import 'dotenv/config'
import express from 'express'
import { listUsers } from './dist/src/controllers/user.controller.js'
import { Router } from 'express'

const router = Router()
router.get('/', listUsers)

const app = express()
app.use(express.json())
app.use('/api/v1/users', router)
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }))

app.listen(3002, () => console.log('server on 3002'))
