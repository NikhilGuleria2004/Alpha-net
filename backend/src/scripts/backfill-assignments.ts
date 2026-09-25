// Flow Integration Phase 3 — backfill assignments from the legacy project
// rosters (see /flowIntegration.md §5 Phase 3).
//
// For every project × `teamMemberIds` entry it creates ONE active assignment
// (bill rate from the project, pay rate from the resource's default pay rate)
// and SKIPS any pair that already has an active assignment. Safe to re-run:
// the second run creates 0 rows. Nothing is ever updated or deleted, and no
// legacy field is touched.
//
// Usage:
//   npx tsx src/scripts/backfill-assignments.ts [--dry-run]
// Env: MONGODB_URI, MONGODB_DB_NAME (same as server).
import 'dotenv/config'
import { getDb, closeDb } from '../lib/mongodb.js'
import { COLLECTIONS, ensureAssignmentIndexes } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

export interface BackfillAssignmentsResult {
  projectsScanned: number
  pairsConsidered: number
  created: number
  existing: number
  skipped: number
  dryRun: boolean
  errors: string[]
}

function asObjectId(value: unknown): ObjectId | undefined {
  if (value instanceof ObjectId) return value
  if (typeof value === 'string' && ObjectId.isValid(value)) return new ObjectId(value)
  return undefined
}

export async function backfillAssignments(opts?: { dryRun?: boolean }): Promise<BackfillAssignmentsResult> {
  const dryRun = opts?.dryRun ?? process.argv.includes('--dry-run')
  const db = await getDb()
  const result: BackfillAssignmentsResult = {
    projectsScanned: 0,
    pairsConsidered: 0,
    created: 0,
    existing: 0,
    skipped: 0,
    dryRun,
    errors: [],
  }

  const projects = await db.collection(COLLECTIONS.PROJECTS).find({}).toArray()
  result.projectsScanned = projects.length
  const now = new Date()

  for (const project of projects) {
    const projectId = asObjectId(project._id)
    const members: unknown[] = Array.isArray(project.teamMemberIds) ? project.teamMemberIds : []
    if (!projectId || members.length === 0) continue

    // Resolve the client FK once per project: explicit clientId, else upsert
    // the legacy free-text client. Best-effort — a legacy project must never
    // make the backfill fail.
    let clientId: ObjectId | undefined = asObjectId(project.clientId)
    if (!clientId && typeof project.client === 'string' && project.client.trim()) {
      try {
        const { findOrCreateClient } = await import('../services/client.service.js')
        const client = dryRun ? null : await findOrCreateClient({ name: project.client.trim() })
        if (client) clientId = asObjectId(client.id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        result.errors.push(`project ${projectId.toString()} client resolution failed: ${msg}`)
      }
    }

    for (const raw of members) {
      result.pairsConsidered++
      const resourceId = asObjectId(raw)
      if (!resourceId) {
        result.skipped++
        result.errors.push(`project ${projectId.toString()} has an invalid team member id; skipped`)
        continue
      }
      const active = await db
        .collection(COLLECTIONS.ASSIGNMENTS)
        .findOne({ resourceId, projectId, status: 'active' })
      if (active) {
        result.existing++
        continue
      }
      const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: resourceId })
      if (!user) {
        result.skipped++
        result.errors.push(`resource ${resourceId.toString()} no longer exists; skipped`)
        continue
      }
      const doc: Record<string, any> = {
        resourceId,
        projectId,
        startDate: typeof project.startDate === 'string' ? project.startDate : '',
        endDate: typeof project.endDate === 'string' ? project.endDate : '',
        billRate: typeof project.hourlyRate === 'number' ? project.hourlyRate : 0,
        payRate: typeof user.defaultPayRate === 'number' ? user.defaultPayRate : 0,
        billingType: 'hourly',
        timesheetRequired: true,
        approvalRequired: true,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      }
      if (clientId) doc.clientId = clientId
      if (dryRun) {
        result.created++
        continue
      }
      await db.collection(COLLECTIONS.ASSIGNMENTS).insertOne(doc)
      result.created++
    }
  }

  return result
}

const isMain = process.argv[1]?.endsWith('backfill-assignments.ts') ?? false
if (isMain) {
  ensureAssignmentIndexes()
    .then(() => backfillAssignments())
    .then((r) => {
      console.log(
        `[backfill-assignments] dryRun=${r.dryRun} projectsScanned=${r.projectsScanned} ` +
          `pairsConsidered=${r.pairsConsidered} created=${r.created} existing=${r.existing} ` +
          `skipped=${r.skipped} errors=${r.errors.length}`,
      )
      for (const e of r.errors) console.error(`[backfill-assignments] error: ${e}`)
      return closeDb()
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[backfill-assignments] fatal:', err)
      process.exit(1)
    })
}
