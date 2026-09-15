import { useAIChat } from '../../contexts/AIContext'
import { AIMessageBubble } from './AIMessageBubble'
import { Button } from '../ui/Button'
import { Send, Bot, ArrowLeft } from 'lucide-react'
import { useRef, useEffect } from 'react'

export function AIChatPanel({ onClose }: { onClose?: () => void }) {
  const { messages, isLoading, error, sendMessage, clearChat } = useAIChat()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

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
    { label: 'Submission Status', message: 'What is the status of my timesheet submissions?' },
    { label: 'Deadline Reminder', message: 'Which of my projects have upcoming deadlines?' },
    { label: 'General Help', message: 'How do I use this platform?' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative h-full w-full max-w-lg bg-card shadow-xl">
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close chat"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Eniac AI Assistant
              </h2>
              <p className="text-xs text-muted-foreground">
                Ask me anything about the platform
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={clearChat}>
            Clear
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 bg-muted/30">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 mb-4">
                <Bot className="h-8 w-8 text-accent" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Welcome!
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                I'm your AI assistant for the Alpha-net platform. Ask me about
                timesheets, projects, approvals, or any platform feature.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => sendMessage(action.message)}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <AIMessageBubble key={msg.id} role={msg.role} content={msg.content} />
          ))}

          {isLoading && (
            <div className="flex justify-start mb-3">
              <div className="bg-secondary border border-border rounded-xl rounded-bl-none px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-muted-foreground">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-start mb-3">
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl rounded-bl-none px-4 py-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border px-6 py-4 bg-card">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <textarea
              name="message"
              ref={inputRef}
              placeholder="Ask me anything..."
              className="flex-1 resize-none rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
          <p className="mt-2 text-xs text-muted-foreground text-center">
            AI responses are powered by Gemini. Don't share sensitive personal information.
          </p>
        </div>
      </div>
    </div>
  )
}
