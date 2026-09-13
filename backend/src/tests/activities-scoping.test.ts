import { describe, it, expect, vi, beforeEach } from "vitest"
import { ObjectId } from "mongodb"
// @ts-ignore
import request from "supertest"
import { createApp } from "../app.js"
import { getDb } from "../lib/mongodb.js"
import { verifyAccessToken } from "../lib/jwt.js"
import { COLLECTIONS } from "../lib/collections.js"

vi.mock("../lib/mongodb.js")
vi.mock("../lib/jwt.js")

describe("GET /activities collection scoping (QA C4 regression)", () => {
  const usersCol = {
    findOne: vi.fn(),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      toArray: vi.fn().mockResolvedValue([]),
    })),
  }
  const projectsCol = {
    findOne: vi.fn(),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      toArray: vi.fn().mockResolvedValue([]),
    })),
  }
  const activitiesCol = {
    findOne: vi.fn(),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      toArray: vi.fn().mockResolvedValue([]),
    })),
    insertOne: vi.fn(),
  }
  const db = {
    collection: vi.fn((n: string) => {
      if (n === COLLECTIONS.USERS) return usersCol
      if (n === COLLECTIONS.PROJECTS) return projectsCol
      if (n === COLLECTIONS.ACTIVITIES) return activitiesCol
      return { findOne: vi.fn(), find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })), insertOne: vi.fn() }
    }),
  }

  beforeEach(() => {
    vi.mocked(getDb).mockReset()
    vi.mocked(verifyAccessToken).mockReset()
    vi.mocked(usersCol.findOne).mockReset()
    vi.mocked(usersCol.find).mockReset()
    vi.mocked(projectsCol.findOne).mockReset()
    vi.mocked(projectsCol.find).mockReset()
    vi.mocked(activitiesCol.findOne).mockReset()
    vi.mocked(activitiesCol.find).mockReset()
    vi.mocked(activitiesCol.insertOne).mockReset()
    vi.mocked(db.collection).mockClear()
    vi.mocked(getDb).mockResolvedValue(db as any)
  })

  function userDoc(userId: string, role: string, isSupervisor: boolean) {
    return {
      _id: new ObjectId(userId),
      email: "u@e.com",
      name: "U",
      employeeId: "E",
      department: "Eng",
      role,
      isSupervisor,
      status: "active",
    }
  }

  it("admin sees all activities in the org, unfiltered", async () => {
    const adminId = new ObjectId().toString()
    const actA = { _id: new ObjectId(), userId: new ObjectId(adminId), projectId: new ObjectId(), description: "admin act", createdAt: new Date("2025-01-01") }
    const actB = { _id: new ObjectId(), userId: new ObjectId(), projectId: new ObjectId(), description: "other act", createdAt: new Date("2025-01-02") }
    vi.mocked(activitiesCol.find).mockReturnValue({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([actA, actB]) })),
      toArray: vi.fn().mockResolvedValue([actA, actB]),
    })
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId: adminId, role: "admin", isSupervisor: false, exp: 9999999999 })
    vi.mocked(usersCol.findOne).mockResolvedValue(userDoc(adminId, "admin", false))
    const res = await request(createApp()).get("/api/v1/activities").set("Authorization", "Bearer a")
    expect(res.status).toBe(200)
    expect(res.body.activities).toHaveLength(2)
  })

  it("non-admin employee cannot read a foreign project id via ?projectId=", async () => {
    const userId = new ObjectId().toString()
    const foreignProjectId = new ObjectId().toString()
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId, role: "user", isSupervisor: false, exp: 9999999999 })
    vi.mocked(usersCol.findOne).mockResolvedValue(userDoc(userId, "user", false))
    vi.mocked(projectsCol.find).mockReturnValue({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      toArray: vi.fn().mockResolvedValue([]),
    })
    const res = await request(createApp()).get(`/api/v1/activities?projectId=${foreignProjectId}`).set("Authorization", "Bearer u")
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe("FORBIDDEN")
  })

  it("non-admin employee sees only activity from projects they can access", async () => {
    const userId = new ObjectId().toString()
    const myProjectId = new ObjectId().toString()
    const foreignProjectId = new ObjectId().toString()
    const mine = { _id: new ObjectId(), userId: new ObjectId(userId), projectId: new ObjectId(myProjectId), description: "my act", createdAt: new Date("2025-01-01") }
    const theirs = { _id: new ObjectId(), userId: new ObjectId(userId), projectId: new ObjectId(foreignProjectId), description: "foreign act", createdAt: new Date("2025-01-02") }
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId, role: "user", isSupervisor: false, exp: 9999999999 })
    vi.mocked(usersCol.findOne).mockResolvedValue(userDoc(userId, "user", false))
    vi.mocked(projectsCol.find).mockImplementation((filter: any) => {
      let docs: any[] = [
        { _id: new ObjectId(myProjectId), teamMemberIds: [new ObjectId(userId)] },
        { _id: new ObjectId(foreignProjectId), teamMemberIds: [] },
      ]
      if (filter?.teamMemberIds) {
        const oid = filter.teamMemberIds.toString()
        docs = docs.filter((d) => (d.teamMemberIds as ObjectId[]).some((id) => id.toString() === oid))
      } else if (filter?._id) {
        const oid = filter._id.toString()
        docs = docs.filter((d) => (d._id as ObjectId).toString() === oid)
      }
      return {
        sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(docs) })),
        toArray: vi.fn().mockResolvedValue(docs),
      }
    })
    vi.mocked(activitiesCol.find).mockImplementation((filter: any) => {
      let docs = [mine, theirs]
      if (filter?.projectId?.$in) {
        const ids = filter.projectId.$in.map((id: any) => id.toString())
        docs = docs.filter((d) => ids.includes((d.projectId as ObjectId).toString()))
      } else if (filter?.projectId && !Array.isArray(filter.projectId)) {
        const oid = filter.projectId.toString()
        docs = docs.filter((d) => (d.projectId as ObjectId).toString() === oid)
      }
      return {
        sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(docs) })),
        toArray: vi.fn().mockResolvedValue(docs),
      }
    })
    const res = await request(createApp()).get("/api/v1/activities").set("Authorization", "Bearer u")
    expect(res.status).toBe(200)
    expect(res.body.activities).toHaveLength(1)
    expect(res.body.activities[0].description).toBe("my act")
  })

  it("supervisor can read a subordinate userId filter", async () => {
    const supervisorId = new ObjectId().toString()
    const subordinateId = new ObjectId().toString()
    const projectId = new ObjectId().toString()
    const act = { _id: new ObjectId(), userId: new ObjectId(subordinateId), projectId: new ObjectId(projectId), description: "subordinate act", createdAt: new Date("2025-01-01") }
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId: supervisorId, role: "user", isSupervisor: true, exp: 9999999999 })
    vi.mocked(usersCol.findOne).mockImplementation((query: any) => {
      const qId = query._id?.toString()
      if (qId === supervisorId && query.status === "active") {
        return userDoc(supervisorId, "user", true)
      }
      if (qId === subordinateId && query.supervisorId?.toString() === supervisorId) {
        return { _id: new ObjectId(subordinateId), supervisorId: new ObjectId(supervisorId) }
      }
      return undefined
    })
    vi.mocked(projectsCol.find).mockReturnValue({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([{ _id: new ObjectId(projectId), supervisorId: new ObjectId(supervisorId), teamMemberIds: [new ObjectId(subordinateId)] }]) })),
      toArray: vi.fn().mockResolvedValue([{ _id: new ObjectId(projectId), supervisorId: new ObjectId(supervisorId), teamMemberIds: [new ObjectId(subordinateId)] }]),
    })
    vi.mocked(activitiesCol.find).mockReturnValue({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([act]) })),
      toArray: vi.fn().mockResolvedValue([act]),
    })
    // sanity: verify getDb mock returns db with a working collection fn
    const g = await getDb()
    expect(typeof g.collection).toBe("function")
    const users = g.collection(COLLECTIONS.USERS)
    expect(users).toBeDefined()
    expect(typeof (users as any).findOne).toBe("function")
    // now call the controller's path directly via the test's own imports to prove
    // the mock is wired for BOTH the test and the controller (same module mock).
    const usersDirect = g.collection(COLLECTIONS.USERS)
    expect(usersDirect).toBe(users)
    const res = await request(createApp()).get(`/api/v1/activities?userId=${subordinateId}`).set("Authorization", "Bearer s")
    expect(res.status).toBe(200)
    expect(res.body.activities).toHaveLength(1)
    expect(res.body.activities[0].description).toBe("subordinate act")
  })

  it("supervisor cannot read a userId that is not their subordinate", async () => {
    const supervisorId = new ObjectId().toString()
    const otherId = new ObjectId().toString()
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId: supervisorId, role: "user", isSupervisor: true, exp: 9999999999 })
    vi.mocked(usersCol.findOne).mockImplementation((query: any) => {
      const qId = query._id?.toString()
      if (qId === supervisorId && query.status === "active") {
        return userDoc(supervisorId, "user", true)
      }
      return undefined
    })
    vi.mocked(projectsCol.find).mockReturnValue({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      toArray: vi.fn().mockResolvedValue([]),
    })
    const res = await request(createApp()).get(`/api/v1/activities?userId=${otherId}`).set("Authorization", "Bearer s")
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
    expect(res.body.error.message).toContain("You can only view your own activity")
  })

  it("non-admin employee cannot use ?timesheetId= on the collection endpoint", async () => {
    const userId = new ObjectId().toString()
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId, role: "user", isSupervisor: false, exp: 9999999999 })
    vi.mocked(usersCol.findOne).mockResolvedValue(userDoc(userId, "user", false))
    const res = await request(createApp()).get("/api/v1/activities?timesheetId=6019b029a5f9b0001f7e1b2c").set("Authorization", "Bearer u")
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
  })
})
