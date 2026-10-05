import { CheckCircle2, Loader2, AlertTriangle, Unlink } from 'lucide-react'
import { Tooltip } from '../ui/Tooltip'

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error' | 'disconnected'

interface IntegrationStatusChipProps {
  status: SyncStatus
  /** e.g. "Clients synced: 12" — the admin-dashboard connector line (§7.3.1). */
  label?: string
  /** Extra detail shown inside the tooltip (§7.3.1 system panel). */
  detail?: string
  /** ISO timestamp of the last sync — rendered in the tooltip. */
  lastSync?: string
  size?: 'sm' | 'md'
  className?: string
}

const STATUS_META: Record<SyncStatus, { text: string; icon: typeof CheckCircle2; classes: string }> = {
  synced: { text: 'Synced', icon: CheckCircle2, classes: 'bg-success-soft text-success' },
  pending: { text: 'Syncing', icon: Loader2, classes: 'bg-warning-soft text-warning' },
  syncing: { text: 'Syncing', icon: Loader2, classes: 'bg-warning-soft text-warning' },
  error: { text: 'Sync error', icon: AlertTriangle, classes: 'bg-error-soft text-destructive' },
  disconnected: { text: 'Disconnected', icon: Unlink, classes: 'bg-error-soft text-destructive' },
}

/**
 * EMS↔Timesheet sync state (EMSFrontend.md §8.2): Client IDs, assignments.
 * Icon + text so the state is never colour-only; tooltip explains the shared-DB
 * mechanism for stakeholders.
 */
export function IntegrationStatusChip({ status, label, detail, lastSync, size = 'sm', className = '' }: IntegrationStatusChipProps) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  const text = label ?? meta.text
  const tooltipContent =
    detail && lastSync
      ? `${detail} · Last sync: ${new Date(lastSync).toLocaleString()}`
      : detail ??
        (status === 'synced'
          ? 'Visible to the timesheet platform via the shared database'
          : status === 'pending' || status === 'syncing'
            ? 'Propagating to the timesheet platform…'
            : 'Failed to propagate — retry from the record')
  return (
    <Tooltip content={tooltipContent}>
      <span
        className={`inline-flex items-center gap-1 rounded-full font-medium ${meta.classes} ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'} ${className}`}
        role="status"
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {text}
      </span>
    </Tooltip>
  )
}
