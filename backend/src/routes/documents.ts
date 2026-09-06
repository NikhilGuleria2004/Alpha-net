import { Router } from 'express'
import multer from 'multer'
import { listDocuments, uploadDocument, removeDocument } from '../controllers/document.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireProjectAccess } from '../middleware/access.js'

const upload = multer({ storage: multer.memoryStorage() })

export function documentsRoutes() {
  const router = Router()
  router.use(authenticate)

  router.get('/', requireProjectAccess, listDocuments)
  router.post('/', requireProjectAccess, upload.single('file') as any, uploadDocument)
  router.delete('/:documentId', requireProjectAccess, removeDocument)

  return router
}
