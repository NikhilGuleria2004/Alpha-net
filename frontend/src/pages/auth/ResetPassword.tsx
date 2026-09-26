import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { resetPassword } from '../../services/authService'
import { usePageTitle } from '../../hooks/usePageTitle'

export function ResetPassword() {
  usePageTitle('Reset Password')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addToast } = useToast()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string; general?: string }>({})
  const [isLoading, setIsLoading] = useState(false)

  const validate = () => {
    const next: { password?: string; confirmPassword?: string } = {}
    if (password.length < 8) next.password = 'Password must be at least 8 characters long'
    else if (!/[A-Z]/.test(password)) next.password = 'Password must contain at least one uppercase letter'
    else if (!/[a-z]/.test(password)) next.password = 'Password must contain at least one lowercase letter'
    else if (!/[0-9]/.test(password)) next.password = 'Password must contain at least one number'
    if (password !== confirmPassword) next.confirmPassword = 'Passwords do not match'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!token) {
      setErrors({ general: 'This reset link is missing its token. Request a new one from the sign-in page.' })
      return
    }
    if (!validate()) return
    setIsLoading(true)
    setErrors({})
    try {
      await resetPassword(token, password)
      addToast('success', 'Password reset. You can now sign in.')
      navigate('/userlog')
    } catch {
      setErrors({ general: 'This reset link is invalid or has expired. Request a new one.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden bg-slate-900 lg:flex lg:w-1/2 lg:flex-col lg:items-center lg:justify-center lg:p-12">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-card/10">
            <span className="text-3xl font-bold text-white">A</span>
          </div>
          <h1 className="text-4xl font-bold text-white">Eniac</h1>
          <p className="mt-4 text-lg text-muted-foreground">Choose a new password to get back in.</p>
        </div>
      </div>
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <h2 className="text-2xl font-semibold text-foreground">Reset password</h2>
          <p className="mt-1 text-sm text-muted-foreground">Enter a new password for your account.</p>
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {errors.general && (
              <div className="rounded-lg border border-destructive/20 bg-error-soft px-4 py-3 text-sm text-destructive" role="alert">
                {errors.general}
              </div>
            )}
            <Input label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} placeholder="New password" autoComplete="new-password" />
            <Input label="Confirm new password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} error={errors.confirmPassword} placeholder="Repeat new password" autoComplete="new-password" />
            <Button type="submit" loading={isLoading} disabled={isLoading} className="w-full">Set new password</Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link to="/userlog" className="text-accent hover:text-accent-hover">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
