import 'dotenv/config'
import express from 'express'
import { authenticate } from './dist/src/middleware/auth.js'
import { Router } from 'express'

const router = Router()
router.use(authenticate)
router.get('/', (req, res) => res.json({ ok: true }))

const app = express()
app.use(express.json())
app.use('/api/v1/test', router)
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }))

app.listen(3002, () => console.log('server on 3002'))
