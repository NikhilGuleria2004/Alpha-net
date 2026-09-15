/// <reference types="vitest" />
// Phase 7: AI write actions must never reach the platform API until the user
// confirms the staged action, and the confirm call must travel the same route
// (with the same user token) as a manual click.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { confirmPendingAction, cancelPendingAction } from '../services/ai.service.js'
import { stagePendingAction } from '../lib/pendingActions.js'
import { callPlatformApi } from '../lib/aiApiClient.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'

// Keep the real PlatformApiError class (ai.service does instanceof checks) and
// only stub the network call.
vi.mock('../lib/aiApiClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/aiApiClient.js')>()
  return { ...actual, callPlatformApi: vi.fn() }
})

const TIMESHEET_ID = '507f1f77bcf86cd799439011'
const USER_ID = '507f1f77bcf86cd799439021'
const OTHER_USER_ID = '507f1f77bcf86cd799439031'

function fakeReq(userId: string): AuthenticatedRequest {
  return { user: { userId, role: 'user', isSupervisor: true } } as unknown as AuthenticatedRequest
}

describe('AI staged write actions — confirmation gate', () => {
  beforeEach(() => {
    vi.mocked(callPlatformApi).mockReset()
    vi.mocked(callPlatformApi).mockResolvedValue({ timesheet: { id: TIMESHEET_ID, status: 'approved' } })
  })

  it('re-validates args and re-checks expiry before executing a create', async () => {
    const staged = stagePendingAction(USER_ID, 'createTimesheet', { projectId: 'nope' }, 'summary')
    await expect(confirmPendingAction(fakeReq(USER_ID), staged.id, 'token')).rejects.toThrow('VALIDATION')
    expect(callPlatformApi).not.toHaveBeenCalled()
  })

  it('executes an approved review against the approvals route with the user token', async () => {
    const staged = stagePendingAction(USER_ID, 'approveTimesheet', { timesheetId: TIMESHEET_ID }, 'summary')
    const result = await confirmPendingAction(fakeReq(USER_ID), staged.id, 'user-token')

    expect(callPlatformApi).toHaveBeenCalledWith(
      'user-token',
      'POST',
      `/approvals/${TIMESHEET_ID}/approve`,
      {},
    )
    expect(result.message).toContain('approved')
  })

  it('sends the decline reason to the approvals route', async () => {
    const staged = stagePendingAction(
      OTHER_USER_ID,
      'declineTimesheet',
      { timesheetId: TIMESHEET_ID, reason: 'Hours do not match the log' },
      'summary',
    )
    const result = await confirmPendingAction(fakeReq(OTHER_USER_ID), staged.id, 'user-token')

    expect(callPlatformApi).toHaveBeenCalledWith(
      'user-token',
      'POST',
      `/approvals/${TIMESHEET_ID}/decline`,
      { reason: 'Hours do not match the log' },
    )
    expect(result.message).toContain('declined')
  })

  it('refuses to execute a decline that carries no reason', async () => {
    const staged = stagePendingAction(OTHER_USER_ID, 'declineTimesheet', { timesheetId: TIMESHEET_ID }, 'summary')
    await expect(confirmPendingAction(fakeReq(OTHER_USER_ID), staged.id, 'token')).rejects.toThrow('VALIDATION')
    expect(callPlatformApi).not.toHaveBeenCalled()
  })

  it('rejects a confirm attempt by a user who does not own the staged action', async () => {
    const staged = stagePendingAction(USER_ID, 'approveTimesheet', { timesheetId: TIMESHEET_ID }, 'summary')
    await expect(confirmPendingAction(fakeReq(OTHER_USER_ID), staged.id, 'token')).rejects.toThrow('FORBIDDEN')
    expect(callPlatformApi).not.toHaveBeenCalled()
  })

  it('does not let the same action execute twice', async () => {
    const staged = stagePendingAction(USER_ID, 'approveTimesheet', { timesheetId: TIMESHEET_ID }, 'summary')
    await confirmPendingAction(fakeReq(USER_ID), staged.id, 'user-token')
    await expect(confirmPendingAction(fakeReq(USER_ID), staged.id, 'user-token')).rejects.toThrow('NOT_FOUND')
    expect(callPlatformApi).toHaveBeenCalledTimes(1)
  })

  it('surfaces a platform rejection instead of reporting success', async () => {
    vi.mocked(callPlatformApi).mockRejectedValueOnce(new Error('Not authorized to approve this timesheet'))
    const staged = stagePendingAction(OTHER_USER_ID, 'approveTimesheet', { timesheetId: TIMESHEET_ID }, 'summary')
    await expect(confirmPendingAction(fakeReq(OTHER_USER_ID), staged.id, 'user-token')).rejects.toThrow(
      'Not authorized to approve this timesheet',
    )
  })

  it('cancel prevents a later confirm from executing', async () => {
    const staged = stagePendingAction(USER_ID, 'approveTimesheet', { timesheetId: TIMESHEET_ID }, 'summary')
    const cancelled = cancelPendingAction(fakeReq(USER_ID), staged.id)
    expect(cancelled.ok).toBe(true)

    await expect(confirmPendingAction(fakeReq(USER_ID), staged.id, 'user-token')).rejects.toThrow('NOT_FOUND')
    expect(callPlatformApi).not.toHaveBeenCalled()
  })
})
