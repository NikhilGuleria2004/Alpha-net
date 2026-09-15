import { createContext, useContext, useState, useCallback, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import type { AIChatMessage, AIPendingAction } from '../types/ai'
import { sendAIChatMessage, confirmAIPendingAction, cancelAIPendingAction, createMessageId } from '../services/aiService'

interface AIContextValue {
  messages: AIChatMessage[]
  isLoading: boolean
  error: string | null
  actionBusyId: string | null
  actionError: string | null
  sendMessage: (content: string) => Promise<void>
  approveAction: (messageId: string) => Promise<void>
  cancelAction: (messageId: string) => Promise<void>
  dismissAction: (messageId: string) => void
  editAction: (messageId: string) => string | null
  clearChat: () => void
  isOpen: boolean
  setIsOpen: Dispatch<SetStateAction<boolean>>
}

const AIContext = createContext<AIContextValue | undefined>(undefined)

const ACTION_DONE_PREFIX = '[actiondone]'

export function AIChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<AIChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return

    const userMsg: AIChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    }

    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    setError(null)
    setActionError(null)

    try {
      const response = await sendAIChatMessage(content, messages)
      const pendingAction: AIPendingAction | null = response.pendingAction ?? null
      const modelMsg: AIChatMessage = {
        id: createMessageId(),
        role: 'model',
        content: response.response,
        timestamp: Date.now(),
        pendingAction,
      }
      setMessages(prev => [...prev, modelMsg])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send message'
      setError(msg)
      const errMsg: AIChatMessage = {
        id: createMessageId(),
        role: 'model',
        content: `Sorry, I encountered an error: ${msg}`,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsLoading(false)
    }
  }, [messages])

  const settleActionMessage = useCallback((messageId: string, note: string) => {
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, pendingAction: null, content: `${m.content}\n\n${ACTION_DONE_PREFIX} ${note}` } : m
    ))
  }, [])

  const approveAction = useCallback(async (messageId: string) => {
    const target = messages.find(m => m.id === messageId)
    const action = target?.pendingAction
    if (!action) return
    setActionBusyId(action.id)
    setActionError(null)
    try {
      const result = await confirmAIPendingAction(action.id)
      settleActionMessage(messageId, `Confirmed — ${result.message || 'the action was applied.'}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to approve action'
      setActionError(msg)
    } finally {
      setActionBusyId(null)
    }
  }, [messages, settleActionMessage])

  const cancelAction = useCallback(async (messageId: string) => {
    const target = messages.find(m => m.id === messageId)
    const action = target?.pendingAction
    if (!action) return
    setActionBusyId(action.id)
    setActionError(null)
    try {
      await cancelAIPendingAction(action.id)
      settleActionMessage(messageId, 'Cancelled — nothing was saved.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel action'
      setActionError(msg)
    } finally {
      setActionBusyId(null)
    }
  }, [messages, settleActionMessage])

  const dismissAction = useCallback((messageId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, pendingAction: null } : m
    ))
  }, [])

  const editAction = useCallback((messageId: string): string | null => {
    const target = messages.find(m => m.id === messageId)
    if (!target?.pendingAction) return null
    void cancelAIPendingAction(target.pendingAction.id).catch(() => undefined)
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, pendingAction: null } : m
    ))
    return target.pendingAction.summary
  }, [messages])

  const clearChat = useCallback(() => {
    setMessages([])
    setError(null)
    setActionError(null)
  }, [])

  return (
    <AIContext.Provider value={{
      messages,
      isLoading,
      error,
      actionBusyId,
      actionError,
      sendMessage,
      approveAction,
      cancelAction,
      dismissAction,
      editAction,
      clearChat,
      isOpen,
      setIsOpen,
    }}>
      {children}
    </AIContext.Provider>
  )
}

export function useAIChat() {
  const context = useContext(AIContext)
  if (!context) {
    throw new Error('useAIChat must be used within AIChatProvider')
  }
  return context
}
