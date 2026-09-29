import { describe, it, expect } from 'vitest'
import {
  createDailyTimesheetSchema,
  updateDailyTimesheetSchema,
  queryDailyTimesheetSchema,
  getDayOfWeekFromDateString,
  getWeekStartFromDateString,
} from '../schemas/daily-timesheet.schema.js'

describe('Phase 1 — Daily Timesheets Schema & Validation', () => {
  describe('Helper: getDayOfWeekFromDateString', () => {
    it('correctly maps dates to dayOfWeek', () => {
      // 2026-09-28 is a Monday
      expect(getDayOfWeekFromDateString('2026-09-28')).toBe('mon')
      expect(getDayOfWeekFromDateString('2026-09-29')).toBe('tue')
      expect(getDayOfWeekFromDateString('2026-09-30')).toBe('wed')
      expect(getDayOfWeekFromDateString('2026-10-01')).toBe('thu')
      expect(getDayOfWeekFromDateString('2026-10-02')).toBe('fri')
      expect(getDayOfWeekFromDateString('2026-10-03')).toBe('sat')
      expect(getDayOfWeekFromDateString('2026-10-04')).toBe('sun')
    })
  })

  describe('Helper: getWeekStartFromDateString', () => {
    it('computes Monday for any day within the week', () => {
      // Monday 2026-09-28 week
      expect(getWeekStartFromDateString('2026-09-28')).toBe('2026-09-28')
      expect(getWeekStartFromDateString('2026-09-29')).toBe('2026-09-28')
      expect(getWeekStartFromDateString('2026-10-02')).toBe('2026-09-28')
      expect(getWeekStartFromDateString('2026-10-04')).toBe('2026-09-28')
      // Next Monday
      expect(getWeekStartFromDateString('2026-10-05')).toBe('2026-10-05')
    })
  })

  describe('createDailyTimesheetSchema', () => {
    it('validates a correct payload with default entryType', () => {
      const parsed = createDailyTimesheetSchema.safeParse({
        projectId: '654321654321654321654321',
        date: '2026-09-28',
        hours: 7.5,
        description: 'Implemented schema tests',
      })
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.entryType).toBe('regular')
        expect(parsed.data.hours).toBe(7.5)
      }
    })

    it('accepts explicit matching dayOfWeek and assignmentId', () => {
      const parsed = createDailyTimesheetSchema.safeParse({
        projectId: '654321654321654321654321',
        assignmentId: '111122223333444455556666',
        date: '2026-09-28',
        dayOfWeek: 'mon',
        hours: 8,
        entryType: 'overtime',
        description: 'Critical deployment support',
      })
      expect(parsed.success).toBe(true)
    })

    it('rejects mismatched dayOfWeek', () => {
      const parsed = createDailyTimesheetSchema.safeParse({
        projectId: '654321654321654321654321',
        date: '2026-09-28', // Monday
        dayOfWeek: 'fri', // Mismatch
        hours: 8,
        description: 'Testing mismatch',
      })
      expect(parsed.success).toBe(false)
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain('dayOfWeek does not match')
      }
    })

    it('rejects invalid date format', () => {
      const parsed = createDailyTimesheetSchema.safeParse({
        projectId: 'p1',
        date: '28-09-2026',
        hours: 8,
        description: 'Invalid date format',
      })
      expect(parsed.success).toBe(false)
    })

    it('rejects hours <= 0 or > 24', () => {
      const zeroHours = createDailyTimesheetSchema.safeParse({
        projectId: 'p1',
        date: '2026-09-28',
        hours: 0,
        description: 'Zero hours',
      })
      expect(zeroHours.success).toBe(false)

      const excessHours = createDailyTimesheetSchema.safeParse({
        projectId: 'p1',
        date: '2026-09-28',
        hours: 24.5,
        description: 'Too many hours',
      })
      expect(excessHours.success).toBe(false)
    })

    it('rejects empty or whitespace-only description', () => {
      const emptyDesc = createDailyTimesheetSchema.safeParse({
        projectId: 'p1',
        date: '2026-09-28',
        hours: 8,
        description: '   ',
      })
      expect(emptyDesc.success).toBe(false)
    })
  })

  describe('updateDailyTimesheetSchema', () => {
    it('accepts partial updates', () => {
      const parsed = updateDailyTimesheetSchema.safeParse({
        hours: 6.5,
        description: 'Refined work description',
      })
      expect(parsed.success).toBe(true)
    })

    it('rejects empty object update', () => {
      const parsed = updateDailyTimesheetSchema.safeParse({})
      expect(parsed.success).toBe(false)
    })

    it('rejects out of bound hours on update', () => {
      const parsed = updateDailyTimesheetSchema.safeParse({
        hours: 25,
      })
      expect(parsed.success).toBe(false)
    })
  })

  describe('queryDailyTimesheetSchema', () => {
    it('accepts valid date range and filters', () => {
      const parsed = queryDailyTimesheetSchema.safeParse({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        projectId: 'p1',
        status: 'draft',
      })
      expect(parsed.success).toBe(true)
    })

    it('rejects startDate after endDate', () => {
      const parsed = queryDailyTimesheetSchema.safeParse({
        startDate: '2026-10-01',
        endDate: '2026-09-01',
      })
      expect(parsed.success).toBe(false)
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain('startDate must be on or before endDate')
      }
    })
  })
})
