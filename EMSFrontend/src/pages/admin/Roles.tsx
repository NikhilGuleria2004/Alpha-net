import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Minus, ArrowRight } from 'lucide-react'
import { EmsCard } from '../../components/ems/EmsCard'
import { RoleBadge } from '../../components/ems/RoleBadge'
import { Button } from '../../components/ui/Button'
import { useEmployeeBase } from '../../hooks/useEmployeeBase'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { getRoles, type GetRolesResponse } from '../../services/rolesService'

/**
 * Roles & Access (admin only).
 *
 * Replaces the Phase 7 placeholder. Read-only by design: it renders the
 * capability matrix exactly as `getCapabilities` computes it on the server, so
 * what an admin reads here is what every route actually enforces. Assigning a
 * role happens in the employee directory.
 */
export function AdminRolesPage() {
  const employeeBase = useEmployeeBase()
  const [data, setData] = useState<GetRolesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loading = useDelayedLoading(!data && !error)

  useEffect(() => {
    let cancelled = false
    getRoles()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading roles…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <EmsCard title="Roles & Access">
        <p className="text-sm text-destructive">{error ?? 'Could not load the role matrix.'}</p>
      </EmsCard>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Roles &amp; Access</h1>
          <p className="text-sm text-muted-foreground">
            What each role can reach across the EMS.
          </p>
        </div>
        <Link to={employeeBase}>
          <Button variant="secondary">
            Assign roles in the directory
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* Role cards — the four roles and how many people hold each. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.roles.map((role) => (
          <EmsCard key={role.key} padding="default">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <RoleBadge role={role.key} />
                <span className="ems-tabular text-xs text-muted-foreground">
                  {role.userCount} {role.userCount === 1 ? 'person' : 'people'}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{role.summary}</p>
            </div>
          </EmsCard>
        ))}
      </div>

      {/* The enforced matrix, grouped by area. */}
      {data.groups.map((group) => (
        <EmsCard key={group.name} title={group.name} padding="none">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="ems-overline px-4 py-2 text-left text-muted-foreground"
                  >
                    Capability
                  </th>
                  {data.roles.map((role) => (
                    <th
                      key={role.key}
                      scope="col"
                      className="ems-overline px-4 py-2 text-center text-muted-foreground"
                    >
                      {role.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.capabilities.map((cap) => (
                  <tr key={cap.key} className="border-b border-border last:border-b-0">
                    <th scope="row" className="px-4 py-2 text-left font-normal text-foreground">
                      <span className="flex items-center gap-2">
                        {cap.label}
                        {cap.billableGated && (
                          <span
                            className="text-[10px] uppercase tracking-wider text-muted-foreground"
                            title="Access also depends on the person being billable"
                          >
                            if billable
                          </span>
                        )}
                      </span>
                    </th>
                    {data.roles.map((role) => {
                      const granted = cap.granted[role.key]
                      return (
                        <td key={role.key} className="px-4 py-2 text-center">
                          {granted ? (
                            <Check
                              className="mx-auto h-4 w-4 text-foreground"
                              aria-label="Allowed"
                            />
                          ) : (
                            <Minus
                              className="mx-auto h-4 w-4 text-muted-foreground/40"
                              aria-label="Not allowed"
                            />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </EmsCard>
      ))}

      <p className="text-xs text-muted-foreground">
        This matrix is generated from the same rules the API enforces on every route, so it
        cannot drift from actual access. Inactive users lose every capability. Roles are
        assigned per person in the employee directory.
      </p>
    </div>
  )
}
