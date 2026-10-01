import { format, addDays, differenceInDays, isWeekend as dateFnsIsWeekend, parseISO, startOfWeek } from 'date-fns'
import type { DateRangePreset } from '../types/report'

export { differenceInDays }

// Resolves the concrete date window a report preset implies, formatted as local
// 'YYYY-MM-DD' (matching the backend's weekStart string comparison). Previously
// the Reports page only sent start/endDate for the 'custom' range, so the
// "Last 7/30/90 days" presets silently returned all-time data (QA_REPORT.md C8).
export function resolveReportDateRange(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string
): { startDate?: string; endDate?: string } {
  if (preset === 'custom') {
    return { startDate: customStart || undefined, endDate: customEnd || undefined }
  }
  const days = preset === '7d' ? 6 : preset === '30d' ? 29 : 89
  const end = new Date()
  const start = addDays(end, -days)
  return { startDate: format(start, 'yyyy-MM-dd'), endDate: format(end, 'yyyy-MM-dd') }
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MMM d, yyyy')
}

/**
 * F-23: the app's single date-formatting path.
 *
 * Decision `D-5`: this is an internal tool, so the UI is pinned to one locale
 * (`APP_LOCALE`) rather than following the browser's. That removes the real
 * hazard here — a bare `toLocaleDateString` call renders 3/4/2026 in one locale and
 * 4/3/2026 in another, which is genuinely ambiguous for a date like 4/3.
 *
 * Every user-visible date in the app now comes from one of these helpers, so a
 * format change lands in one place. `date-fns` with explicit English patterns is
 * the engine (it is locale-deterministic by construction, which is why it is
 * preferred here over ad-hoc `Intl` constructions in components).
 */
export const APP_LOCALE = 'en-US'

/** "Sep 7" — the compact form used in tables, chips and the week strip. */
export function formatShortDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MMM d')
}

/** "Sep 7, 2026" — the same as {@link formatDate}, named for the contrast. */
export function formatDateWithYear(date: string | Date): string {
  return formatDate(date)
}

/**
 * "Sep 7, 2026" for the current year, "Sep 7" otherwise — used by the activity
 * timeline, which only shows a year when it differs from now.
 */
export function formatDateAutoYear(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return d.getFullYear() !== new Date().getFullYear() ? formatDate(d) : formatShortDate(d)
}

/** "Sep 7, 2026, 3:14 PM" — notification timestamps need the time, not just the day. */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MMM d, yyyy, h:mm a')
}

// Renders a week's start–end range for display. Parses the weekStart string as
// *local* midnight (parseLocalDate) and adds days with local math, so a Mon–Fri
// week stays Mon–Fri for UTC-negative timezones. Bypassing this — e.g. `new
// Date(weekStart)` (UTC) then `formatDate` (local) — renders as "Sun – Thu"
// (QA M12).
export function formatWeekRange(weekStart: string | Date, endOffset: number = 4): string {
  const start = typeof weekStart === 'string' ? parseLocalDate(weekStart) : weekStart
  const end = addDays(start, endOffset)
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
}

export function formatDateRange(start: string | Date, end: string | Date): string {
  const s = typeof start === 'string' ? parseISO(start) : start
  const e = typeof end === 'string' ? parseISO(end) : end
  return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
}

export function getWeekDates(weekStart: string | Date): { date: Date; dayKey: string; label: string }[] {
  const start = typeof weekStart === 'string' ? parseISO(weekStart) : weekStart
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
  return days.map((dayKey, index) => {
    const date = addDays(start, index)
    return {
      date,
      dayKey,
      label: format(date, 'EEE, MMM d'),
    }
  })
}

export function isWeekend(date: string | Date): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date
  return dateFnsIsWeekend(d)
}

export function addDaysToDate(date: string | Date, amount: number): Date {
  const d = typeof date === 'string' ? parseISO(date) : date
  return addDays(d, amount)
}

export function differenceInDaysFromNow(date: string | Date): number {
  const d = typeof date === 'string' ? parseISO(date) : date
  return differenceInDays(d, new Date())
}

export function isOverdue(endDate: string | Date): boolean {
  const d = typeof endDate === 'string' ? parseISO(endDate) : endDate
  return differenceInDays(d, new Date()) < 0
}

export function getCurrentWeekStart(): string {
  const today = new Date()
  const start = startOfWeek(today, { weekStartsOn: 1 })
  return format(start, 'yyyy-MM-dd')
}

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Parses a 'YYYY-MM-DD' string as *local* midnight. The app treats weekStart
// strings as local dates; `new Date('2026-09-07')` would parse them as UTC and
// can shift the day for negative timezones.
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Adds whole weeks to a local date.
export function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + 7 * weeks)
  return d
}

// Monday of the week containing `date` (local).
export function mondayOf(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

// Snaps any 'YYYY-MM-DD' string to the Monday of its week (mirrors the
// backend's normalizeToMonday in timesheet.service.ts).
export function normalizeToMonday(dateStr: string): string {
  return toLocalDateString(mondayOf(parseLocalDate(dateStr)))
}
