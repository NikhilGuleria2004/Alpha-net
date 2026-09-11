export interface Document {
  id: string
  projectId: string
  name: string
  size: number
  mimeType: string
  storageKey: string
  url?: string
  uploadedBy: string
  createdAt: string
}
