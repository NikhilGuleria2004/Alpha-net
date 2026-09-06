import 'dotenv/config'
import express from 'express'
import { listUsers, getUser, create, update, deactivate, activate, assignSupervisor } from './dist/src/controllers/user.controller.js'
import { authenticate, requireAdmin } from './dist/src/middleware/auth.js'
import { Router } from 'express'

const router = Router()
router.use(authenticate)
router.get('/', requireAdmin, listUsers)
router.get('/:id', getUser)
router.post('/', requireAdmin, create)
router.patch('/:id', requireAdmin, update)
router.post('/:id/deactivate', requireAdmin, deactivate)
router.post('/:id/activate', requireAdmin, activate)
router.patch('/:id/supervisor', requireAdmin, assignSupervisor)

const app = express()
app.use(express.json())
app.use('/api/v1/users', router)
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }))

app.listen(3002, () => console.log('server on 3002'))
