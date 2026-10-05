import { formatMoney, formatRate, type SupportedCurrency } from '../../utils/currency'

interface PayRateCellProps {
  amount: number | null | undefined
  currency?: SupportedCurrency
  period?: 'hour' | 'flat'
  className?: string
}

/** Right-alignable, tabular currency cell for pay/bill rates. */
export function PayRateCell({ amount, currency = 'USD', period = 'hour', className = '' }: PayRateCellProps) {
  if (amount === null || amount === undefined) {
    return <span className={`text-muted-foreground ${className}`}>—</span>
  }
  return (
    <span className={`ems-tabular text-foreground ${className}`}>
      {period === 'hour' ? formatRate(amount, currency) : formatMoney(amount, currency)}
    </span>
  )
}
