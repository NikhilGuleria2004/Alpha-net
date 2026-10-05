import { Check } from 'lucide-react'

export interface Step {
  id: string
  label: string
  description?: string
  /** 'done' shows a tick, 'current' is highlighted, 'todo' is muted. */
  state: 'done' | 'current' | 'todo'
  /** Validation errors on a done/current step block advancement. */
  hasError?: boolean
}

interface StepperProps {
  steps: Step[]
  onStepClick?: (id: string) => void
  orientation?: 'vertical' | 'horizontal'
  className?: string
}

/**
 * Onboarding wizard rail (EMSFrontend.md §7.4): vertical numbered steps with
 * per-step completion ticks. Steps are buttons when `onStepClick` is provided
 * (keyboard-operable); otherwise plain list items with `aria-current="step"`.
 */
export function Stepper({ steps, onStepClick, orientation = 'vertical', className = '' }: StepperProps) {
  const isVertical = orientation === 'vertical'
  return (
    <ol
      className={`${isVertical ? 'flex flex-col' : 'flex flex-row flex-wrap gap-2'} ${className}`}
      aria-label="Progress"
    >
      {steps.map((step, index) => {
        const clickable = Boolean(onStepClick) && step.state !== 'todo'
        const circle =
          step.state === 'done' ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-white" aria-hidden="true">
              <Check className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span
              className={`ems-tabular flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                step.state === 'current'
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border bg-muted text-muted-foreground'
              }`}
              aria-hidden="true"
            >
              {index + 1}
            </span>
          )
        const body = (
          <>
            {circle}
            <span className="min-w-0">
              <span className={`block truncate text-sm font-medium ${step.state === 'todo' ? 'text-muted-foreground' : 'text-foreground'}`}>
                {step.label}
                {step.hasError && <span className="ml-1 text-destructive" aria-label="has errors">•</span>}
              </span>
              {step.description && <span className="block truncate text-xs text-muted-foreground">{step.description}</span>}
            </span>
          </>
        )
        return (
          <li key={step.id} className={isVertical ? 'relative flex gap-3 pb-5 last:pb-0' : ''}>
            {isVertical && index < steps.length - 1 && (
              <span
                className={`absolute left-3 top-7 h-[calc(100%-1.75rem)] w-px ${step.state === 'done' ? 'bg-success/50' : 'bg-border'}`}
                aria-hidden="true"
              />
            )}
            {clickable ? (
              <button
                type="button"
                onClick={() => onStepClick?.(step.id)}
                aria-current={step.state === 'current' ? 'step' : undefined}
                className="flex min-h-[32px] flex-1 items-start gap-3 rounded-lg px-2 py-1 text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {body}
              </button>
            ) : (
              <span
                className="flex flex-1 items-start gap-3 px-2 py-1"
                aria-current={step.state === 'current' ? 'step' : undefined}
              >
                {body}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
