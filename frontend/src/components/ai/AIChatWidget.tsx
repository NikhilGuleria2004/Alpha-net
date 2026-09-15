import { useAIChat } from '../../contexts/AIContext'
import { AIChatPanel } from './AIChatPanel'
import { Bot } from 'lucide-react'
import { useEffect, useRef } from 'react'

export function AIChatWidget() {
  const { isOpen, setIsOpen, messages, isLoading } = useAIChat()
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Keyboard shortcut: Ctrl+Shift+A or Cmd+Shift+A
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setIsOpen])

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-white shadow-xl transition-all hover:bg-indigo-700 ${
          isOpen ? 'scale-90 opacity-60' : 'scale-100 hover:scale-105'
        }`}
        aria-label={isOpen ? 'Close AI chat' : 'Open AI chat'}
      >
        {isLoading ? (
          <span className="flex h-5 w-5 items-center justify-center animate-pulse">
            <Bot className="h-5 w-5" />
          </span>
        ) : (
          <>
            <Bot className="h-5 w-5" />
            <span className="text-sm font-medium">Ask AI</span>
          </>
        )}
        {messages.length > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-xs font-semibold text-indigo-700">
            {messages.filter((m) => m.role === 'user').length}
          </span>
        )}
      </button>

      {isOpen && <AIChatPanel onClose={() => setIsOpen(false)} />}
    </>
  )
}
