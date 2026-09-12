import { Router } from 'express'
import multer from 'multer'
import { listDocuments, uploadDocument, removeDocument, downloadDocument, listMyDocuments } from '../controllers/document.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireProjectAccess } from '../middleware/access.js'

const upload = multer({ storage: multer.memoryStorage() })

export function documentsRoutes() {
  // mergeParams: true is required so that :projectId (captured by the parent
  // /:projectId/documents mount in routes/projects.ts) and :documentId are
  // visible on req.params inside this router. Without it req.params is empty
  // here and requireProjectAccess / handlers cannot resolve the project.
  const router = Router({ mergeParams: true })
  router.use(authenticate)

  router.get('/', requireProjectAccess, listDocuments)
  router.post('/', requireProjectAccess, upload.single('file') as any, uploadDocument)
  router.get('/:documentId/download', requireProjectAccess, downloadDocument)
  router.delete('/:documentId', requireProjectAccess, removeDocument)

  return router
}

/**
 * Top-level store listing (QA C2): GET /api/v1/documents returns every document
 * visible to the requester. Separate from the nested per-project router above
 * (which requires a :projectId param and per-project access checks).
 */
export function myDocumentsRoutes() {
  const router = Router()
  router.use(authenticate)
  router.get('/', listMyDocuments)
  return router
}
