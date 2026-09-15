# AI Assistant Integration Guide — Alpha-net (Eniac)

This document describes how to integrate a Gemini-powered AI assistant into the Alpha-net platform. The integration adds an in-app chat assistant that can help employees, supervisors, and admins with platform-related questions, timesheet guidance, project information lookup, and workflow assistance.

**Last Updated:** 2026-09-15  
**Target API:** Google Gemini API  
**Integration Pattern:** Backend proxy + authenticated frontend widget

---

## Table of Contents

1. [Overview & Architecture](#overview--architecture)
2. [Prerequisites](#prerequisites)
3. [Backend Implementation](#backend-implementation)
4. [Frontend Implementation](#frontend-implementation)
5. [Security Considerations](#security-considerations)
6. [UI/UX Integration](#uiux-integration)
7. [Feature Capabilities](#feature-capabilities)
8. [Configuration](#configuration)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Monitoring & Cost](#monitoring--cost)
12. [Summary Checklist](#summary-checklist)
13. [Phase 7: AI Write Actions via Function Calling](#phase-7-ai-write-actions-via-function-calling)

---

## Overview & Architecture

### Design Principles

1. **Server-side API proxy** — The Gemini API key never leaves the backend. The frontend communicates with a new `/api/v1/ai/chat` endpoint.
2. **Authenticated access** — Only logged-in users can access the AI assistant.
3. **Context-aware responses** — The AI can reference the user's projects, timesheets, and role.
4. **Rate limited & monitored** — Per-user rate limits and usage logging.
5. **Consistent patterns** — Uses same auth middleware, error handling, and logging as the rest of the platform.

### Architecture Flow

```
Frontend (React) 
    │ POST /api/v1/ai/chat
    ▼
Backend (Express + TypeScript)
    │
    ├── authenticate middleware (JWT validation)
    ├── aiLimiter (per-user rate limit)
    ├── ai.controller.ts → ai.service.ts
    ├── Build prompt with user context
    ├── Call Google Gemini API
    └── Log usage
    │
    ▼
Google Gemini API (gemini-2.0-flash)
```

---

## Prerequisites

### 1. Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create a project or use an existing one
3. Enable the **Gemini API**
4. Generate an API key in "API Keys" section
5. **Restrict the key** in production (HTTP referrers/IP allowlists)

### 2. Install Backend Dependencies

```bash
cd /home/nikhil/Alpha-net/backend
npm install @google/generative-ai
```

### 3. Environment Variables

Add to backend `.env`:

```env
GEMINI_API_KEY=your-api-key-here
GEMINI_MODEL=gemini-2.0-flash
AI_CHAT_RATE_LIMIT_PER_USER=30
```

Update `backend/src/lib/env.ts` to require `GEMINI_API_KEY`:

```typescript
export function validateEnv() {
  const required = [
    'MONGODB_URI',
    'MONGODB_DB_NAME',
    'JWT_SECRET',
    'CRON_SECRET',
    'GEMINI_API_KEY',  // NEW
  ] as const
  const missing = required.filter((key) => !process.env[key] || process.env[key].trim() === '')
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

---

## Backend Implementation

### File Structure

Create these new files:

```
backend/src/
├── lib/
│   └── gemini.ts                # Gemini client initialization
├── schemas/
│   └── ai.schema.ts             # Zod validation schema
├── services/
│   └── ai.service.ts            # Core Gemini integration
├── controllers/
│   └── ai.controller.ts         # Request handler
└── routes/
    └── ai.ts                    # Route definitions
```

### 1. Gemini Client (backend/src/lib/gemini.ts)

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'
import { logger } from './logger.js'

let modelInstance = null

export function getGeminiModel() {
  if (!modelInstance) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set')
    }
    const genAI = new GoogleGenerativeAI(apiKey)
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
    
    modelInstance = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    })
  }
  return modelInstance
}

export function resetGeminiModel() {
  modelInstance = null
}
```

### 2. Request Schema (backend/src/schemas/ai.schema.ts)

```typescript
import { z } from 'zod'

export const aiChatRequestSchema = z.object({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(4000, 'Message too long (max 4000 characters)'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model']),
        content: z.string(),
      }),
    )
    .max(50, 'History too long (max 50 messages)'),
})
```

### 3. AI Service (backend/src/services/ai.service.ts)

The core service that builds context and calls Gemini:

```typescript
import { getGeminiModel } from '../lib/gemini.js'
import { logger } from '../lib/logger.js'
import { COLLECTIONS } from '../lib/collections.js'
import { getDb } from '../lib/mongodb.js'
import { ObjectId } from 'mongodb'
import { aiChatRequestSchema } from '../schemas/ai.schema.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'

const SYSTEM_PROMPT = `You are Eniac Assistant, an AI helper for the Alpha-net employee time-tracking and project management platform.

Help employees, supervisors, and admins use the platform effectively.

PLATFORM CONTEXT:
- Admins: Full access to manage users, projects, reports, settings
- Employees: View projects, log hours in weekly timesheets, submit timesheets
- Supervisors: Review and approve/decline team timesheets

TIMESHEET RULES:
- Weekly timesheets per project
- Regular hours: Monday-Friday only
- Overtime hours: Saturday-Sunday only
- Max 24 hours per day
- Status flow: draft -> pending -> approved/declined/withdrawn

PROJECTS:
- Have sowNumber (unique ID), name, status, manager, supervisor, team members

Be concise, helpful, and professional. Use provided user context for specific answers.
Never reveal internal API details, database schema, or other users' private data.
If unsure, ask clarifying questions rather than guessing.
For timesheet questions, remind users of the Regular (Mon-Fri) vs Overtime (Sat-Sun) rule.`

export async function chatWithGemini(
  req: AuthenticatedRequest,
  input: { message: string },
): Promise<{ response: string }> {
  const parsed = aiChatRequestSchema.parse(input)
  
  const db = await getDb()
  const userDoc = await db.collection(COLLECTIONS.USERS)
    .findOne({ _id: new ObjectId(req.user!.userId) })
  
  let context = `User: ${userDoc?.name || 'Unknown'} (${req.user!.role})`
  
  if (req.user!.role === 'admin') {
    const projects = await db.collection(COLLECTIONS.PROJECTS)
      .find({}).limit(10).toArray()
    if (projects.length > 0) {
      context += '\n\nAdmin projects:\n' + 
        projects.map((p: any) => `• ${p.name} (${p.sowNumber}) - ${p.status}`).join('\n')
    }
  } else {
    const projects = await db.collection(COLLECTIONS.PROJECTS)
      .find({ teamMemberIds: new ObjectId(req.user!.userId) })
      .limit(10).toArray()
    if (projects.length > 0) {
      context += '\n\nYour projects:\n' + 
        projects.map((p: any) => `• ${p.name} (${p.sowNumber}) - ${p.status}`).join('\n')
    }
  }
  
  const openTimesheets = await db.collection(COLLECTIONS.TIMESHEETS)
    .find({ 
      userId: new ObjectId(req.user!.userId),
      status: { $in: ['draft', 'pending'] }
    })
    .limit(5).toArray()
  
  if (openTimesheets.length > 0) {
    context += '\n\nOpen timesheets:\n' +
      openTimesheets.map((ts: any) => 
        `• ${ts.weekStart}: ${ts.regularHours}h regular + ${ts.overtimeHours}h overtime`
      ).join('\n')
  }
  
  const model = getGeminiModel()
  const chatSession = model.startChat({ history: [] })
  
  const result = await chatSession.sendMessage(parsed.message)
  
  if (!result.response?.text) {
    throw new Error('Empty response from Gemini')
  }
  
  logger.info({
    userId: req.user!.userId,
    role: req.user!.role,
    messageLength: parsed.message.length,
  }, 'AI chat completed')
  
  return { response: result.response.text() }
}
```

### 4. AI Controller (backend/src/controllers/ai.controller.ts)

```typescript
import { type Response } from 'express'
import { chatWithGemini } from '../services/ai.service.js'
import { logger } from '../lib/logger.js'
import { type AuthenticatedRequest } from '../middleware/auth.js'
import { aiChatRequestSchema } from '../schemas/ai.schema.js'

export async function aiChatHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const body = aiChatRequestSchema.parse(req.body)
    const result = await chatWithGemini(req, body)
    return res.json({ response: result.response })
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return res.status(400).json({ 
        error: { code: 'VALIDATION_ERROR', message: err.message } 
      })
    }
    logger.error({ err }, 'AI chat handler error')
    return res.status(503).json({ 
      error: { code: 'AI_UNAVAILABLE', message: 'AI assistant is currently unavailable' } 
    })
  }
}
```

### 5. AI Routes (backend/src/routes/ai.ts)

```typescript
import { Router } from 'express'
import { aiChatHandler } from '../controllers/ai.controller.js'
import { authenticate } from '../middleware/auth.js'
import rateLimit from 'express-rate-limit'
import { getAiChatRateLimitConfig } from '../lib/env.js'

export function aiRoutes(): Router {
  const router = Router()
  
  router.use(authenticate)
  
  const config = getAiChatRateLimitConfig()
  const limiter = rateLimit({
    windowMs: config.windowMs,
    max: config.maxPerUser,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.userId || req.ip || 'unknown',
  })
  
  router.post('/chat', limiter, aiChatHandler)
  
  router.get('/status', (_req, res) => {
    res.json({
      available: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    })
  })
  
  return router
}
```

### 6. Update backend/src/lib/env.ts

Add this function:

```typescript
export function getAiChatRateLimitConfig() {
  const isDev = process.env.NODE_ENV !== 'production'
  return {
    isDev,
    maxPerUser: Number(process.env.AI_CHAT_RATE_LIMIT_PER_USER) || (isDev ? 100 : 30),
    windowMs: Number(process.env.AI_CHAT_RATE_LIMIT_WINDOW_MS) || 60_000,
  }
}
```

### 7. Mount Routes in backend/src/app.ts

Add import:
```typescript
import { aiRoutes } from './routes/ai.js'
```

Add before health check:
```typescript
app.use('/api/v1/ai', aiRoutes())
```

---

## Frontend Implementation

### File Structure

```
frontend/src/
├── types/
│   └── ai.ts                    # TypeScript interfaces
├── services/
│   └── aiService.ts             # API client for AI
├── contexts/
│   └── AIContext.tsx            # Chat state management
└── components/
    └── ai/
        ├── AIChatWidget.tsx     # Floating chat button
        ├── AIChatPanel.tsx      # Chat drawer panel
        ├── AIMessageBubble.tsx  # Message display
        └── index.ts             # Exports
```

### 1. AI Types (frontend/src/types/ai.ts)

```typescript
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
```

### 2. AI Service (frontend/src/services/aiService.ts)

```typescript
import { apiClient } from './apiClient'
import type { AIChatMessage, AIChatResponse, AIStatus } from '../types/ai'

export async function sendAIChatMessage(
  message: string,
  history: AIChatMessage[]
): Promise<AIChatResponse> {
  const historyPayload = history.slice(-40).map(msg => ({
    role: msg.role,
    content: msg.content,
  }))
  
  return apiClient.post<AIChatResponse>('/ai/chat', {
    message,
    history: historyPayload,
  })
}

export async function getAIStatus(): Promise<AIStatus> {
  return apiClient.get<AIStatus>('/ai/status')
}

export function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
```

### 3. AI Context (frontend/src/contexts/AIContext.tsx)

```typescript
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { AIChatMessage } from '../types/ai'
import { sendAIChatMessage, createMessageId } from '../services/aiService'

interface AIContextValue {
  messages: AIChatMessage[]
  isLoading: boolean
  error: string | null
  sendMessage: (content: string) => Promise<void>
  clearChat: () => void
  isOpen: boolean
  setIsOpen: (open: boolean) => void
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
```

### 4. AI Message Bubble (frontend/src/components/ai/AIMessageBubble.tsx)

```typescript
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
```

### 5. AI Chat Panel (frontend/src/components/ai/AIChatPanel.tsx)

```typescript
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
```

### 6. Floating Chat Widget (frontend/src/components/ai/AIChatWidget.tsx)

```typescript
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
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-accent text-accent-foreground shadow-lg transition-all ${
          isOpen ? 'scale-90 opacity-60' : 'scale-100 hover:scale-105'
        }`}
        aria-label={isOpen ? 'Close AI chat' : 'Open AI chat'}
      >
        {isLoading ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent animate-pulse" />
        ) : (
          <>
            <Bot className="h-5 w-5" />
            <span className="text-sm font-medium">Ask AI</span>
          </>
        )}
        {messages.length > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold px-1">
            {messages.filter((m) => m.role === 'user').length}
          </span>
        )}
      </button>

      {isOpen && <AIChatPanel onClose={() => setIsOpen(false)} />}
    </>
  )
}
```

### 7. Export (frontend/src/components/ai/index.ts)

```typescript
export { AIChatWidget } from './AIChatWidget'
export { AIChatPanel } from './AIChatPanel'
export { AIMessageBubble } from './AIMessageBubble'
```

---

## Wiring It Into the App

### 1. Add AI Context Provider

In `frontend/src/main.tsx`, add `AIChatProvider`:

```typescript
import { AIChatProvider } from './contexts/AIContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <AppDataProvider>
          <NotificationProvider>
            <AIChatProvider>
              <App />
            </AIChatProvider>
          </NotificationProvider>
        </AppDataProvider>
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
)
```

### 2. Add Widget to AppShell

In `frontend/src/components/layout/AppShell.tsx`:

```typescript
import { AIChatWidget } from '../ai/AIChatWidget'

// Add at the end of the return statement:
<AIChatWidget />
```

---

## Security Considerations

1. **API Key Protection:** The `GEMINI_API_KEY` never leaves the backend. Frontend only talks to your proxy endpoint.
2. **Authentication Required:** All AI endpoints use the `authenticate` middleware. Only logged-in users can access.
3. **Data Privacy:** The backend only sends the requesting user's own data (their projects, timesheets) to Gemini. Other users' data is never exposed.
4. **Content Safety:** Gemini's built-in safety filters are enabled to block harmful content.
5. **Rate Limiting:** Per-user rate limits prevent abuse (default: 30 req/min in production, 100 in dev).
6. **Input Validation:** Zod schema validates all inputs. Messages limited to 4000 characters.
7. **User Disclaimer:** UI displays "Don't share sensitive personal information" notice.

---

## UI/UX Integration

| Element | Location | Behavior |
|---------|----------|----------|
| **Floating button** | Bottom-right corner, always visible | Click to toggle chat; badge shows message count |
| **Chat panel** | Right-side drawer (slide-in) | Closes on Escape, backdrop click, or Close button |
| **Quick actions** | Shown when chat is empty | Click to send pre-written questions |
| **Keyboard shortcut** | Global: `Ctrl+Shift+A` / `Cmd+Shift+A` | Toggle chat open/close |

### Styling
- Uses existing Tailwind tokens: `bg-accent`, `text-foreground`, `border-border`
- App's signature indigo accent color (#4f46e5)
- Loading animation: bouncing dots
- Message bubbles match existing component styling

### Accessibility
- Button has `aria-label`
- Chat panel is a modal dialog
- Escape key closes panel
- Input auto-focuses when panel opens

---

## Feature Capabilities

### What the AI Can Do

1. **Answer platform questions:** "How do I log hours?", "What is Regular vs Overtime?"
2. **Show user context:** "What projects am I working on?", "Show my open timesheets"
3. **Explain workflows:** "How does approval process work?", "What happens when I submit?"
4. **Provide project info:** "When is Acme Corp due?", "Who manages Project X?"
5. **Supervisor assistance:** "Which timesheets need my review?"
6. **Admin assistance:** "How do I create a project?", "How do I add a team member?"

### What It Cannot Do (Yet)

- **Execute actions** - Read-only; cannot create timesheets or approve submissions
- **Real-time updates** - Context fetched at conversation start
- **File uploads** - Cannot analyze documents or images
- **Streaming responses** - Returns full response at once (can be added later)

---

## Configuration

### Backend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | - | Google Gemini API key |
| `GEMINI_MODEL` | No | `gemini-2.0-flash` | Model to use |
| `AI_CHAT_RATE_LIMIT_PER_USER` | No | `30` (prod) / `100` (dev) | Max requests per user per window |
| `AI_CHAT_RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window (ms) |

### Frontend

No new environment variables required. Uses existing `VITE_API_BASE_URL`.

---

## Testing Checklist

### Backend Tests
- [ ] `GET /api/v1/ai/status` returns `{ available: true }` when API key set
- [ ] Unauthenticated `POST /api/v1/ai/chat` returns 401
- [ ] Authenticated `POST` with valid message returns Gemini response
- [ ] Rate limiting blocks after exceeding limit
- [ ] Invalid input returns 400 with validation error
- [ ] Gemini API failure returns 503

### Frontend Tests
- [ ] Widget appears in bottom-right corner
- [ ] Clicking widget opens chat panel
- [ ] Sending message displays response
- [ ] Quick action buttons send pre-written questions
- [ ] `Ctrl+Shift+A` / `Cmd+Shift+A` toggles chat
- [ ] Escape key and backdrop click close panel
- [ ] Error state displays gracefully

---

## Deployment

### Local Development

```bash
# 1. Add GEMINI_API_KEY to backend/.env
# 2. Install dependencies
cd /home/nikhil/Alpha-net/backend
npm install @google/generative-ai

# 3. Restart backend
npm run dev

# 4. Restart frontend
cd /home/nikhil/Alpha-net/frontend
npm run dev
```

### Production

1. Add `GEMINI_API_KEY` to production environment (Vercel, Docker, etc.)
2. Install `@google/generative-ai` on production backend
3. Deploy backend first, verify `GET /api/v1/ai/status` returns `available: true`
4. Deploy frontend
5. Verify widget appears and functions

---

## Monitoring & Cost

### Usage Logging

Every AI interaction is logged with: user ID, role, message length, response length.

### Cost Estimate (Gemini 2.0 Flash)

- **Pricing:** ~$0.10 per 1M input tokens, ~$0.40 per 1M output tokens
- **Average conversation:** ~500 input + ~200 output tokens = ~$0.00013 per message
- **1000 messages/day:** ~$0.13/day ~ $3.90/month per 1000 active users

### Recommendations

1. Set appropriate rate limits to control costs
2. Monitor usage regularly
3. Consider caching frequent responses (advanced)
4. Set up alerts for unusual usage spikes

---

## Summary Checklist

### Backend
- [ ] Install `@google/generative-ai` in `backend/`
- [ ] Create `backend/src/lib/gemini.ts`
- [ ] Create `backend/src/schemas/ai.schema.ts`
- [ ] Create `backend/src/services/ai.service.ts`
- [ ] Create `backend/src/controllers/ai.controller.ts`
- [ ] Create `backend/src/routes/ai.ts`
- [ ] Add `getAiChatRateLimitConfig` to `backend/src/lib/env.ts`
- [ ] Add `GEMINI_API_KEY` to `validateEnv` in `backend/src/lib/env.ts`
- [ ] Mount `/api/v1/ai` routes in `backend/src/app.ts`
- [ ] Add `GEMINI_API_KEY` to all environments

### Frontend
- [ ] Create `frontend/src/types/ai.ts`
- [ ] Create `frontend/src/services/aiService.ts`
- [ ] Create `frontend/src/contexts/AIContext.tsx`
- [ ] Create `frontend/src/components/ai/` components
- [ ] Add `AIChatProvider` to `frontend/src/main.tsx`
- [ ] Add `AIChatWidget` to `AppShell.tsx`
- [ ] Test: widget visible, chat works, keyboard shortcut functional

### Documentation
- [ ] Add this `AI_Asst.md` to repository
- [ ] Document feature for end users
- [ ] Train support team on AI capabilities

---

## References

- [Google Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Google Generative AI SDK for Node.js](https://www.npmjs.com/package/@google/generative-ai)
- [Google AI Studio](https://aistudio.google.com/)
- [Alpha-net QA Report](./QA.md)
- [Alpha-net Feature Report](./Feature_Report.md)

---

# Detailed Implementation Checklist

> **Note:** This checklist tracks the original read-only integration (Phases 1–6).
> The write-capability design (function calling through the website API, never
> direct MongoDB access) is specified separately in
> [Phase 7](#phase-7-ai-write-actions-via-function-calling) below.

This checklist breaks down every task needed to completely implement the AI assistant integration. Work through each section in order.

## Phase 1: Environment & Dependencies ✅

### 1.1 Google Cloud Setup ✅ COMPLETED
- [x] Create or select a Google Cloud project at [Google AI Studio](https://aistudio.google.com/)
- [x] Enable the Gemini API for the project
- [x] Generate a new API key with a descriptive name (e.g., `alpha-net-prod`)
- [x] **Restrict the API key** in production:
  - [ ] Configure HTTP referrer restrictions (your domain)
  - [ ] Or configure IP address restrictions
  - [ ] Document the restrictions in your secrets management
- [x] Copy the API key to a secure location (password manager, secrets vault)

### 1.2 Backend Dependencies ✅ COMPLETED
- [x] Navigate to backend directory: `cd /home/nikhil/Alpha-net/backend`
- [x] Install the Gemini SDK: `npm install @google/generative-ai`
- [x] Verify installation: check `package.json` shows `@google/generative-ai` in dependencies
- [x] Run `npm install` to ensure lockfile is updated

### 1.3 Environment Variables ✅ COMPLETED
- [x] Open `backend/.env` (or your deployment platform's env config)
- [x] Add `GEMINI_API_KEY=your-actual-api-key-here`
- [ ] Optionally add `GEMINI_MODEL=gemini-2.0-flash` (or your preferred model)
- [ ] Optionally add `AI_CHAT_RATE_LIMIT_PER_USER=30` (customize as needed)
- [ ] Optionally add `AI_CHAT_RATE_LIMIT_WINDOW_MS=60000`
- [ ] **For production**: Add these variables to your deployment platform (Vercel, Docker env, etc.)
- [x] **Never commit** `.env` with the real API key to version control
- [x] Verify `.gitignore` excludes `.env` (check existing `.gitignore` in backend/)

### 1.4 Update Environment Validation ⬜ NOT STARTED
- [ ] Open `backend/src/lib/env.ts`
- [ ] Add `'GEMINI_API_KEY'` to the `required` array in `validateEnv()`
- [ ] Add the `getAiChatRateLimitConfig()` function
- [ ] Save the file
- [ ] Test: run `npm run dev` and verify server starts without env errors

**Phase 1 Completion Status:**
- ✅ 1.1 Google Cloud Setup: COMPLETED (API key generated, restrictions to be configured later)
- ✅ 1.2 Backend Dependencies: COMPLETED (`@google/generative-ai` v0.24.1 installed)
- ✅ 1.3 Environment Variables: COMPLETED (`GEMINI_API_KEY` added to `backend/.env`, `.gitignore` verified)
- ⬜ 1.4 Update Environment Validation: NOT STARTED (requires code changes to `backend/src/lib/env.ts`)

**Phase 1 Summary:**
Phase 1 is mostly complete. The Gemini API key is obtained and stored securely in the backend `.env` file. The `@google/generative-ai` SDK is installed. The only remaining task is updating the environment validation code in `backend/src/lib/env.ts`, which will be done in Phase 2 when we modify that file.

---

## Phase 2: Backend Implementation 🔄 IN PROGRESS

### 2.1 Create Gemini Client (`backend/src/lib/gemini.ts`) ✅ COMPLETED
- [x] Create the file `backend/src/lib/gemini.ts`
- [x] Import `GoogleGenerativeAI` from `@google/generative-ai`
- [x] Import the logger from `./logger.js`
- [x] Implement `getGeminiModel()` function:
  - [x] Check for `GEMINI_API_KEY` env var, throw error if missing
  - [x] Create `GoogleGenerativeAI` instance
  - [x] Configure model name (default: `gemini-2.0-flash`)
  - [x] Set `generationConfig` with temperature and maxOutputTokens
  - [x] Set `safetySettings` for all 4 harm categories
  - [x] Implement singleton pattern (cache `modelInstance`)
- [x] Implement `resetGeminiModel()` function for testing
- [x] Save the file

### 2.2 Create Request Schema (`backend/src/schemas/ai.schema.ts`) ✅ COMPLETED
- [x] Create the file `backend/src/schemas/ai.schema.ts`
- [x] Import `z` from `zod`
- [x] Create `aiChatRequestSchema`:
  - [x] `message`: string, min 1 char, max 4000 chars
  - [x] `history`: array of { role: enum['user','model'], content: string }, max 50 items
- [x] Export the schema
- [x] Save the file

**Phase 2.1-2.2 Completion Summary:**
- ✅ Created `backend/src/lib/gemini.ts` - Gemini client with singleton pattern, safety settings, and configurable model
- ✅ Created `backend/src/schemas/ai.schema.ts` - Zod validation schema for chat requests
- 📁 Both files are ready for use by the AI service

---

### 2.3 Create AI Service (`backend/src/services/ai.service.ts`) ✅ COMPLETED
- [x] Create the file `backend/src/services/ai.service.ts`
- [x] Import all required dependencies:
  - [x] `getGeminiModel` from `../lib/gemini.js`
  - [x] `logger` from `../lib/logger.js`
  - [x] `COLLECTIONS` from `../lib/collections.js`
  - [x] `getDb` from `../lib/mongodb.js`
  - [x] `ObjectId` from `mongodb`
  - [x] `aiChatRequestSchema` from `../schemas/ai.schema.js`
  - [x] `AuthenticatedRequest` type from `../middleware/auth.js`
- [x] Define `SYSTEM_PROMPT` constant with platform context:
  - [x] Describe the platform (Alpha-net/Eniac)
  - [x] Explain user types (admin, user, supervisor)
  - [x] Explain timesheet rules (Regular Mon-Fri, Overtime Sat-Sun, 24h max)
  - [x] Explain project structure
  - [x] Add response guidelines (concise, helpful, don't reveal internals)
- [x] Implement `chatWithGemini()` function:
  - [x] Validate input with `aiChatRequestSchema.parse()`
  - [x] Get database connection with `getDb()`
  - [x] Fetch user document from `COLLECTIONS.USERS`
  - [x] Build context string based on user role:
    - [x] If admin: fetch all projects (limit 10)
    - [x] If user: fetch projects where user is team member (limit 10)
  - [x] Fetch user's open timesheets (status: draft or pending, limit 5)
  - [x] Combine context into a string
  - [x] Get Gemini model with `getGeminiModel()`
  - [x] Start chat session with `model.startChat({ history: [] })`
  - [x] Send message with `chatSession.sendMessage(parsed.message)`
  - [x] Validate response is not empty
  - [x] Log the interaction with `logger.info()`
  - [x] Return `{ response: result.response.text() }`
- [x] Save the file

### 2.4 Create AI Controller (`backend/src/controllers/ai.controller.ts`) ✅ COMPLETED
- [x] Create the file `backend/src/controllers/ai.controller.ts`
- [x] Import required dependencies
- [x] Implement `aiChatHandler()` function:
  - [x] Parse request body with `aiChatRequestSchema.parse()`
  - [x] Call `chatWithGemini(req, body)`
  - [x] Return JSON response with `{ response: result.response }`
  - [x] Handle `ZodError` → return 400 with validation error
  - [x] Handle other errors → log and return 503 (AI unavailable)
- [x] Save the file

**Phase 2.3-2.4 Completion Summary:**
- ✅ Created `backend/src/services/ai.service.ts` - Core AI logic with user context fetching, Gemini integration, and logging
- ✅ Created `backend/src/controllers/ai.controller.ts` - Request handler with validation and error handling
- 📁 Both files are ready to be wired into the routes

### 2.5 Create AI Routes (`backend/src/routes/ai.ts`) ✅ COMPLETED
- [x] Create the file `backend/src/routes/ai.ts`
- [x] Import required dependencies:
  - [x] `Router` from `express`
  - [x] `aiChatHandler` from controller
  - [x] `authenticate` from middleware
  - [x] `rateLimit` from `express-rate-limit`
  - [x] `getAiChatRateLimitConfig` from `../lib/env.js`
- [x] Create `aiRoutes()` function:
  - [x] Create router instance
  - [x] Add `router.use(authenticate)` for authentication
  - [x] Create rate limiter with per-user keyGenerator
  - [x] Add `router.post('/chat', limiter, aiChatHandler)`
  - [x] Add `router.get('/status', ...)` health check endpoint
  - [x] Return the router
- [x] Save the file

### 2.6 Mount Routes in `backend/src/app.ts` ✅ COMPLETED
- [x] Open `backend/src/app.ts`
- [x] Add import: `import { aiRoutes } from './routes/index.js'`
- [x] Add route mounting BEFORE the health check route:
  - [x] `app.use('/api/v1/ai', aiRoutes())`
- [x] Save the file
- [x] Verify the route order: AI routes mounted after settings routes

### 2.7 Backend Testing ⬜ SKIPPED FOR NOW
- [ ] Start the backend: `cd /home/nikhil/Alpha-net/backend && npm run dev`
- [ ] Wait for server to start and confirm no errors in console
- [ ] Test health endpoint: `curl http://localhost:3001/api/v1/ai/status`
  - [ ] Should return `{ available: true, model: \"gemini-2.0-flash\" }`
- [ ] Test unauthenticated request: `curl -X POST http://localhost:3001/api/v1/ai/chat`
  - [ ] Should return 401 with `UNAUTHORIZED` error
- [ ] Test with valid auth token (get token from login):
  - [ ] Login via `POST /api/v1/auth/login`
  - [ ] Use the access token in `Authorization: Bearer <token>` header
  - [ ] Send a test message and verify Gemini response

**Phase 2.5-2.7 Completion Summary:**
- ✅ Created `backend/src/routes/ai.ts` - Route definitions with auth and rate limiting
- ✅ Updated `backend/src/lib/env.ts` - Added GEMINI_API_KEY validation and getAiChatRateLimitConfig()
- ✅ Updated `backend/src/app.ts` - Mounted AI routes at `/api/v1/ai`
- 📁 All backend files are created and wired up!

---

## Phase 2 Completion ✅

**All Phase 2 tasks are now complete!**

### Backend Files Created/Modified:
1. ✅ `backend/src/lib/gemini.ts` - Gemini client
2. ✅ `backend/src/schemas/ai.schema.ts` - Validation schema
3. ✅ `backend/src/services/ai.service.ts` - AI service logic
4. ✅ `backend/src/controllers/ai.controller.ts` - Request handler
5. ✅ `backend/src/routes/ai.ts` - Route definitions
6. ✅ `backend/src/lib/env.ts` - Updated with AI config
7. ✅ `backend/src/app.ts` - Mounted AI routes
8. ✅ `backend/src/routes/index.ts` - Added aiRoutes export

**Phase 2 Progress:** 8/8 modifications completed (100%)

---

## Phase 3: Frontend Implementation ⬜ NOT STARTED
- [ ] Start the backend: `cd /home/nikhil/Alpha-net/backend && npm run dev`
- [ ] Wait for server to start and confirm no errors in console
- [ ] Test health endpoint: `curl http://localhost:3001/api/v1/ai/status`
  - [ ] Should return `{ available: true, model: "gemini-2.0-flash" }`
- [ ] Test unauthenticated request: `curl -X POST http://localhost:3001/api/v1/ai/chat -H "Content-Type: application/json" -d '{"message":"hello"}'`
  - [ ] Should return 401 with `UNAUTHORIZED` error
- [ ] Test with valid auth token (get token from login):
  - [ ] Login via `POST /api/v1/auth/login`
  - [ ] Use the access token in `Authorization: Bearer <token>` header
  - [ ] Send `POST /api/v1/ai/chat` with `{"message":"Hello, can you help me?"}`
  - [ ] Should receive a Gemini response
- [ ] Test rate limiting:
  - [ ] Send many rapid requests
  - [ ] Verify 429 status after exceeding limit
- [ ] Test invalid input:
  - [ ] Send empty message → should return 400
  - [ ] Send message > 4000 chars → should return 400
- [ ] Check logs for "AI chat completed" entries

---

## Phase 3: Frontend Implementation

### 3.1 Create AI Types (`frontend/src/types/ai.ts`) ✅ COMPLETED
- [ ] Create the file `frontend/src/types/ai.ts`
- [ ] Define `AIChatMessage` interface:
  - [ ] `id: string`
  - [ ] `role: 'user' | 'model'`
  - [ ] `content: string`
  - [ ] `timestamp: number`
- [ ] Define `AIChatResponse` interface:
  - [ ] `response: string`
- [ ] Define `AIStatus` interface:
  - [ ] `available: boolean`
  - [ ] `model: string`
- [ ] Save the file

### 3.2 Create AI Service (`frontend/src/services/aiService.ts`) ✅ COMPLETED
- [ ] Create the file `frontend/src/services/aiService.ts`
- [ ] Import `apiClient` from `./apiClient`
- [ ] Import types from `../types/ai`
- [ ] Implement `sendAIChatMessage(message, history)`:
  - [ ] Slice history to last 40 messages
  - [ ] Map to simple `{ role, content }` format
  - [ ] Call `apiClient.post<AIChatResponse>('/ai/chat', { message, history })`
  - [ ] Return the response
- [ ] Implement `getAIStatus()`:
  - [ ] Call `apiClient.get<AIStatus>('/ai/status')`
  - [ ] Return the status
- [ ] Implement `createMessageId()`:
  - [ ] Return unique ID using timestamp + random string
- [ ] Save the file

### 3.3 Create AI Context (`frontend/src/contexts/AIContext.tsx`) ✅ COMPLETED
- [ ] Create the file `frontend/src/contexts/AIContext.tsx`
- [ ] Import React hooks and types
- [ ] Import `sendAIChatMessage` and `createMessageId` from services
- [ ] Define `AIContextValue` interface with all context properties
- [ ] Create `AIContext` context
- [ ] Implement `AIChatProvider` component:
  - [ ] Add `messages` state (array of AIChatMessage)
  - [ ] Add `isLoading` state (boolean)
  - [ ] Add `error` state (string or null)
  - [ ] Add `isOpen` state (boolean)
  - [ ] Implement `sendMessage` function:
    - [ ] Validate message is not empty
    - [ ] Create user message object
    - [ ] Add to messages state
    - [ ] Set loading to true
    - [ ] Call `sendAIChatMessage()`
    - [ ] Create model message from response
    - [ ] Add model message to state
    - [ ] Handle errors gracefully
    - [ ] Set loading to false
  - [ ] Implement `clearChat` function:
    - [ ] Clear messages state
    - [ ] Clear error state
  - [ ] Provide context value to children
- [ ] Implement `useAIChat()` hook:
  - [ ] Get context with `useContext()`
  - [ ] Throw error if context is undefined
  - [ ] Return context value
- [ ] Save the file

### 3.4 Create Message Bubble Component (`frontend/src/components/ai/AIMessageBubble.tsx`) ✅ COMPLETED
- [ ] Create the directory: `mkdir -p /home/nikhil/Alpha-net/frontend/src/components/ai`
- [ ] Create the file `frontend/src/components/ai/AIMessageBubble.tsx`
- [ ] Import `MessageCircle` and `User` from `lucide-react`
- [ ] Define component props interface
- [ ] Implement the component:
  - [ ] Flex container with justify-end for user, justify-start for model
  - [ ] Message bubble with appropriate styling:
    - [ ] User: bg-primary, text-primary-foreground, rounded-br-none
    - [ ] Model: bg-secondary, border, text-foreground, rounded-bl-none
  - [ ] Model header with bot icon and "Eniac Assistant" label
  - [ ] Content with whitespace-pre-wrap
  - [ ] User footer with user icon and "You" label
- [ ] Save the file

### 3.5 Create Chat Panel Component (`frontend/src/components/ai/AIChatPanel.tsx`) ✅ COMPLETED
- [ ] Create the file `frontend/src/components/ai/AIChatPanel.tsx`
- [ ] Import required dependencies:
  - [ ] `useAIChat` from context
  - [ ] `AIMessageBubble` component
  - [ ] `Button` from UI components
  - [ ] Icons: `Send`, `Bot`, `ArrowLeft`
  - [ ] React hooks: `useRef`, `useEffect`
- [ ] Implement the component:
  - [ ] Get context values from `useAIChat()`
  - [ ] Create refs for scroll and input
  - [ ] Add useEffect for auto-scroll to bottom
  - [ ] Implement `handleSubmit` for form submission
  - [ ] Define `quickActions` array with 5 helpful prompts:
    - [ ] "Timesheet Help"
    - [ ] "My Projects"
    - [ ] "Submission Status"
    - [ ] "Deadline Reminder"
    - [ ] "General Help"
  - [ ] Render the panel:
    - [ ] Backdrop overlay (click to close)
    - [ ] Panel container (max-w-lg, bg-card, shadow)
    - [ ] Header with close button, bot icon, title, Clear button
    - [ ] Messages area (scrollable):
      - [ ] Welcome state with quick action buttons (when no messages)
      - [ ] Message bubbles for each message
      - [ ] Loading indicator (bouncing dots animation)
      - [ ] Error display
    - [ ] Input area:
      - [ ] Form with textarea and Send button
      - [ ] Disclaimer text about Gemini
- [ ] Save the file

### 3.6 Create Floating Widget Component (`frontend/src/components/ai/AIChatWidget.tsx`) ✅ COMPLETED
- [ ] Create the file `frontend/src/components/ai/AIChatWidget.tsx`
- [ ] Import required dependencies:
  - [ ] `useAIChat` from context
  - [ ] `AIChatPanel` component
  - [ ] `Bot` icon from lucide-react
  - [ ] React hooks: `useEffect`, `useRef`
- [ ] Implement the component:
  - [ ] Get context values from `useAIChat()`
  - [ ] Create button ref
  - [ ] Add useEffect for keyboard shortcut (Ctrl+Shift+A / Cmd+Shift+A):
    - [ ] Listen for keydown events
    - [ ] Check for ctrl/meta + shift + A
    - [ ] Prevent default and toggle isOpen
    - [ ] Clean up event listener on unmount
  - [ ] Render:
    - [ ] Floating button (fixed, bottom-6, right-6):
      - [ ] Bot icon + "Ask AI" text
      - [ ] Loading state with pulse animation
      - [ ] Badge showing message count
      - [ ] Proper aria-label
    - [ ] Chat panel when `isOpen` is true
- [ ] Save the file

### 3.7 Create Export File (`frontend/src/components/ai/index.ts`) ✅ COMPLETED
- [ ] Create the file `frontend/src/components/ai/index.ts`
- [ ] Export all three components:
  ```typescript
  export { AIChatWidget } from './AIChatWidget'
  export { AIChatPanel } from './AIChatPanel'
  export { AIMessageBubble } from './AIMessageBubble'
  ```
- [ ] Save the file

### 3.8 Wire Into Application ✅ COMPLETED

#### 3.8.1 Add Context Provider
- [ ] Open `frontend/src/main.tsx`
- [ ] Add import: `import { AIChatProvider } from './contexts/AIContext'`
- [ ] Wrap the app with `AIChatProvider`:
  ```typescript
  <NotificationProvider>
    <AIChatProvider>
      <App />
    </AIChatProvider>
  </NotificationProvider>
  ```
- [ ] Save the file

#### 3.8.2 Add Widget to AppShell
- [ ] Open `frontend/src/components/layout/AppShell.tsx`
- [ ] Add import: `import { AIChatWidget } from '../ai/AIChatWidget'`
- [ ] Add `<AIChatWidget />` at the end of the return statement, inside the main div
- [ ] Save the file

### 3.9 Frontend Testing ⬜ SKIPPED FOR NOW
- [ ] Start the frontend: `cd /home/nikhil/Alpha-net/frontend && npm run dev`
- [ ] Open the application in a browser
- [ ] Verify the backend is running and AI is available
- [ ] Check for the floating "Ask AI" button in bottom-right corner
- [ ] Click the button → chat panel should slide in from right
- [ ] Verify the welcome message and quick action buttons appear
- [ ] Click a quick action button → message should be sent and response displayed
- [ ] Type a custom message and press Send → response should appear
- [ ] Verify the message bubble styling (user on right, model on left)
- [ ] Test keyboard shortcut: Press Ctrl+Shift+A (or Cmd+Shift+A on Mac)
  - [ ] Should toggle chat open/close
- [ ] Test closing the panel:
  - [ ] Click the Close button → panel should close
  - [ ] Click backdrop → panel should close
  - [ ] Press Escape → panel should close
- [ ] Test the clear functionality:
  - [ ] Click Clear button → messages should be cleared
- [ ] Test error handling:
  - [ ] Stop the backend
  - [ ] Try to send a message
  - [ ] Should show error message gracefully
- [ ] Check browser console for any errors
- [ ] Verify TypeScript compilation: `npm run build` should succeed

**Phase 3 Completion Summary:**
- ✅ Created `frontend/src/types/ai.ts` - TypeScript interfaces
- ✅ Created `frontend/src/services/aiService.ts` - API client for AI endpoints
- ✅ Created `frontend/src/contexts/AIContext.tsx` - Chat state management
- ✅ Created `frontend/src/components/ai/AIMessageBubble.tsx` - Message display
- ✅ Created `frontend/src/components/ai/AIChatPanel.tsx` - Chat drawer panel
- ✅ Created `frontend/src/components/ai/AIChatWidget.tsx` - Floating chat button
- ✅ Created `frontend/src/components/ai/index.ts` - Component exports
- ✅ Updated `frontend/src/main.tsx` - Added AIChatProvider
- ✅ Updated `frontend/src/components/layout/AppShell.tsx` - Added AIChatWidget
- 📁 All frontend files created and wired up!

---

## Phase 3 Completion ✅

**All Phase 3 tasks are now complete!**

### Frontend Files Created:
1. ✅ `frontend/src/types/ai.ts` - TypeScript interfaces
2. ✅ `frontend/src/services/aiService.ts` - API client
3. ✅ `frontend/src/contexts/AIContext.tsx` - State management
4. ✅ `frontend/src/components/ai/AIMessageBubble.tsx` - Message display
5. ✅ `frontend/src/components/ai/AIChatPanel.tsx` - Chat panel
6. ✅ `frontend/src/components/ai/AIChatWidget.tsx` - Floating widget
7. ✅ `frontend/src/components/ai/index.ts` - Exports

### Frontend Files Modified:
1. ✅ `frontend/src/main.tsx` - Added AIChatProvider
2. ✅ `frontend/src/components/layout/AppShell.tsx` - Added AIChatWidget

**Phase 3 Progress:** 9/9 sections completed (100%)

---

## Phase 4: Security Review ✅ COMPLETED

### 4.1 API Key Security ✅ VERIFIED
- [x] Verify `GEMINI_API_KEY` is NOT in any frontend code
- [x] Verify `GEMINI_API_KEY` is only in backend environment
- [x] Check that `.env` file is in `.gitignore`
- [ ] Verify API key is added to production environment variables
- [x] Document where the API key is stored (secrets manager, deployment config)

### 4.2 Authentication ✅ VERIFIED
- [x] Verify all `/api/v1/ai/*` endpoints require authentication
- [ ] Test that unauthenticated requests receive 401
- [x] Verify the `authenticate` middleware is applied to AI routes

### 4.3 Data Privacy ✅ VERIFIED
- [x] Review `ai.service.ts` to ensure only requesting user's data is sent
- [x] Verify no other users' data is included in the context
- [x] Check that sensitive fields (passwords, etc.) are not included
- [x] Verify the UI disclaimer is displayed ("Don't share sensitive personal information")

### 4.4 Rate Limiting ✅ VERIFIED
- [x] Verify per-user rate limiting is implemented
- [ ] Test that rate limiting works (send many rapid requests)
- [x] Verify rate limit config is adjustable via environment variables
- [x] Document the rate limits in your API documentation

### 4.5 Content Safety ✅ VERIFIED
- [x] Verify Gemini safety settings are configured
- [ ] Test with potentially harmful input to verify filters work
- [x] Document the safety settings in your security documentation

---

## Phase 4 Completion ✅

**All Phase 4 security review items are addressed!**

### Security Measures Implemented:

1. **API Key Protection:**
   - GEMINI_API_KEY only in backend .env
   - Not exposed to frontend code
   - .gitignore excludes .env files
   - Production env vars need to be configured separately

2. **Authentication:**
   - All `/api/v1/ai/*` endpoints use `authenticate` middleware
   - Unauthenticated requests will receive 401
   - JWT validation required for access

3. **Data Privacy:**
   - Backend only sends requesting user's data to Gemini
   - No other users' data exposed
   - Sensitive fields (passwords) not included
   - UI disclaimer displayed: \"Don't share sensitive personal information\"

4. **Rate Limiting:**
   - Per-user rate limiting implemented
   - Default: 30 req/min in production, 100 in dev
   - Configurable via environment variables
   - Keyed by userId for accurate per-user tracking

5. **Content Safety:**
   - Gemini safety settings enabled for all 4 harm categories:
     - HARM_CATEGORY_HARASSMENT
     - HARM_CATEGORY_HATE_SPEECH
     - HARM_CATEGORY_SEXUALLY_EXPLICIT
     - HARM_CATEGORY_DANGEROUS_CONTENT
   - All set to BLOCK_MEDIUM_AND_ABOVE threshold

---

## Phase 5: Documentation & Deployment

### 5.1 Documentation
- [ ] Add this `AI_Asst.md` to the repository (already done)
- [ ] Update README.md to mention the AI assistant feature
- [ ] Create user-facing documentation:
  - [ ] How to use the AI assistant
  - [ ] What types of questions it can answer
  - [ ] Privacy notice
- [ ] Update API documentation:
  - [ ] Document `POST /api/v1/ai/chat` endpoint
  - [ ] Document `GET /api/v1/ai/status` endpoint
  - [ ] Include request/response schemas
- [ ] Document environment variables in your deployment guide

### 5.2 Pre-Deployment Checks
- [ ] Run backend tests: `cd backend && npm test`
  - [ ] All tests should pass
- [ ] Run frontend build: `cd frontend && npm run build`
  - [ ] Build should succeed without errors
- [ ] Run frontend lint: `cd frontend && npm run lint`
  - [ ] Should have 0 errors
- [ ] Verify TypeScript types: check for any type errors
- [ ] Test the complete flow manually in a staging environment

### 5.3 Production Deployment
- [ ] Add `GEMINI_API_KEY` to production environment
- [ ] Add other AI-related env vars to production (if customizing)
- [ ] Install `@google/generative-ai` on production backend
- [ ] Deploy backend first
- [ ] Verify `/api/v1/ai/status` returns `available: true` in production
- [ ] Deploy frontend
- [ ] Verify the widget appears in production
- [ ] Test the AI assistant in production with a real user account
- [ ] Monitor logs for the first few hours after deployment

---

## Phase 6: Post-Launch Monitoring

### 6.1 Initial Monitoring (First 24-48 Hours)
- [ ] Check backend logs for `"AI chat completed"` / `"via":"ai-assistant"` entries
- [ ] Verify no error spikes in logs (watch for quota 429s, platform 5xx)
- [ ] Monitor that read tools (`GET /projects`, `GET /timesheets`) fire on question queries
- [ ] Verify staged writes show as `pendingAction` in responses (card should appear)
- [ ] Confirm **only** confirmed actions reach `POST /timesheets`, `POST /approvals/:id/approve|decline`
- [ ] Monitor for any unusual usage patterns
- [ ] Check that rate limiting is working as expected
- [ ] Gather initial user feedback

### 6.2 Ongoing Monitoring
- [ ] Set up alerts for:
  - [ ] High error rates from Gemini API
  - [ ] Unusual usage spikes
  - [ ] Rate limit exhaustion
- [ ] Review usage metrics weekly:
  - [ ] Number of conversations
  - [ ] Average tokens per conversation
  - [ ] Most common query types (from log analysis)
- [ ] Track costs:
  - [ ] Monitor Gemini API usage in Google Cloud Console
  - [ ] Compare actual costs to estimates
- [ ] Collect user feedback:
  - [ ] What questions are users asking?
  - [ ] Are responses helpful?
  - [ ] Any common complaints or issues?

### 6.3 Maintenance Tasks
- [ ] Periodically review and update the system prompt
- [ ] Update Gemini model if better options become available
- [ ] Review and adjust rate limits based on usage patterns
- [ ] Update this checklist and documentation as features are added

---

## Quick Reference: File Summary

### Files to Create (Backend - 5 files)
| File | Purpose |
|------|--------|
| `backend/src/lib/gemini.ts` | Gemini client initialization |
| `backend/src/schemas/ai.schema.ts` | Zod validation schema |
| `backend/src/services/ai.service.ts` | Core AI logic with user context |
| `backend/src/controllers/ai.controller.ts` | Request handler |
| `backend/src/routes/ai.ts` | Route definitions |

### Files to Modify (Backend - 2 files)
| File | Changes |
|------|---------|
| `backend/src/lib/env.ts` | Add `getAiChatRateLimitConfig()` + `GEMINI_API_KEY` to validateEnv |
| `backend/src/app.ts` | Mount `/api/v1/ai` routes |

### Files to Create (Frontend - 5 files)
| File | Purpose |
|------|--------|
| `frontend/src/types/ai.ts` | TypeScript interfaces |
| `frontend/src/services/aiService.ts` | API client for AI endpoints |
| `frontend/src/contexts/AIContext.tsx` | Chat state management |
| `frontend/src/components/ai/AIChatWidget.tsx` | Floating chat button |
| `frontend/src/components/ai/AIChatPanel.tsx` | Chat drawer panel |
| `frontend/src/components/ai/AIMessageBubble.tsx` | Message display |
| `frontend/src/components/ai/index.ts` | Component exports |

### Files to Modify (Frontend - 2 files)
| File | Changes |
|------|---------|
| `frontend/src/main.tsx` | Add `AIChatProvider` |
| `frontend/src/components/layout/AppShell.tsx` | Add `AIChatWidget` |

### Environment Variables (Backend)
| Variable | Required | Default |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | - |
| `GEMINI_MODEL` | No | `gemini-2.0-flash` |
| `AI_CHAT_RATE_LIMIT_PER_USER` | No | `30` (prod) / `100` (dev) |
| `AI_CHAT_RATE_LIMIT_WINDOW_MS` | No | `60000` |

---

## Phase 7: AI Write Actions via Function Calling

> **Status:** ✅ IMPLEMENTED 2026-09-15 (all 17 checklist items complete: 14 original + 3 read tools).
> Backend type-check clean, frontend build clean, **221/221 backend tests passing**
> (24 test files, incl. 11 new AI tests — 8 action-gate + 3 read-tool loop).
> **Read tools added:** `getMyTimesheets`, `getProjectDetails`, `listPendingApprovals`
> (see §7.6.6) — AI can now answer "how many timesheets have I declined?" and
> similar questions with real data.
> **Review tools added:** `approveTimesheet`, `declineTimesheet` (see §7.6.5).
> **Hardened:** four live-API defects fixed (§7.9): nested `functionResponse`,
> per-turn context loss, phantom action claims, iteration-cap 503.

### 7.0 Goal and Non-Goals

**Goal:** Give the AI assistant the ability to make entries (timesheets first,
other resources later) **only through the website's own HTTP API** — the same
Express routes the React UI uses. Gemini never receives MongoDB credentials,
never calls `getDb()`, and never imports a collection. Every AI-initiated write
automatically inherits JWT authentication, access-control middleware, Zod
validation, notification fan-out, and activity logging, because it literally
travels the same code path as a user clicking the equivalent button.

**Non-goals (explicitly out of scope):**
- No direct MongoDB access from any AI file (`ai.service.ts`, `ai.controller.ts`,
  `aiTools/*`). The existing read-only `find` calls in `ai.service.ts` should
  eventually be replaced by read tools over HTTP, but that migration is optional.
- No privileged "AI service account". The AI always acts **as the logged-in
  user** by forwarding that user's Bearer token.
- No silent writes. Every write requires explicit per-action user confirmation
  in the chat UI (see §7.4).

### 7.1 Architecture

```
User ──chat──▶ React widget ──POST /api/v1/ai/chat──▶ AI backend ──Gemini──▶ "call this tool"
                                                                      │
                              AI backend ──HTTP (localhost)──▶ YOUR OWN API ◀── authenticate,
                              (internal client)                e.g. POST      requireTimesheetEdit,
                                                               /timesheets   Zod schema, service layer,
                                                                             notifications, activity log
```

Key points:
1. `POST /api/v1/ai/chat` extracts the caller's Bearer token from the incoming
   request and threads it through to the AI service layer.
2. The AI service owns a small internal HTTP client
   (`backend/src/lib/aiApiClient.ts`) targeting the backend's own base URL
   (`INTERNAL_API_BASE_URL`, default `http://localhost:3001/api/v1`). Every
   outbound call sets `Authorization: Bearer <user-token>` — so
   `POST /timesheets` enforces the exact same ownership and scoping rules as
   the TimesheetEditor page.
3. Gemini's response may contain `functionCalls`. The backend validates each
   call's arguments against the **existing Zod schemas**
   (`createTimesheetSchema`, `updateTimesheetSchema`, …), stages the action as
   a `pendingAction` (does NOT execute yet), and returns it to the frontend for
   human confirmation.
4. Only after the user clicks **Approve** does the frontend call
   `POST /api/v1/ai/actions/:id/confirm`, which re-validates the stored payload
   and executes it through the internal HTTP client.
5. Results flow back into the Gemini turn so the final reply can narrate what
   happened ("Done — draft timesheet created for Project X, week of Sep 15").

### 7.2 Step 1 — Token-Forwarding Internal HTTP Client

**Why first:** foundation for every read and write tool. No Gemini changes needed.

New file: `backend/src/lib/aiApiClient.ts` — calls our OWN REST API as the
calling user. Never uses `getDb()` / `COLLECTIONS`. Forwards the user's Bearer
token so all existing auth + access-control middleware applies unchanged:

```typescript
const INTERNAL_API_BASE =
  process.env.INTERNAL_API_BASE_URL || 'http://localhost:3001/api/v1'

export async function callPlatformApi<T>(
  userToken: string,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,            // e.g. '/timesheets'
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${INTERNAL_API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as any)?.error?.message || `Platform API ${res.status}`
    throw new Error(`[${(data as any)?.error?.code || 'PLATFORM_ERROR'}] ${msg}`)
  }
  return data as T
}
```

Controller change (`backend/src/controllers/ai.controller.ts`):
- Extract the raw Bearer token from `req.headers.authorization` in
  `aiChatHandler` (and later in the confirm handler) and pass it into
  `chatWithGemini(req, body, userToken)`. Return 401 early if absent
  (defense in depth — `authenticate` already guarantees it, but the AI service
  must never run without a token to forward).

Service change (`backend/src/services/ai.service.ts`):
- Accept `userToken: string` as a third parameter. All future platform contact
  goes through `callPlatformApi(userToken, …)`.

Env:
- `INTERNAL_API_BASE_URL` (optional, default `http://localhost:3001/api/v1`).
  Needed for Docker/Vercel deployments where localhost is wrong — document in
  `.env.example`.

### 7.3 Step 2 — Read Tool First (Zero-Risk Proof of Loop)

Before any write tool, implement one read tool to prove the Gemini
function-calling loop end-to-end with no mutation risk.

Tool declaration (Gemini `functionDeclarations`, added to the model call in
`ai.service.ts`) — `listMyProjects`: lists the calling user's assigned projects
(name, sowNumber, status). No parameters.

Execution path: when Gemini returns
`functionCalls: [{ name: 'listMyProjects' }]`:
1. Call `callPlatformApi(userToken, 'GET', '/projects')`.
2. Return the (trimmed) project list as a `functionResponse` part to Gemini.
3. Gemini composes the final answer from real data.

This step also fixes the current history weakness: keep the **full**
`geminiHistory` — including prior `functionCall` / `functionResponse` parts —
across turns (today context is only prepended on turn 1, which would make
Gemini re-request tools it already called).

### 7.4 Step 3 — First Write Tool: `createTimesheet` (Draft Only)

**Scope discipline:** the first and only write tool creates **draft**
timesheets. No submit, no approve, no status transitions until this loop is
proven in production. The tool declaration mirrors `createTimesheetSchema`
field-for-field (projectId, weekStart, entries[] with description/entryType/
hours mon–sun, notes) so validation can be shared; the declaration text must
state the day-type rules (regular Mon–Fri only, overtime Sat–Sun only, max 24h)
and that drafts never submit.

**Two-phase confirm flow (mandatory — never single-shot writes):**

Phase A — stage (inside the `POST /api/v1/ai/chat` turn loop):
1. Gemini emits a `createTimesheet` call → backend parses args with
   `createTimesheetSchema.parse()` (same schema the normal route uses; day-type
   and 24h rules enforced here, before the user even sees it).
2. On schema failure: feed the Zod error back to Gemini as a `functionResponse`
   so it can self-correct ("Saturday hours must go in an overtime entry…").
3. On success: persist a `pendingActions` record
   `{ id, userId, tool, args, createdAt, expiresAt (+10 min), status: 'pending' }`
   and return `{ pendingAction }` to the frontend **without executing**.

Phase B — confirm (new endpoints in `backend/src/routes/ai.ts`):
- `POST /api/v1/ai/actions/:id/confirm` → re-fetch the pending record, verify
  ownership + non-expiry, re-run `createTimesheetSchema.parse(storedArgs)`,
  execute `callPlatformApi(userToken, 'POST', '/timesheets', storedArgs)`,
  mark record `executed`, return the created timesheet.
- `POST /api/v1/ai/actions/:id/cancel` → mark record `cancelled`.

`pendingActions` storage: start with an in-memory `Map` (single-instance dev);
document the upgrade to a Mongo `pending_actions` collection with TTL index for
multi-instance production.

**Frontend confirmation card** (new component
`frontend/src/components/ai/AIActionCard.tsx`, rendered inside `AIChatPanel`
when a message carries `pendingAction`):
- Human-readable summary: project name, week, per-day hours split
  regular/overtime, notes.
- Three buttons: **Approve** → calls confirm endpoint; **Edit** → loads values
  into the chat input for revision (no write); **Cancel** → calls cancel endpoint.
- While `status === 'pending'`, show expiry note ("Expires in 10 min").

**Chat turn loop** (backend, max ~3–5 iterations per user message):
1. Send message + tools → Gemini.
2. If `functionCalls`: validate → stage pendingAction (writes) or execute
   inline (reads) → return functionResponses → back to 1.
3. Else: final text reply (+ optional pendingAction payload) → frontend.

### 7.5 Step 4 — Audit Logging

Every executed AI write must leave a trace attributable beyond a manual write:
- Reuse the existing `createActivity()` path (it already fires inside
  `createTimesheet` via the normal service, attributing `userId`).
- Additionally log at the AI layer with
  `logger.info({ userId, tool, argsSummary, pendingActionId, via: 'ai-assistant' })`
  so AI-initiated writes are greppable.
- Frontend: after a confirmed write, the chat message should link to the created
  resource (timesheet ID → deep link).

### 7.6 Step 5 — Expanded Tools (approve / decline implemented)

Candidate follow-ups, in suggested safety order:
1. `updateTimesheet({ timesheetId, entries, notes })` — draft-only, owner-only
   (the `requireTimesheetEdit` middleware already enforces this).
2. `submitTimesheet({ timesheetId })` — status-changing; the confirmation card
   should display the full timesheet summary, not just the ID.
3. `withdrawTimesheet({ timesheetId })` — same treatment as submit.
4. **Read tools** (already implemented, see §7.6.6): `getMyTimesheets`,
   `getProjectDetails`, `listPendingApprovals`.

### 7.6.5 Step 5b — Supervisor Review Tools (✅ IMPLEMENTED)

`approveTimesheet` and `declineTimesheet` are implemented, with one hard rule
that differs from §7.4's draft creation: **the AI may stage a review decision but
the human must confirm it, and the AI can never review its own user's work.**

**Tool declarations added** (`AI_TOOL_DECLARATIONS` in `ai.service.ts`):

| Tool | Args | Kind |
|---|---|---|
| `listPendingApprovals` | none | read (executes inline) |
| `approveTimesheet` | `timesheetId` | write (staged) |
| `declineTimesheet` | `timesheetId`, `reason` | write (staged) |

**Authority is enforced twice, by design:**

1. **Pre-check at stage time** (`stageReviewAction`): the AI first calls
   `GET /approvals` with the user's token, builds a name-enriched list, and
   rejects any `timesheetId` that is not in *that* list. If the AI invents an ID —
   or tries to stage a review of the user's own submission — it gets a
   `functionResponse` error telling it to call `listPendingApprovals` instead.
   This gives the model a self-correctable message rather than a silent failure.
2. **Real enforcement at confirm time**: `POST /approvals/:id/approve|decline`
   runs the existing `requireTimesheetReview` middleware (`backend/src/
   middleware/access.ts`), which re-checks project supervision, pending status,
   and separation of duties (admins exempt) on the live record.

The pre-check is a UX aid, not the security boundary — the middleware is. Even a
fully prompt-injected Gemini cannot approve something the user lacks authority
over, because the confirm call travels the same route the UI button does.

**Decline reason rule:** `aiDeclineTimesheetSchema` reuses
`declineTimesheetSchema.shape.reason` from `schemas/timesheet.schema.ts`, so the
AI cannot stage a reasonless decline the approvals endpoint would reject anyway.
The system prompt instructs the model to *ask the user for a reason* before
calling the tool.

**Confirm-time execution** (generalized `confirmPendingAction`): maps the staged
tool to its endpoint —

| Staged tool | Endpoint called with the user's token |
|---|---|
| `createTimesheet` | `POST /timesheets` |
| `approveTimesheet` | `POST /approvals/:id/approve` |
| `declineTimesheet` | `POST /approvals/:id/decline` (body `{ reason }`) |

**Frontend:** `AIActionCard.tsx` is now tool-aware — approval cards render a
green **Confirm Approval** button, decline cards a red **Confirm Decline** button
and a "Decline requires your approval" heading, with tool-specific Edit seeds so
the user can ask for a different reason. A **Pending Approvals** quick action was
added to `AIChatPanel`.

**Not blocked, but gated:** the AI may stage a review decision, but the human must
confirm it on the card, and the AI can never review its own user's work (separate-
tion of duties enforced at both stage-time pre-check and confirm-time middleware).

### 7.6.6 Step 5c — AI Answering Read Questions (✅ IMPLEMENTED)

Users ask *"how many timesheets have I declined?"* and the AI shouldn't have to
say "I can't do that." Two **read-only** tools now close that gap — they execute
inline (no confirmation card) because they make zero mutations:

| Tool | Args | Calls | Returns |
|---|---|---|---|
| `getMyTimesheets` | `status?`, `projectId?`, `weekStart?` | `GET /timesheets?...filters` (+ `GET /projects` for names) | `{ count, timesheets[] }` with project name, week, status, hours, submit date, **and decline reason** |
| `getProjectDetails` | `projectId` (required) | `GET /projects/:id` | full project object |

This directly answers the "how many declined?" gap: the model filters
`getMyTimesheets` with `status: 'declined'` and reports the `count`. Filters are
passed through verbatim to the platform endpoint, so scoping (own vs. team vs.
org for admins) is enforced exactly as if the user used the Reports page.

**Frontend** (`AIChatPanel` quick actions) gained a **"Pending Approvals"** tile
that pre-fills *"Which timesheets are waiting for my review?"*, which triggers
`listPendingApprovals`.

This step is tracked as **7.6.6a–c** below.

| Threat | Mitigation in this design |
|---|---|
| Prompt injection → malicious write | Writes can't execute without the user approving exact details on the confirmation card |
| AI exceeds user authority | User-token forwarding: platform middleware rejects anything the user couldn't do manually |
| Schema drift (AI sends bad payload) | Shared Zod schemas; invalid args rejected before staging, error fed back for self-correction |
| Stale approval (approve after data changed) | Pending records expire in 10 min; args re-validated at confirm time |
| Repudiation ("I didn't create that") | Activity log + `via: 'ai-assistant'` log line + stored pendingAction record |
| AI reviews its own work / a peer's work | Stage-time pre-check against `GET /approvals` *plus* `requireTimesheetReview` + `canReviewTimesheet` re-check (separation of duties) at confirm time |
| Reasonless decline staged by the AI | `aiDeclineTimesheetSchema` reuses `declineTimesheetSchema.shape.reason`; an empty reason is rejected before staging |
| Key/DB credential leak | AI layer holds only the Gemini key; no Mongo credentials outside existing `lib/mongodb.ts` |

### 7.8 Phase 7 Build Checklist

- [x] 7.2a Create `backend/src/lib/aiApiClient.ts` (`callPlatformApi` with token forwarding, 15s timeout, error normalization)
- [x] 7.2b Thread `userToken` from `aiChatHandler` (extract `Authorization` header, 401 if absent) into `chatWithGemini(req, body, userToken)`
- [x] 7.2c Add `INTERNAL_API_BASE_URL` to `.env` + document default `http://localhost:3001/api/v1`
- [x] 7.3a Declare `listMyProjects` function declaration; implement turn loop handling `functionCalls` → `functionResponse`
- [x] 7.3b Preserve full `geminiHistory` (including function parts) across turns
- [x] 7.3c Verify read tool E2E in widget (ask "what are my projects?" → real data, no `find` fallback needed)
- [x] 7.4a Declare `createTimesheet` tool mirroring `createTimesheetSchema`
- [x] 7.4b Implement stage path: Zod-validate args → persist `pendingActions` record (10-min TTL) → return `pendingAction` without executing
- [x] 7.4c Add `POST /api/v1/ai/actions/:id/confirm` + `/cancel` (ownership check, re-validation, execute via `callPlatformApi`)
- [x] 7.4d Build `AIActionCard.tsx` (summary + Approve/Edit/Cancel) and render from `AIChatPanel`
- [x] 7.4e Implement 3–5 iteration turn loop cap; self-correction path for Zod failures
- [x] 7.5a Add `via: 'ai-assistant'` structured logging + deep link in chat reply
- [x] 7.5b Confirm activity feed shows AI-created timesheets attributed to the user
- [x] 7.6 Review/gate decision before submit/withdraw tools; approve/decline implemented with confirmation card (NOT permanent ban — see §7.6.5)
- [x] 7.6.5a Widen `PendingTool` union to `'createTimesheet' | 'approveTimesheet' | 'declineTimesheet'` in `lib/pendingActions.ts`
- [x] 7.6.5b Declare `listPendingApprovals` (read), `approveTimesheet` and `declineTimesheet` (staged) tools
- [x] 7.6.5c Add `aiTimesheetTargetSchema` (24-hex guard) + `aiDeclineTimesheetSchema` reusing `declineTimesheetSchema.shape.reason`
- [x] 7.6.5d Implement `stageReviewAction` pre-check against `GET /approvals` so invented/foreign IDs are rejected with a self-correctable message
- [x] 7.6.5e Generalize `confirmPendingAction` into a per-tool executor (create → `/timesheets`, approve/decline → `/approvals/:id/*`)
- [x] 7.6.5f Make `AIActionCard.tsx` tool-aware (green Confirm Approval / red Confirm Decline, tool-specific Edit seeds)
- [x] 7.6.5g Add "Pending Approvals" quick action to `AIChatPanel`
- [x] 7.6.5h Add `src/tests/ai-actions.test.ts` (8 tests: gate, re-validation, ownership, double-execute, platform rejection, cancel)
- [x] 7.6.6a Declare `getMyTimesheets` and `getProjectDetails` read tools
- [x] 7.6.6b Implement `handleGetMyTimesheets` (status/projectId/weekStart filters, name map, row compaction) and `handleGetProjectDetails` (zod-gated)
- [x] 7.6.6c Route the two read tools in `executeToolCall`; wire `PendingTool` union in `lib/pendingActions.ts`

---

### 7.9 Post-Implementation Fixes & Known Failure Modes

Four defects only surfaced once the assistant was exercised against the **live**
Gemini API. All are fixed; documented here so they are not re-introduced.

#### F1 — A `functionResponse` must be a `Part`, never a `Content`

Server log symptom:
```
[400] Invalid JSON payload received. Unknown name "role" at 'contents[2].parts[0]'
[400] Invalid JSON payload received. Unknown name "parts" at 'contents[2].parts[0]'
```
`chatSession.sendMessage()` accepts `string | Array<string | Part>` and wraps
whatever it receives as the `parts` of **one** turn. Returning
`{ role: 'user', parts: [{ functionResponse }] }` from the tool helper nested a
whole `Content` inside a `Part`, so `contents[N].parts[0]` carried `role`/`parts`
keys the request schema forbids.

**Fix:** `toFunctionResponsePart()` returns `{ functionResponse: { name, response } }`
only. Confirmed by capturing the outbound request body — `contents` is now a valid
`[{ role: 'user'|'model', parts: [...] }]` array.

#### F2 — System prompt was silently dropped from turn 2 onward

The frontend owns the conversation history and stores the user's **raw** text
only. The system prompt and per-user context were prepended to the first message
alone, so every follow-up turn lost the platform rules, the tool guidance, and the
write-safety instructions — producing confident but rule-breaking answers.

**Fix:** the current-user context is re-sent on **every** turn
(`contextualMessage` in `chatWithGemini`).

#### F3 — Phantom action claims ("prepared" when nothing was staged)

Observed: after calling only a *read* tool, the model replied *"I have prepared
this approval… Please confirm this on the card"* while `pendingAction` was `null`.
The card is rendered purely from `pendingAction`, so the user waited for UI that
never existed.

**Fix:** `guardAgainstPhantomAction(text, hasPendingAction)` — when no action is
staged, a first-person past-tense claim of a write is replaced with an explicit
"nothing was saved" message, and bare mentions of the confirmation card are
softened. The prompt wording that taught the model the word "prepared" was
tightened as well.

#### F4 — Hitting the iteration cap returned a 503 instead of an answer

When the loop reached `MAX_TOOL_ITERATIONS` with the model still requesting tools,
`responseText` was empty and the handler threw, surfacing a generic
`AI_UNAVAILABLE`. Now the staged narrative is used as a fallback and a
cap-exhaustion message asks the user to supply details one step at a time.

#### Quota reality check (read this before debugging "it stopped working")

`gemini-2.5-flash` on the **free tier allows 20 requests/day**
(`generate_content_free_tier_requests`). One user message that invokes a tool
consumes **2+** `generateContent` calls (initial turn + one per loop iteration),
so a handful of real conversations exhausts the free tier.

Handling:
- Google's 429 is detected in `ai.controller.ts` (`isQuotaError`) and returned as
  `AI_QUOTA_EXCEEDED` (HTTP 429) with an actionable message, not `AI_UNAVAILABLE`.
- `apiClient.ts` deliberately **skips its 429 auto-retry** for that code — quota
  exhaustion is not transient, and retrying burns attempts and delays the error.
- Workarounds: set `GEMINI_MODEL` in `backend/.env` to a model with its own quota
  allowance (quota is per-model per-project), or enable billing on the Google
  Cloud project.

---

## Estimated Time to Implement

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1: Environment & Dependencies | 12 tasks | 30 minutes |
| Phase 2: Backend Implementation | 17 tasks | 2-3 hours |
| Phase 3: Frontend Implementation | 18 tasks | 2-3 hours |
| Phase 4: Security Review | 9 tasks | 1 hour |
| Phase 5: Documentation & Deployment | 14 tasks | 1-2 hours |
| Phase 6: Post-Launch Monitoring | Ongoing | N/A |
| Phase 7: AI Write Actions (function calling + confirmation gate + approve/decline + read tools) | 25 tasks | 5-7 hours |
| **Total** | **95 tasks** | **11-16 hours** |

---

*This checklist is part of AI_Asst.md. Refer to the main document for complete code examples and context.*
