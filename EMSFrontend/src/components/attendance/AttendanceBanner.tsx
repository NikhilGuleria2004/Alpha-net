import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useAttendanceToday } from '../../hooks/useAttendanceToday'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { toLocalDateString } from '../../utils/date'
import { getLocalStorage, setLocalStorage } from '../../utils/storage'
import { namespaceForRole } from '../layout/nav'
import { Button } from '../ui/Button'

const DISMISS_KEY = 'att_gate_dismissed'

/**
 * Daily attendance gate (EMSFrontend.md §3.5). Renders in the shell shell for
 * every markable, non-admin role: until today is marked, a dismissible banner
 * sits just below the topbar with a one-click link to the attendance page. The
 * dismissal is per-day (stored under today's date) so it naturally re-surfaces
 * the next morning, and the banner also auto-hides once the day is marked —
 * including when the in-session Mark card retracts it via `onAttendanceChange`.
 */
export function AttendanceBanner() {
  const { user } = useAuth()
  const caps = usePermissions()
  const navigate = useNavigate()
  const { summary, isLoading } = useAttendanceToday()
  const showLoading = useDelayedLoading(isLoading)
  const [dismissed, setDismissed] = useState(() => getLocalStorage<string | null>(DISMISS_KEY, null) === toLocalDateString(new Date()))

  // If the day is already marked (by another tab/component this session), clear
  // a prior dismissal so the banner doesn't linger falsely hidden.
  useEffect(() => {
    if (summary?.marked) {
      setDismissed(false)
    }
  }, [summary?.marked])

  if (!user || !caps.markAttendance) return null
  if (showLoading) return null // avoid a flash before we know the day's state
  if (summary?.marked) return null
  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    setLocalStorage(DISMISS_KEY, toLocalDateString(new Date()))
  }

  const handleMark = () => {
    navigate(`${namespaceForRole(user.role)}/attendance`)
  }

  return (
    <div
      role="status"
      className="ems-overline flex items-center justify-between gap-3 rounded-b-lg border-b border-border bg-error-soft/60 px-4 py-2 text-sm text-foreground"
    >
      <span className="font-medium">
        Don't forget to mark your attendance for today — it takes a second and keeps your record complete.
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={handleMark}>
          Mark now
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Dismiss for today"
          title="Dismiss for today"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
