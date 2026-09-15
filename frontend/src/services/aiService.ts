import { apiClient } from './apiClient'
import type { AIChatMessage, AIChatResponse, AIStatus, AIConfirmResult } from '../types/ai'

export async function sendAIChatMessage(
  message: string,
  history: AIChatMessage[]
): Promise<AIChatResponse> {
  const historyPayload = history.slice(-40).map(msg => ({
    role: msg.role,
    content: msg.content,
  }))

  return apiClient.post<AIChatResponse>('/ai/chat', {
    message,
    history: historyPayload,
  })
}

export async function confirmAIPendingAction(actionId: string): Promise<AIConfirmResult> {
  return apiClient.post<AIConfirmResult>(`/ai/actions/${actionId}/confirm`)
}

export async function cancelAIPendingAction(actionId: string): Promise<{ ok: boolean; id: string }> {
  return apiClient.post<{ ok: boolean; id: string }>(`/ai/actions/${actionId}/cancel`)
}

export async function getAIStatus(): Promise<AIStatus> {
  return apiClient.get<AIStatus>('/ai/status')
}

export function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
