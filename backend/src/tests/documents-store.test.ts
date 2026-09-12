import { describe, it, expect, vi, beforeEach } from "vitest"
import { ObjectId } from "mongodb"
// @ts-ignore
import request from "supertest"
import { createApp } from "../app.js"
import { getDb } from "../lib/mongodb.js"
import { verifyAccessToken } from "../lib/jwt.js"
import { COLLECTIONS } from "../lib/collections.js"
import { get as getBlob } from "@vercel/blob"
vi.mock("../lib/mongodb.js")
vi.mock("../lib/jwt.js")
vi.mock("@vercel/blob")
vi.mock("../services/project.service.js", () => ({ getProjectsForUser: vi.fn() }))
import { getProjectsForUser } from "../services/project.service.js"

function createMockCollection(docs = []) {
  return {
    find: vi.fn((filter: any) => {
      let filtered = docs
      if (filter?.projectId?.$in) {
        const ids = filter.projectId.$in.map((id: any) => id.toString())
        filtered = docs.filter((d: any) => ids.includes(d.projectId.toString()))
      }
      const chain = {
        sort: vi.fn(() => chain),
        toArray: vi.fn().mockResolvedValue(filtered),
      }
      return chain
    }),
    findOne: vi.fn(), insertOne: vi.fn(), deleteOne: vi.fn(),
  }
}

let mockDb, usersCollection, projectsCollection, documentsCollection
function setupMocks(docs = []) {
  vi.mocked(getDb).mockReset(); vi.mocked(verifyAccessToken).mockReset(); vi.mocked(getProjectsForUser).mockReset()
  usersCollection = createMockCollection(); projectsCollection = createMockCollection(); documentsCollection = createMockCollection(docs)
  mockDb = { collection: vi.fn((name) => { if (name === COLLECTIONS.USERS) return usersCollection; if (name === COLLECTIONS.PROJECTS) return projectsCollection; if (name === COLLECTIONS.DOCUMENTS) return documentsCollection; return createMockCollection() }) }
  vi.mocked(getDb).mockResolvedValue(mockDb)
}

function mockUser(userId, role, isSupervisor) {
  vi.mocked(verifyAccessToken).mockResolvedValue({ userId, role, isSupervisor, exp: 9999999999 })
  vi.mocked(usersCollection.findOne).mockResolvedValue({ _id: new ObjectId(userId), email: `u@e.com`, name: `U`, employeeId: `E`, department: "Eng", role, isSupervisor, status: "active" })
}

describe('Documents store listing (QA C2)', () => {
  beforeEach(() => { setupMocks() })

  it('admin sees every document in the org', async () => {
    const adminId = new ObjectId().toString()
    const projA = new ObjectId().toString()
    const projB = new ObjectId().toString()
    const docs = [
      { _id: new ObjectId(), projectId: new ObjectId(projA), name: 'org-wide.pdf', size: 1000, mimeType: 'application/pdf', storageKey: 's1', url: 'https://blob.example/s1', uploadedBy: new ObjectId(adminId), createdAt: new Date('2025-01-01') },
      { _id: new ObjectId(), projectId: new ObjectId(projB), name: 'archive.zip', size: 2000, mimeType: 'application/zip', storageKey: 's2', url: 'https://blob.example/s2', uploadedBy: new ObjectId(adminId), createdAt: new Date('2025-01-02') },
    ]
    setupMocks(docs)
    mockUser(adminId, 'admin', false)
    const res = await request(createApp()).get('/api/v1/documents').set('Authorization', 'Bearer admin-token')
    expect(res.status).toBe(200)
    expect(res.body.documents).toHaveLength(2)
    expect(res.body.documents.map((d) => d.name).sort()).toEqual(['archive.zip', 'org-wide.pdf'])
  })

  it('non-admin sees only documents for projects they can access', async () => {
    const userId = new ObjectId().toString()
    const projA = new ObjectId().toString()
    const projB = new ObjectId().toString()
    const projZ = new ObjectId().toString()
    const docs = [
      { _id: new ObjectId(), projectId: new ObjectId(projA), name: 'alpha-plan.pdf', size: 100, mimeType: 'application/pdf', storageKey: 'sa', url: 'https://blob.example/sa', uploadedBy: new ObjectId(userId), createdAt: new Date('2025-01-01') },
      { _id: new ObjectId(), projectId: new ObjectId(projA), name: 'alpha-budget.xlsx', size: 200, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', storageKey: 'sb', url: 'https://blob.example/sb', uploadedBy: new ObjectId(userId), createdAt: new Date('2025-01-02') },
      { _id: new ObjectId(), projectId: new ObjectId(projB), name: 'beta-plan.pdf', size: 300, mimeType: 'application/pdf', storageKey: 'sc', url: 'https://blob.example/sc', uploadedBy: new ObjectId(userId), createdAt: new Date('2025-01-03') },
      { _id: new ObjectId(), projectId: new ObjectId(projZ), name: 'private-plan.pdf', size: 400, mimeType: 'application/pdf', storageKey: 'sd', url: 'https://blob.example/sd', uploadedBy: new ObjectId(userId), createdAt: new Date('2025-01-04') },
    ]
    setupMocks(docs)
    vi.mocked(getProjectsForUser).mockResolvedValue([
      { id: projA, name: 'Alpha', managerId: 'm1', supervisorId: 's1', teamMemberIds: [userId] },
      { id: projB, name: 'Beta', managerId: 'm2', supervisorId: 's2', teamMemberIds: [userId] },
    ])
    mockUser(userId, 'user', false)
    const res = await request(createApp()).get('/api/v1/documents').set('Authorization', 'Bearer user-token')
    expect(res.status).toBe(200)
    expect(res.body.documents).toHaveLength(3)
    expect(res.body.documents.map((d) => d.name).sort()).toEqual(['alpha-budget.xlsx', 'alpha-plan.pdf', 'beta-plan.pdf'])
    expect(res.body.documents.find((d) => d.name === 'private-plan.pdf')).toBeUndefined()
  })

  it('returns an empty list when the requester has no accessible projects', async () => {
    const userId = new ObjectId().toString()
    setupMocks([])
    vi.mocked(getProjectsForUser).mockResolvedValue([])
    mockUser(userId, 'user', false)
    const res = await request(createApp()).get('/api/v1/documents').set('Authorization', 'Bearer user-token')
    expect(res.status).toBe(200)
    expect(res.body.documents).toEqual([])
  })
})

describe('Store-level document download (QA H8)', () => {
  beforeEach(() => { setupMocks() })

  function mockBlobDownload(content = 'file-bytes') {
    vi.mocked(getBlob).mockResolvedValue({
      stream: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(content)); c.close() } }),
    } as any)
  }

  it('streams the private blob for a user who can access the project', async () => {
    // Invoke the controller directly with a Writable-based fake response:
    // supertest's HTTP client cannot parse a streamed binary body
    // (HPE_CLOSED_CONNECTION) even though the endpoint returns 200 with
    // correct headers. Direct invocation asserts headers + piped bytes.
    const { downloadMyDocument } = await import('../controllers/document.controller.js')
    const { Writable } = await import('node:stream')
    const userId = new ObjectId().toString()
    const projectId = new ObjectId().toString()
    const doc = { _id: new ObjectId(), projectId: new ObjectId(projectId), name: 'plan.pdf', size: 9, mimeType: 'application/pdf', storageKey: 'sk', url: 'https://blob.example/sk', uploadedBy: new ObjectId(userId), createdAt: new Date() }
    setupMocks([doc])
    vi.mocked(getProjectsForUser).mockResolvedValue([{ id: projectId } as any])
    vi.mocked(documentsCollection.findOne).mockResolvedValue(doc)
    mockBlobDownload()
    const headers: Record<string, string> = {}
    const chunks: Buffer[] = []
    const sink = new Writable({ write(c, _e, cb) { chunks.push(Buffer.from(c)); cb() } })
    const fakeRes = Object.assign(sink, {
      setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v },
      status: (code: number) => { (fakeRes as any).statusCode = code; return fakeRes },
      json: vi.fn(),
    }) as any
    await downloadMyDocument({ params: { documentId: doc._id.toString() }, user: { userId, role: 'user', isSupervisor: false } } as any, fakeRes)
    await new Promise<void>((resolve) => { if (sink.writableFinished) resolve(); else sink.on('finish', () => resolve()) })
    expect(headers['content-type']).toContain('application/pdf')
    expect(headers['content-disposition']).toContain('plan.pdf')
    expect(Buffer.concat(chunks).toString()).toBe('file-bytes')
    expect(vi.mocked(getBlob)).toHaveBeenCalledWith('sk', { access: 'private' })
  })

  it('rejects a user who cannot access the document project with 403', async () => {
    const userId = new ObjectId().toString()
    const projectId = new ObjectId().toString()
    const docId = new ObjectId()
    const doc = { _id: docId, projectId: new ObjectId(projectId), name: 'secret.pdf', size: 9, mimeType: 'application/pdf', storageKey: 'sk', url: 'https://blob.example/sk', uploadedBy: new ObjectId(), createdAt: new Date() }
    setupMocks([doc])
    vi.mocked(getProjectsForUser).mockResolvedValue([])
    vi.mocked(documentsCollection.findOne).mockResolvedValue(doc)
    mockUser(userId, 'user', false)
    const res = await request(createApp()).get(`/api/v1/documents/${docId.toString()}/download`).set('Authorization', 'Bearer user-token')
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('returns 404 for an unknown document id', async () => {
    const userId = new ObjectId().toString()
    setupMocks([])
    vi.mocked(documentsCollection.findOne).mockResolvedValue(null)
    mockUser(userId, 'admin', false)
    const res = await request(createApp()).get(`/api/v1/documents/${new ObjectId().toString()}/download`).set('Authorization', 'Bearer admin-token')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})
