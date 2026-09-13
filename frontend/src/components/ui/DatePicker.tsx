import { useState } from 'react'
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface DatePickerProps {
  value?: string
  onChange?: (date: string) => void
  minDate?: string
  maxDate?: string
  disabledDates?: string[]
  placeholder?: string
  label?: string
  error?: string
  helperText?: string
}

export function DatePicker({ value, onChange, minDate, maxDate, disabledDates = [], placeholder = 'Select a date', label, error, helperText }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date())

  const selectedDate = value ? new Date(value) : null

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const isDisabled = (date: Date) => {
    if (minDate && date < new Date(minDate)) return true
    if (maxDate && date > new Date(maxDate)) return true
    if (disabledDates.some((d) => isSameDay(new Date(d), date))) return true
    return false
  }

  const handleSelect = (date: Date) => {
    if (isDisabled(date)) return
    onChange?.(format(date, 'yyyy-MM-dd'))
    setIsOpen(false)
  }

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="relative w-full">
      {label && (
        <label className="mb-1 block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full rounded-lg border ${error ? 'border-red-500' : 'border-border'} bg-card px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`}
      >
        {selectedDate ? format(selectedDate, 'MMM d, yyyy') : <span className="text-muted-foreground">{placeholder}</span>}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 rounded-xl border border-border bg-card p-4 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentMonth((prev) => addMonths(prev, -1))}
              className="rounded-lg p-1 hover:bg-muted"
            >
              <ChevronLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <span className="font-semibold text-foreground">{format(currentMonth, 'MMMM yyyy')}</span>
            <button
              type="button"
              onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
              className="rounded-lg p-1 hover:bg-muted"
            >
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
          <div className="mb-2 grid grid-cols-7 gap-1">
            {weekDays.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((date) => {
              const disabled = isDisabled(date)
              const isCurrentMonth = isSameMonth(date, currentMonth)
              const isSelected = selectedDate && isSameDay(date, selectedDate)
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelect(date)}
                  className={`rounded-lg p-2 text-sm transition-colors ${
                    !isCurrentMonth
                      ? 'text-slate-300'
                      : disabled
                        ? 'cursor-not-allowed text-slate-300'
                        : isSelected
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {format(date, 'd')}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-600" role="alert">{error}</p>}
      {helperText && !error && <p className="mt-1 text-sm text-muted-foreground">{helperText}</p>}
    </div>
  )
}
