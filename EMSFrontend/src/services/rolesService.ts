/**
 * Roles & Access service — typed wrapper over `GET /roles`.
 *
 * The endpoint is read-only and derives its payload from the same
 * `getCapabilities` the API enforces on every route, so this screen can never
 * disagree with real authorization. Roles themselves are assigned in the
 * employee directory (`PATCH /employees/:id`), not here.
 */
import { api } from './apiClient'
import type { UserRole } from '../types/auth'

export interface RoleSummary {
  key: UserRole
  label: string
  summary: string
  userCount: number
}

export interface CapabilityCell {
  key: string
  label: string
  /** True when access depends on the user's `billable` flag, not just role. */
  billableGated: boolean
  /** Keyed by role: `{ admin: true, hr: false, ... }`. */
  granted: Record<string, boolean>
}

export interface CapabilityGroupBlock {
  name: string
  capabilities: CapabilityCell[]
}

export interface GetRolesResponse {
  roles: RoleSummary[]
  groups: CapabilityGroupBlock[]
}

export async function getRoles(): Promise<GetRolesResponse> {
  return api.get<GetRolesResponse>('/roles')
}
