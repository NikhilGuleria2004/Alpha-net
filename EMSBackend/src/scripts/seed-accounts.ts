/**
 * seed:accounts — creates the two standing operator accounts the EMS needs to
 * be usable at all.
 *
 * Why this exists: `POST /employees` and `POST /onboarding` are both gated
 * `requireRole('admin', 'hr')`, and `GET /employees` is admin/hr-only too. With
 * no `hr` account on the database there is no way to onboard anyone, so the
 * whole HR surface is unreachable. This script bootstraps exactly the two roles
 * that unlock it — an HR partner and a manager — so the real onboarding flow
 * can be exercised end to end.
 *
 * Deliberately separate from `seed:demo`: that script mirrors the UI fixtures
 * (`@eniac.demo` addresses, 40+ rows) and refuses to touch the shared platform
 * database. These are real `@eniacinc.com` operator logins, so they must run
 * against whichever database `.env` points at.
 *
 * Writes the same document shape `createEmployee` + `redeemInvite` produce —
 * `role` AND `emsRole` together, `status: 'active'`, a bcrypt `passwordHash`,
 * `employmentType`, and a `payrate_history` row is NOT written because neither
 * account is billable (`payRate: null`), matching the guardrail in
 * `createEmployee`.
 *
 * Safe to re-run: every account is an upsert keyed on `email`. Re-running
 * rotates the password back to the value below, so it is also the way to reset
 * a forgotten local password.
 *
 * Usage: npm run seed:accounts
 */
import 'dotenv/config'
import { getDb, closeDb } from '../lib/mongodb.js'
import { COLLECTIONS, ensureIndexes } from '../lib/collections.js'
import { hashPassword } from '../services/auth.service.js'
import type { UserRole } from '../types/auth.js'

interface AccountSpec {
  name: string
  email: string
  password: string
  employeeId: string
  role: UserRole
  department: string
  title: string
}

/**
 * `employeeId` is UNIQUE in the `users` collection, so these are pinned well
 * clear of the `E000001`–`E000102` band the demo seeder and real hires use.
 * Override with SEED_HR_EMPLOYEE_ID / SEED_MANAGER_EMPLOYEE_ID if they collide.
 */
const ACCOUNTS: AccountSpec[] = [
  {
    name: process.env.SEED_HR_NAME ?? 'HR-Eniac',
    email: 'hreniac@eniacinc.com',
    password: process.env.SEED_HR_PASSWORD ?? 'EniacHR1',
    employeeId: process.env.SEED_HR_EMPLOYEE_ID ?? 'E000900',
    role: 'hr',
    department: 'People Ops',
    title: 'HR Partner',
  },
  {
    name: process.env.SEED_MANAGER_NAME ?? 'Manager',
    email: 'manager@eniacinc.com',
    password: process.env.SEED_MANAGER_PASSWORD ?? 'EniacMng1',
    employeeId: process.env.SEED_MANAGER_EMPLOYEE_ID ?? 'E000901',
    role: 'manager',
    department: 'Delivery',
    title: 'Delivery Manager',
  },
]

async function main() {
  const dbName = process.env.MONGODB_DB_NAME || '(unset)'
  console.log(`[seed:accounts] target database: ${dbName}`)

  // Same guard as the rest of the app: the unique email/employeeId indexes must
  // exist before an upsert-by-email can be trusted to fail loudly on a clash.
  await ensureIndexes()
  const db = await getDb()
  const users = db.collection(COLLECTIONS.USERS)
  const now = new Date()

  for (const spec of ACCOUNTS) {
    const email = spec.email.toLowerCase()
    const passwordHash = await hashPassword(spec.password)

    // Refuse to steal an existing person's account: if the address is taken by
    // a different employeeId, or the employeeId belongs to a different email,
    // stop rather than silently reassign someone's role to admin/hr.
    const clash = await users.findOne({
      $or: [{ email }, { employeeId: spec.employeeId }],
    })
    if (clash && (clash.email !== email || clash.employeeId !== spec.employeeId)) {
      console.error(
        `[seed:accounts] SKIPPED ${email}: address or employeeId ${spec.employeeId} ` +
          `already belongs to ${clash.email} (${clash.employeeId}). ` +
          'Pick a different id via the SEED_*_EMPLOYEE_ID env vars.',
      )
      process.exitCode = 1
      continue
    }

    // `role` and `emsRole` are written together, as `createEmployee` does.
    // `resolveEmsRole` prefers `emsRole`, so leaving it unset would make the
    // account fall back to the platform's value and resolve to `employee`.
    // `createdAt` is deliberately absent from `doc`: it belongs in `$setOnInsert`
    // only, so re-running refreshes the role and password without rewriting the
    // original join date.
    const doc = {
      name: spec.name,
      email,
      employeeId: spec.employeeId,
      department: spec.department,
      role: spec.role,
      emsRole: spec.role,
      title: spec.title,
      employmentType: 'full_time',
      status: 'active',
      billable: false,
      payRate: null,
      currency: 'USD',
      passwordHash,
      updatedAt: now,
    }

    await users.updateOne(
      { email },
      {
        $set: doc,
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    )

    // Keep the department registry in step, as `createEmployee`'s
    // `syncDepartment` does, so the HR filters and dropdowns list it.
    await db.collection(COLLECTIONS.DEPARTMENTS).updateOne(
      { name: spec.department },
      { $setOnInsert: { name: spec.department, createdAt: now } },
      { upsert: true },
    )

    console.log(`[seed:accounts] ${spec.role.padEnd(7)} ${email}  (${spec.employeeId}, ${spec.department})`)
  }

  await closeDb()
}

main().catch((err) => {
  console.error('[seed:accounts] failed:', err)
  process.exit(1)
})
