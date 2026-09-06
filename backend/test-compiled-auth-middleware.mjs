import 'dotenv/config'
import { authenticate } from './dist/src/middleware/auth.js'
import express from 'express'

const app = express()
app.use(express.json())
app.get('/api/v1/test', authenticate, (req, res) => res.json({ ok: true }))
app.listen(3002, () => console.log('server on 3002'))
