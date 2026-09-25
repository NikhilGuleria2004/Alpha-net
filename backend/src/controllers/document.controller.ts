import { type Request, type Response } from 'express'
import { getDocumentsByProjectId, createDocument, deleteDocument, validateFile, getDocumentById, getAllDocuments, getDocumentsByProjectIds, getDocumentsByUserId, type Document } from '../services/document.service.js'
import { documentListQuerySchema, uploadDocumentMetaSchema, type DocumentListQuery, type DocumentKind } from '../schemas/document.schema.js'
import { getProjectsForUser } from '../services/project.service.js'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireProjectAccess } from '../middleware/access.js'
import { createActivity } from '../services/activity.service.js'
import { createNotification } from '../services/notification.service.js'
import { getProjectById } from '../services/project.service.js'
import { put, del, get } from '@vercel/blob'
import { Readable } from 'node:stream'
import { logger } from '../lib/logger.js'

export async function listDocuments(req: AuthenticatedRequest, res: Response) {
  const documents = await getDocumentsByProjectId(req.params.projectId as string)
  res.json({ documents })
}

/**
 * Store-level listing (QA C2 + Phase 8 §5 item 1): one fetch that returns every
 * document the requester can see — admins get all, everyone else gets documents
 * for the projects already visible to them (same visibility the /projects
 * endpoint uses). This is what populates the app's document store on login.
 *
 * Flow Integration Phase 8 adds optional narrowing filters for the onboarding
 * checklist: `?userId=` (documents tagged to that subject) and `?kind=`
 * (i9|w4|offer|other). Filters never widen access — for non-admins the userId
 * filter intersects with (rather than replaces) project visibility.
 */
export async function listMyDocuments(req: AuthenticatedRequest, res: Response) {
  let query: DocumentListQuery
  try {
    query = documentListQuerySchema.parse(req.query)
  } catch (err) {
    // Bad filter input is a client error (400), not a server failure.
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: err instanceof Error ? err.message : 'Invalid query' },
    })
  }
  try {
    const { userId, role, isSupervisor } = req.user!
    let documents: Document[]
    if (role === 'admin') {
      // ?userId= narrows via the Phase 8 documents.userId index; without it the
      // legacy org-wide listing (getAllDocuments) is byte-identical to before.
      documents = query.userId ? await getDocumentsByUserId(query.userId) : await getAllDocuments()
    } else {
      const projects = await getProjectsForUser(userId, role, isSupervisor)
      documents = await getDocumentsByProjectIds(projects.map((p) => p.id))
      if (query.userId) documents = documents.filter((doc) => doc.userId === query.userId)
    }
    if (query.kind) documents = documents.filter((doc) => doc.kind === query.kind)
    return res.json({ documents })
  } catch (err) {
    logger.error({ err }, 'failed to list accessible documents')
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load documents' } })
  }
}

export async function uploadDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const file = (req as any).file as { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined
    if (!file) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'File is required' } })
    }

    const validationError = validateFile(file.mimetype, file.size)
    if (validationError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: validationError } })
    }

    const project = await getProjectById(req.params.projectId as string)
    if (!project) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } })
    }

    // Flow Integration Phase 8 (§5, item 1): optional multipart metadata for
    // the onboarding checklist — `kind` (i9|w4|offer|other) and `userId`
    // (whose onboarding this document belongs to). Both are omitted by legacy
    // form posts (absent/empty → undefined), which therefore still store a
    // byte-identical document; invalid values → 400 before any blob write.
    let meta: { kind?: DocumentKind; userId?: string }
    try {
      meta = uploadDocumentMetaSchema.parse({
        kind: typeof req.body?.kind === 'string' && req.body.kind !== '' ? req.body.kind : undefined,
        userId: typeof req.body?.userId === 'string' && req.body.userId !== '' ? req.body.userId : undefined,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid upload metadata'
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
    }

    const timestamp = Date.now()
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storageKey = `documents/${req.params.projectId}/${timestamp}-${sanitized}`

    const blob = await put(storageKey, file.buffer, {
      access: 'private',
      contentType: file.mimetype,
    })

    const document = await createDocument({
      projectId: req.params.projectId as string,
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      storageKey: blob.pathname,
      url: blob.url,
      uploadedBy: req.user!.userId,
      kind: meta.kind,
      userId: meta.userId,
    })

    await createActivity({
      userId: req.user!.userId,
      projectId: req.params.projectId as string,
      description: `Document "${file.originalname}" was uploaded to project "${project.name}".`,
    })

    if (project.supervisorId && project.supervisorId !== req.user!.userId) {
      await createNotification({
        userId: project.supervisorId,
        type: 'document',
        title: 'New Document Uploaded',
        message: `A new document "${file.originalname}" was uploaded to project "${project.name}".`,
        relatedId: document.id,
      })
    }

    res.status(201).json({ document })
  } catch (err) {
    logger.error({ err }, 'failed to upload document')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function downloadDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const document = await getDocumentById(req.params.documentId as string)
    if (!document) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } })
    }
    // QA: this route is mounted under /:projectId/documents and gated by
    // requireProjectAccess, which only checks whether the user can access the
    // *project in the URL* — not whether the document actually belongs to it.
    // Without this check a user who can see project A can download any
    // document by guessing its ID, even if it lives on project B. Verify the
    // document's projectId matches the route's projectId.
    if (document.projectId !== (req.params.projectId as string)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } })
    }

    const blob = await get(document.storageKey, { access: 'private' })
    if (!blob || blob.statusCode === 304) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document content not found' } })
    }

    const stream = Readable.fromWeb(blob.stream)
    res.setHeader('Content-Type', document.mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.name)}"`)
    res.setHeader('Content-Length', document.size.toString())
    stream.pipe(res)
  } catch (err) {
    logger.error({ err }, 'failed to download document')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

/**
 * Store-level document download (QA H8): GET /api/v1/documents/:documentId/download
 * streams a private blob through the authenticated endpoint instead of linking
 * the private blob's public URL (which 403s). Access is scoped the same way as
 * the C2 store listing — admins get any document; everyone else only documents
 * whose project they can access.
 */
export async function downloadMyDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const document = await getDocumentById(req.params.documentId as string)
    if (!document) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } })
    }

    const { userId, role, isSupervisor } = req.user!
    if (role !== 'admin') {
      const visible = await getProjectsForUser(userId, role, isSupervisor)
      const allowed = visible
        .map((p) => p.id)
        .includes(document.projectId)
      if (!allowed) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this document' } })
      }
    }

    const blob = await get(document.storageKey, { access: 'private' })
    if (!blob || blob.statusCode === 304) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document content not found' } })
    }

    const stream = Readable.fromWeb(blob.stream)
    res.setHeader('Content-Type', document.mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.name)}"`)
    res.setHeader('Content-Length', document.size.toString())
    stream.pipe(res)
  } catch (err) {
    logger.error({ err }, 'failed to download document')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function removeDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const document = await getDocumentById(req.params.documentId as string)
    if (!document) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } })
    }
    // QA: same IDOR as downloadDocument — this route is mounted under
    // /:projectId/documents and gated by requireProjectAccess, which only
    // checks access to the *project in the URL*. Verify the document actually
    // belongs to that project before letting the uploader or an admin delete
    // it; otherwise a user who can see project A can delete documents on
    // project B by guessing their IDs.
    if (document.projectId !== (req.params.projectId as string)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } })
    }

    const isAdmin = req.user!.role === 'admin'
    const isUploader = document.uploadedBy === req.user!.userId
    if (!isAdmin && !isUploader) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the uploader or an admin can delete this document' } })
    }

    const deleted = await deleteDocument(req.params.documentId as string)
    if (!deleted) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } })
    }
    res.status(204).send()
  } catch (err) {
    logger.error({ err }, 'failed to delete document')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}
