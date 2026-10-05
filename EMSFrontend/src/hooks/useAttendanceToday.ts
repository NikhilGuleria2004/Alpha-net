import { useCallback, useEffect, useState } from 'react'
import type { AttendanceSummary } from '../types/attendance'
import { getMyAttendance, onAttendanceChange } from '../services/attendanceService'

/**
 * Drives the daily-gate banner (EMSFrontend.md §3.5). Fetches the signed-in
 * user's attendance status for today and re-fetches whenever another component
 * (the mark view's optimistic commit) mutates it — via the lightweight
 * `onAttendanceChange` signal, not polling.
 */
export function useAttendanceToday() {
  const [summary, setSummary] = useState<AttendanceSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchToday = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getMyAttendance()
      setSummary(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load attendance.')
      setSummary(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchToday()
    return onAttendanceChange(fetchToday)
  }, [fetchToday])

  return { summary, isLoading, error, refetch: fetchToday }
}
