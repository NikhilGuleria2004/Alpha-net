import type { EmsUser } from '../../types/auth'
import { MOCK_USERS } from '../fixtures'

/**
 * Curated sign-in directory (one user per role) for the Login page's demo
 * accounts (EMSFrontend.md §5.1, §14 Phase 2 gate "log in as each of 5 roles").
 *
 * Sourced from the canonical `MOCK_USERS` fixture so the email each button
 * submits resolves inside the mock adapter's user lookup — they share one
 * directory. The earlier standalone list diverged from the fixtures and silently
 * failed sign-in for the employee row. Phase 8 replaces this with the real EMS
 * API; until then the list is mock-only.
 */
export const mockUsers: EmsUser[] = MOCK_USERS.reduce<EmsUser[]>((acc, user) => {
  if (!acc.some((existing) => existing.role === user.role)) acc.push(user)
  return acc
}, [])
