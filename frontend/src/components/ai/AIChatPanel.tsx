import { useAIChat } from '../../contexts/AIContext'
import { AIMessageBubble } from './AIMessageBubble'
import { AIActionCard } from './AIActionCard'
import { Button } from '../ui/Button'
import { Send, Bot, ArrowLeft } from 'lucide-react'
import { useRef, useEffect } from 'react'

export function AIChatPanel({ onClose }: { onClose?: () => void }) {
  const { messages, isLoading, error, sendMessage, clearChat } = useAIChat()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<Element | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Guideline 1.1/1.3 (checklist item 1.1): the panel behaves like a modal —
  // focus moves into the composer on open and returns to the trigger on close,
  // and Escape dismisses it. PreviouslyFocused is captured on mount (before
  // the auto-focused textarea steals document.activeElement).
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement
    inputRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose?.()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      if (previouslyFocusedRef.current instanceof HTMLElement) {
        previouslyFocusedRef.current.focus()
      }
    }
  }, [onClose])

  // Guideline 1.3 (checklist item 1.1): Cmd/Ctrl+Enter submits from the
  // composer, matching chat-app conventions. Shift+Enter keeps a newline.
  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.currentTarget as HTMLFormElement
    const input = form.elements.namedItem('message') as HTMLTextAreaElement
    if (input?.value.trim()) {
      sendMessage(input.value)
      input.value = ''
    }
  }

  const quickActions = [
    { label: 'Timesheet Help', message: 'How do I log hours in my timesheet? Can you explain the Regular vs Overtime rule?' },
    { label: 'My Projects', message: 'What projects am I assigned to? Show me my active projects and their deadlines.' },
    { label: 'Pending Approvals', message: 'Which timesheets are waiting for my review?' },
    { label: 'Submission Status', message: 'What is the status of my timesheet submissions?' },
    { label: 'Deadline Reminder', message: 'Which of my projects have upcoming deadlines?' },
    { label: 'General Help', message: 'How do I use this platform?' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end" ref={panelRef}>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div role="dialog" aria-modal="true" aria-label="AI chat" className="relative flex h-full w-full max-w-lg flex-col bg-card shadow-2xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close chat"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Eniac AI Assistant
              </h2>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                Online — Ask me anything about the platform
              </p>
            </div>
          </div>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={clearChat}>
              Clear
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-canvas px-6 py-4">
          {messages.length === 0 && (
            <div className="flex min-h-full flex-col items-center justify-center py-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
                <Bot className="h-8 w-8 text-accent" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">
                Welcome!
              </h3>
              <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                I'm your AI assistant for the Eniac platform. Ask me about
                timesheets, projects, approvals, or any platform feature.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => sendMessage(action.message)}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground shadow-sm transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent-hover"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id}>
              <AIMessageBubble role={msg.role} content={msg.content} />
              {msg.pendingAction && (
                <AIActionCard messageId={msg.id} action={msg.pendingAction} />
              )}
            </div>
          ))}

          {isLoading && (
            <div className="mb-3 flex justify-start">
              <div className="rounded-xl rounded-bl-none border border-border bg-card px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-accent" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-accent" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-accent" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-muted-foreground">Thinking…</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-3 flex justify-start">
              <div className="rounded-xl rounded-bl-none border border-destructive/20 bg-error-soft px-4 py-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 border-t border-border bg-card px-6 py-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <textarea
              name="message"
              ref={inputRef}
              aria-label="Message the AI assistant"
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask me anything… (Ctrl+Enter to send)"
              className="flex-1 resize-none rounded-xl border border-border bg-card px-4 py-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
              rows={2}
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="md"
              loading={isLoading}
              leftIcon={<Send className="h-4 w-4" />}
              className="shrink-0"
            >
              Send
            </Button>
          </form>
          <p className="mt-2 text-center text-xs text-muted-foreground/60">
            {/* Guideline 8.16: provider-neutral copy — the backend's default LLM
                provider is Groq (env-changeable to Gemini), so the panel must not
                name a specific one. */}
            Responses are AI-generated &amp; may be inaccurate. Don't share sensitive personal information.
          </p>
        </div>
      </div>
    </div>
  )
}
