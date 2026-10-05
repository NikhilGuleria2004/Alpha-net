import { describe, it, expect } from 'vitest'
import { resolveEmsRole, isEmsRole, emsRoleUpdate } from '../lib/role.js'

/**
 * Phase 8 / D-19 — the shared `users` collection carries the *platform's*
 * vocabulary, so EMS must translate rather than read `role` directly.
 *
 * Before this, a platform account (`role: 'user'`) authenticated fine and then
 * received zero capabilities: `getCapabilities` matched no case and fell through
 * to NO_ACCESS, so every screen 403'd.
 */
describe('resolveEmsRole — platform role translation', () => {
  it('maps the platform\'s flat "user" role to employee', () => {
    expect(resolveEmsRole({ role: 'user' })).toBe('employee')
  })

  it('passes through roles both services already agree on', () => {
    expect(resolveEmsRole({ role: 'admin' })).toBe('admin')
    expect(resolveEmsRole({ role: 'hr' })).toBe('hr')
    expect(resolveEmsRole({ role: 'manager' })).toBe('manager')
    expect(resolveEmsRole({ role: 'employee' })).toBe('employee')
  })

  it('always returns a member of the UserRole union', () => {
    for (const role of ['user', 'admin', 'nonsense', '', undefined, null, 42, {}]) {
      expect(isEmsRole(resolveEmsRole({ role } as any))).toBe(true)
    }
  })

  it('defaults to employee when there is no user at all', () => {
    expect(resolveEmsRole(null)).toBe('employee')
    expect(resolveEmsRole(undefined)).toBe('employee')
    expect(resolveEmsRole({})).toBe('employee')
  })

  it('prefers the EMS-owned override over the platform value', () => {
    // A platform user promoted to an EMS manager stays a platform `user`;
    // only EMS cares that they are a manager.
    expect(resolveEmsRole({ role: 'user', emsRole: 'manager' })).toBe('manager')
    expect(resolveEmsRole({ role: 'admin', emsRole: 'employee' })).toBe('employee')
  })

  it('ignores a corrupt override rather than leaking it', () => {
    expect(resolveEmsRole({ role: 'user', emsRole: 'superuser' })).toBe('employee')
    expect(resolveEmsRole({ role: 'admin', emsRole: 7 })).toBe('admin')
  })
})

/**
 * D-21 — EMS dropped the `supervisor` role. The platform's `isSupervisor` flag
 * is project-scoped (supervise projects and their timesheets) while an EMS
 * supervisor would be people-scoped, so honouring it would grant powers over a
 * team that does not exist in EMS. A platform supervisor must therefore resolve
 * to `employee`, which is what the flag already produced in practice.
 */
describe('supervisor is not an EMS role (D-21)', () => {
  it('resolves a platform supervisor to employee, not supervisor', () => {
    expect(resolveEmsRole({ role: 'user', isSupervisor: true })).toBe('employee')
  })

  it('never returns "supervisor" for any stored shape', () => {
    const probes = [
      { role: 'user', isSupervisor: true },
      { role: 'supervisor', isSupervisor: true },
      { role: 'user', emsRole: 'supervisor' },
      { role: 'admin', emsRole: 'supervisor' },
    ]
    for (const probe of probes) {
      expect(resolveEmsRole(probe as never)).not.toBe('supervisor')
      expect(isEmsRole(resolveEmsRole(probe as never))).toBe(true)
    }
  })

  it('rejects "supervisor" as an EMS role override', () => {
    expect(isEmsRole('supervisor')).toBe(false)
    expect(isEmsRole('manager')).toBe(true)
  })
})

describe('emsRoleUpdate — never writes the platform-owned field', () => {
  it('targets emsRole so the platform\'s z.enum([\'admin\',\'user\']) stays satisfiable', () => {
    const patch = emsRoleUpdate('manager')
    expect(patch).toEqual({ emsRole: 'manager' })
    expect('role' in patch).toBe(false)
  })
})