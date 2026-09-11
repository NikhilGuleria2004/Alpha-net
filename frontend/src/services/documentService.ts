import type { Document } from '../types/document'
import apiClient, { request } from './apiClient'

export async function getDocuments(projectId?: string): Promise<Document[]> {
  if (!projectId) {
    return []
  }
  const response = await apiClient.get<{ documents: Document[] }>(`/projects/${projectId}/documents`)
  return response.documents
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
