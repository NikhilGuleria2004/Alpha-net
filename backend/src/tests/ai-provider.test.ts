/// <reference types="vitest" />
// Provider-layer regression tests. These lock in behaviour that previously broke
// against a real API:
//   - provider selection (AI_PROVIDER wins, then whichever key exists)
//   - the Gemini wire format must NOT nest a Content inside a Part
//   - Groq's OpenAI-shaped request/response mapping

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SchemaType } from '@google/generative-ai'
import {
  AiProviderError,
  getAiProviderInfo,
  resolveAiProviderName,
  resetAiProvider,
  type AiMessage,
  type AiToolSpec,
} from '../lib/aiProvider.js'
import { createGroqProvider, GROQ_DEFAULT_MODEL } from '../lib/groq.js'
import { toGeminiContents, toGeminiDeclaration } from '../lib/gemini.js'

const ENV_KEYS = [
  'AI_PROVIDER',
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_MODEL',
  'GEMINI_MODEL',
  'GROQ_BASE_URL',
] as const
let savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  savedEnv = {}
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  resetAiProvider()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  resetAiProvider()
  vi.unstubAllGlobals()
})

describe('AI provider selection', () => {
  it('prefers Groq when only GROQ_API_KEY is present', () => {
    process.env.GROQ_API_KEY = 'gsk_test'
    expect(resolveAiProviderName()).toBe('groq')
  })

  it('falls back to Gemini when only GEMINI_API_KEY is present', () => {
    process.env.GEMINI_API_KEY = 'gemini_test'
    expect(resolveAiProviderName()).toBe('gemini')
  })

  it('prefers Groq when both keys are present', () => {
    process.env.GROQ_API_KEY = 'gsk_test'
    process.env.GEMINI_API_KEY = 'gemini_test'
    expect(resolveAiProviderName()).toBe('groq')
  })

  it('lets an explicit AI_PROVIDER override key-based detection', () => {
    process.env.GROQ_API_KEY = 'gsk_test'
    process.env.GEMINI_API_KEY = 'gemini_test'
    process.env.AI_PROVIDER = 'gemini'
    expect(resolveAiProviderName()).toBe('gemini')
  })

  it('ignores a junk AI_PROVIDER value and falls back to auto-detection', () => {
    process.env.AI_PROVIDER = 'chatgpt'
    process.env.GEMINI_API_KEY = 'gemini_test'
    expect(resolveAiProviderName()).toBe('gemini')
  })

  it('throws a 503 provider error when no key is configured', () => {
    expect(() => resolveAiProviderName()).toThrow(AiProviderError)
  })

  it('reports the live provider and default Groq model', () => {
    process.env.GROQ_API_KEY = 'gsk_test'
    expect(getAiProviderInfo()).toEqual({
      available: true,
      provider: 'groq',
      model: GROQ_DEFAULT_MODEL,
    })
  })

  it('reports unavailable instead of throwing when nothing is configured', () => {
    expect(getAiProviderInfo()).toEqual({ available: false, provider: null, model: '' })
  })
describe('Gemini wire format', () => {
  it('merges the system message into the first user turn (no system role)', () => {
    const contents = toGeminiContents([
      { role: 'system', content: 'RULES' },
      { role: 'user', content: 'hello' },
    ])
    expect(contents).toHaveLength(1)
    expect(contents[0].role).toBe('user')
    expect(contents[0].parts[0]).toEqual({ text: 'RULES\n\nhello' })
  })

  it('maps an assistant tool-call turn to a model content with functionCall parts', () => {
    const contents = toGeminiContents([
      { role: 'assistant', content: 'on it', toolCalls: [{ id: 'c1', name: 'listMyProjects', args: {} }] },
    ])
    expect(contents[0].role).toBe('model')
    expect(contents[0].parts).toEqual([
      { text: 'on it' },
      { functionCall: { name: 'listMyProjects', args: {} } },
    ])
  })

  // Regression: the original code passed a Content ({role, parts}) into
  // sendMessage(), which nested it inside a Part and made the API reject the
  // request with `Unknown name "role" at 'contents[N].parts[0]'`.
  it('emits functionResponse parts directly — never a nested Content', () => {
    const contents = toGeminiContents([
      { role: 'tool', toolCallId: 'c1', name: 'listMyProjects', content: '{"projects":[]}' },
    ])
    expect(contents).toHaveLength(1)
    expect(contents[0].role).toBe('user')
    expect(contents[0].parts[0]).toEqual({
      functionResponse: { name: 'listMyProjects', response: { projects: [] } },
    })
    // A Part must carry exactly one of {text, functionCall, functionResponse}.
    expect(Object.keys(contents[0].parts[0])).toHaveLength(1)
  })

  it('groups parallel tool results into a single user turn', () => {
    const contents = toGeminiContents([
      { role: 'tool', toolCallId: 'c1', name: 'listMyProjects', content: '{}' },
      { role: 'tool', toolCallId: 'c2', name: 'listPendingApprovals', content: '{"approvals":[]}' },
    ])
    expect(contents).toHaveLength(1)
    expect(contents[0].parts).toHaveLength(2)
  })

  it('survives an unparseable tool result', () => {
    const contents = toGeminiContents([{ role: 'tool', toolCallId: 'c1', name: 'x', content: 'not json' }])
    expect(contents[0].parts[0]).toEqual({
      functionResponse: { name: 'x', response: { error: 'Unparseable tool result' } },
    })
  })

  it('skips an empty assistant turn', () => {
    expect(toGeminiContents([{ role: 'assistant', content: '', toolCalls: [] }])).toEqual([])
  })

  it('converts JSON Schema tool specs, including string enums', () => {
    const spec: AiToolSpec = {
      name: 'demo',
      description: 'demo tool',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['regular', 'overtime'] },
          hours: { type: 'number' },
          days: { type: 'array', items: { type: 'object', properties: { mon: { type: 'number' } } } },
        },
        required: ['mode'],
      },
    }
        const declaration = toGeminiDeclaration(spec)
    const params = declaration.parameters as unknown as {
      type: unknown
      properties: Record<string, Record<string, unknown>>
      required?: string[]
    }

    expect(params.type).toBe(SchemaType.OBJECT)
    expect(params.required).toEqual(['mode'])
    // Gemini rejects a bare `enum` on STRING and requires format: 'enum'.
    expect(params.properties.mode).toEqual({
      type: SchemaType.STRING,
      format: 'enum',
      enum: ['regular', 'overtime'],
    })
    expect(params.properties.hours.type).toBe(SchemaType.NUMBER)
    expect(params.properties.days.type).toBe(SchemaType.ARRAY)
    expect((params.properties.days.items as Record<string, unknown>).type).toBe(SchemaType.OBJECT)
  })

  it('keeps an empty properties bag for a no-argument tool', () => {
    const declaration = toGeminiDeclaration({
      name: 'listMyProjects',
      description: 'no args',
      parameters: { type: 'object', properties: {} },
    })
    const params = declaration.parameters as { properties: Record<string, unknown>; required?: string[] }
    expect(params.properties).toEqual({})
    expect(params.required).toBeUndefined()
  })
})
describe('Groq adapter', () => {
  const systemAndUser: AiMessage[] = [
    { role: 'system', content: 'RULES' },
    { role: 'user', content: 'hi' },
  ]

  function stubFetch(payload: unknown, status = 200) {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('posts the OpenAI-shaped body to the Groq endpoint with the default model', async () => {
    process.env.GROQ_API_KEY = 'gsk_test'
    const fetchMock = stubFetch({ choices: [{ message: { content: 'hello there' } }] })

    const provider = createGroqProvider()
    const result = await provider.generate(systemAndUser, [
      { name: 'listMyProjects', description: 'list', parameters: { type: 'object', properties: {} } },
    ])

    expect(result).toEqual({ text: 'hello there', toolCalls: [] })
    expect(provider.name).toBe('groq')
    expect(provider.model).toBe(GROQ_DEFAULT_MODEL)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer gsk_test')

    const body = JSON.parse(init.body)
    expect(body.model).toBe('openai/gpt-oss-20b')
    expect(body.messages).toEqual([
      { role: 'system', content: 'RULES' },
      { role: 'user', content: 'hi' },
    ])
    expect(body.tool_choice).toBe('auto')
    expect(body.tools[0]).toEqual({
      type: 'function',
      function: { name: 'listMyProjects', description: 'list', parameters: { type: 'object', properties: {} } },
    })
  })

  it('omits tools entirely when none are supplied', async () => {
    process.env.GROQ_API_KEY = 'gsk_test'
    const fetchMock = stubFetch({ choices: [{ message: { content: 'plain answer' } }] })

    await createGroqProvider().generate(systemAndUser, [])

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.tools).toBeUndefined()
    expect(body.tool_choice).toBeUndefined()
  })

  it('parses tool calls and their JSON-string arguments', async () => {
    process.env.GROQ_API_KEY = 'gsk_test'
    stubFetch({
      choices: [
        {
          message: {
            content: '',
            tool_calls: [
              {
                id: 'call_abc',
                type: 'function',
                function: { name: 'createTimesheet', arguments: '{"weekStart":"2026-09-14"}' },
              },
            ],
          },
        },
      ],
    })

    const result = await createGroqProvider().generate(systemAndUser, [])
    expect(result.toolCalls).toEqual([
      { id: 'call_abc', name: 'createTimesheet', args: { weekStart: '2026-09-14' } },
    ])
  })

  it('degrades to empty args when the model emits malformed JSON', async () => {
    process.env.GROQ_API_KEY = 'gsk_test'
    stubFetch({
      choices: [{ message: { tool_calls: [{ id: 'c1', function: { name: 'x', arguments: '{oops' } }] } }],
    })

    const result = await createGroqProvider().generate(systemAndUser, [])
    expect(result.toolCalls[0].args).toEqual({})
  })

  it('strips raw <tool_call> markup that gpt-oss sometimes leaks into content', async () => {
    process.env.GROQ_API_KEY = 'gsk_test'
    stubFetch({ choices: [{ message: { content: 'Sure thing.<tool_call>{"name":"x"}</tool_call>' } }] })

    const result = await createGroqProvider().generate(systemAndUser, [])
    expect(result.text).toBe('Sure thing.')
  })

  it('maps messages back to OpenAI roles including tool results', async () => {
    process.env.GROQ_API_KEY = 'gsk_test'
    const fetchMock = stubFetch({ choices: [{ message: { content: 'ok' } }] })

    await createGroqProvider().generate(
      [
        { role: 'system', content: 'RULES' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'x', args: { a: 1 } }] },
        { role: 'tool', toolCallId: 'c1', name: 'x', content: '{"ok":true}' },
      ],
      [],
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages[2]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'x', arguments: '{"a":1}' } }],
    })
    expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' })
  })

  it('surfaces a 429 as a quota-class provider error', async () => {
    process.env.GROQ_API_KEY = 'gsk_test'
    stubFetch({ error: { message: 'Rate limit reached' } }, 429)

    const error = await createGroqProvider()
      .generate(systemAndUser, [])
      .catch((err: unknown) => err)

    expect(error).toBeInstanceOf(AiProviderError)
    expect((error as AiProviderError).status).toBe(429)
    expect((error as AiProviderError).message).toContain('Rate limit reached')
  })

  it('treats a response with no choices as an upstream error', async () => {
    process.env.GROQ_API_KEY = 'gsk_test'
    stubFetch({})

    await expect(createGroqProvider().generate(systemAndUser, [])).rejects.toThrow(AiProviderError)
  })

  it('honours GROQ_MODEL and GROQ_BASE_URL overrides', async () => {
    process.env.GROQ_API_KEY = 'gsk_test'
    process.env.GROQ_MODEL = 'llama-3.3-70b-versatile'
    process.env.GROQ_BASE_URL = 'https://proxy.internal/v1/'
    const fetchMock = stubFetch({ choices: [{ message: { content: 'ok' } }] })

    const provider = createGroqProvider()
    await provider.generate(systemAndUser, [])

    expect(provider.model).toBe('llama-3.3-70b-versatile')
    // A trailing slash in the base URL must not produce a double slash.
    expect(fetchMock.mock.calls[0][0]).toBe('https://proxy.internal/v1/chat/completions')

    delete process.env.GROQ_BASE_URL
    delete process.env.GROQ_MODEL
  })
})
})