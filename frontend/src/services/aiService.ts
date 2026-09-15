import { apiClient } from './apiClient'
import type { AIChatMessage, AIChatResponse, AIStatus } from '../types/ai'

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

export async function getAIStatus(): Promise<AIStatus> {
  return apiClient.get<AIStatus>('/ai/status')
}

export function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
