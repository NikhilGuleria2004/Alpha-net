import { type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  placeholder?: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
}

export function Select({ label, error, placeholder, options, className = '', id, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')
  const errorId = `${selectId}-error`

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1 block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`w-full appearance-none rounded-full border ${error ? 'border-destructive focus:border-destructive focus:ring-destructive' : 'border-border focus:border-accent focus:ring-accent'} bg-card px-3 h-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 pr-9 ${className}`}
          {...props}
        >
          {placeholder && (
            <option key="placeholder" value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option, index) => (
            <option key={option.value ?? `option-${index}`} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute inset-y-0 right-0 flex h-9 w-9 items-center justify-end pr-3 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
