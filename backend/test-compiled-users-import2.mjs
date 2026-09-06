import 'dotenv/config'
import usersRoutes from './dist/src/routes/users.js'
import express from 'express'

const app = express()
app.use(express.json())
app.use('/api/v1/users', usersRoutes)
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }))

app.listen(3002, () => console.log('server on 3002'))
