import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  SchemaType,
  type Content,
  type FunctionDeclaration,
  type GenerativeModel,
  type Part,
  type Schema,
} from '@google/generative-ai'
import { logger } from './logger.js'
import {
  AiProviderError,
  type AiMessage,
  type AiProvider,
  type AiToolCall,
  type AiToolSpec,
  type AiTurnResult,
} from './aiProvider.js'

// Gemini adapter. Gemini's own function-calling shape differs from the OpenAI
// wire format, so this module owns every translation:
//   - neutral `system` messages    → merged into the first content's text
//   - neutral `tool` messages      → `functionResponse` parts on a `user` content
//   - neutral `assistant` + calls  → `model` content with `functionCall` parts
//   - JSON Schema tool params      → Gemini `Schema` (SchemaType enums)
//
// `systemInstruction` is intentionally NOT used: on v1beta the SDK emits a
// `system` role that gemini-2.5-flash rejects (see AI_Asst.md §7.3).

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash'

let modelInstance: GenerativeModel | null = null

export function getGeminiModel(): GenerativeModel {
  if (modelInstance) return modelInstance

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new AiProviderError(503, 'GEMINI_API_KEY is not set')
  }
  const modelName = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL

  modelInstance = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
  })
  logger.info({ model: modelName }, 'Gemini model initialized')
  return modelInstance
}

export function resetGeminiModel() {
  modelInstance = null
}
/**
 * JSON Schema (what the tool specs and Groq consume) → Gemini's Schema dialect.
 * `Schema` is a discriminated union in this SDK, so each branch must build the
 * exact variant. String enums are the notable special case: Gemini rejects a
 * plain `enum` field and requires `format: 'enum'` instead.
 */
function toGeminiSchema(input: unknown): Schema {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const type = typeof raw.type === 'string' ? raw.type.toLowerCase() : 'object'
  const schema = buildGeminiVariant(type, raw)
  if (typeof raw.description === 'string') schema.description = raw.description
  return schema
}

/** Builds the exact union member; the `Schema` return type drives the discrimination. */
function buildGeminiVariant(type: string, raw: Record<string, unknown>): Schema {
  switch (type) {
    case 'number':
      return { type: SchemaType.NUMBER }
    case 'integer':
      return { type: SchemaType.INTEGER }
    case 'boolean':
      return { type: SchemaType.BOOLEAN }
    case 'array':
      return { type: SchemaType.ARRAY, items: toGeminiSchema(raw.items) }
    case 'string': {
      const values = Array.isArray(raw.enum)
        ? raw.enum.filter((v): v is string => typeof v === 'string')
        : []
      // Gemini rejects a plain `enum` on STRING; it wants `format: 'enum'`.
      return values.length > 0
        ? { type: SchemaType.STRING, format: 'enum', enum: values }
        : { type: SchemaType.STRING }
    }
    case 'object':
    default:
      return { type: SchemaType.OBJECT, properties: toGeminiProperties(raw.properties) }
  }
}

function toGeminiProperties(input: unknown): Record<string, Schema> {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const properties: Record<string, Schema> = {}
  for (const [key, value] of Object.entries(source)) {
    properties[key] = toGeminiSchema(value)
  }
  return properties
}

/** @internal Exported for regression tests — see AI_Asst.md §8.4. */
export function toGeminiDeclaration(tool: AiToolSpec): FunctionDeclaration {
  // Our specs always declare an object root; Gemini requires `properties` to be
  // present even when a tool takes no arguments.
  const params = (tool.parameters ?? {}) as Record<string, unknown>
  const required = Array.isArray(params.required)
    ? params.required.filter((r): r is string => typeof r === 'string')
    : []

  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: SchemaType.OBJECT,
      properties: toGeminiProperties(params.properties),
      ...(required.length > 0 ? { required } : {}),
    },
  }
}
/** Neutral messages → Gemini `contents`. Consecutive tool results share one turn. */
/** @internal Exported for regression tests — see AI_Asst.md §8.4. */
export function toGeminiContents(messages: AiMessage[]): Content[] {
  const contents: Content[] = []
  let preamble = ''
  let preambleUsed = false

  const withPreamble = (text: string): string => {
    if (preambleUsed || !preamble) return text
    preambleUsed = true
    return `${preamble}\n\n${text}`
  }

  for (const message of messages) {
    if (message.role === 'system') {
      preamble += preamble ? `\n\n${message.content}` : message.content
      continue
    }

    if (message.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: withPreamble(message.content) }] })
      continue
    }

    if (message.role === 'tool') {
      // Gemini wants function results as `user`-role parts. Grouping parallel
      // results into one content keeps the turn shape valid.
      let response: Record<string, unknown>
      try {
        const parsed: unknown = JSON.parse(message.content)
        response = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { result: parsed }
      } catch {
        response = { error: 'Unparseable tool result' }
      }
      const part: Part = { functionResponse: { name: message.name, response } }
      const last = contents[contents.length - 1]
      const lastIsToolResponse =
        last?.role === 'user' && last.parts.length > 0 && last.parts.every((p) => 'functionResponse' in p)
      if (lastIsToolResponse) {
        last.parts.push(part)
      } else {
        contents.push({ role: 'user', parts: [part] })
      }
      continue
    }

    // assistant → model
    const parts: Part[] = []
    if (message.content) parts.push({ text: message.content })
    for (const call of message.toolCalls ?? []) {
      parts.push({ functionCall: { name: call.name, args: call.args } })
    }
    if (parts.length === 0) continue
    contents.push({ role: 'model', parts })
  }

  return contents
}

function safeResponseText(response: { text?: () => string } | undefined): string {
  if (!response?.text) return ''
  try {
    return response.text() || ''
  } catch {
    // `text()` throws when the candidate holds only functionCall parts or was
    // blocked. For a tool turn that is expected, not an error.
    return ''
  }
}

export function createGeminiProvider(): AiProvider {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new AiProviderError(503, 'GEMINI_API_KEY is not set')
  }
  const model = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL

  return {
    name: 'gemini',
    model,

    async generate(messages: AiMessage[], tools: AiToolSpec[]): Promise<AiTurnResult> {
      const result = await getGeminiModel().generateContent({
        contents: toGeminiContents(messages),
        ...(tools.length > 0
          ? { tools: [{ functionDeclarations: tools.map(toGeminiDeclaration) }] }
          : {}),
      })

      const response = result.response
      // Gemini supplies no call id; synthesize one so results can reference it.
      const toolCalls: AiToolCall[] = (response.functionCalls?.() || []).map((call, index) => ({
        id: `gemini_call_${index}`,
        name: call.name,
        args: (call.args && typeof call.args === 'object' ? call.args : {}) as Record<string, unknown>,
      }))

      return { text: safeResponseText(response), toolCalls }
    },
  }
}
