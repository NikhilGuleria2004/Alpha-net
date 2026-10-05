import { type ReactNode } from 'react'
import { Shield, UserCog, Briefcase, User } from 'lucide-react'
import { Badge } from '../ui/Badge'
import type { UserRole } from '../../types/auth'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

// Color + icon per role. Icon (not color alone) carries the meaning so the
// badge is still readable without color perception (guide "colour is not the
// only signal").
const ROLE_META: Record<UserRole, { label: string; variant: BadgeVariant; icon: ReactNode }> = {
  admin: { label: 'Admin', variant: 'info', icon: <Shield className="h-3.5 w-3.5" /> },
  hr: { label: 'HR', variant: 'success', icon: <UserCog className="h-3.5 w-3.5" /> },
  manager: { label: 'Manager', variant: 'warning', icon: <Briefcase className="h-3.5 w-3.5" /> },
  employee: { label: 'Employee', variant: 'default', icon: <User className="h-3.5 w-3.5" /> },
}

interface RoleBadgeProps {
  role: UserRole
  size?: 'sm' | 'md'
  className?: string
}

export function RoleBadge({ role, size = 'md', className = '' }: RoleBadgeProps) {
  const meta = ROLE_META[role]
  return (
    <Badge variant={meta.variant} size={size} leftIcon={meta.icon} className={className}>
      {meta.label}
    </Badge>
  )
}
