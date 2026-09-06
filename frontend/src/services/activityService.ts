import type { Activity } from '../types/activity'
import apiClient from './apiClient'

export async function getActivities(): Promise<Activity[]> {
  const response = await apiClient.get<{ activities: Activity[] }>('/activities')
  return response.activities
}

export async function getActivitiesByUserId(userId: string): Promise<Activity[]> {
  const response = await apiClient.get<{ activities: Activity[] }>(`/activities/users/${userId}`)
  return response.activities
}

export async function getActivitiesByProjectId(projectId: string): Promise<Activity[]> {
  const response = await apiClient.get<{ activities: Activity[] }>(`/activities/projects/${projectId}`)
  return response.activities
}

export async function getActivitiesByTimesheetId(timesheetId: string): Promise<Activity[]> {
  const response = await apiClient.get<{ activities: Activity[] }>(`/activities/timesheets/${timesheetId}`)
  return response.activities
}

export async function createActivity(data: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> {
  const response = await apiClient.post<{ activity: Activity }>('/activities', data)
  return response.activity
}
