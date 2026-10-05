import { type TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
  showCount?: boolean
  maxLength?: number
}

export function Textarea({ label, error, helperText, showCount, maxLength, className = '', id, value, ...props }: TextareaProps) {
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-')
  const errorId = `${textareaId}-error`
  const helperId = `${textareaId}-helper`
  const currentLength = typeof value === 'string' ? value.length : 0

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="mb-1 block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : helperText ? helperId : undefined}
        className={`w-full rounded-lg border ${error ? 'border-destructive focus:border-destructive focus-visible:ring-destructive' : 'border-border focus:border-accent focus-visible:ring-accent'} bg-card px-3 py-2 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 resize-y ${className}`}
        value={value}
        {...props}
      />
      <div className="mt-1 flex items-center justify-between">
        <div>
          {error && (
            <p id={errorId} className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {helperText && !error && (
            <p id={helperId} className="text-sm text-muted-foreground">
              {helperText}
            </p>
          )}
        </div>
        {showCount && maxLength && (
          <span className="text-xs text-muted-foreground">
            {currentLength}/{maxLength}
          </span>
        )}
      </div>
    </div>
  )
}
