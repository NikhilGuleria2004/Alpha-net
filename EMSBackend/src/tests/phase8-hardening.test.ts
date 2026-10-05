import { describe, it, expect, vi, beforeEach } from 'vitest'
import { COLLECTIONS } from '../lib/collections.js'

/**
 * Phase 8 hardening — regressions found while verifying interoperability with
 * the shared timesheet platform (task 8.2).
 *
 * Both cases here were live defects, not hypotheticals: each one broke a real
 * cross-platform flow against a database that both services write to.
 */

// ── ensureIndexes: the shared `sessions` collection ──────────────────────────

vi.mock('../lib/mongodb', () => ({ getDb: vi.fn(), closeDb: vi.fn() }))

/** Minimal collection double that records index calls. */
function createIndexCollection(existing: any[] = []) {
  const collection: any = {
    createIndex: vi.fn().mockResolvedValue('ok'),
    dropIndex: vi.fn().mockResolvedValue(undefined),
    indexes: vi.fn().mockResolvedValue(existing),
  }
  return collection
}

/** Load a fresh copy of the module so the `indexesEnsured` latch resets. */
async function loadEnsureIndexes(collections: Record<string, any>) {
  vi.resetModules()
  const mongodb = await import('../lib/mongodb.js')
  vi.mocked(mongodb.getDb).mockResolvedValue({
    collection: (name: string) => collections[name] ?? createIndexCollection(),
  } as any)
  const mod = await import('../lib/collections.js')
  return mod.ensureIndexes
}

describe('Phase 8 — shared sessions index is partial', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('scopes the refreshHash uniqueness to documents that actually carry one', async () => {
    const sessions = createIndexCollection()
    const ensureIndexes = await loadEnsureIndexes({ [COLLECTIONS.SESSIONS]: sessions })

    await ensureIndexes()

    const call = sessions.createIndex.mock.calls.find(([keys]: any[]) => 'refreshHash' in keys)
    expect(call).toBeDefined()
    expect(call?.[1]).toMatchObject({ unique: true })
    // Without a partial filter every platform session (which omits the field)
    // would collide as `null` and the platform could only ever log in once.
    expect(call?.[1]?.partialFilterExpression).toEqual({ refreshHash: { $type: 'string' } })
  })

  it('drops a pre-existing non-partial index instead of throwing IndexOptionsConflict', async () => {
    const sessions = createIndexCollection([{ name: 'refreshHash_1', key: { refreshHash: 1 }, unique: true }])
    const ensureIndexes = await loadEnsureIndexes({ [COLLECTIONS.SESSIONS]: sessions })

    await expect(ensureIndexes()).resolves.not.toThrow()
    expect(sessions.dropIndex).toHaveBeenCalledWith('refreshHash_1')
  })

  it('leaves an already-partial index alone on later boots', async () => {
    const sessions = createIndexCollection([
      { name: 'refreshHash_1', key: { refreshHash: 1 }, unique: true, partialFilterExpression: { refreshHash: { $type: 'string' } } },
    ])
    const ensureIndexes = await loadEnsureIndexes({ [COLLECTIONS.SESSIONS]: sessions })

    await ensureIndexes()
    // Dropping and recreating on every boot would briefly remove the
    // uniqueness guarantee, so an up-to-date index must be left in place.
    expect(sessions.dropIndex).not.toHaveBeenCalled()
  })
})

/**
 * Found when repointing EMS at the shared Atlas `alphanet` database: every
 * pre-existing platform row predates these fields, so a plain unique index
 * could not even be *built* (E11000 at build time). That aborted the remainder
 * of ensureIndexes and left the deployment half-migrated.
 */
describe('Phase 8 — shared legacy-row indexes are partial', () => {
  // [collection name, field, index name] — the collection *name*, because
  // COLLECTIONS is keyed by SCREAMING_CASE constants, not by these values.
  const cases: Array<[string, string, string]> = [
    [COLLECTIONS.CLIENTS, 'clientCode', 'clientCode_1'],
    [COLLECTIONS.INVITES, 'tokenHash', 'tokenHash_1'],
  ]

  beforeEach(() => {
    vi.resetModules()
  })

  it.each(cases)('%s.%s is partial so legacy rows without the field coexist', async (collection, field, indexName) => {
    const coll = createIndexCollection()
    const ensureIndexes = await loadEnsureIndexes({ [collection]: coll })

    await ensureIndexes()

    const call = coll.createIndex.mock.calls.find(([keys]: any[]) => field in keys)
    expect(call, `${collection}.${field} index was not created`).toBeDefined()
    expect(call?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { [field]: { $type: 'string' } },
    })
    expect(indexName).toBeTruthy()
  })

  it('migrates a pre-existing non-partial legacy index on those collections', async () => {
    for (const [collection, , indexName] of cases) {
      const coll = createIndexCollection([{ name: indexName, key: {}, unique: true }])
      const ensureIndexes = await loadEnsureIndexes({ [collection]: coll })
      await ensureIndexes()
      expect(coll.dropIndex, `${collection} legacy index was not dropped`).toHaveBeenCalledWith(indexName)
    }
  })

  it('ensureIndexes completes when a shared collection has legacy null rows', async () => {
    // The real failure mode: index build rejects, ensureIndexes throws, and the
    // collections declared after the failing one never get indexed at all.
    const clients = createIndexCollection()
    clients.indexes.mockResolvedValue([
      { name: 'normalizedName_1', key: { normalizedName: 1 }, unique: true },
      { name: 'status_1', key: { status: 1 } },
    ])
    const ensureIndexes = await loadEnsureIndexes({ [COLLECTIONS.CLIENTS]: clients })

    await expect(ensureIndexes()).resolves.not.toThrow()
  })
})

// ── people mapper: timestamp tolerance ──────────────────────────────────────

describe('Phase 8 — toEmsUser tolerates non-Date timestamps', () => {
  /** Drive listEmployees with one row whose timestamps have the given type. */
  async function listWithTimestamp(createdAt: unknown) {
    vi.resetModules()
    const mongodb = await import('../lib/mongodb.js')
    const users = {
      find: () => ({ sort: () => ({ toArray: async () => [{ _id: 'u1', name: 'Esha', email: 'esha@eniac.demo', createdAt }] }) }),
    }
    vi.mocked(mongodb.getDb).mockResolvedValue({ collection: () => users } as any)
    const people = await import('../services/people.service.js')
    return people.listEmployees({})
  }

  it('accepts a BSON Date', async () => {
    const result = await listWithTimestamp(new Date('2026-09-30T08:15:00.000Z'))
    expect(result.users[0].createdAt).toBe('2026-09-30T08:15:00.000Z')
  })

  it('accepts an ISO string written by a platform row instead of throwing', async () => {
    // `users` is a shared collection. A string timestamp used to crash the
    // whole directory listing with "createdAt.toISOString is not a function".
    const result = await listWithTimestamp('2026-09-30T08:15:00.000Z')
    expect(result.users[0].createdAt).toBe('2026-09-30T08:15:00.000Z')
  })

  it('degrades to undefined rather than emitting an invalid date', async () => {
    const result = await listWithTimestamp('not-a-date')
    expect(result.users[0].createdAt).toBeUndefined()
  })
})
