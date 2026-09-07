import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
import type { Project } from '../types/project'
import type { User } from '../types/auth'
import type { CreateUserInput } from '../types/user'
import type { Timesheet, SaveTimesheetInput } from '../types/timesheet'
import type { CreateProjectInput } from '../types/project'
import type { Notification } from '../types/notification'
import type { Activity } from '../types/activity'
import type { Document } from '../types/document'
import { getProjects as fetchProjects, createProject as createProjectService, updateProject as updateProjectService, deleteProject as deleteProjectService, addTeamMember as addTeamMemberService, removeTeamMember as removeTeamMemberService, assignSupervisor as assignSupervisorService } from '../services/projectService'
import { getUsers as fetchUsers, createUser as createUserService, updateUser as updateUserService, deactivateUser as deactivateUserService } from '../services/userService'
import { getTimesheets as fetchTimesheets, saveDraft as saveDraftService, submitTimesheet as submitTimesheetService, withdrawTimesheet as withdrawTimesheetService, approveTimesheet as approveTimesheetService, declineTimesheet as declineTimesheetService, createTimesheet as createTimesheetService } from '../services/timesheetService'
import { getNotifications as fetchNotifications, markAsRead as markAsReadService, markAllAsRead as markAllAsReadService, createNotification as createNotificationService } from '../services/notificationService'
import { getActivities as fetchActivities, createActivity as createActivityService } from '../services/activityService'
import { getDocuments as fetchDocuments, createDocument as createDocumentService, deleteDocument as deleteDocumentService } from '../services/documentService'
import { useAuth } from './AuthContext'

interface AppDataContextValue {
  projects: Project[]
  users: User[]
  timesheets: Timesheet[]
  notifications: Notification[]
  activities: Activity[]
  documents: Document[]
  isLoading: boolean
  refreshProjects: () => Promise<void>
  refreshUsers: () => Promise<void>
  refreshTimesheets: () => Promise<void>
  refreshNotifications: () => Promise<void>
  refreshActivities: () => Promise<void>
  refreshDocuments: () => Promise<void>
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
  markNotificationAsRead: (id: string) => Promise<void>
  markAllNotificationsAsRead: () => Promise<void>
  addNotification: (data: Omit<Notification, 'id' | 'createdAt'>) => Promise<Notification>
  addActivity: (data: Omit<Activity, 'id' | 'createdAt'>) => Promise<Activity>
  createDocument: (data: Omit<Document, 'id' | 'uploadedAt'>) => Promise<Document>
  deleteDocument: (projectId: string, id: string) => Promise<boolean>
}

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
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
        const [projectsData, usersData, timesheetsData, activitiesData, documentsData] = await Promise.all([
          fetchProjects(),
          fetchUsers(),
          fetchTimesheets(),
          fetchActivities(),
          fetchDocuments(),
        ])
        if (!cancelled) {
          setProjects(projectsData)
          setUsers(usersData)
          setTimesheets(timesheetsData)
          setActivities(activitiesData)
          setDocuments(documentsData)
        }
      } finally {
        if (!cancelled) {
          loadingRef.current = false
          setIsLoading(false)
        }
      }
    }
    loadInitialData()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, authLoading])

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

  const refreshNotifications = async () => {
    const data = await fetchNotifications()
    setNotifications(data)
  }

  const refreshActivities = async () => {
    const data = await fetchActivities()
    setActivities(data)
  }

  const refreshDocuments = async () => {
    const data = await fetchDocuments()
    setDocuments(data)
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

  const handleSaveDraft = async (id: string, data: SaveTimesheetInput) => {
    try {
      const updated = await saveDraftService(id, data)
      if (updated) {
        setTimesheets((prev) => prev.map((t) => (t.id === id ? updated : t)))
      }
      return updated
    } catch {
      return undefined
    }
  }

  const handleSubmitTimesheet = async (id: string) => {
    try {
      const updated = await submitTimesheetService(id)
      if (updated) {
        setTimesheets((prev) => prev.map((t) => (t.id === id ? updated : t)))
      }
      return updated
    } catch {
      return undefined
    }
  }

  const handleWithdrawTimesheet = async (id: string, reason?: string) => {
    try {
      const updated = await withdrawTimesheetService(id, reason)
      if (updated) {
        setTimesheets((prev) => prev.map((t) => (t.id === id ? updated : t)))
      }
      return updated
    } catch {
      return undefined
    }
  }

  const handleApproveTimesheet = async (id: string) => {
    try {
      const updated = await approveTimesheetService(id)
      if (updated) {
        setTimesheets((prev) => prev.map((t) => (t.id === id ? updated : t)))
      }
      return updated
    } catch {
      return undefined
    }
  }

  const handleDeclineTimesheet = async (id: string, reason: string) => {
    try {
      const updated = await declineTimesheetService(id, reason)
      if (updated) {
        setTimesheets((prev) => prev.map((t) => (t.id === id ? updated : t)))
      }
      return updated
    } catch {
      return undefined
    }
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

  const handleMarkNotificationAsRead = async (id: string) => {
    await markAsReadService(id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const handleMarkAllNotificationsAsRead = async () => {
    await markAllAsReadService()
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const handleAddNotification = async (data: Omit<Notification, 'id' | 'createdAt'>) => {
    const notification = await createNotificationService(data)
    setNotifications((prev) => [notification, ...prev])
    return notification
  }

  const handleAddActivity = async (data: Omit<Activity, 'id' | 'createdAt'>) => {
    const activity = await createActivityService(data)
    setActivities((prev) => [activity, ...prev])
    return activity
  }

  const handleCreateDocument = async (data: Omit<Document, 'id' | 'uploadedAt'>) => {
    const document = await createDocumentService(data)
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

  return (
    <AppDataContext.Provider
      value={{
        projects,
        users,
        timesheets,
        notifications,
        activities,
        documents,
        isLoading,
        refreshProjects,
        refreshUsers,
        refreshTimesheets,
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
        markNotificationAsRead: handleMarkNotificationAsRead,
        markAllNotificationsAsRead: handleMarkAllNotificationsAsRead,
        addNotification: handleAddNotification,
        addActivity: handleAddActivity,
        createDocument: handleCreateDocument,
        deleteDocument: handleDeleteDocument,
        refreshDocuments,
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
