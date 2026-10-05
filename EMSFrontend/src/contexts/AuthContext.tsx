import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { EmsUser } from '../types/auth'
import {
  login as authLogin,
  logout as authLogout,
  getCurrentUser as authGetCurrentUser,
  redeemInvite as authRedeemInvite,
} from '../services/authService'
import { useToast } from './ToastContext'

interface AuthContextValue {
  user: EmsUser | null
  isAuthenticated: boolean
  isLoading: boolean
  /** POST /auth/login via the `api` switch; stashes the access token in memory. */
  login: (email: string, password: string) => Promise<EmsUser>
  /** POST /auth/redeem-invite; stashes the token and establishes the session. */
  redeemInvite: (token: string, password: string) => Promise<EmsUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * EMS auth context (EMSFrontend.md §7.1, §10, §14 Phase 3 3.2).
 *
 * Bootstraps on mount by calling `authService.getCurrentUser()` — which hits
 * /auth/me and, on a hard-reload 401, exchanges the httpOnly refresh cookie for
 * a fresh access token before giving up. The access token lives only in the
 * apiClient module variable (never localStorage); only the resolved `user` is
 * held here. This is the single seam Phase 8 swaps from mock→real.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<EmsUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { addToast } = useToast()

  useEffect(() => {
    let cancelled = false
    authGetCurrentUser().then((currentUser) => {
      if (!cancelled) {
        setUser(currentUser)
        setIsLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleLogin = async (email: string, password: string) => {
    try {
      const loggedInUser = await authLogin(email, password)
      setUser(loggedInUser)
      return loggedInUser
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Sign-in failed.')
      throw err
    }
  }

  const handleRedeemInvite = async (token: string, password: string) => {
    const invitedUser = await authRedeemInvite(token, password)
    setUser(invitedUser)
    return invitedUser
  }

  const handleLogout = async () => {
    try {
      await authLogout()
    } catch {
      // Network/session errors shouldn't block a local sign-out.
    } finally {
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: user !== null, isLoading, login: handleLogin, redeemInvite: handleRedeemInvite, logout: handleLogout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
