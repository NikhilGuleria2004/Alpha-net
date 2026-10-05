import { useId, useState } from 'react'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { CURRENCIES, formatMoney, parseMoney, type SupportedCurrency } from '../../utils/currency'

interface MoneyInputProps {
  label?: string
  value: number | null
  onChange: (value: number | null) => void
  currency?: SupportedCurrency
  onCurrencyChange?: (currency: SupportedCurrency) => void
  error?: string
  helperText?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  id?: string
}

/**
 * Currency-aware money input (EMSFrontend.md §8.2): free-type while focused,
 * formatted to 2 decimals on blur; rejects negatives via `parseMoney`.
 * Pair with `RateInput` (per-hour variant) for pay/bill rates.
 */
export function MoneyInput({
  label,
  value,
  onChange,
  currency = 'USD',
  onCurrencyChange,
  error,
  helperText,
  required = false,
  disabled = false,
  placeholder = '0.00',
  id,
}: MoneyInputProps) {
  const autoId = useId()
  const inputId = id ?? `money-${autoId}`
  const [text, setText] = useState<string | null>(null)

  const shown = text ?? (value === null ? '' : formatMoney(value, currency).replace(/[^0-9.,]/g, ''))

  return (
    <div className="flex w-full items-end gap-2">
      <div className="flex-1">
        <Input
          id={inputId}
          label={label ? `${label}${required ? ' *' : ''}` : undefined}
          value={shown}
          inputMode="decimal"
          placeholder={placeholder}
          disabled={disabled}
          error={error}
          helperText={helperText}
          aria-required={required}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => {
            const parsed = parseMoney(e.target.value)
            setText(null)
            onChange(parsed)
          }}
        />
      </div>
      {onCurrencyChange && (
        <div className="w-28 shrink-0">
          <Select
            label="Currency"
            value={currency}
            disabled={disabled}
            options={CURRENCIES.map((c) => ({ value: c.value, label: c.value }))}
            onChange={(e) => onCurrencyChange(e.target.value as SupportedCurrency)}
          />
        </div>
      )}
    </div>
  )
}

interface RateInputProps extends Omit<MoneyInputProps, 'placeholder'> {
  placeholder?: string
}

/** Per-hour variant of `MoneyInput` — the pay/bill-rate field of §7.4/§7.5. */
export function RateInput({ placeholder = '85.00', helperText = 'Per hour', ...rest }: RateInputProps) {
  return <MoneyInput {...rest} placeholder={placeholder} helperText={helperText} />
}
