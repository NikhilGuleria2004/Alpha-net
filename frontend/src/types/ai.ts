export interface AIChatMessage {
  id: string
  role: 'user' | 'model'
  content: string
  timestamp: number
  pendingAction?: AIPendingAction | null
}

export type AIPendingTool = 'createTimesheet' | 'approveTimesheet' | 'declineTimesheet'

export interface AIPendingAction {
  id: string
  tool: AIPendingTool
  summary: string
  expiresInSeconds: number
}

export interface AIChatResponse {
  response: string
  pendingAction?: AIPendingAction | null
}

export interface AIStatus {
  available: boolean
  /** Which backend provider is live: "groq" | "gemini" (null when unavailable). */
  provider?: string | null
  model: string
}

export interface AIConfirmResult {
  // The created/updated platform resource (timesheet, etc.) — shape varies by tool.
  resource: unknown
  message: string
}
