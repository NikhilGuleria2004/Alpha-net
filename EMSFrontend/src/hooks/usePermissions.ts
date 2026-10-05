import { getCapabilities, type Capabilities } from '../utils/permissions'
import type { EmsUser } from '../types/auth'
import { useAuth } from '../contexts/AuthContext'

/**
 * Capability access for components (EMSFrontend.md §6.3, §10).
 *
 * Phase 3: now that the auth context exists, this reads the signed-in user from
 * context by default — call sites that don't pass an argument resolve their caps
 * from `useAuth()`. Callers that need to simulate another role (the dev
 * playground's role matrix) may still pass an explicit user, which takes
 * precedence. `null` yields zero capabilities (deny by default).
 */
export function usePermissions(user?: EmsUser | null): Capabilities {
  const contextUser = useAuth().user
  return getCapabilities(user ?? contextUser)
}

export type { Capabilities }
