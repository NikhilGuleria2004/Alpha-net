export type UserStatus = 'active' | 'inactive' | 'invited'

export interface CreateUserInput {
  /** Optional when firstName + lastName are provided — the backend composes the display name. */
  name?: string
  firstName?: string
  lastName?: string
  email: string
  employeeId: string
  department: string
  role: 'admin' | 'user'
  isSupervisor: boolean
  status: UserStatus
  supervisorId?: string
  password: string
}
