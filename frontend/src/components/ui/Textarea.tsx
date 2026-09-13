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
        className={`w-full rounded-lg border ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-indigo-500 focus:ring-indigo-500'} bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 resize-y ${className}`}
        value={value}
        {...props}
      />
      <div className="mt-1 flex items-center justify-between">
        <div>
          {error && (
            <p id={errorId} className="text-sm text-red-600" role="alert">
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
