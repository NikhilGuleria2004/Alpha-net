import { type Request, type Response } from 'express'
import { getDocumentsByProjectId, createDocument, deleteDocument, validateFile } from '../services/document.service.js'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireProjectAccess } from '../middleware/access.js'
import { createActivity } from '../services/activity.service.js'
import { createNotification } from '../services/notification.service.js'
import { getProjectById } from '../services/project.service.js'
import { put, del } from '@vercel/blob'

export async function listDocuments(req: AuthenticatedRequest, res: Response) {
  const documents = await getDocumentsByProjectId(req.params.projectId as string)
  res.json({ documents })
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
      access: 'public',
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
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } })
  }
}

export async function removeDocument(req: AuthenticatedRequest, res: Response) {
  const deleted = await deleteDocument(req.params.documentId as string)
  if (!deleted) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } })
  }
  res.status(204).send()
}
