export type UserStatus = 'active' | 'inactive'

export interface CreateUserInput {
  name: string
  email: string
  employeeId: string
  department: string
  role: 'admin' | 'user'
  isSupervisor: boolean
  status: UserStatus
  supervisorId?: string
}
