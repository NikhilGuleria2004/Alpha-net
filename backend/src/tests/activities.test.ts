/// <reference types="vitest" />

import { describe, it, expect, vi } from 'vitest'
// @ts-ignore
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import { verifyAccessToken } from '../lib/jwt.js'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'

vi.mock('../lib/mongodb.js')
vi.mock('../lib/jwt.js')

// S3 regression (QA_REPORT.md): POST /activities accepted caller-supplied
// userId/projectId/timesheetId — any user could forge journal entries attributed
// to anyone (and invalid ObjectIds leaked raw Mongo errors as 500s). The endpoint
// is removed; all activities are written server-side by services that run in the
// context of real business events (submit/approve/decline/upload/assign...).
describe('POST /api/v1/activities (S3 regression)', () => {
  it('no longer exists — forging activities is impossible', async () => {
    const collection = {
      findOne: vi.fn(),
      find: vi.fn(() => ({ sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })),
    }
    const db = { collection: vi.fn(() => collection) }
    vi.mocked(getDb).mockResolvedValue(db as any)
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId: '507f1f77bcf86cd799439011', role: 'user', isSupervisor: false, exp: 9999999999 })
    // authenticate resolves the caller as an active user.
    vi.mocked(collection.findOne).mockResolvedValue({
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      email: 'user@example.com',
      name: 'User',
      employeeId: 'EMP001',
      department: 'Engineering',
      role: 'user',
      isSupervisor: false,
      status: 'active',
    })

    const res = await request(createApp())
      .post('/api/v1/activities')
      .set('Authorization', 'Bearer valid-token')
      .send({ userId: '507f1f77bcf86cd799439012', description: 'forged activity' })

    expect(res.status).toBe(404)
  })
})