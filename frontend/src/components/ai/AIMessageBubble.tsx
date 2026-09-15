import { MessageCircle, User } from 'lucide-react'

interface AIMessageBubbleProps {
  role: 'user' | 'model'
  content: string
}

export function AIMessageBubble({ role, content }: AIMessageBubbleProps) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
        role === 'user'
          ? 'rounded-br-md bg-indigo-600 text-white'
          : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'
      }`}>
        {role === 'model' && (
          <div className="mb-1 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-indigo-600" />
            <span className="text-xs font-medium text-slate-500">
              Eniac Assistant
            </span>
          </div>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
        {role === 'user' && (
          <div className="mt-1 flex items-center justify-end gap-1.5">
            <span className="text-[11px] text-indigo-200">You</span>
            <User className="h-3.5 w-3.5 text-indigo-200" />
          </div>
        )}
      </div>
    </div>
  )
}
