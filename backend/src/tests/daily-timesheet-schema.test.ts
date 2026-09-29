import { describe, it, expect } from 'vitest'
import {
  createDailyTimesheetSchema,
  updateDailyTimesheetSchema,
  queryDailyTimesheetSchema,
  isValidCalendarDate,
  getDayOfWeekFromDateString,
  getWeekStartFromDateString,
} from '../schemas/daily-timesheet.schema.js'

describe('Phase 1 — Daily Timesheet Zod Schemas & Validation Rules', () => {
  describe('Calendar date validator', () => {
    it('accepts real calendar dates', () => {
      expect(isValidCalendarDate('2026-09-28')).toBe(true)
      expect(isValidCalendarDate('2024-02-29')).toBe(true) // leap year
    })

    it('rejects impossible calendar dates', () => {
      expect(isValidCalendarDate('2026-02-31')).toBe(false)
      expect(isValidCalendarDate('2026-02-29')).toBe(false) // 2026 is not leap
      expect(isValidCalendarDate('2026-04-31')).toBe(false)
      expect(isValidCalendarDate('invalid-date')).toBe(false)
      expect(isValidCalendarDate('2026-13-01')).toBe(false)
    })
  })

  describe('Day-of-week derivation and week start helpers', () => {
    it('computes dayOfWeek accurately in UTC', () => {
      expect(getDayOfWeekFromDateString('2026-09-28')).toBe('mon')
      expect(getDayOfWeekFromDateString('2026-10-02')).toBe('fri')
      expect(getDayOfWeekFromDateString('2026-10-03')).toBe('sat')
      expect(getDayOfWeekFromDateString('2026-10-04')).toBe('sun')
    })

    it('computes the Monday weekStart accurately', () => {
      expect(getWeekStartFromDateString('2026-09-28')).toBe('2026-09-28')
      expect(getWeekStartFromDateString('2026-10-04')).toBe('2026-09-28')
    })
  })

  describe('createDailyTimesheetSchema', () => {
    it('accepts valid weekday regular entries', () => {
      const parsed = createDailyTimesheetSchema.safeParse({
        projectId: '654321654321654321654321',
        date: '2026-09-28', // Monday
        hours: 8,
        entryType: 'regular',
        description: 'Completed sprint backlog items',
      })
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.entryType).toBe('regular')
      }
    })

    it('accepts valid weekend overtime entries', () => {
      const parsed = createDailyTimesheetSchema.safeParse({
        projectId: '654321654321654321654321',
        date: '2026-10-03', // Saturday
        hours: 4.5,
        entryType: 'overtime',
        description: 'Weekend production deployment support',
      })
      expect(parsed.success).toBe(true)
    })

    it('rejects invalid dates like 2026-02-31 and invalid-date', () => {
      const res1 = createDailyTimesheetSchema.safeParse({
        projectId: 'p1',
        date: '2026-02-31',
        hours: 8,
        description: 'Working on phantom day',
      })
      expect(res1.success).toBe(false)

      const res2 = createDailyTimesheetSchema.safeParse({
        projectId: 'p1',
        date: 'invalid-date',
        hours: 8,
        description: 'Working on bad date string',
      })
      expect(res2.success).toBe(false)
    })

    it('rejects hours < 0 or > 24', () => {
      const neg = createDailyTimesheetSchema.safeParse({
        projectId: 'p1',
        date: '2026-09-28',
        hours: -1,
        description: 'Negative hours',
      })
      expect(neg.success).toBe(false)

      const excess = createDailyTimesheetSchema.safeParse({
        projectId: 'p1',
        date: '2026-09-28',
        hours: 24.5,
        description: 'Excessive hours',
      })
      expect(excess.success).toBe(false)
    })

    it('rejects empty or too short descriptions', () => {
      const empty = createDailyTimesheetSchema.safeParse({
        projectId: 'p1',
        date: '2026-09-28',
        hours: 8,
        description: '   ',
      })
      expect(empty.success).toBe(false)

      const short = createDailyTimesheetSchema.safeParse({
        projectId: 'p1',
        date: '2026-09-28',
        hours: 8,
        description: 'ab',
      })
      expect(short.success).toBe(false)
    })
  })

  describe('updateDailyTimesheetSchema', () => {
    it('validates partial updates', () => {
      const parsed = updateDailyTimesheetSchema.safeParse({
        hours: 7,
        description: 'Updated daily summary',
      })
      expect(parsed.success).toBe(true)
    })

    it('rejects empty payload', () => {
      const parsed = updateDailyTimesheetSchema.safeParse({})
      expect(parsed.success).toBe(false)
    })
  })

  describe('queryDailyTimesheetSchema', () => {
    it('accepts filter combinations', () => {
      const parsed = queryDailyTimesheetSchema.safeParse({
        date: '2026-09-28',
        weekStart: '2026-09-28',
        projectId: 'p1',
        userId: 'u1',
        status: 'draft',
      })
      expect(parsed.success).toBe(true)
    })
  })
})
