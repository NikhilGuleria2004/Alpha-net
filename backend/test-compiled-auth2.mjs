import 'dotenv/config'
import { login } from './dist/src/controllers/auth.controller.js'
import express from 'express'

const app = express()
app.use(express.json())
app.post('/api/v1/auth/login', login)
app.listen(3002, () => console.log('server on 3002'))
