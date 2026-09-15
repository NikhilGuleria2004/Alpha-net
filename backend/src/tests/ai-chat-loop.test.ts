/// <reference types="vitest" />
// Chat-loop regression tests. The loop is provider-neutral, so these assert the
// contract EVERY adapter must satisfy: full history on every turn, tool results
// fed back verbatim, writes STAGED (never executed here), and no phantom claims
// of success when nothing was actually staged.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { chatWithAssistant } from '../services/ai.service.js'
import { COLLECTIONS } from '../lib/collections.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'
import type { AiMessage } from '../lib/aiProvider.js'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getAiProvider: vi.fn(),
  callPlatformApi: vi.fn(),
}))

vi.mock('../lib/mongodb.js', () => ({ getDb: mocks.getDb }))
vi.mock('../lib/aiApiClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/aiApiClient.js')>()
  return { ...actual, callPlatformApi: mocks.callPlatformApi }
})
vi.mock('../lib/aiProvider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/aiProvider.js')>()
  return { ...actual, getAiProvider: mocks.getAiProvider }
})

const USER_ID = '507f1f77bcf86cd799439021'
const PROJECT_ID = '507f1f77bcf86cd799439011'

function fakeRequest(): AuthenticatedRequest {
  return { user: { userId: USER_ID, role: 'user', isSupervisor: false } } as unknown as AuthenticatedRequest
}

function fakeDb() {
  const cursor = (rows: unknown[]) => ({ limit: () => ({ toArray: async () => rows }) })
  return {
    collection: (name: string) => ({
      findOne: async () => (name === COLLECTIONS.USERS ? { _id: USER_ID, name: 'Ada Lovelace' } : null),
      find: () =>
        cursor(
          name === COLLECTIONS.PROJECTS ? [{ name: 'Apollo', sowNumber: 'SOW-1', status: 'active' }] : [],
        ),
    }),
  }
}

const generate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getDb.mockResolvedValue(fakeDb())
  mocks.callPlatformApi.mockResolvedValue({ projects: [{ id: PROJECT_ID, name: 'Apollo' }] })
  mocks.getAiProvider.mockReturnValue({ name: 'groq', model: 'openai/gpt-oss-20b', generate })
})

function firstMessages(): AiMessage[] {
  return generate.mock.calls[0][0] as AiMessage[]
}

function lastMessages(): AiMessage[] {
  return generate.mock.calls[generate.mock.calls.length - 1][0] as AiMessage[]
}

describe('AI chat turn loop', () => {
  it('re-sends the system prompt and user context on every turn', async () => {
    generate.mockResolvedValueOnce({ text: 'Hi Ada', toolCalls: [] })

    const result = await chatWithAssistant(
      fakeRequest(),
      { message: 'hello', history: [{ role: 'model', content: 'earlier reply' }] },
      'user-token',
    )

    const messages = firstMessages()
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('Eniac Assistant')
    expect(messages[0].content).toContain('Ada Lovelace')
    // The client sends 'model'; the neutral layer speaks 'assistant'.
    expect(messages[1]).toEqual({ role: 'assistant', content: 'earlier reply' })
    expect(messages[2]).toEqual({ role: 'user', content: 'hello' })

    expect(result.response).toBe('Hi Ada')
    expect(result.pendingAction).toBeUndefined()
  })

  it('executes a read tool and feeds its result back to the model', async () => {
    generate
      .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'c1', name: 'listMyProjects', args: {} }] })
      .mockResolvedValueOnce({ text: 'You are on Apollo.', toolCalls: [] })

    const result = await chatWithAssistant(fakeRequest(), { message: 'my projects?' }, 'user-token')

    expect(generate).toHaveBeenCalledTimes(2)
    expect(mocks.callPlatformApi).toHaveBeenCalledWith('user-token', 'GET', '/projects')
    expect(lastMessages().at(-1)).toEqual({
      role: 'tool',
      toolCallId: 'c1',
      name: 'listMyProjects',
      content: JSON.stringify({
        projects: [{ projectId: PROJECT_ID, name: 'Apollo', sowNumber: '', status: '' }],
      }),
    })
    expect(result.response).toBe('You are on Apollo.')
  })

  it('stages a timesheet write instead of executing it', async () => {
    generate
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [
          {
            id: 'c1',
            name: 'createTimesheet',
            args: {
              projectId: PROJECT_ID,
              weekStart: '2026-09-14',
              entries: [{ description: 'Dev', entryType: 'regular', hours: { mon: 8, tue: 8 } }],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ text: 'Prepared a draft for your confirmation.', toolCalls: [] })

    const result = await chatWithAssistant(fakeRequest(), { message: 'log 16h last week' }, 'user-token')

    expect(result.pendingAction?.tool).toBe('createTimesheet')
    expect(result.pendingAction?.summary).toContain('Apollo')
    // Only a READ went out — the write waits for the user's confirmation card.
    expect(mocks.callPlatformApi).toHaveBeenCalledTimes(1)
    expect(mocks.callPlatformApi).toHaveBeenCalledWith('user-token', 'GET', '/projects')
  })

  it('blocks a phantom success claim when nothing was staged', async () => {
    generate.mockResolvedValueOnce({ text: "I've created the draft timesheet for you.", toolCalls: [] })

    const result = await chatWithAssistant(fakeRequest(), { message: 'log my hours' }, 'user-token')

    expect(result.pendingAction).toBeUndefined()
    expect(result.response).not.toContain("I've created")
    expect(result.response).toContain('nothing was saved')
  })

  it('reports the tool-iteration cap instead of throwing a 503', async () => {
    generate.mockResolvedValue({ text: '', toolCalls: [{ id: 'c', name: 'listMyProjects', args: {} }] })

    const result = await chatWithAssistant(fakeRequest(), { message: 'loop forever' }, 'user-token')

    expect(result.response).toContain('more steps than I can take at once')
    expect(generate.mock.calls.length).toBeGreaterThan(1)
  })

  it('offers no tools when no user token is available', async () => {
    generate.mockResolvedValueOnce({ text: 'hello', toolCalls: [] })

    await chatWithAssistant(fakeRequest(), { message: 'hi' })

    expect(generate.mock.calls[0][1]).toEqual([])
  })
})