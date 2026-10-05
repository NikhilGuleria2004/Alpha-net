import { useState, type FormEvent } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { dashboardPathFor } from '../../utils/dashboardPath'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { validatePassword } from '../../utils/validation'

/**
 * Invite redemption (EMSFrontend.md §5.1, §7.1). An invited employee follows a
 * link `/onboarding/:token`, sets a password here, and POSTs to
 * /auth/redeem-invite via the `api` switch. A successful redemption logs them
 * in (token stashed in memory) and lands them on their role dashboard.
 */
export function InviteRedeemPage() {
  usePageTitle('Set up your account')
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { redeemInvite } = useAuth()
  const { addToast } = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const pw = validatePassword(password)
    if (!pw.valid) {
      setError(pw.message ?? 'Password does not meet the requirements.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!token) {
      setError('This invitation link is missing a token. Ask your administrator for a new one.')
      return
    }
    setIsSubmitting(true)
    try {
      // redeemInvite (AuthContext) → authService.redeemInvite → POST /auth/redeem-invite
      // via the `api` switch; it stashes the access token and sets the context user.
      const user = await redeemInvite(token, password)
      addToast('success', 'Your account is ready. Welcome to Eniac EMS.')
      const returnTo =
        (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? dashboardPathFor(user.role)
      navigate(returnTo, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate your account. The link may have expired.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="ems-shadow-card w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
            E
          </div>
          <span className="text-lg font-semibold text-foreground">Eniac EMS</span>
        </div>

        <h1 className="mt-5 text-xl font-semibold text-foreground">Set up your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a password to accept your invitation. It must be at least 8 characters with
          an uppercase letter, a lowercase letter, and a number.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          <Input
            label="Invitation token"
            value={token}
            readOnly
            noSpell
            helperText="From the email link."
          />
          <Input
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />
          <Input
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-error-soft px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" loading={isSubmitting} disabled={isSubmitting}>
            {isSubmitting ? 'Activating…' : 'Activate account'}
          </Button>
        </form>
      </div>
    </div>
  )
}
