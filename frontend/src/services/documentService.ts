import type { Document } from '../types/document'
import apiClient, { request } from './apiClient'

/**
 * Store-level listing (QA C2): returns every document the current user can see —
 * admins get all documents across the org, supervisors/employees get only
 * documents for projects they have access to. This is what the app's document
 * store calls on login / refresh, so uploaded documents actually appear in the UI.
 */
export async function getAllDocuments(): Promise<Document[]> {
  const response = await apiClient.get<{ documents: Document[] }>('/documents')
  return response.documents ?? []
}

export async function getDocuments(projectId?: string): Promise<Document[]> {
  if (!projectId) {
    // No projectId — fall back to the store-level listing so a bare call does not
    // return [] by construction (QA C2). The caller gets every document the user
    // can see, not just a per-project slice. Per-project callers should use
    // getDocumentsByProjectId(projectId) explicitly.
    return getAllDocuments()
  }
  return getDocumentsByProjectId(projectId)
}

export async function getDocumentsByProjectId(projectId: string): Promise<Document[]> {
  const response = await apiClient.get<{ documents: Document[] }>(`/projects/${projectId}/documents`)
  return response.documents
}

export async function uploadProjectDocument(projectId: string, file: File): Promise<Document> {
  // The backend upload endpoint (document.controller.ts) expects multipart/form-data
  // with a `file` field (multer upload.single('file')) — a JSON body is rejected.
  const formData = new FormData()
  formData.append('file', file)
  const response = await request<{ document: Document }>(`/projects/${projectId}/documents`, {
    method: 'POST',
    body: formData,
  })
  return response.document
}

export async function deleteDocument(projectId: string, id: string): Promise<boolean> {
  try {
    await apiClient.delete<void>(`/projects/${projectId}/documents/${id}`)
    return true
  } catch {
    return false
  }
}
