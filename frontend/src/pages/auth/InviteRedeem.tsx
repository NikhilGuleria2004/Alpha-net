import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { AlertCircle } from 'lucide-react'
import { getInviteByToken, redeemInvite } from '../../services/inviteService'
import { dashboardPathFor } from '../../routes/HomeRedirect'
import { FullPageSpinner } from '../../components/ui/FullPageSpinner'

export function InviteRedeem() {
  usePageTitle('Accept Invite')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login } = useAuth()
  const { addToast } = useToast()

  const token = searchParams.get('token') || ''

  const [isVerifying, setIsVerifying] = useState(true)
  const [isValidToken, setIsValidToken] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string; general?: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function verify() {
      if (!token) {
        setIsVerifying(false)
        setVerifyError('No invitation token provided.')
        return
      }
      try {
        const invite = await getInviteByToken(token)
        if (!cancelled) {
          if (invite) {
            setIsValidToken(true)
            setInviteEmail(invite.email)
          } else {
            setIsValidToken(false)
            setVerifyError('This invitation link is invalid or has expired.')
          }
        }
      } catch {
        if (!cancelled) {
          setIsValidToken(false)
          setVerifyError('Unable to verify this invitation. Please try again.')
        }
      } finally {
        if (!cancelled) setIsVerifying(false)
      }
    }
    void verify()
    return () => { cancelled = true }
  }, [token])

  const validate = () => {
    const newErrors: { password?: string; confirmPassword?: string } = {}
    if (!password) {
      newErrors.password = 'Password is required'
    } else {
      const pw = validatePassword(password)
      if (!pw.valid) newErrors.password = pw.message || 'Password does not meet requirements'
    }
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validatePassword = (password: string): { valid: boolean; message?: string } => {
    if (password.length < 8) return { valid: false, message: 'Password must be at least 8 characters long' }
    if (!/[A-Z]/.test(password)) return { valid: false, message: 'Password must contain at least one uppercase letter' }
    if (!/[a-z]/.test(password)) return { valid: false, message: 'Password must contain at least one lowercase letter' }
    if (!/[0-9]/.test(password)) return { valid: false, message: 'Password must contain at least one number' }
    return { valid: true }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    setErrors({})
    try {
      const result = await redeemInvite({ token, password })
      if (!result.user || !result.invite) {
        setErrors({ general: 'This invitation link is invalid or has expired.' })
        return
      }
      await login(result.user.email, password)
      addToast('success', 'Account activated successfully')
      navigate(dashboardPathFor(result.user.role), { replace: true })
    } catch {
      setErrors({ general: 'Failed to activate account. Please try again.' })
      addToast('error', 'Account activation failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isVerifying) {
    return <div className="flex min-h-screen items-center justify-center"><FullPageSpinner /></div>
  }

  if (!isValidToken || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="mx-auto w-full max-w-sm text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error-soft">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Invalid Invitation</h1>
          <p className="mt-2 text-sm text-muted-foreground">{verifyError || 'This invitation link is invalid or has expired.'}</p>
          <Button variant="secondary" onClick={() => navigate('/adminlog')} className="mt-6">Go to Sign In</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden bg-slate-900 lg:flex lg:w-1/2 lg:flex-col lg:items-center lg:justify-center lg:p-12">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-white">
            <span className="text-3xl font-bold">A</span>
          </div>
          <h1 className="text-4xl font-bold text-white">Eniac</h1>
          <p className="mt-4 text-lg text-muted-foreground">Internal Project Management</p>
          <p className="mt-2 text-accent/60">Set your password to get started.</p>
        </div>
      </div>

      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
              <span className="text-lg font-bold">A</span>
            </div>
            <span className="text-2xl font-bold text-foreground">Eniac</span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Set Your Password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Accept the invitation for <strong className="text-foreground">{inviteEmail}</strong></p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {errors.general && (
              <div className="rounded-lg border border-destructive/20 bg-error-soft px-4 py-3 text-sm text-destructive" role="alert">
                {errors.general}
              </div>
            )}
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((prev) => ({ ...prev, password: '' })) }}
              error={errors.password}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Confirm Password</label>
              <div className="relative">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: '' })) }}
                  className="w-full rounded-lg border border-border px-3 py-2 pr-10 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.confirmPassword)}
                />
              </div>
              {errors.confirmPassword && <p className="mt-1 text-sm text-destructive" role="alert">{errors.confirmPassword}</p>}
            </div>

            <Button type="submit" loading={isSubmitting} disabled={isSubmitting} className="w-full">
              Activate Account
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
