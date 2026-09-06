import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalizeToMonday, calcTotals, validateEntries, type TimesheetEntry } from '../services/timesheet.service.js'

describe('normalizeToMonday', () => {
  it('returns the same Monday for a Monday', () => {
    expect(normalizeToMonday('2024-01-01')).toBe('2024-01-01')
  })

  it('returns the previous Monday for a Wednesday', () => {
    expect(normalizeToMonday('2024-01-03')).toBe('2024-01-01')
  })

  it('returns the previous Monday for a Saturday', () => {
    expect(normalizeToMonday('2024-01-06')).toBe('2024-01-01')
  })

  it('returns the same Monday for a Sunday', () => {
    expect(normalizeToMonday('2024-01-07')).toBe('2024-01-01')
  })

  it('returns the same Monday for a Tuesday', () => {
    expect(normalizeToMonday('2024-01-02')).toBe('2024-01-01')
  })

  it('normalizes across month boundaries', () => {
    expect(normalizeToMonday('2024-02-05')).toBe('2024-02-05')
  })
})

describe('calcTotals', () => {
  it('returns zeros for empty entries', () => {
    expect(calcTotals([])).toEqual({ regularHours: 0, overtimeHours: 0, totalHours: 0 })
  })

  it('calculates regular hours only', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: 'Regular work',
        entryType: 'regular',
        hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
      },
    ]
    expect(calcTotals(entries)).toEqual({ regularHours: 40, overtimeHours: 0, totalHours: 40 })
  })

  it('calculates overtime hours only', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: 'Weekend work',
        entryType: 'overtime',
        hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 8, sun: 8 },
      },
    ]
    expect(calcTotals(entries)).toEqual({ regularHours: 0, overtimeHours: 16, totalHours: 16 })
  })

  it('calculates mixed regular and overtime', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: 'Regular work',
        entryType: 'regular',
        hours: { mon: 8, tue: 8, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
      },
      {
        id: '2',
        description: 'Weekend work',
        entryType: 'overtime',
        hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 4, sun: 4 },
      },
    ]
    expect(calcTotals(entries)).toEqual({ regularHours: 16, overtimeHours: 8, totalHours: 24 })
  })

  it('ignores weekend hours in regular entries', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: 'Regular work',
        entryType: 'regular',
        hours: { mon: 8, tue: 8, wed: 0, thu: 0, fri: 0, sat: 4, sun: 4 },
      },
    ]
    expect(calcTotals(entries)).toEqual({ regularHours: 16, overtimeHours: 0, totalHours: 16 })
  })

  it('ignores weekday hours in overtime entries', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: 'Overtime work',
        entryType: 'overtime',
        hours: { mon: 4, tue: 4, wed: 0, thu: 0, fri: 0, sat: 8, sun: 8 },
      },
    ]
    expect(calcTotals(entries)).toEqual({ regularHours: 0, overtimeHours: 16, totalHours: 16 })
  })
})

describe('validateEntries', () => {
  it('returns no errors for valid regular entries', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: 'Regular work',
        entryType: 'regular',
        hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
      },
    ]
    expect(validateEntries(entries)).toHaveLength(0)
  })

  it('returns no errors for valid overtime entries', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: 'Weekend work',
        entryType: 'overtime',
        hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 8, sun: 8 },
      },
    ]
    expect(validateEntries(entries)).toHaveLength(0)
  })

  it('returns error for regular entry on Saturday', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: 'Regular work',
        entryType: 'regular',
        hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 8, sun: 0 },
      },
    ]
    expect(validateEntries(entries)).toEqual([
      expect.stringContaining('Regular entry "Regular work" has hours on sat'),
    ])
  })

  it('returns error for regular entry on Sunday', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: 'Regular work',
        entryType: 'regular',
        hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 8 },
      },
    ]
    expect(validateEntries(entries)).toEqual([
      expect.stringContaining('Regular entry "Regular work" has hours on sun'),
    ])
  })

  it('returns error for overtime entry on Monday', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: 'Overtime work',
        entryType: 'overtime',
        hours: { mon: 8, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
      },
    ]
    expect(validateEntries(entries)).toEqual([
      expect.stringContaining('Overtime entry "Overtime work" has hours on mon'),
    ])
  })

  it('returns error for negative hours', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: 'Work',
        entryType: 'regular',
        hours: { mon: -1, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
      },
    ]
    expect(validateEntries(entries)).toEqual([
      expect.stringContaining('Invalid hours for mon: must be a non-negative number.'),
    ])
  })

  it('returns error for hours exceeding daily maximum', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: 'Work',
        entryType: 'regular',
        hours: { mon: 25, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
      },
    ]
    expect(validateEntries(entries)).toEqual([
      expect.stringContaining('Hours exceed daily maximum of 24 for mon.'),
    ])
  })

  it('returns error for missing description with hours', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: '   ',
        entryType: 'regular',
        hours: { mon: 8, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
      },
    ]
    expect(validateEntries(entries)).toEqual([
      expect.stringContaining('Description is required for entries with hours.'),
    ])
  })

  it('allows empty description when no hours', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: '   ',
        entryType: 'regular',
        hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
      },
    ]
    expect(validateEntries(entries)).toHaveLength(0)
  })

  it('returns multiple errors for multiple invalid entries', () => {
    const entries: TimesheetEntry[] = [
      {
        id: '1',
        description: 'Bad entry',
        entryType: 'regular',
        hours: { mon: 8, tue: 0, wed: 0, thu: 0, fri: 0, sat: 8, sun: 0 },
      },
      {
        id: '2',
        description: '',
        entryType: 'overtime',
        hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 8, sun: 0 },
      },
    ]
    expect(validateEntries(entries)).toHaveLength(2)
  })
})
