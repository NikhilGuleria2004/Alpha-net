import type { UserRole } from '../types/auth.js'

/**
 * The `users` collection is SHARED with the timesheet platform, and the two
 * services do not agree on what `role` means.
 *
 * The platform's vocabulary is flat: `admin` or `user` (see its
 * `z.enum(['admin','user'])` in auth/user/invite schemas), and it encodes
 * "supervisor" as `role: 'user'` + `isSupervisor: true` — see its
 * `invite.service.ts`. EMS needs five roles.
 *
 * So a stored `role: 'user'` is an *ordinary employee* as far as EMS is
 * concerned, and treating it as unknown left every platform user with zero
 * capabilities (`getCapabilities` fell through to NO_ACCESS): they could sign
 * in and then 403 on every screen.
 *
 * EMS models four roles. The platform's `isSupervisor` flag is deliberately
 * NOT consulted: it is project-scoped on the platform (supervise projects and
 * their timesheets) while an EMS supervisor would be people-scoped (supervise
 * direct reports), so honouring it would grant powers over a team that does
 * not exist in EMS. A platform supervisor therefore resolves to `employee`
 * here, which is what the flag already produced in practice. See D-21.
 *
 * EMS therefore never interprets `role` directly. It reads `emsRole` — an
 * EMS-owned field, additive per the shared-DB rules — and only falls back to
 * translating the platform's value when there is no override. That keeps the
 * platform authoritative for "is this a platform admin" while giving EMS its own
 * role model, and it means the next person who signs up on the platform is
 * usable in EMS immediately with no migration.
 *
 * `emsRole` is deliberately the only thing EMS writes on a role change: the
 * platform validates `role` against `z.enum(['admin','user'])` on its own write
 * paths, so EMS must not write an EMS-only value there. See D-19.
 */

const EMS_ROLES: readonly UserRole[] = ['admin', 'hr', 'manager', 'employee']

/** Platform `role` value -> EMS role. Anything unmapped falls through to `employee`. */
const PLATFORM_ROLE_MAP: Readonly<Record<string, UserRole>> = {
  user: 'employee',
  employee: 'employee',
  manager: 'manager',
  hr: 'hr',
  admin: 'admin',
}

export function isEmsRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (EMS_ROLES as readonly string[]).includes(value)
}

/** The subset of a user document this module needs. */
export interface RoleBearingUser {
  role?: unknown
  emsRole?: unknown
  // Mongo documents are `WithId<Document>` with an `any` index signature, which
  // TypeScript otherwise rejects against a purely-optional ("weak") shape.
  [key: string]: unknown
}

/**
 * Effective EMS role: explicit EMS override first, then the platform's value
 * translated, then `employee` as a safe floor. Never returns a value outside
 * the `UserRole` union, which is what unblocks `getCapabilities` and
 * `dashboardPathFor` for every platform user.
 */
export function resolveEmsRole(user: RoleBearingUser | null | undefined): UserRole {
  if (!user) return 'employee'
  if (isEmsRole(user.emsRole)) return user.emsRole
  if (isEmsRole(user.role)) return user.role
  const mapped = PLATFORM_ROLE_MAP[String(user.role)]
  return mapped ?? 'employee'
}


/**
 * Fields for a role change. Returns the patch to write so the caller stores
 * `emsRole` rather than the platform-owned `role`.
 */
export function emsRoleUpdate(role: UserRole): { emsRole: UserRole } {
  return { emsRole: role }
}