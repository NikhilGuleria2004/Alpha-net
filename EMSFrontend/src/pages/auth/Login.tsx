import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { dashboardPathFor } from '../../utils/dashboardPath'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'

/**
 * Sign-in (EMSFrontend.md §5.1, §14 Phase 2 gate "log in as each of 5
 * roles"). Mock credentials resolve against the seeded directory via
 * `AuthContext.login`; Phase 3 replaces the adapter with the real
 * `/auth/login` endpoint without touching this form's contract.
 */
export function LoginPage() {
  usePageTitle('Sign in')
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      // authService.login → POST /auth/login via the `api` switch; it stashes the
      // in-memory access token and returns the resolved user so the role-aware
      // redirect can happen before the session restore resolves in AuthContext.
      const user = await login(email.trim(), password)
      const returnTo = from?.pathname ? `${from.pathname}${from.search ?? ''}` : dashboardPathFor(user.role)
      navigate(returnTo, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Check your email and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="ems-shadow-card w-full max-w-md rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
            E
          </div>
          <span className="text-lg font-semibold text-foreground">Eniac EMS</span>
        </div>

        <h1 className="mt-5 text-xl font-semibold text-foreground">Sign in to your workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use your work email to access the Employee Management System.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          <Input
            label="Work email"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@eniac.com"
            autoComplete="email"
            noSpell
            required
            autoFocus
          />
          <Input
            label="Password"
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
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
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
