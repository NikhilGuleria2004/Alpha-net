import { logger } from '../lib/logger.js'
import { COLLECTIONS } from '../lib/collections.js'
import { getDb } from '../lib/mongodb.js'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { aiChatRequestSchema } from '../schemas/ai.schema.js'
import { createTimesheetSchema, declineTimesheetSchema } from '../schemas/timesheet.schema.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'
import { callPlatformApi, PlatformApiError } from '../lib/aiApiClient.js'
import { getAiProvider, type AiMessage, type AiToolCall, type AiToolSpec } from '../lib/aiProvider.js'
import {
  stagePendingAction,
  getPendingAction,
  settlePendingAction,
  type PendingAction,
  type PendingTool,
} from '../lib/pendingActions.js'

const SYSTEM_PROMPT = `You are Eniac Assistant, an AI helper for the Eniac employee time-tracking and project management platform.

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
For timesheet questions, remind users of the Regular (Mon-Fri) vs Overtime (Sat-Sun) rule.

TOOLS — you have function tools. Use them instead of guessing:
- listMyProjects: call when the user asks about their projects. Takes no arguments.
- listPendingApprovals: call when the user asks what needs review, or before approving/declining,
  so you have the real timesheetId. Takes no arguments. Only returns timesheets the user may review.
- createTimesheet: call when the user asks you to log/create hours. Creates a DRAFT ONLY (never submits).
  You MUST know the projectId — call listMyProjects first if the user only gave a project name.
  weekStart must be the Monday of the target week (YYYY-MM-DD). Ask the user if the week is ambiguous.
- approveTimesheet: call when the user asks you to approve a submitted timesheet. Requires the
  timesheetId from listPendingApprovals — never invent an ID.
- declineTimesheet: call when the user asks you to decline/reject a submitted timesheet. Requires the
  timesheetId from listPendingApprovals AND a short, concrete reason for the employee.

REVIEW RULES:
- Only supervisors of the project and admins can approve or decline. If listPendingApprovals returns
  nothing for the user, tell them they have no timesheets awaiting their review.
- Separation of duties: nobody may review their own submission (admins exempt). If the user asks you to
  approve their own timesheet, refuse and explain why.
- Declining always requires a reason. If the user does not give one, ask for it before calling the tool.

WRITE SAFETY:
- You never save anything yourself. Approve/decline/create calls only PREPARE the action; the user must
  confirm it on the card that appears in the chat. Say so clearly ("prepared", not "done").`

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

function coerceHours(value: unknown): Record<string, number> {
  const hours: Record<string, number> = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }
  if (value && typeof value === 'object') {
    for (const day of DAY_KEYS) {
      const raw = (value as Record<string, unknown>)[day]
      const num = typeof raw === 'string' ? Number(raw) : raw
      if (typeof num === 'number' && Number.isFinite(num) && num >= 0) {
        hours[day] = num
      }
    }
  }
  return hours
}

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/

// Stored-args schemas for the review tools. `timesheetId` arrives from the tool
// call (not a URL param), so it needs its own guard — validating the shape here
// keeps `ObjectId()` construction inside the platform API from throwing a 500.
const aiTimesheetTargetSchema = z.object({
  timesheetId: z.string().regex(OBJECT_ID_RE, 'Timesheet ID must be a 24-character hex id'),
})

// Reuses the platform's own decline rule (non-empty reason) so the AI cannot
// stage a reasonless decline that the approvals endpoint would reject anyway.
const aiDeclineTimesheetSchema = z.object({
  timesheetId: z.string().regex(OBJECT_ID_RE, 'Timesheet ID must be a 24-character hex id'),
  reason: declineTimesheetSchema.shape.reason,
})

// Provider-neutral tool specs (plain JSON Schema): the Groq adapter consumes
// these verbatim, lib/gemini.ts converts them to Gemini's Schema dialect.
// Declaring them once means a tool can never be described differently to two
// providers.
const AI_TOOL_SPECS: AiToolSpec[] = [
  {
    name: 'listMyProjects',
    description: "List the calling user's assigned projects. Takes no arguments.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'listPendingApprovals',
    description:
      'List timesheets awaiting review by the calling user (supervisor/admin only). Takes no arguments. ' +
      'Call this before approving or declining so you have the real timesheetId.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'createTimesheet',
    description:
      'Create a DRAFT timesheet for the calling user. Drafts only, never submits. ' +
      'Requires a valid projectId. weekStart must be the Monday of the target week (YYYY-MM-DD).',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        weekStart: { type: 'string' },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              entryType: { type: 'string', enum: ['regular', 'overtime'] },
              hours: {
                type: 'object',
                properties: {
                  mon: { type: 'number' },
                  tue: { type: 'number' },
                  wed: { type: 'number' },
                  thu: { type: 'number' },
                  fri: { type: 'number' },
                  sat: { type: 'number' },
                  sun: { type: 'number' },
                },
              },
            },
            required: ['description', 'entryType', 'hours'],
          },
        },
        notes: { type: 'string' },
      },
      required: ['projectId', 'weekStart', 'entries'],
    },
  },
  {
    name: 'approveTimesheet',
    description:
      'PREPARE an approval for a submitted (pending) timesheet. Does not save anything by itself — ' +
      'the user must confirm it on the card in the chat. Requires the timesheetId from listPendingApprovals.',
    parameters: {
      type: 'object',
      properties: {
        timesheetId: { type: 'string' },
      },
      required: ['timesheetId'],
    },
  },
  {
    name: 'declineTimesheet',
    description:
      'PREPARE a decline for a submitted (pending) timesheet. Does not save anything by itself — ' +
      'the user must confirm it on the card in the chat. Requires the timesheetId from ' +
      'listPendingApprovals and a short reason that will be sent to the employee.',
    parameters: {
      type: 'object',
      properties: {
        timesheetId: { type: 'string' },
        reason: { type: 'string' },
      },
                  required: ['timesheetId', 'reason'],
    },
  },
  {
    name: 'getMyTimesheets',
    description:
      'List the calling user\'s OWN timesheets (the platform scopes this to you/your team automatically). ' +
      'Use to answer "how many timesheets have I declined/approved/submitted" and similar. ' +
      'status is optional: one of "draft", "pending", "approved", "declined", "withdrawn". ' +
      ' projectId and weekStart (YYYY-MM-DD Monday) further narrow the list. ' +
      'Returns a count plus compact rows (project name, week, status, hours, submit date, decline reason).',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'pending', 'approved', 'declined', 'withdrawn'] },
        projectId: { type: 'string' },
        weekStart: { type: 'string' },
      },
    },
  },
  {
    name: 'getProjectDetails',
    description:
      'Look up a single project by id (must be a project the caller can see). ' +
      'Returns name, SOW number, status, dates, manager/supervisor and team size. ' +
      'projectId is required and must come from listMyProjects or an approval row.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
]

const MAX_TOOL_ITERATIONS = 5

/**
 * Tool results are shipped back to the model as a JSON *string*, which is the one
 * shape every provider accepts. Serializing here also strips undefined,
 * ObjectIds and Dates that no provider will accept on the wire.
 */
function toToolResultContent(payload: unknown): string {
  try {
    return JSON.stringify(JSON.parse(JSON.stringify(payload ?? null)))
  } catch {
    return JSON.stringify({ error: 'Tool result could not be serialized' })
  }
}

// Observed failure: when the tool loop ended without a staged action, the model
// still claimed success ("I've prepared this approval… tap Confirm on the card").
// The user then waits for a card that will never appear. These patterns catch a
// first-person past-tense claim of having performed a mutation.
const PHANTOM_ACTION_RE =
  /\b(i'?ve|i have|i just|i already|i went ahead and)\s+(prepared|created|saved|submitted|approved|declined|logged|added|updated|staged|recorded)\b/i

// Mentions of the confirmation card are only valid alongside a real pendingAction.
const CONFIRM_CARD_RE = /(tap|click|hit|press)\s+confirm|confirm (it|this|the action) (below|on)|on the card/i

/**
 * Never let the assistant imply a write happened when nothing was staged. The
 * frontend renders the card purely from `pendingAction`, so a phantom claim is a
 * dead end for the user.
 */
export function guardAgainstPhantomAction(text: string, hasPendingAction: boolean): string {
  if (hasPendingAction) return text
  if (PHANTOM_ACTION_RE.test(text)) {
    return (
      "I wasn't able to prepare that change, so nothing was saved and no confirmation card was " +
      'created. Tell me the exact details (which timesheet or project, the week, and the hours) ' +
      "and I'll prepare it again."
    )
  }
  if (CONFIRM_CARD_RE.test(text)) {
    return text.replace(
      CONFIRM_CARD_RE,
      'review the details before anything is saved',
    )
  }
  return text
}

function buildActionSummary(args: Record<string, unknown>, projectName?: string): string {
  const entries = Array.isArray(args.entries) ? (args.entries as Array<Record<string, unknown>>) : []
  const lines = entries.map((e) => {
    const hours = coerceHours(e.hours)
    const days = DAY_KEYS.filter((d) => hours[d] > 0).map((d) => `${d} ${hours[d]}h`).join(', ') || 'no hours'
    return `Entry ${String(e.description || '')} (${String(e.entryType || 'regular')}): ${days}`
  })
  return [
    `Create DRAFT timesheet${projectName ? ` for ${projectName}` : ''}`,
    `Week of ${String(args.weekStart || 'unknown')}`,
    ...lines,
  ].filter(Boolean).join('\n')
}

export interface AiPendingAction {
  id: string
  tool: PendingTool
  summary: string
  expiresInSeconds: number
}

export interface AiChatResult {
  response: string
  pendingAction?: AiPendingAction
}

interface ToolOutcome {
  payload: unknown
  pendingAction?: AiPendingAction
  narrative?: string
}

interface ReviewableApproval {
  timesheetId: string
  projectName: string
  weekStart: string
  regularHours: number
  overtimeHours: number
  totalHours: number
  status: string
  submittedAt: string | null
}

function readProjectNameMap(data: unknown): Map<string, string> {
  const map = new Map<string, string>()
  const projects = (data as { projects?: Array<Record<string, unknown>> })?.projects
  if (!Array.isArray(projects)) return map
  for (const p of projects) {
    const id = typeof p.id === 'string' ? p.id : typeof p._id === 'string' ? p._id : ''
    if (id) map.set(id, typeof p.name === 'string' ? p.name : 'Unnamed project')
  }
  return map
}

async function handleListPendingApprovals(userToken: string): Promise<ReviewableApproval[]> {
  const approvalsData = await callPlatformApi<{ approvals?: Array<Record<string, unknown>> }>(
    userToken,
    'GET',
    '/approvals',
  )
  const approvals = Array.isArray(approvalsData?.approvals) ? approvalsData.approvals : []

  // Project names make the confirmation card readable. A failure here must not
  // break listing, so it degrades to an unnamed project.
  let nameMap = new Map<string, string>()
  try {
    nameMap = readProjectNameMap(await callPlatformApi(userToken, 'GET', '/projects'))
  } catch {
    nameMap = new Map<string, string>()
  }

  return approvals.map((a) => {
    const projectId = String(a.projectId ?? '')
    return {
      timesheetId: String(a.id ?? ''),
      projectName: nameMap.get(projectId) || 'a project',
      weekStart: String(a.weekStart ?? ''),
      regularHours: Number(a.regularHours ?? 0),
      overtimeHours: Number(a.overtimeHours ?? 0),
      totalHours: Number(a.totalHours ?? 0),
      status: String(a.status ?? ''),
      submittedAt: typeof a.submittedAt === 'string' ? a.submittedAt : null,
    }
  })
}

function buildReviewSummary(verb: 'APPROVE' | 'DECLINE', approval: ReviewableApproval, reason?: string): string {
  const lines = [
    `${verb} timesheet — ${approval.projectName}`,
    `Week of ${approval.weekStart || 'unknown'}`,
    `${approval.regularHours}h regular + ${approval.overtimeHours}h overtime = ${approval.totalHours}h total`,
  ]
  if (reason) lines.push(`Reason sent to the employee: ${reason}`)
  lines.push(`Timesheet ID: ${approval.timesheetId}`)
  return lines.join('\n')
}

function buildStagedPayload(staged: PendingAction, summary: string, verb: string): ToolOutcome {
  const expiresInSeconds = Math.max(1, Math.round((staged.expiresAt - Date.now()) / 1000))
  const pendingAction: AiPendingAction = {
    id: staged.id,
    tool: staged.tool,
    summary,
    expiresInSeconds,
  }
  const narrative =
    `${verb} (NOT saved yet):\n${summary}\n\n` +
    `Review it below and tap Confirm to save it, or Cancel to discard it.`
  return {
    payload: { staged: true, pendingAction, message: 'Action staged — waiting for user approval in chat.' },
    pendingAction,
    narrative,
  }
}

async function stageReviewAction(
  callName: 'approveTimesheet' | 'declineTimesheet',
  rawArgs: Record<string, unknown>,
  ctx: { userId: string; userToken: string },
): Promise<ToolOutcome> {
  const schema = callName === 'declineTimesheet' ? aiDeclineTimesheetSchema : aiTimesheetTargetSchema
  const parsed = schema.safeParse({
    timesheetId: typeof rawArgs.timesheetId === 'string' ? rawArgs.timesheetId.trim() : rawArgs.timesheetId,
    ...(callName === 'declineTimesheet' ? { reason: rawArgs.reason } : {}),
  })
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
    return { payload: { error: `Invalid ${callName} details: ${detail}. Ask the user to clarify.` } }
  }
  const args = parsed.data as Record<string, unknown>

  // Authority pre-check: only offer actions that will pass requireTimesheetReview
  // at confirm time, and give the model a clear reason when they won't.
  let reviewable: ReviewableApproval[]
  try {
    reviewable = await handleListPendingApprovals(ctx.userToken)
  } catch (err) {
    const message = err instanceof PlatformApiError ? err.message : 'Failed to load pending approvals'
    return { payload: { error: message } }
  }
  const approval = reviewable.find((a) => a.timesheetId === String(args.timesheetId))
  if (!approval) {
    return {
      payload: {
        error:
          'That timesheet is not in this user\'s pending approvals, so they cannot review it. ' +
          'Call listPendingApprovals and pick one of the returned timesheetIds. Never approve the ' +
          'user\'s own submission (separation of duties).',
      },
    }
  }

  if (callName === 'approveTimesheet') {
    const staged = stagePendingAction(ctx.userId, 'approveTimesheet', args, buildReviewSummary('APPROVE', approval))
    return buildStagedPayload(staged, staged.summary, `I've prepared this approval`)
  }

  const reason = String(args.reason)
  const staged = stagePendingAction(
    ctx.userId,
    'declineTimesheet',
    args,
    buildReviewSummary('DECLINE', approval, reason),
  )
  return buildStagedPayload(staged, staged.summary, `I've prepared this decline`)
}

async function handleListMyProjects(userToken: string): Promise<unknown> {
  const data = await callPlatformApi<{
    projects?: Array<{ id?: string; _id?: string; name?: string; sowNumber?: string; status?: string }>
  }>(userToken, 'GET', '/projects')
  const projects = Array.isArray(data?.projects) ? data.projects : []
  return {
    projects: projects.slice(0, 20).map((p) => ({
      projectId: p.id || p._id || '',
      name: p.name || 'Unnamed project',
      sowNumber: p.sowNumber || '',
      status: p.status || '',
    })),
    }
}

interface AiTimesheetRow {
  timesheetId: string
  projectId: string
  projectName: string
  weekStart: string
  status: string
  totalHours: number
  submittedAt: string | null
  reviewReason: string | null
}

async function handleGetMyTimesheets(
  userToken: string,
  args: unknown,
): Promise<{ count: number; timesheets: AiTimesheetRow[]; note?: string }> {
  const parsed = z
    .object({
      status: z.enum(['draft', 'pending', 'approved', 'declined', 'withdrawn']).optional(),
      projectId: z.string().optional(),
      weekStart: z.string().optional(),
    })
    .safeParse(args)

  const params = new URLSearchParams()
  if (parsed.success) {
    if (parsed.data.status) params.set('status', parsed.data.status)
    if (parsed.data.projectId) params.set('projectId', parsed.data.projectId)
    if (parsed.data.weekStart) params.set('weekStart', parsed.data.weekStart)
  }

  const query = params.toString()
  const data = await callPlatformApi<{ timesheets?: Array<Record<string, unknown>> }>(
    userToken,
    'GET',
    `/timesheets${query ? `?${query}` : ''}`,
  )
  const timesheets = Array.isArray(data?.timesheets) ? data.timesheets : []

  // Project names make the rows readable; best-effort (degrade to the id).
  let nameMap = new Map<string, string>()
  try {
    nameMap = readProjectNameMap(
      await callPlatformApi<{ projects?: Array<Record<string, unknown>> }>(userToken, 'GET', '/projects'),
    )
  } catch {
    /* best-effort */
  }

  const rows: AiTimesheetRow[] = timesheets.map((t) => {
    const projectId = String(t.projectId ?? '')
    const review = (t.review as { reason?: string } | undefined) ?? {}
    return {
      timesheetId: String(t.id ?? t._id ?? ''),
      projectId,
      projectName: nameMap.get(projectId) || projectId || 'Unnamed project',
      weekStart: String(t.weekStart ?? ''),
      status: String(t.status ?? ''),
      totalHours: Number(t.totalHours ?? 0),
      submittedAt: typeof t.submittedAt === 'string' ? t.submittedAt : null,
      reviewReason: typeof review.reason === 'string' ? review.reason : null,
    }
  })

  return { count: rows.length, timesheets: rows.slice(0, 50) }
}

async function handleGetProjectDetails(userToken: string, args: unknown): Promise<unknown> {
  const parsed = z.object({ projectId: z.string().regex(OBJECT_ID_RE, 'projectId must be a 24-character hex id') }).safeParse(args)
  if (!parsed.success) {
    return {
      error: `Invalid projectId: ${parsed.error.issues.map((i) => i.message).join('; ')}. Ask the user to clarify.`,
    }
  }
  return callPlatformApi(userToken, 'GET', `/projects/${parsed.data.projectId}`)
}

async function executeToolCall(
  call: { name: string; args: unknown },
  ctx: { userId: string; userToken: string },
): Promise<ToolOutcome> {
  if (call.name === 'listMyProjects') {
    try {
      return { payload: await handleListMyProjects(ctx.userToken) }
    } catch (err) {
      const message = err instanceof PlatformApiError ? err.message : 'Failed to list projects'
      return { payload: { error: message } }
    }
  }

  if (call.name === 'listPendingApprovals') {
    try {
      const approvals = await handleListPendingApprovals(ctx.userToken)
      return {
        payload: {
          approvals: approvals.slice(0, 20),
          note: approvals.length === 0
            ? 'No timesheets are awaiting this user\'s review.'
            : 'Only these timesheets may be approved or declined by this user.',
        },
      }
    } catch (err) {
      const message = err instanceof PlatformApiError ? err.message : 'Failed to list pending approvals'
            return { payload: { error: message } }
    }
  }

  if (call.name === 'getMyTimesheets') {
    try {
      return { payload: await handleGetMyTimesheets(ctx.userToken, call.args) }
    } catch (err) {
      const message = err instanceof PlatformApiError ? err.message : 'Failed to list your timesheets'
      return { payload: { error: message } }
    }
  }

  if (call.name === 'getProjectDetails') {
    try {
      return { payload: await handleGetProjectDetails(ctx.userToken, call.args) }
    } catch (err) {
      const message = err instanceof PlatformApiError ? err.message : 'Failed to fetch project details'
      return { payload: { error: message } }
    }
  }

  if (call.name === 'approveTimesheet' || call.name === 'declineTimesheet') {
    const raw = (call.args && typeof call.args === 'object' ? call.args : {}) as Record<string, unknown>
    return stageReviewAction(call.name, raw, ctx)
  }

  if (call.name === 'createTimesheet') {
    const raw = (call.args && typeof call.args === 'object' ? call.args : {}) as Record<string, unknown>
    const entriesRaw = Array.isArray(raw.entries) ? raw.entries : []
    const entries = entriesRaw.map((entry, index) => {
      const e = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
      return {
        id: typeof e.id === 'string' && e.id ? e.id : `ai-entry-${index + 1}`,
        description: e.description,
        entryType: e.entryType,
        hours: coerceHours(e.hours),
      }
    })
    const parsed = createTimesheetSchema.safeParse({
      projectId: raw.projectId,
      weekStart: raw.weekStart,
      entries,
      notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    })
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
      return { payload: { error: `Invalid timesheet details: ${detail}. Ask the user to clarify.` } }
    }
    const validArgs = parsed.data as unknown as Record<string, unknown>

    let projectName: string | undefined
    try {
      const listed = (await handleListMyProjects(ctx.userToken)) as {
        projects: Array<{ projectId: string; name: string }>
      }
      projectName = listed.projects.find((p) => p.projectId === String(validArgs.projectId))?.name
    } catch {
      projectName = undefined
    }

    const summary = buildActionSummary(validArgs, projectName)
    const staged = stagePendingAction(ctx.userId, 'createTimesheet', validArgs, summary)
    return buildStagedPayload(staged, summary, `I've prepared this draft timesheet`)
  }

  return { payload: { error: `Unknown tool: ${call.name}` } }
}
export async function chatWithAssistant(
  req: AuthenticatedRequest,
  input: { message: string; history?: Array<{ role: 'user' | 'model'; content: string }> },
  userToken?: string,
): Promise<AiChatResult> {
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
  
  const canUseTools = Boolean(userToken)
  const provider = getAiProvider()

  // The system prompt and per-user context are re-sent on EVERY turn. The client
  // owns `history` and stores only the user's raw text, so anything prepended
  // once would silently vanish from turn 2 onward.
  const messages: AiMessage[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\nCURRENT USER CONTEXT:\n${context}` },
    ...(parsed.history ?? [])
      .filter((h) => typeof h.content === 'string' && h.content.trim().length > 0)
      .map(
        (h): AiMessage => ({
          role: h.role === 'model' ? 'assistant' : 'user',
          content: h.content,
        }),
      ),
    { role: 'user', content: parsed.message },
  ]

  let pendingAction: AiChatResult['pendingAction']
  let stagedNarrative: string | undefined
  let lastToolCalls: AiToolCall[] = []
  let responseText = ''

  // Stateless turn loop: hand the provider the whole conversation, run whatever
  // tools it asks for, append the results, and repeat until it answers in prose.
  // Each adapter translates the neutral `messages` array to its own wire format,
  // so there is exactly one place that reasons about conversation state.
  for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
    const turn = await provider.generate(messages, canUseTools ? AI_TOOL_SPECS : [])
    responseText = turn.text

    if (!canUseTools || turn.toolCalls.length === 0) {
      lastToolCalls = []
      break
    }
    lastToolCalls = turn.toolCalls

    messages.push({ role: 'assistant', content: turn.text, toolCalls: turn.toolCalls })
    for (const call of turn.toolCalls) {
      const outcome = await executeToolCall(
        { name: call.name, args: call.args },
        { userId: req.user!.userId, userToken: userToken as string },
      )
      if (outcome.pendingAction) {
        pendingAction = outcome.pendingAction
        stagedNarrative = outcome.narrative
      }
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: toToolResultContent(outcome.payload),
      })
    }
  }

  if (!responseText && stagedNarrative) {
    responseText = stagedNarrative
  }
  if (!responseText) {
    // Hitting the iteration cap means the model kept requesting tools instead of
    // answering. Report that plainly rather than surfacing a 503.
    if (canUseTools && lastToolCalls.length > 0) {
      responseText =
        'That request needed more steps than I can take at once. Please give me the details ' +
        'one at a time (for example: list the projects, then log the hours for one of them).'
    } else {
      throw new Error(`Empty response from ${provider.name}`)
    }
  }
  responseText = guardAgainstPhantomAction(responseText, Boolean(pendingAction))

  logger.info({
    userId: req.user!.userId,
    role: req.user!.role,
    messageLength: parsed.message.length,
    provider: provider.name,
    toolsUsed: canUseTools,
    pendingAction: pendingAction?.id || null,
  }, 'AI chat completed')

  return pendingAction ? { response: responseText, pendingAction } : { response: responseText }
}
// Phase 7: confirm path — re-validates the staged payload against the SAME
// Zod schema, then executes it through OUR OWN REST API as the calling user.
// Nothing here touches MongoDB directly.
export async function confirmPendingAction(
  req: AuthenticatedRequest,
  id: string,
  userToken: string,
): Promise<{ resource: unknown; message: string }> {
  const action = getPendingAction(id)
  if (!action || action.status !== 'pending') {
    throw new Error(`NOT_FOUND: pending action ${id} does not exist`)
  }
  if (action.userId !== req.user!.userId) {
    throw new Error('FORBIDDEN: you do not own this action')
  }
  if (Date.now() > action.expiresAt) {
    settlePendingAction(id, 'cancelled')
    throw new Error('EXPIRED: this action expired — ask the assistant to prepare it again')
  }

  // Re-validate the stored args against the platform schema for this tool. The
  // record may be minutes old, so this is the last line of defence before the
  // write reaches the real endpoint.
  let endpoint: string
  let body: Record<string, unknown>
  let successMessage: string

  if (action.tool === 'createTimesheet') {
    const parsed = createTimesheetSchema.safeParse(action.args)
    if (!parsed.success) {
      settlePendingAction(id, 'cancelled')
      const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
      throw new Error(`VALIDATION: stored action no longer valid: ${detail}`)
    }
    endpoint = '/timesheets'
    body = parsed.data as Record<string, unknown>
    successMessage = 'Draft timesheet created via AI assistant.'
  } else if (action.tool === 'approveTimesheet' || action.tool === 'declineTimesheet') {
    const isDecline = action.tool === 'declineTimesheet'
    const parsed = (isDecline ? aiDeclineTimesheetSchema : aiTimesheetTargetSchema).safeParse(action.args)
    if (!parsed.success) {
      settlePendingAction(id, 'cancelled')
      const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
      throw new Error(`VALIDATION: stored action no longer valid: ${detail}`)
    }
    const target = parsed.data as { timesheetId: string; reason?: string }
    // The approvals endpoint re-runs requireTimesheetReview as the user: project
    // supervision, pending status and separation of duties are checked there.
    endpoint = `/approvals/${encodeURIComponent(target.timesheetId)}/${isDecline ? 'decline' : 'approve'}`
    body = isDecline ? { reason: target.reason } : {}
    successMessage = isDecline
      ? 'Timesheet declined via AI assistant.'
      : 'Timesheet approved via AI assistant.'
  } else {
    throw new Error(`VALIDATION: unsupported tool ${String(action.tool)}`)
  }

  let resource: unknown
  try {
    resource = await callPlatformApi(userToken, 'POST', endpoint, body)
  } catch (err) {
    const message = err instanceof PlatformApiError ? err.message : (err as Error).message
    throw new Error(`PLATFORM: ${message}`)
  }
  settlePendingAction(id, 'executed')
  logger.info({
    userId: req.user!.userId,
    tool: action.tool,
    pendingActionId: id,
    via: 'ai-assistant',
  }, 'AI write action executed')
  return { resource, message: successMessage }
}

export function cancelPendingAction(
  req: AuthenticatedRequest,
  id: string,
): { ok: true; id: string } {
  const action = getPendingAction(id)
  if (!action) {
    throw new Error(`NOT_FOUND: pending action ${id} does not exist`)
  }
  if (action.userId !== req.user!.userId) {
    throw new Error('FORBIDDEN: you do not own this action')
  }
  settlePendingAction(id, 'cancelled')
  logger.info({ userId: req.user!.userId, pendingActionId: id, via: 'ai-assistant' }, 'AI write action cancelled')
  return { ok: true, id }
}

