import 'dotenv/config'
import express from 'express'
import { authenticate, requireAdmin } from './dist/src/middleware/auth.js'
import { listUsers } from './dist/src/controllers/user.controller.js'
import { getUserById } from './dist/src/services/user.service.js'
import { Router } from 'express'

console.log('All imports loaded')

const router = Router()
router.use(authenticate)
router.get('/', requireAdmin, listUsers)

const app = express()
app.use(express.json())
app.use('/api/v1/users', router)
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }))

app.listen(3002, () => console.log('server on 3002'))
