import { Router, type Response } from 'express'
import multer from 'multer'
import { unlink } from 'node:fs/promises'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { validateQuery } from '../middleware/validate.js'
import { createDocumentSchema, documentListQuerySchema } from '../schemas/document.schema.js'
import * as documentService from '../services/document.service.js'
import { resolveRequesterName } from './_shared.js'
import { logger } from '../lib/logger.js'

/** 10 MB transport ceiling. Enforced at the multer boundary, not post-hoc. */
const MAX_FILE_SIZE = 10 * 1024 * 1024

/**
 * `diskStorage` (not `memoryStorage`) so a large upload is streamed to a temp
 * file and released immediately — Phase 5 persists metadata only, so buffering
 * 10 MB per request in RAM would be pure waste.
 */
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, '/tmp'),
    filename: (_req, file, cb) => cb(null, `ems-doc-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
})

/**
 * multer streams the upload to a temp file so a 10 MB body is never buffered in
 * memory, and this route persists metadata only — nothing ever reads those
 * bytes back. That makes the temp file pure garbage, and on a platform where
 * /tmp is capped and outlives a single request (Vercel allows 500 MB for the
 * life of a warm instance) leaving them behind would eventually fail every
 * upload with ENOSPC. Best-effort by design: a file that is already gone is not
 * worth surfacing to the client.
 */
async function discardUpload(req: AuthenticatedRequest): Promise<void> {
  const file = (req as unknown as { file?: Express.Multer.File }).file
  if (!file?.path) return
  await unlink(file.path).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT') {
      logger.warn({ err, path: file.path }, 'failed to remove upload temp file')
    }
  })
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
])

/**
 * GET /documents, POST /documents (EMSBackend §7.5).
 * `documents` is the shared platform collection; these routes are additive only.
 */
export function documentsRoutes() {
  const router = Router()

  router.use(authenticate)

  /** GET /documents[?type=&userId=] — self-scoped, org-wide for hr/admin. */
  router.get('/', validateQuery(documentListQuerySchema), async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!
    const filters = req.query as { type?: string; userId?: string }
    const result = await documentService.listDocuments(user.userId, user.role, {
      type: filters.type,
      userId: filters.userId,
    })
    res.json(result)
  })

  /**
   * POST /documents (multipart) — metadata-first. The multipart text fields are
   * validated before anything is written; the file itself only supplies size and
   * MIME type (see document.service.createDocument for why bytes are not stored).
   */
  router.post('/', upload.single('file') as any, async (req: AuthenticatedRequest, res: Response) => {
    // 'close' fires on every exit path — success, an early 4xx return, or an
    // aborted client — so the temp file is reclaimed without restructuring the
    // handler around a try/finally.
    res.once('close', () => { void discardUpload(req) })

    const file = (req as unknown as { file?: Express.Multer.File }).file
    if (!file) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A file is required' } })
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return res.status(400).json({
        error: { code: 'UNSUPPORTED_FILE_TYPE', message: `Unsupported file type: ${file.mimetype}` },
      })
    }

    const parsed = createDocumentSchema.safeParse({
      kind: req.body?.kind,
      name: req.body?.name || file.originalname,
      userId: req.body?.userId,
      expiryAt: req.body?.expiryAt,
    })
    if (!parsed.success) {
      const details = parsed.error.issues.reduce((acc, issue) => {
        acc[issue.path.join('.')] = issue.message
        return acc
      }, {} as Record<string, string>)
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details },
      })
    }

    try {
      // Filing against another employee is an HR act (§6.2): an employee may
      // only ever write their own record. Without this, any authenticated user
      // could attach a forged contract/visa to someone else's profile.
      if (parsed.data.userId && parsed.data.userId !== req.user!.userId) {
        if (req.user!.role !== 'admin' && req.user!.role !== 'hr') {
          return res.status(403).json({
            error: { code: 'FORBIDDEN', message: 'Only HR or an admin may file a document for another employee' },
          })
        }
      }

      const uploaderName = await resolveRequesterName(req.user!.userId)
      const document = await documentService.createDocument(req.user!.userId, uploaderName, {
        kind: parsed.data.kind,
        name: parsed.data.name!,
        userId: parsed.data.userId ?? req.user!.userId,
        size: file.size,
        mimeType: file.mimetype,
        expiryAt: parsed.data.expiryAt,
      })
      res.status(201).json({ document })
    } catch (err) {
      logger.warn({ err }, 'document metadata creation failed')
      res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to store document' } })
    }
  })

  return router
}