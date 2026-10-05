/**
 * My Profile — `/me/profile` (EMSFrontend.md §7.11, §5.1; §15 marks this
 * ✅ for employee/hr/manager).
 *
 * Read-only by design. Every field below comes from the session bootstrap
 * (`GET /auth/me`, held in `AuthContext`), so this page issues no request of
 * its own and cannot drift from the identity the API already resolved.
 *
 * There is deliberately no edit form here: EMSBackend exposes no
 * self-profile mutation endpoint (`GET /auth/me` is read-only, and
 * `PATCH /employees/:id` is admin/hr-gated), so an editable form would be a
 * control that silently discards input. The sibling timesheet platform does
 * have `PATCH /users/me`, but its allowed set includes `email` — the login
 * credential — which needs a verification step before it is safe to expose.
 *
 * Appearance preferences (theme/density/surface) live in `/me/settings`; §7.11
 * treats Profile and Appearance as sections of one settings surface, so this
 * page links there rather than duplicating those controls.
 */
import type { ReactNode } from 'react'
import { ArrowRight, ShieldAlert } from 'lucide-react'
import type { EmploymentType, UserStatus } from '../../types/auth'
import { useAuth } from '../../contexts/AuthContext'
import { EmsCard } from '../../components/ems/EmsCard'
import { EmployeeIdBadge } from '../../components/ems/EmployeeIdBadge'
import { RoleBadge } from '../../components/ems/RoleBadge'
import { BillableChip } from '../../components/ems/BillableChip'
import { PayRateCell } from '../../components/ems/PayRateCell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { LoadingState } from '../../components/ui/LoadingState'
import { formatDate } from '../../utils/date'

/**
 * `UserStatus` is not one of `StatusBadge`'s covered unions (project /
 * timesheet / invoice), so this maps it to a plain `Badge` rather than
 * reusing that component — passing an unknown status there would miss its
 * `config` lookup and throw on destructuring.
 */
const STATUS_META: Record<UserStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
  active: { label: 'Active', variant: 'success' },
  invited: { label: 'Invited', variant: 'warning' },
  on_leave: { label: 'On leave', variant: 'info' },
  inactive: { label: 'Inactive', variant: 'danger' },
}

/** Typed against the union so a new member fails the build rather than rendering "—". */
const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  contract: 'Contract',
}

const EM_DASH = '—'

/** One label/value pair. Renders `—` for absent optionals so rows stay aligned. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

/** Fields the employee cannot change themselves, with the route that does own them. */
function ManagedByHr({ target }: { target: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        Maintained by HR. To correct anything here, ask your HR contact — they edit it from{' '}
        {target}.
      </span>
    </p>
  )
}

export function MyProfilePage() {
  const { user } = useAuth()

  // `ProtectedRoute` already gates on `isLoading`, so this only guards the
  // type contract (and the frame between logout and unmount).
  if (!user) {
    return <LoadingState label="Loading your profile…" />
  }

  const status = STATUS_META[user.status]

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">My Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your employee record as it stands in the shared company database.
        </p>
      </header>

      <EmsCard title="Identity">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">{user.name}</Field>
          <Field label="Email">{user.email}</Field>
          <Field label="Employee ID">
            {user.employeeId ? <EmployeeIdBadge id={user.employeeId} /> : EM_DASH}
          </Field>
          <Field label="Account status">
            <Badge variant={status.variant} size="sm">
              {status.label}
            </Badge>
          </Field>
        </dl>
        <ManagedByHr target="Employees" />
      </EmsCard>

      <EmsCard title="Employment">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="EMS role">
            <RoleBadge role={user.role} size="sm" />
          </Field>
          <Field label="Department">{user.department ?? EM_DASH}</Field>
          <Field label="Job title">{user.title ?? EM_DASH}</Field>
          <Field label="Employment type">
            {user.employmentType ? EMPLOYMENT_TYPE_LABEL[user.employmentType] : EM_DASH}
          </Field>
          <Field label="Start date">{user.joinedAt ? formatDate(user.joinedAt) : EM_DASH}</Field>
          <Field label="Resource type">
            <BillableChip billable={user.billable} size="sm" />
          </Field>
        </dl>
        <ManagedByHr target="the employee record" />
      </EmsCard>

      <EmsCard title="Compensation" subtitle="Your own pay rate. Client bill rates are never shown here.">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Pay rate">
            <PayRateCell amount={user.payRate} currency={user.currency} period="hour" />
          </Field>
          <Field label="Currency">{user.currency ?? EM_DASH}</Field>
        </dl>
        <ManagedByHr target="Pay Rates, which keeps a history of every change" />
      </EmsCard>

      <EmsCard title="Preferences">
        <p className="text-sm text-muted-foreground">
          Theme, density and surface style are yours to change and persist on this device.
        </p>
        <div>
          <Button variant="secondary" to="/me/settings" rightIcon={<ArrowRight className="h-4 w-4" />}>
            Open My Settings
          </Button>
        </div>
      </EmsCard>
    </div>
  )
}
