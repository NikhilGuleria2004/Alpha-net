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
  input: { message: string; history?: Array<{ role: 'user' | 'model'; content: string }> },
): Promise<{ response: string }> {
  const parsed = aiChatRequestSchema.parse({
    message: input.message,
    history: Array.isArray(input.history) ? input.history : [],
  })
  
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
  const geminiHistory = (parsed.history ?? [])
    .filter((h) => typeof h.content === 'string' && h.content.trim().length > 0)
    .map((h) => ({
      role: h.role,
      parts: [{ text: h.content }],
    }))

  const chatSession = model.startChat({
    history: geminiHistory,
  })
  
  const contextualMessage = geminiHistory.length === 0
    ? `${SYSTEM_PROMPT}\n\nCURRENT USER CONTEXT:\n${context}\n\nUSER MESSAGE:\n${parsed.message}`
    : parsed.message

  const result = await chatSession.sendMessage(contextualMessage)
  
  const responseText = result.response?.text?.()

  if (!responseText) {
    throw new Error('Empty response from Gemini')
  }
  
  logger.info({
    userId: req.user!.userId,
    role: req.user!.role,
    messageLength: parsed.message.length,
  }, 'AI chat completed')
  
  return { response: responseText }
}
