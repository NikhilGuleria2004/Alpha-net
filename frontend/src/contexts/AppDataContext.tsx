import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import type { Project } from '../types/project'
import type { User } from '../types/auth'
import type { CreateUserInput } from '../types/user'
import type { Timesheet, SaveTimesheetInput } from '../types/timesheet'
import type { CreateProjectInput } from '../types/project'
import type { Notification } from '../types/notification'
import type { Activity } from '../types/activity'
import type { Document } from '../types/document'
import type { Invoice } from '../types/invoice'
import { getProjects as fetchProjects, createProject as createProjectService, updateProject as updateProjectService, deleteProject as deleteProjectService, addTeamMember as addTeamMemberService, removeTeamMember as removeTeamMemberService, assignSupervisor as assignSupervisorService } from '../services/projectService'
import { getUsers as fetchUsers, createUser as createUserService, updateUser as updateUserService, deactivateUser as deactivateUserService } from '../services/userService'
import { getTimesheets as fetchTimesheets, saveDraft as saveDraftService, submitTimesheet as submitTimesheetService, withdrawTimesheet as withdrawTimesheetService, approveTimesheet as approveTimesheetService, declineTimesheet as declineTimesheetService, createTimesheet as createTimesheetService } from '../services/timesheetService'
import { getNotifications as fetchNotifications, markAsRead as markAsReadService, markAllAsRead as markAllAsReadService } from '../services/notificationService'
import { getActivities as fetchActivities } from '../services/activityService'
import { getDocuments as fetchDocuments, uploadProjectDocument as uploadDocumentService, deleteDocument as deleteDocumentService } from '../services/documentService'
import { getInvoices as fetchInvoices, createInvoice as createInvoiceService, updateInvoice as updateInvoiceService, sendInvoice as sendInvoiceService } from '../services/invoiceService'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'

// QA C1 sub-item: the initial load is keyed by section NAME. The previous
// positional version read documents from the activities slot and notifications
// from the documents slot (the real notifications result was never consumed at
// all), and it counted failures out of a hardcoded 6 while seven sections were
// actually being loaded.
type WorkspaceSectionKey = 'projects' | 'users' | 'timesheets' | 'invoices' | 'activities' | 'documents' | 'notifications'

interface WorkspaceSection {
  key: WorkspaceSectionKey
  /** Human label used when reporting partial loads. */
  label: string
  run: () => Promise<unknown>
}

// apiClient throws plain Errors that carry the backend's error code as
// "[CODE] message" (see services/apiClient.ts). A 403 is a permission decision,
// not a load failure: GET /invoices is admin-or-project-scoped, so every plain
// employee legitimately gets [FORBIDDEN] there. Reporting that as a failure
// produced an alarming "try refreshing the page" toast that no refresh could
// ever fix.
const PERMISSION_DENIED = /^\[FORBIDDEN\]/

function isPermissionDenial(reason: unknown): boolean {
  return reason instanceof Error && PERMISSION_DENIED.test(reason.message)
}

interface AppDataContextValue {
  projects: Project[]
  users: User[]
  timesheets: Timesheet[]
  invoices: Invoice[]
  notifications: Notification[]
  activities: Activity[]
  documents: Document[]
  isLoading: boolean
  refreshProjects: () => Promise<void>
  refreshUsers: () => Promise<void>
  refreshTimesheets: () => Promise<void>
  refreshInvoices: () => Promise<void>
  refreshNotifications: () => Promise<void>
  refreshActivities: () => Promise<void>
  refreshDocuments: () => Promise<Document[]>
  // QA M11b: live notification updates. The bell previously only refreshed
  // when some user action triggered a refresh; a background tab never learned
  // of approvals. startNotificationPoll/stopNotificationPoll let the
  // NotificationContext mount a visibility-aware 15s poller that refreshes
  // notifications and the unread count without a user action.
  startNotificationPoll: () => void
  stopNotificationPoll: () => void
  createProject: (data: CreateProjectInput) => Promise<Project>
  updateProject: (id: string, data: Partial<CreateProjectInput>) => Promise<Project | undefined>
  deleteProject: (id: string) => Promise<boolean>
  addTeamMember: (projectId: string, userId: string) => Promise<Project | undefined>
  removeTeamMember: (projectId: string, userId: string) => Promise<Project | undefined>
  assignSupervisor: (projectId: string, userId: string) => Promise<Project | undefined>
  createUser: (data: CreateUserInput) => Promise<User>
  updateUser: (id: string, data: Partial<CreateUserInput>) => Promise<User | undefined>
  deactivateUser: (id: string) => Promise<User | undefined>
  saveDraft: (id: string, data: SaveTimesheetInput) => Promise<Timesheet | undefined>
  submitTimesheet: (id: string) => Promise<Timesheet | undefined>
  withdrawTimesheet: (id: string, reason?: string) => Promise<Timesheet | undefined>
  approveTimesheet: (id: string) => Promise<Timesheet | undefined>
  declineTimesheet: (id: string, reason: string) => Promise<Timesheet | undefined>
  createTimesheet: (data: SaveTimesheetInput) => Promise<Timesheet>
  createInvoice: (data: { projectId: string; hourlyRate?: number }) => Promise<Invoice>
  updateInvoice: (id: string, data: { hourlyRate?: number; addVariableCosts?: { amount: number; reason: string }[]; removeVariableCostIds?: string[] }) => Promise<Invoice | undefined>
  sendInvoice: (id: string) => Promise<Invoice | undefined>
  markNotificationAsRead: (id: string) => Promise<void>
  markAllNotificationsAsRead: () => Promise<void>
  uploadDocument: (projectId: string, file: File) => Promise<Document>
  deleteDocument: (projectId: string, id: string) => Promise<boolean>
}

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { addToast } = useToast()
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const loadingRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || authLoading) {
      setIsLoading(false)
      return
    }

    let cancelled = false
    async function loadInitialData() {
      if (loadingRef.current) return
      loadingRef.current = true
      setIsLoading(true)
      try {
        // Promise.allSettled, not Promise.all (QA C1): a 403/500 on any single
        // fetch must never discard the entire app's data. Previously the
        // admin-only user directory rejected the whole load for every
        // non-admin, leaving all dashboards silently empty.
        const sections: WorkspaceSection[] = [
          { key: 'projects', label: 'projects', run: () => fetchProjects() },
          { key: 'users', label: 'users', run: () => fetchUsers() },
          { key: 'timesheets', label: 'timesheets', run: () => fetchTimesheets() },
          { key: 'invoices', label: 'invoices', run: () => fetchInvoices() },
          { key: 'activities', label: 'activities', run: () => fetchActivities() },
          { key: 'documents', label: 'documents', run: () => fetchDocuments() },
          { key: 'notifications', label: 'notifications', run: () => fetchNotifications() },
        ]
        const settled = await Promise.allSettled(sections.map((section) => section.run()))

        // Look each result up by key, so a settled value can never be written
        // into another section's state (QA C1 sub-item).
        const byKey = new Map<WorkspaceSectionKey, PromiseSettledResult<unknown>>()
        sections.forEach((section, index) => byKey.set(section.key, settled[index]))
        const value = <T,>(key: WorkspaceSectionKey, fallback: T): T => {
          const result = byKey.get(key)
          return result?.status === 'fulfilled' ? (result.value as T) : fallback
        }

        if (!cancelled) {
          setProjects(value('projects', [] as Project[]))
          setUsers(value('users', [] as User[]))
          setTimesheets(value('timesheets', [] as Timesheet[]))
          setInvoices(value('invoices', [] as Invoice[]))
          setActivities(value('activities', [] as Activity[]))
          setDocuments(value('documents', [] as Document[]))
          setNotifications(value('notifications', [] as Notification[]))

          // Surface partial-load failures (QA C1 sub-item): a rejected fetch
          // must be visible, not silently swallowed into empty dashboards —
          // and the count now covers every section instead of a hardcoded 6,
          // naming the sections so the message is actionable.
          const failures: Array<{ label: string; reason: unknown }> = []
          settled.forEach((result, index) => {
            if (result.status === 'rejected') {
              failures.push({ label: sections[index].label, reason: result.reason })
            }
          })
          if (failures.length > 0) {
            const denied = failures.filter((failure) => isPermissionDenial(failure.reason))
            const labels = failures.map((failure) => failure.label).join(', ')
            if (denied.length === failures.length) {
              // Every rejection was a 403: this role simply cannot read those
              // sections. Say so plainly; there is nothing to retry.
              addToast('info', `Not available for your role: ${labels}.`)
            } else {
              addToast(
                'error',
                `Some workspace data failed to load (${failures.length} of ${sections.length}: ${labels}). Try refreshing the page.`,
              )
            }
          }
        }
      } finally {
        if (!cancelled) {
          loadingRef.current = false
          setIsLoading(false)
        }
      }
    }
    loadInitialData().catch(() => {
      // Defensive: loadInitialData can no longer reject via allSettled, but
      // never let an unexpected error surface as an unhandled rejection.
    })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, authLoading, addToast])

  const refreshProjects = async () => {
    const data = await fetchProjects()
    setProjects(data)
  }

  const refreshUsers = async () => {
    const data = await fetchUsers()
    setUsers(data)
  }

  const refreshTimesheets = async () => {
    const data = await fetchTimesheets()
    setTimesheets(data)
  }

  const refreshInvoices = async () => {
    const data = await fetchInvoices()
    setInvoices(data)
  }

  // Stable identity (useCallback) so consumers can safely use these in effect dependency arrays.
  const refreshNotifications = useCallback(async () => {
    const data = await fetchNotifications()
    setNotifications(data)
  }, [])

  // QA M11b: live notification updates. The bell previously only refreshed
  // when some user action triggered a refresh; a background tab never learned
  // of approvals. This polls every 15s while the tab is visible and the user
  // is authenticated, pausing when the tab is hidden so idle tabs don't waste
  // requests. It's started/stopped by the NotificationContext, which is the
  // only consumer that cares about unread counts.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // QA A11: the interval closure captures isAuthenticated at creation time, so
  // a logout after the poller started would be invisible to scheduled ticks
  // and keep firing /notifications with no credentials. The ref is checked on
  // every tick instead; NotificationContext also stops the poll on logout.
  const isAuthRef = useRef(false)
  useEffect(() => {
    isAuthRef.current = isAuthenticated
  }, [isAuthenticated])
  const startNotificationPoll = useCallback(() => {
    if (!isAuthenticated || pollRef.current) return
    pollRef.current = setInterval(() => {
      if (!isAuthRef.current || document.visibilityState === 'hidden') return
      void refreshNotifications()
    }, 15_000)
  }, [isAuthenticated, refreshNotifications])
  const stopNotificationPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const refreshActivities = async () => {
    const data = await fetchActivities()
    setActivities(data)
  }

  const refreshDocuments = async () => {
    const data = await fetchDocuments()
    setDocuments(data)
    return data
  }

  const handleCreateProject = async (data: CreateProjectInput) => {
    try {
      const project = await createProjectService(data)
      setProjects((prev) => [...prev, project])
      return project
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project'
      throw new Error(message)
    }
  }

  const handleUpdateProject = async (id: string, data: Partial<CreateProjectInput>) => {
    const updated = await updateProjectService(id, data)
    if (updated) {
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)))
    }
    return updated
  }

  const handleDeleteProject = async (id: string) => {
    const success = await deleteProjectService(id)
    if (success) {
      setProjects((prev) => prev.filter((p) => p.id !== id))
    }
    return success
  }

  const handleAddTeamMember = async (projectId: string, userId: string) => {
    const updated = await addTeamMemberService(projectId, userId)
    if (updated) {
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)))
    }
    return updated
  }

  const handleRemoveTeamMember = async (projectId: string, userId: string) => {
    const updated = await removeTeamMemberService(projectId, userId)
    if (updated) {
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)))
    }
    return updated
  }

  const handleAssignSupervisor = async (projectId: string, userId: string) => {
    const updated = await assignSupervisorService(projectId, userId)
    if (updated) {
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)))
    }
    return updated
  }

  const handleCreateUser = async (data: CreateUserInput) => {
    const user = await createUserService(data)
    setUsers((prev) => [...prev, user])
    return user
  }

  const handleUpdateUser = async (id: string, data: Partial<CreateUserInput>) => {
    const updated = await updateUserService(id, data)
    if (updated) {
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)))
    }
    return updated
  }

  const handleDeactivateUser = async (id: string) => {
    const updated = await deactivateUserService(id)
    if (updated) {
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)))
    }
    return updated
  }

  // H1 (QA.md): never swallow backend errors here. Rethrow so callers
  // (TimesheetEditor, ReviewPanel) can surface the server's message verbatim
  // instead of showing a false success toast on failure.
  const handleSaveDraft = async (id: string, data: SaveTimesheetInput) => {
    const updated = await saveDraftService(id, data)
    if (updated) {
      setTimesheets((prev) => prev.map((t) => (t.id === id ? updated : t)))
    }
    return updated
  }

  const handleSubmitTimesheet = async (id: string) => {
    const updated = await submitTimesheetService(id)
    if (updated) {
      setTimesheets((prev) => prev.map((t) => (t.id === id ? updated : t)))
    }
    return updated
  }

  const handleWithdrawTimesheet = async (id: string, reason?: string) => {
    const updated = await withdrawTimesheetService(id, reason)
    if (updated) {
      setTimesheets((prev) => prev.map((t) => (t.id === id ? updated : t)))
    }
    return updated
  }

  const handleApproveTimesheet = async (id: string) => {
    const updated = await approveTimesheetService(id)
    if (updated) {
      setTimesheets((prev) => prev.map((t) => (t.id === id ? updated : t)))
    }
    return updated
  }

  const handleDeclineTimesheet = async (id: string, reason: string) => {
    const updated = await declineTimesheetService(id, reason)
    if (updated) {
      setTimesheets((prev) => prev.map((t) => (t.id === id ? updated : t)))
    }
    return updated
  }

  const handleCreateTimesheet = async (data: SaveTimesheetInput) => {
    try {
      const timesheet = await createTimesheetService(data)
      setTimesheets((prev) => [...prev, timesheet])
      return timesheet
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create timesheet'
      throw new Error(message)
    }
  }

  const handleMarkNotificationAsRead = useCallback(async (id: string) => {
    await markAsReadService(id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }, [])

  const handleMarkAllNotificationsAsRead = useCallback(async () => {
    await markAllAsReadService()
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const handleUploadDocument = async (projectId: string, file: File) => {
    const document = await uploadDocumentService(projectId, file)
    setDocuments((prev) => [...prev, document])
    return document
  }

  const handleDeleteDocument = async (projectId: string, id: string) => {
    const success = await deleteDocumentService(projectId, id)
    if (success) {
      setDocuments((prev) => prev.filter((d) => d.id !== id))
    }
    return success
  }

  const handleCreateInvoice = async (data: { projectId: string; hourlyRate?: number }) => {
    const invoice = await createInvoiceService(data)
    setInvoices((prev) => [...prev, invoice])
    return invoice
  }

  const handleUpdateInvoice = async (id: string, data: { hourlyRate?: number; addVariableCosts?: { amount: number; reason: string }[]; removeVariableCostIds?: string[] }) => {
    const updated = await updateInvoiceService(id, data)
    if (updated) {
      setInvoices((prev) => prev.map((i) => (i.id === id ? updated : i)))
    }
    return updated
  }

  const handleSendInvoice = async (id: string) => {
    const sent = await sendInvoiceService(id)
    if (sent) {
      setInvoices((prev) => prev.map((i) => (i.id === id ? sent : i)))
    }
    return sent
  }

  return (
    <AppDataContext.Provider
      value={{
        projects,
        users,
        timesheets,
        invoices,
        notifications,
        activities,
        documents,
        isLoading,
        refreshProjects,
        refreshUsers,
        refreshTimesheets,
        refreshInvoices,
        refreshNotifications,
        refreshActivities,
        createProject: handleCreateProject,
        updateProject: handleUpdateProject,
        deleteProject: handleDeleteProject,
        addTeamMember: handleAddTeamMember,
        removeTeamMember: handleRemoveTeamMember,
        assignSupervisor: handleAssignSupervisor,
        createUser: handleCreateUser,
        updateUser: handleUpdateUser,
        deactivateUser: handleDeactivateUser,
        saveDraft: handleSaveDraft,
        submitTimesheet: handleSubmitTimesheet,
        withdrawTimesheet: handleWithdrawTimesheet,
        approveTimesheet: handleApproveTimesheet,
        declineTimesheet: handleDeclineTimesheet,
        createTimesheet: handleCreateTimesheet,
        createInvoice: handleCreateInvoice,
        updateInvoice: handleUpdateInvoice,
        sendInvoice: handleSendInvoice,
markNotificationAsRead: handleMarkNotificationAsRead,
        markAllNotificationsAsRead: handleMarkAllNotificationsAsRead,
        uploadDocument: handleUploadDocument,
        deleteDocument: handleDeleteDocument,
        refreshDocuments,
        startNotificationPoll,
        stopNotificationPoll,
      }}
    >
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData() {
  const context = useContext(AppDataContext)
  if (!context) {
    throw new Error('useAppData must be used within an AppDataProvider')
  }
  return context
}
