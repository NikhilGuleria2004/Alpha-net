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
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close chat"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Eniac AI Assistant
              </h2>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
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

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-6 py-4">
          {messages.length === 0 && (
            <div className="flex min-h-full flex-col items-center justify-center py-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
                <Bot className="h-8 w-8 text-indigo-600" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-slate-900">
                Welcome!
              </h3>
              <p className="mb-6 max-w-sm text-sm text-slate-500">
                I'm your AI assistant for the Alpha-net platform. Ask me about
                timesheets, projects, approvals, or any platform feature.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => sendMessage(action.message)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
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
            <div className="mb-3 flex justify-start">
              <div className="rounded-xl rounded-bl-none border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-600" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-600" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-600" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-slate-500">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-3 flex justify-start">
              <div className="rounded-xl rounded-bl-none border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <textarea
              name="message"
              ref={inputRef}
              placeholder="Ask me anything..."
              className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
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
          <p className="mt-2 text-center text-xs text-slate-400">
            AI responses are powered by Gemini. Don't share sensitive personal information.
          </p>
        </div>
      </div>
    </div>
  )
}
