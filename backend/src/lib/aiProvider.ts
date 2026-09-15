import { logger } from './logger.js'
import { createGroqProvider, GROQ_DEFAULT_MODEL } from './groq.js'
import { createGeminiProvider, GEMINI_DEFAULT_MODEL } from './gemini.js'

// Provider-neutral LLM layer. `ai.service.ts` speaks ONLY in terms of the types
// below; each adapter (Groq, Gemini) translates them to its own wire format.
// Swapping providers is an env change (`AI_PROVIDER`), not a code change.
//
// History note: the assistant originally called the Gemini SDK's stateful
// `ChatSession`. That forced provider-specific history bookkeeping into the
// service and produced two live bugs (context lost on turn 2+, and a malformed
// nested `functionResponse`). The interface below is deliberately STATELESS:
// every call ships the whole conversation, so history handling lives in exactly
// one place (the service) and no adapter can drift.

export type AiRole = 'system' | 'user' | 'assistant' | 'tool'

/** A tool call requested by the model. `id` is synthesized for providers (Gemini) that don't supply one. */
export interface AiToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export type AiMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AiToolCall[] }
  // `content` is the JSON-serialized tool result, so the shape is provider-neutral.
  | { role: 'tool'; toolCallId: string; name: string; content: string }

/** JSON Schema subset — accepted as-is by OpenAI-compatible APIs, converted for Gemini. */
export interface AiToolParameterSchema {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

export interface AiToolSpec {
  name: string
  description: string
  parameters: AiToolParameterSchema
}

export interface AiTurnResult {
  text: string
  toolCalls: AiToolCall[]
}

export interface AiProvider {
  readonly name: AiProviderName
  readonly model: string
  generate(messages: AiMessage[], tools: AiToolSpec[]): Promise<AiTurnResult>
}

export type AiProviderName = 'groq' | 'gemini'

/**
 * Carries the upstream HTTP status so the controller can distinguish a quota
 * rejection (429 → "try again later") from a genuine outage (503).
 */
export class AiProviderError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AiProviderError'
    this.status = status
  }
}

let cachedProvider: AiProvider | null = null

/**
 * `AI_PROVIDER` wins when set. Otherwise prefer Groq (the current default), then
 * fall back to Gemini so existing deployments that only hold a Gemini key keep
 * working untouched.
 */
export function resolveAiProviderName(): AiProviderName {
  const explicit = (process.env.AI_PROVIDER || '').trim().toLowerCase()
  if (explicit === 'groq' || explicit === 'gemini') return explicit
  if (explicit) {
    logger.warn({ AI_PROVIDER: explicit }, 'Unknown AI_PROVIDER value — falling back to auto-detection')
  }
  if (process.env.GROQ_API_KEY?.trim()) return 'groq'
  if (process.env.GEMINI_API_KEY?.trim()) return 'gemini'
  throw new AiProviderError(
    503,
    'No AI provider configured. Set GROQ_API_KEY (or GEMINI_API_KEY) in the environment.',
  )
}

export function getAiProvider(): AiProvider {
  if (cachedProvider) return cachedProvider
  const name = resolveAiProviderName()
  cachedProvider = name === 'groq' ? createGroqProvider() : createGeminiProvider()
  logger.info({ provider: cachedProvider.name, model: cachedProvider.model }, 'AI provider selected')
  return cachedProvider
}

/** Test hook — clears the memoized provider so env changes take effect. */
export function resetAiProvider() {
  cachedProvider = null
}

export function getAiProviderInfo() {
  try {
    const provider = getAiProvider()
    return { available: true, provider: provider.name, model: provider.model }
  } catch {
    return { available: false, provider: null, model: '' }
  }
}

export function getDefaultModelFor(name: AiProviderName): string {
  return name === 'groq' ? GROQ_DEFAULT_MODEL : GEMINI_DEFAULT_MODEL
}
