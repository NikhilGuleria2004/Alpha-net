import { useState, type FormEvent } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useToast } from '../../contexts/ToastContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { resetPassword } from '../../services/authService'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { validatePassword } from '../../utils/validation'

/**
 * Self-service password reset (EMSFrontend.md §5.1, §7.1). The reset token is
 * delivered by email and read from the `?token=` query param; submitting calls
 * POST /auth/reset-password via the `api` switch and then returns to /login.
 */
export function ResetPasswordPage() {
  usePageTitle('Reset password')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addToast } = useToast()
  const [token] = useState(() => searchParams.get('token') ?? '')
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
      setError('This reset link is missing a token. Request a new one from the sign-in page.')
      return
    }
    setIsSubmitting(true)
    try {
      await resetPassword(token, password)
      addToast('success', 'Your password has been reset. Sign in below.')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password. Try requesting a new link.')
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

        <h1 className="mt-5 text-xl font-semibold text-foreground">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter a new password — it must be at least 8 characters with upper, lower and a number.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          <Input
            label="Reset token"
            value={token}
            readOnly
            noSpell
            helperText="From the reset email link."
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
            {isSubmitting ? 'Resetting…' : 'Reset password'}
          </Button>
        </form>
      </div>
    </div>
  )
}
