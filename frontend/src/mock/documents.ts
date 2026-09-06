export interface Document {
  id: string
  projectId: string
  name: string
  size: string
  type: string
  uploadedBy: string
  uploadedAt: string
}

export const documents: Document[] = [
  {
    id: 'doc-1',
    projectId: 'project-1',
    name: 'Website_Modernization_SOW.pdf',
    size: '2.4 MB',
    type: 'application/pdf',
    uploadedBy: 'admin-1',
    uploadedAt: '2026-08-25T10:00:00Z',
  },
  {
    id: 'doc-2',
    projectId: 'project-1',
    name: 'Brand_Guidelines_v2.pdf',
    size: '4.1 MB',
    type: 'application/pdf',
    uploadedBy: 'admin-1',
    uploadedAt: '2026-08-26T11:00:00Z',
  },
  {
    id: 'doc-3',
    projectId: 'project-2',
    name: 'Mobile_Platform_Requirements.docx',
    size: '1.2 MB',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    uploadedBy: 'admin-1',
    uploadedAt: '2026-08-10T09:00:00Z',
  },
  {
    id: 'doc-4',
    projectId: 'project-2',
    name: 'UX_Research_Report.pdf',
    size: '3.8 MB',
    type: 'application/pdf',
    uploadedBy: 'user-3',
    uploadedAt: '2026-08-12T14:00:00Z',
  },
  {
    id: 'doc-5',
    projectId: 'project-3',
    name: 'Analytics_Dashboard_Spec.pdf',
    size: '2.0 MB',
    type: 'application/pdf',
    uploadedBy: 'admin-1',
    uploadedAt: '2026-06-20T11:00:00Z',
  },
  {
    id: 'doc-6',
    projectId: 'project-3',
    name: 'Data_Model.xlsx',
    size: '0.6 MB',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    uploadedBy: 'user-11',
    uploadedAt: '2026-07-05T10:00:00Z',
  },
  {
    id: 'doc-7',
    projectId: 'project-6',
    name: 'Ecommerce_Redesign_Plan.docx',
    size: '1.5 MB',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    uploadedBy: 'admin-1',
    uploadedAt: '2026-04-20T10:00:00Z',
  },
  {
    id: 'doc-8',
    projectId: 'project-7',
    name: 'Security_Audit_Scope.pdf',
    size: '1.8 MB',
    type: 'application/pdf',
    uploadedBy: 'user-10',
    uploadedAt: '2026-08-28T08:00:00Z',
  },
]
