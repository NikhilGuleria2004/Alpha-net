import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js', () => ({
  getDb: vi.fn(),
}))

vi.mock('../services/activity.service.js', () => ({
  createActivity: vi.fn(),
}))

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
  del: vi.fn(),
}))

import { getDb } from '../lib/mongodb.js'
import {
  getDocumentsByProjectId,
  getDocumentById,
  createDocument,
  deleteDocument,
  validateFile,
} from '../services/document.service.js'

function createMockCollection(items: Record<string, unknown>[] = []) {
  let storedItems = [...items]
  return {
    find: vi.fn(() => ({
      toArray: vi.fn(() => Promise.resolve([...storedItems])),
      sort: vi.fn(() => ({
        toArray: vi.fn(() => Promise.resolve([...storedItems])),
      })),
    })),
    findOne: vi.fn(({ _id }: { _id: ObjectId }) => {
      const found = storedItems.find((item) => item._id.toString() === _id.toString())
      return Promise.resolve(found ?? null)
    }),
    insertOne: vi.fn((doc: Record<string, unknown>) => {
      const inserted = { _id: new ObjectId(), ...doc }
      storedItems.push(inserted)
      return Promise.resolve({ insertedId: inserted._id })
    }),
    deleteOne: vi.fn(() => {
      storedItems = []
      return Promise.resolve({ deletedCount: 1 })
    }),
  }
}

describe('document.service', () => {
  const mockDb = {
    collection: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDb).mockResolvedValue(mockDb as never)
  })

  describe('validateFile', () => {
    it('accepts valid PDF files', () => {
      expect(validateFile('application/pdf', 1024)).toBeNull()
    })

    it('accepts valid image files', () => {
      expect(validateFile('image/png', 1024)).toBeNull()
      expect(validateFile('image/jpeg', 1024)).toBeNull()
    })

    it('rejects unsupported file types', () => {
      const result = validateFile('application/x-executable', 1024)
      expect(result).not.toBeNull()
      expect(result).toContain('Unsupported file type')
    })

    it('rejects files exceeding size limit', () => {
      const result = validateFile('application/pdf', 11 * 1024 * 1024)
      expect(result).not.toBeNull()
      expect(result).toContain('exceeds maximum')
    })

    it('accepts files at exact size limit', () => {
      expect(validateFile('application/pdf', 10 * 1024 * 1024)).toBeNull()
    })
  })

  describe('getDocumentsByProjectId', () => {
    it('returns documents for a project', async () => {
      const projectId = new ObjectId()
      const documents = [
        { _id: new ObjectId(), projectId, name: 'doc1.pdf', uploadedBy: new ObjectId() },
        { _id: new ObjectId(), projectId, name: 'doc2.pdf', uploadedBy: new ObjectId() },
      ]
      mockDb.collection.mockReturnValue(createMockCollection(documents))

      const result = await getDocumentsByProjectId(projectId.toString())
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('doc1.pdf')
    })

    it('returns empty array when no documents', async () => {
      mockDb.collection.mockReturnValue(createMockCollection([]))

      const result = await getDocumentsByProjectId(new ObjectId().toString())
      expect(result).toHaveLength(0)
    })
  })

  describe('getDocumentById', () => {
    it('returns document when found', async () => {
      const docId = new ObjectId()
      const document = { _id: docId, name: 'test.pdf', projectId: new ObjectId(), uploadedBy: new ObjectId() }
      mockDb.collection.mockReturnValue(createMockCollection([document]))

      const result = await getDocumentById(docId.toString())
      expect(result).not.toBeNull()
      expect(result?.name).toBe('test.pdf')
    })

    it('returns null when document not found', async () => {
      mockDb.collection.mockReturnValue(createMockCollection([]))

      const result = await getDocumentById(new ObjectId().toString())
      expect(result).toBeNull()
    })
  })

  describe('createDocument', () => {
    it('creates a document with valid input', async () => {
      mockDb.collection.mockReturnValue(createMockCollection([]))

      const result = await createDocument({
        projectId: new ObjectId().toString(),
        name: 'test.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        storageKey: 'blob-key-123',
        url: 'https://blob.vercel.com/test.pdf',
        uploadedBy: new ObjectId().toString(),
      })

      expect(result.name).toBe('test.pdf')
      expect(result.size).toBe(1024)
      expect(result.mimeType).toBe('application/pdf')
    })
  })

  describe('deleteDocument', () => {
    it('deletes a document and returns true', async () => {
      const docId = new ObjectId()
      const document = {
        _id: docId,
        name: 'test.pdf',
        projectId: new ObjectId(),
        uploadedBy: new ObjectId(),
        storageKey: 'blob-key-123',
      }
      mockDb.collection.mockReturnValue(createMockCollection([document]))

      const result = await deleteDocument(docId.toString())
      expect(result).toBe(true)
    })

    it('returns false when document not found', async () => {
      mockDb.collection.mockReturnValue(createMockCollection([]))

      const result = await deleteDocument(new ObjectId().toString())
      expect(result).toBe(false)
    })
  })
})
