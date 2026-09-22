import type { User } from '../types/auth'
import apiClient from './apiClient'

export interface Invite {
  id: string
  email: string
  role: 'user' | 'supervisor' | 'admin'
  token: string
  invitedBy: string
  projectId?: string
  firstName?: string
  lastName?: string
  invitedByName?: string
  inviteeName?: string
  createdAt: string
  expiresAt: string
  acceptedAt?: string
  status: 'pending' | 'accepted' | 'expired'
}

export interface CreateInviteInput {
  email: string
  role: 'user' | 'supervisor' | 'admin'
  firstName?: string
  lastName?: string
  employeeId?: string
  department?: string
  supervisorId?: string
  projectId?: string
}

export interface RedeemInviteInput {
  token: string
  password: string
  firstName?: string
  lastName?: string
  employeeId?: string
  department?: string
}

export async function getInvites(): Promise<Invite[]> {
  const response = await apiClient.get<{ invites: Invite[] }>('/invites')
  return response.invites
}

export async function createInvite(data: CreateInviteInput): Promise<Invite> {
  const response = await apiClient.post<{ invite: Invite }>('/invites', data)
  return response.invite
}

export async function resendInvite(inviteId: string): Promise<Invite> {
  const response = await apiClient.post<{ invite: Invite }>('/invites/resend', { inviteId })
  return response.invite
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await apiClient.post<void>('/invites/revoke', { inviteId })
}

export async function redeemInvite(data: RedeemInviteInput): Promise<{ user: User; invite: Invite }> {
  const response = await apiClient.post<{ user: User; invite: Invite }>('/invites/redeem', data)
  return response
}

export async function getInviteByToken(token: string): Promise<Invite | undefined> {
  const response = await apiClient.get<{ invite: Invite }>(`/invites/check-token?token=${encodeURIComponent(token)}`)
  return response.invite
}
