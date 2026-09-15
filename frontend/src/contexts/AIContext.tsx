import { createContext, useContext, useState, useCallback, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import type { AIChatMessage } from '../types/ai'
import { sendAIChatMessage, createMessageId } from '../services/aiService'

interface AIContextValue {
  messages: AIChatMessage[]
  isLoading: boolean
  error: string | null
  sendMessage: (content: string) => Promise<void>
  clearChat: () => void
  isOpen: boolean
  setIsOpen: Dispatch<SetStateAction<boolean>>
}

const AIContext = createContext<AIContextValue | undefined>(undefined)

export function AIChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<AIChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

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
    
    try {
      const response = await sendAIChatMessage(content, messages)
      const modelMsg: AIChatMessage = {
        id: createMessageId(),
        role: 'model',
        content: response.response,
        timestamp: Date.now(),
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

  const clearChat = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return (
    <AIContext.Provider value={{
      messages,
      isLoading,
      error,
      sendMessage,
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
