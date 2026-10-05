import { type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { EmptyState } from '../ui/EmptyState'
import type { Capabilities, CapabilityKey } from '../../utils/permissions'

interface PermissionGateProps {
  capabilities: Capabilities
  allow: CapabilityKey | CapabilityKey[]
  /** `every` requires all listed capabilities; `some` requires at least one. */
  mode?: 'every' | 'some'
  children: ReactNode
  /** Shown when access is denied. Defaults to a lock EmptyState. */
  fallback?: ReactNode
  /** Render nothing (instead of the fallback) when denied — for nav items. */
  silent?: boolean
}

/**
 * Capability gate (EMSFrontend.md §6.3, §8.2): the only sanctioned way to
 * hide UI behind a permission. Reads the capability object — never a raw role
 * string — so `role === 'x'` never scatters through pages.
 */
export function PermissionGate({
  capabilities,
  allow,
  mode = 'every',
  children,
  fallback,
  silent = false,
}: PermissionGateProps) {
  const keys = Array.isArray(allow) ? allow : [allow]
  const ok =
    mode === 'every' ? keys.every((k) => capabilities[k]) : keys.some((k) => capabilities[k])

  if (ok) return <>{children}</>
  if (silent) return null
  if (fallback !== undefined) return <>{fallback}</>
  return (
    <EmptyState
      icon={<Lock className="h-5 w-5" />}
      title="Not permitted"
      description="Your role does not have access to this section. Contact your administrator if you need it."
    />
  )
}
