import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'

export function UserLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({})
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {}
    if (!email.trim()) newErrors.email = 'Email is required'
    if (!password.trim()) newErrors.password = 'Password is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    setIsLoading(true)
    setErrors({})
    try {
      await login('user')
      addToast('success', 'Welcome back')
      navigate('/user/dashboard')
    } catch {
      setErrors({ general: 'Invalid credentials. Please try again.' })
      addToast('error', 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDemoLogin = async (demoId: 'user-demo' | 'supervisor-demo') => {
    setIsLoading(true)
    setErrors({})
    try {
      await login('user')
      addToast('success', 'Welcome back')
      navigate(demoId === 'supervisor-demo' ? '/supervisor/timesheets' : '/user/dashboard')
    } catch {
      setErrors({ general: 'Demo login failed. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden bg-slate-900 lg:flex lg:w-1/2 lg:flex-col lg:items-center lg:justify-center lg:p-12">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
            <span className="text-3xl font-bold text-white">A</span>
          </div>
          <h1 className="text-4xl font-bold text-white">Alphanet</h1>
          <p className="mt-4 text-lg text-slate-300">Internal Project Management</p>
          <p className="mt-2 text-slate-400">Manage your projects, timesheets and submissions.</p>
          <div className="mt-12 flex justify-center gap-4">
            <div className="h-2 w-2 rounded-full bg-slate-500" />
            <div className="h-2 w-2 rounded-full bg-slate-700" />
            <div className="h-2 w-2 rounded-full bg-slate-500" />
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <span className="text-lg font-bold">A</span>
            </div>
            <span className="text-2xl font-bold text-slate-900">Alphanet</span>
          </div>
          <h2 className="text-2xl font-semibold text-slate-900">Employee Portal</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to your employee account</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {errors.general && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {errors.general}
              </div>
            )}
            <Input
              label="Work Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              placeholder="you@alphanet.com"
              autoComplete="email"
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-sm text-red-600" role="alert">{errors.password}</p>}
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Remember me
              </label>
              <button type="button" className="text-sm text-indigo-600 hover:text-indigo-700">
                Forgot password?
              </button>
            </div>

            <Button type="submit" loading={isLoading} disabled={isLoading} className="w-full">
              Sign In
              <ArrowRight className="h-4 w-4" />
            </Button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-slate-500">or</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="secondary" onClick={() => handleDemoLogin('user-demo')} disabled={isLoading}>
                Continue as Demo User
              </Button>
              <Button type="button" variant="secondary" onClick={() => handleDemoLogin('supervisor-demo')} disabled={isLoading}>
                Continue as Demo Supervisor
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
