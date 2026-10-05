import { Badge } from '../ui/Badge'
import { BadgeDollarSign, CircleSlash } from 'lucide-react'

interface BillableChipProps {
  billable: boolean
  size?: 'sm' | 'md'
  className?: string
}

/** Billable / Non-billable marker (EMSFrontend.md §6.2). */
export function BillableChip({ billable, size = 'md', className = '' }: BillableChipProps) {
  if (billable) {
    return (
      <Badge variant="success" size={size} leftIcon={<BadgeDollarSign className="h-3.5 w-3.5" />} className={className}>
        Billable
      </Badge>
    )
  }
  return (
    <Badge variant="default" size={size} leftIcon={<CircleSlash className="h-3.5 w-3.5" />} className={className}>
      Non-billable
    </Badge>
  )
}
