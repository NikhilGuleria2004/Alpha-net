import { format, addDays, differenceInDays, isWeekend as dateFnsIsWeekend, parseISO, startOfWeek } from 'date-fns'

export { differenceInDays }

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MMM d, yyyy')
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
