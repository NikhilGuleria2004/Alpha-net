import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Activity } from '../types/activity'

/** Minimal MSW-seeded activity feed (EMSFrontend.md §7.5, §10). */

interface AppDataContextValue {
  activities: Activity[]
  logActivity: (activity: Activity) => void
}

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [activities, setActivities] = useState<Activity[]>([])

  const logActivity = useCallback((activity: Activity) => {
    setActivities((prev) => [activity, ...prev])
  }, [])

  const value = useMemo(() => ({ activities, logActivity }), [activities, logActivity])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const context = useContext(AppDataContext)
  if (!context) {
    throw new Error('useAppData must be used within an AppDataProvider')
  }
  return context
}
