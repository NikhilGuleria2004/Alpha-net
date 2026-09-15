// Phase 7: every tool that mutates platform state must be staged here first and
// only executed after the user approves the exact details on the confirmation
// card. Read-only tools never reach this store.
export type PendingTool = 'createTimesheet' | 'approveTimesheet' | 'declineTimesheet'

export interface PendingAction {
  id: string
  userId: string
  tool: PendingTool
  args: Record<string, unknown>
  summary: string
  status: 'pending' | 'executed' | 'cancelled' | 'expired'
  createdAt: number
  expiresAt: number
}

// Phase 7: two-phase confirm store. In-memory Map is correct for single-instance
// dev. Production multi-instance deployments must replace this with a Mongo
// `pending_actions` collection + TTL index (documented in AI_Asst.md §7.4).
const PENDING_TTL_MS = Number(process.env.AI_PENDING_ACTION_TTL_MS) || 10 * 60 * 1000

const pendingActions = new Map<string, PendingAction>()

function makeId(): string {
  return `pact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function isExpired(action: PendingAction): boolean {
  return Date.now() > action.expiresAt
}

function markExpired(action: PendingAction): PendingAction {
  action.status = 'expired'
  return action
}

export function stagePendingAction(
  userId: string,
  tool: PendingTool,
  args: Record<string, unknown>,
  summary: string,
): PendingAction {
  // Opportunistically sweep this user's stale records.
  for (const [id, existing] of pendingActions) {
    if (existing.userId === userId && (existing.status !== 'pending' || isExpired(existing))) {
      pendingActions.delete(id)
    }
  }
  const now = Date.now()
  const action: PendingAction = {
    id: makeId(),
    userId,
    tool,
    args,
    summary,
    status: 'pending',
    createdAt: now,
    expiresAt: now + PENDING_TTL_MS,
  }
  pendingActions.set(action.id, action)
  return action
}

export function getPendingAction(id: string): PendingAction | undefined {
  const action = pendingActions.get(id)
  if (!action) return undefined
  if (action.status === 'pending' && isExpired(action)) {
    return markExpired(action)
  }
  return action
}

export function settlePendingAction(id: string, status: 'executed' | 'cancelled'): PendingAction | undefined {
  const action = pendingActions.get(id)
  if (!action) return undefined
  action.status = status
  return action
}

export function getPendingTtlMs(): number {
  return PENDING_TTL_MS
}
