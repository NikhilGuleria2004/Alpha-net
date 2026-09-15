export interface AIChatMessage {
  id: string
  role: 'user' | 'model'
  content: string
  timestamp: number
}

export interface AIChatResponse {
  response: string
}

export interface AIStatus {
  available: boolean
  model: string
}
