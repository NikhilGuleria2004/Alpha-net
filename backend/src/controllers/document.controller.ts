import { type Request, type Response } from 'express'
import { getDocumentsByProjectId, createDocument, deleteDocument, validateFile, getDocumentById, getAllDocuments, getDocumentsByProjectIds } from '../services/document.service.js'
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
 * Store-level listing (QA C2): one fetch that returns every document the
 * requester can see — admins get all, everyone else gets documents for the
 * projects already visible to them (same visibility the /projects endpoint
 * uses). This is what populates the app's document store on login.
 */
export async function listMyDocuments(req: AuthenticatedRequest, res: Response) {
  try {
    const { userId, role, isSupervisor } = req.user!
    if (role === 'admin') {
      return res.json({ documents: await getAllDocuments() })
    }
    const projects = await getProjectsForUser(userId, role, isSupervisor)
    const documents = await getDocumentsByProjectIds(projects.map((p) => p.id))
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
