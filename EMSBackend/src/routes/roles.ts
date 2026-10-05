import { Router, type Response } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/access.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import {
  ROLE_CATALOG,
  CAPABILITY_CATALOG,
  capabilityMatrix,
} from '../services/capabilities.js'
import { resolveEmsRole } from '../lib/role.js'
import type { UserRole } from '../types/auth.js'

/**
 * GET /roles — read-only role × capability matrix for the admin "Roles &
 * Access" screen (EMSBackend §6.2).
 *
 * The page used to be a Phase 7 placeholder, but every rule it needs already
 * existed in `getCapabilities`; this endpoint just serves that matrix plus the
 * catalog metadata and a live headcount per role. Deriving the response from
 * `getCapabilities` (rather than restating it) means the screen can never drift
 * from what the API actually enforces.
 *
 * Roles are assigned through the employee directory (`PATCH /employees/:id`),
 * not here — this endpoint is deliberately read-only.
 */
export function rolesRoutes() {
  const router = Router()

  router.use(authenticate, requireRole('admin'))

  router.get('/', async (_req, res: Response) => {
    const db = await getDb()
    const matrix = capabilityMatrix()

    // Headcount per EMS role. Group the stored (role, emsRole) pairs and run
    // each through the real `resolveEmsRole`, so the counts cannot drift from
    // the resolution every request actually uses (D-19: `emsRole` wins, the
    // platform's flat `user` degrades to `employee`).
    const pairs = await db
      .collection(COLLECTIONS.USERS)
      .aggregate<{ _id: { role: string | null; emsRole: string | null }; count: number }>([
        { $project: { _id: 0, role: 1, emsRole: 1 } },
        { $group: { _id: { role: '$role', emsRole: '$emsRole' }, count: { $sum: 1 } } },
      ])
      .toArray()

    const userCountByRole = new Map<UserRole, number>(ROLE_CATALOG.map((r) => [r.key, 0]))
    for (const pair of pairs) {
      const resolved = resolveEmsRole({ role: pair._id.role, emsRole: pair._id.emsRole })
      if (userCountByRole.has(resolved as UserRole)) {
        userCountByRole.set(resolved as UserRole, (userCountByRole.get(resolved as UserRole) ?? 0) + pair.count)
      }
    }

    const usersByRole = ROLE_CATALOG.map((role) => ({
      ...role,
      userCount: userCountByRole.get(role.key) ?? 0,
    }))

    // Group the capabilities for rendering, preserving catalog order.
    const grouped = new Map<string, Array<(typeof CAPABILITY_CATALOG)[number]>>()
    for (const cap of CAPABILITY_CATALOG) {
      const bucket = grouped.get(cap.group) ?? []
      bucket.push(cap)
      grouped.set(cap.group, bucket)
    }

    res.json({
      roles: usersByRole,
      groups: [...grouped.entries()].map(([name, capabilities]) => ({
        name,
        capabilities: capabilities.map((cap) => ({
          key: cap.key,
          label: cap.label,
          billableGated: cap.billableGated ?? false,
          granted: ROLE_CATALOG.reduce<Record<string, boolean>>((acc, role) => {
            acc[role.key] = matrix[role.key][cap.key]
            return acc
          }, {}),
        })),
      })),
    })
  })

  return router
}
