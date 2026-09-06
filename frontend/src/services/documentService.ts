import type { Document } from '../types/document'
import apiClient from './apiClient'

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

export async function createDocument(data: Omit<Document, 'id' | 'uploadedAt'> & { projectId: string }): Promise<Document> {
  const response = await apiClient.post<{ document: Document }>(`/projects/${data.projectId}/documents`, data)
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
