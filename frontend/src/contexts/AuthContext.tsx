import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { User } from '../types/auth'
import { login as authLogin, logout as authLogout, loginAsDemo as authLoginAsDemo, getCurrentUser } from '../services/authService'

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  loginAsDemo: (demoId: 'admin-demo' | 'user-demo' | 'supervisor-demo') => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getCurrentUser().then((currentUser) => {
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
    const loggedInUser = await authLogin(email, password)
    setUser(loggedInUser)
  }

  const handleLoginAsDemo = async (demoId: 'admin-demo' | 'user-demo' | 'supervisor-demo') => {
    const loggedInUser = await authLoginAsDemo(demoId)
    setUser(loggedInUser)
  }

  const handleLogout = async () => {
    await authLogout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user), isLoading, login: handleLogin, loginAsDemo: handleLoginAsDemo, logout: handleLogout }}>
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
