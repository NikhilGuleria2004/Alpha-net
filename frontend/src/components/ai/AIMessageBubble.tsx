import { MessageCircle, User } from 'lucide-react'

interface AIMessageBubbleProps {
  role: 'user' | 'model'
  content: string
}

export function AIMessageBubble({ role, content }: AIMessageBubbleProps) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
        role === 'user'
          ? 'bg-primary text-primary-foreground rounded-br-none'
          : 'bg-secondary border border-border text-foreground rounded-bl-none'
      }`}>
        {role === 'model' && (
          <div className="flex items-center gap-2 mb-1">
            <MessageCircle className="h-4 w-4 text-accent" />
            <span className="text-xs font-medium text-muted-foreground">
              Eniac Assistant
            </span>
          </div>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
        {role === 'user' && (
          <div className="flex items-center gap-2 mt-1">
            <User className="h-4 w-4 text-primary-foreground/60" />
            <span className="text-xs text-primary-foreground/60">You</span>
          </div>
        )}
      </div>
    </div>
  )
}
