export type UserRole = 'admin' | 'user'

export type UserStatus = 'active' | 'inactive'

export interface User {
  id: string
  name: string
  email: string
  employeeId: string
  department: string
  role: UserRole
  isSupervisor: boolean
  status: UserStatus
  supervisorId?: string
}

export interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  login: (role: UserRole) => Promise<void>
  logout: () => Promise<void>
}
