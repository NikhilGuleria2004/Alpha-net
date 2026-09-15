import { logger } from './logger.js'
import {
  AiProviderError,
  type AiMessage,
  type AiProvider,
  type AiToolCall,
  type AiToolSpec,
  type AiTurnResult,
} from './aiProvider.js'

// Groq adapter. Groq exposes an OpenAI-compatible /chat/completions endpoint, so
// this speaks the OpenAI wire format directly with `fetch` — no extra SDK
// dependency (matching lib/aiApiClient.ts) and no opinionated history layer.

export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-20b'

const REQUEST_TIMEOUT_MS = 30_000

function getGroqEndpoint(): string {
  const base = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
  return `${base.replace(/\/$/, '')}/chat/completions`
}

interface GroqToolCall {
  id?: string
  type?: string
  function?: { name?: string; arguments?: string }
}

interface GroqMessage {
  role?: string
  content?: string | null
  tool_calls?: GroqToolCall[]
}

interface GroqChatResponse {
  choices?: Array<{ message?: GroqMessage; finish_reason?: string }>
  error?: { message?: string; type?: string }
}

/**
 * gpt-oss models occasionally emit a raw `<tool_call>` block in `content` when
 * they cannot map a request onto the declared tools. Leaking that markup into
 * the chat bubble looks broken, so strip it and keep only the prose.
 */
function sanitizeText(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<\/?tool_call>/gi, '')
    .trim()
}

/** OpenAI delivers arguments as a JSON *string*; a malformed one must not crash the turn. */
function parseToolArgs(raw: string | undefined, toolName: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    logger.warn({ toolName }, 'Tool arguments were not a JSON object — ignoring')
    return {}
  } catch (err) {
    logger.warn({ err, toolName, raw: raw.slice(0, 200) }, 'Failed to parse tool arguments')
    return {}
  }
}

function toGroqMessages(messages: AiMessage[]) {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
    }
    if (m.role === 'assistant') {
      const out: Record<string, unknown> = { role: 'assistant', content: m.content || '' }
      if (m.toolCalls && m.toolCalls.length > 0) {
        out.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
        }))
      }
      return out
    }
    return { role: m.role, content: m.content }
  })
}

function toGroqTools(tools: AiToolSpec[]) {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}

async function callGroq(body: Record<string, unknown>, apiKey: string): Promise<GroqChatResponse> {
  let res: Response
  try {
    res = await fetch(getGroqEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    throw new AiProviderError(503, `Groq API unreachable: ${(err as Error).message}`)
  }

  const text = await res.text()
  let data: GroqChatResponse = {}
  try {
    data = text ? (JSON.parse(text) as GroqChatResponse) : {}
  } catch {
    data = {}
  }

  if (!res.ok) {
    const detail = data.error?.message || text.slice(0, 300) || `Groq API ${res.status}`
    throw new AiProviderError(res.status, detail)
  }
  return data
}

export function createGroqProvider(): AiProvider {
  const apiKey = (process.env.GROQ_API_KEY || '').trim()
  if (!apiKey) {
    throw new AiProviderError(503, 'GROQ_API_KEY is not set')
  }
  const model = process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL

  return {
    name: 'groq',
    model,

    async generate(messages: AiMessage[], tools: AiToolSpec[]): Promise<AiTurnResult> {
      const data = await callGroq(
        {
          model,
          messages: toGroqMessages(messages),
          ...(tools.length > 0 ? { tools: toGroqTools(tools), tool_choice: 'auto' } : {}),
          temperature: 0.7,
          max_tokens: 2048,
        },
        apiKey,
      )

      const message = data.choices?.[0]?.message
      if (!message) {
        throw new AiProviderError(502, 'Groq returned no choices')
      }

      const toolCalls: AiToolCall[] = (message.tool_calls || [])
        .filter((tc) => typeof tc?.function?.name === 'string' && tc.function.name)
        .map((tc, index) => ({
          // Groq always supplies an id, but the tool result message must be able
          // to reference SOMETHING, so synthesize a stable fallback.
          id: tc.id || `groq_call_${index}`,
          name: tc.function!.name as string,
          args: parseToolArgs(tc.function?.arguments, tc.function!.name as string),
        }))

      return {
        text: sanitizeText(message.content || ''),
        toolCalls,
      }
    },
  }
}
