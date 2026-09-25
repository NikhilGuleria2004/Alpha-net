// Flow Integration Phase 1 — backfill normalized clients from legacy
// free-text `projects.client` strings (see /flowIntegration.md §5 Phase 1).
//
// Idempotent: upserts clients by normalized name, then sets `clientId` only
// on projects missing it. Safe to re-run; never overwrites an existing
// `clientId`, never renames clients, never deletes anything.
//
// Usage:
//   npx tsx src/scripts/backfill-clients.ts [--dry-run]
// Env: MONGODB_URI, MONGODB_DB_NAME (same as server).
import 'dotenv/config'
import { getDb, closeDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { findOrCreateClient } from '../services/client.service.js'
import { ObjectId } from 'mongodb'

export interface BackfillClientsResult {
  distinctNames: number
  clientsCreated: number
  clientsExisting: number
  projectsScanned: number
  projectsUpdated: number
  projectsSkipped: number
  dryRun: boolean
  errors: string[]
}

export async function backfillClients(opts?: { dryRun?: boolean }): Promise<BackfillClientsResult> {
  const dryRun = opts?.dryRun ?? process.argv.includes('--dry-run')
  const db = await getDb()
  const result: BackfillClientsResult = {
    distinctNames: 0,
    clientsCreated: 0,
    clientsExisting: 0,
    projectsScanned: 0,
    projectsUpdated: 0,
    projectsSkipped: 0,
    dryRun,
    errors: [],
  }

  const projects = await db.collection(COLLECTIONS.PROJECTS).find({}).toArray()
  result.projectsScanned = projects.length

  // Group by normalized name so `Sony`/`sony`/` Sony ` produce one client.
  const byNormalized = new Map<string, { display: string; ids: ObjectId[]; missingClientId: ObjectId[] }>()
  for (const p of projects) {
    const raw = typeof p.client === 'string' ? p.client : ''
    if (!raw.trim()) {
      result.projectsSkipped++
      result.errors.push(`project ${p._id.toString()} has empty client string; skipped`)
      continue
    }
    const normalized = raw.toLowerCase().trim().replace(/\s+/g, ' ')
    let group = byNormalized.get(normalized)
    if (!group) {
      group = { display: raw.trim(), ids: [], missingClientId: [] }
      byNormalized.set(normalized, group)
    }
    group.ids.push(p._id as ObjectId)
    if (!p.clientId) group.missingClientId.push(p._id as ObjectId)
  }
  result.distinctNames = byNormalized.size

  for (const [, group] of byNormalized) {
    try {
      // findOrCreateClient is itself idempotent on normalizedName.
      const before = await db.collection(COLLECTIONS.CLIENTS).findOne({ normalizedName: group.display.toLowerCase().trim().replace(/\s+/g, ' ') })
      const client = dryRun
        ? before ?? { id: '(dry-run)', name: group.display }
        : await findOrCreateClient({ name: group.display })
      if (before) result.clientsExisting++
      else result.clientsCreated++
      if (dryRun) {
        result.projectsSkipped += group.missingClientId.length
        continue
      }
      const clientObjectId = new ObjectId((client as { id: string }).id)
      for (const projectId of group.missingClientId) {
        const res = await db.collection(COLLECTIONS.PROJECTS).updateOne(
          { _id: projectId, clientId: { $exists: false } },
          { $set: { clientId: clientObjectId, updatedAt: new Date() } },
        )
        if (res.modifiedCount > 0) result.projectsUpdated++
        else result.projectsSkipped++
      }
      result.projectsSkipped += group.ids.length - group.missingClientId.length
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`client "${group.display}": ${msg}`)
    }
  }

  return result
}

const isMain = process.argv[1]?.endsWith('backfill-clients.ts') ?? false
if (isMain) {
  backfillClients()
    .then((r) => {
      console.log(
        `[backfill-clients] dryRun=${r.dryRun} distinctNames=${r.distinctNames} ` +
          `clientsCreated=${r.clientsCreated} clientsExisting=${r.clientsExisting} ` +
          `projectsScanned=${r.projectsScanned} projectsUpdated=${r.projectsUpdated} ` +
          `projectsSkipped=${r.projectsSkipped} errors=${r.errors.length}`,
      )
      for (const e of r.errors) console.error(`[backfill-clients] error: ${e}`)
      return closeDb()
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[backfill-clients] fatal:', err)
      process.exit(1)
    })
}
