import type { Invoice, CreateInvoiceInput, UpdateInvoiceInput } from '../types/invoice'
import apiClient from './apiClient'

export async function getInvoices(): Promise<Invoice[]> {
  const response = await apiClient.get<{ invoices: Invoice[] }>('/invoices')
  return response.invoices
}

export async function getInvoiceById(id: string): Promise<Invoice | undefined> {
  const response = await apiClient.get<{ invoice: Invoice }>(`/invoices/${id}`)
  return response.invoice
}

export async function getInvoicesByProjectId(projectId: string): Promise<Invoice[]> {
  const response = await apiClient.get<{ invoices: Invoice[] }>(`/invoices?projectId=${projectId}`)
  return response.invoices
}

export async function createInvoice(data: CreateInvoiceInput): Promise<Invoice> {
  const response = await apiClient.post<{ invoice: Invoice }>('/invoices', data)
  return response.invoice
}

export async function updateInvoice(id: string, data: UpdateInvoiceInput): Promise<Invoice | undefined> {
  const response = await apiClient.patch<{ invoice: Invoice }>(`/invoices/${id}`, data)
  return response.invoice
}

export async function sendInvoice(id: string, to?: string): Promise<Invoice | undefined> {
  const response = await apiClient.post<{ invoice: Invoice }>(`/invoices/${id}/send`, to ? { to } : {})
  return response.invoice
}
