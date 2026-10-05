interface EmployeeIdBadgeProps {
  id: string
  className?: string
}

/** Mono `E000123` chip for the resource master identifier. */
export function EmployeeIdBadge({ id, className = '' }: EmployeeIdBadgeProps) {
  return (
    <span
      className={`ems-tabular inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground ${className}`}
    >
      {id}
    </span>
  )
}
