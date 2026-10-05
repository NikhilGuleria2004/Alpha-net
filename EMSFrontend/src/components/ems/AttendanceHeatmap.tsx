import { useId } from 'react'
import type { AttendanceStatus } from '../../types/attendance'

/**
 * Calendar/roster heatmap grid (EMSFrontend.md §8.2).
 *
 * Dense month view: one 28px+ cell per day, colour + glyph so status is never
 * colour-only. Keyboard: the grid is a single tab stop with arrow-key
 * navigation between day cells (roving tabindex, `grid` pattern). Full
 * `AttendanceClock` marking + `RosterTable` oversight land in Phase 3 — this
 * is the visual primitive Phase 1 owes the playground.
 */

export interface HeatmapDay {
  /** ISO date (`YYYY-MM-DD`). */
  date: string
  status: AttendanceStatus
  /** Optional hours/count intensity for the tooltip. */
  value?: number
}

interface AttendanceHeatmapProps {
  days: HeatmapDay[]
  /** Called on Enter/Space when a focused day is activated. */
  onSelectDay?: (day: HeatmapDay) => void
  selectedDate?: string
  weekStartsOn?: 0 | 1
  className?: string
}

const CELL_META: Record<AttendanceStatus, { label: string; classes: string; glyph: string }> = {
  present: { label: 'Present', classes: 'bg-success/20 text-success', glyph: '●' },
  remote: { label: 'Remote', classes: 'bg-accent/20 text-accent', glyph: '◐' },
  late: { label: 'Late', classes: 'bg-warning/25 text-warning', glyph: '▲' },
  half_day: { label: 'Half day', classes: 'bg-warning/15 text-warning', glyph: '◑' },
  on_leave: { label: 'On leave', classes: 'bg-sky-500/20 text-sky-600 dark:text-sky-400', glyph: '○' },
  absent: { label: 'Absent', classes: 'bg-destructive/15 text-destructive', glyph: '✕' },
  holiday: { label: 'Holiday', classes: 'bg-muted text-muted-foreground', glyph: '–' },
  weekend: { label: 'Weekend', classes: 'bg-transparent text-muted-foreground/60', glyph: '·' },
}

const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function handleGridKeys(event: React.KeyboardEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement
  if (target.dataset.day !== 'true') return
  const cells = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-day="true"]'))
  const index = cells.indexOf(target)
  if (index < 0) return
  let next: number | null = null
  if (event.key === 'ArrowRight') next = index + 1
  else if (event.key === 'ArrowLeft') next = index - 1
  else if (event.key === 'ArrowDown') next = index + 7
  else if (event.key === 'ArrowUp') next = index - 7
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = cells.length - 1
  else return
  event.preventDefault()
  const el = cells[next]
  if (el) {
    cells.forEach((c) => c.setAttribute('tabindex', '-1'))
    el.setAttribute('tabindex', '0')
    el.focus()
  }
}

export function AttendanceHeatmap({ days, onSelectDay, selectedDate, weekStartsOn = 1, className = '' }: AttendanceHeatmapProps) {
  const gridId = useId()
  const weekdays = weekStartsOn === 1 ? WEEKDAYS_MON : WEEKDAYS_SUN

  return (
    <div className={className}>
      <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden="true">
        {weekdays.map((day) => (
          <span key={day} className="ems-overline py-1 text-center text-muted-foreground">
            {day}
          </span>
        ))}
      </div>
      <div
        className="grid grid-cols-7 gap-1"
        role="grid"
        aria-label="Attendance calendar"
        aria-describedby={`${gridId}-hint`}
        onKeyDown={handleGridKeys}
      >
        {days.map((day, index) => {
          const meta = CELL_META[day.status]
          const isSelected = day.date === selectedDate
          return (
            <button
              key={day.date}
              type="button"
              role="gridcell"
              data-day="true"
              tabIndex={index === 0 ? 0 : -1}
              aria-selected={isSelected}
              aria-label={`${day.date}: ${meta.label}${day.value !== undefined ? `, ${day.value} hours` : ''}`}
              title={`${day.date} — ${meta.label}`}
              onClick={() => onSelectDay?.(day)}
              className={`flex min-h-[28px] min-w-[28px] flex-col items-center justify-center rounded-md px-1 py-1 text-[11px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${meta.classes} ${
                isSelected ? 'ring-2 ring-accent ring-offset-1' : ''
              }`}
            >
              <span className="ems-tabular leading-none">{Number(day.date.slice(8, 10))}</span>
              <span aria-hidden="true" className="text-[9px] leading-none">
                {meta.glyph}
              </span>
            </button>
          )
        })}
      </div>
      <p id={`${gridId}-hint`} className="sr-only">
        Use arrow keys to move between days, Enter to select a day.
      </p>
    </div>
  )
}
