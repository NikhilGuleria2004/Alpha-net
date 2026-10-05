/**
 * Commercial domain types — clients, projects, assignments (EMSBackend §7.6).
 *
 * All three collections are SHARED with the timesheet platform backend, so these
 * types are the *API-boundary* shapes the EMSFrontend consumes, while the stored
 * documents carry the platform's field names as well. See each service for the
 * dual-write map.
 */

import type { SupportedCurrencyCode } from './auth.js'

// ── Clients ──────────────────────────────────────────────────────────────────

/**
 * EMS-owned human handle, e.g. `CL-2026-001`. Generated server-side and unique.
 * Named `clientCode` (not `clientId`) because EMSBackend §5.3 originally
 * specified `C####` while EMSFrontend/src/types/client.ts expects `CL-2026-###`;
 * the frontend contract wins for shape (non-negotiable rule 3).
 */
export interface Client {
  id: string
  clientCode: string
  name: string
  /** Platform-maintained dedup key (unique index). Lowercased, whitespace-collapsed. */
  normalizedName: string
  description?: string
  billingAddress?: string
  paymentTerms?: string
  contactEmail?: string
  /**
   * `synced` once the row is visible to the timesheet platform. Rows are written
   * straight to the shared collection, so EMS-created clients are `synced` on read.
   */
  syncStatus: 'synced' | 'pending' | 'error'
  contactName?: string
  contactPhone?: string
  contractValue?: number
  status?: string
  createdAt: string
  updatedAt: string
}

export interface CreateClientInput {
  name: string
  description?: string
  billingAddress?: string
  paymentTerms?: string
  contactEmail?: string
  contactName?: string
  contactPhone?: string
  contractValue?: number
}

export interface ClientContact {
  id: string
  clientId: string
  name: string
  email: string
  phone: string
}

export interface ClientActivityEntry {
  id: string
  description: string
  actor: string
  timestamp: string
  kind: string
}

// ── Projects ─────────────────────────────────────────────────────────────────

/** Matches the platform's ProjectStatus union so platform reads stay valid. */
export type ProjectStatus = 'draft' | 'active' | 'completed' | 'overdue' | 'archived'

export interface Project {
  id: string
  name: string
  sowNumber: string
  /** Legacy free-text client name the platform still displays. Kept in sync with clientId. */
  client: string
  clientId?: string
  description: string
  startDate: string
  endDate: string
  deadline: string
  status: ProjectStatus
  managerId: string
  supervisorId: string
  teamMemberIds: string[]
  hourlyRate?: number | null
  /** EMS extension (§5.2): PO/SOW cap. Platform reads this for invoice balance. */
  poCap?: number | null
  /** EMS extension: staffing demand inputs. */
  skillsRequired?: string[]
  billRateDefault?: number | null
  seats?: number
  roleOnProject?: string
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  clientId: string
  sowNumber: string
  poCap?: number
  startDate: string
  endDate: string
  deadline?: string
  description?: string
  skillsRequired?: string[]
  billRateDefault?: number
  status?: ProjectStatus
  seats?: number
  roleOnProject?: string
}

// ── Assignments ──────────────────────────────────────────────────────────────

/** Frontend-facing status vocabulary (EMSFrontend/src/types/assignment.ts). */
export type AssignmentStatus = 'proposed' | 'active' | 'ending_soon' | 'ended'

/**
 * Stored status vocabulary. The platform queries `status: 'active'` in
 * getActiveAssignment/resolveAssignmentForTimesheet, so the persisted value
 * must be platform-native; it is translated on read (see toAssignment).
 */
export type StoredAssignmentStatus = 'active' | 'onHold' | 'completed' | 'terminated'

export interface Assignment {
  id: string
  userId: string
  projectId: string
  clientId: string
  billRate: number
  payRate: number
  currency: SupportedCurrencyCode
  /** 0–100. */
  ftePercent: number
  roleOnProject?: string
  startDate: string
  endDate: string
  status: AssignmentStatus
  /** True when the resource logs time against this assignment on the platform. */
  timesheetEnabled: boolean
  /** (billRate - payRate) / billRate, as a fraction. Null when billRate <= 0. */
  marginPct?: number | null
  createdAt: string
  updatedAt: string
}

export interface CreateAssignmentInput {
  userId: string
  projectId: string
  billRate: number
  payRate?: number
  currency?: SupportedCurrencyCode
  ftePercent?: number
  roleOnProject?: string
  startDate: string
  endDate: string
}

export interface AssignmentDemand {
  id: string
  projectName: string
  role: string
  skills: string[]
  seats: number
  filled: number
  startDate: string
  endDate: string
}

export interface ProjectTeamMember {
  userId: string
  name: string
  role: string
}

export interface ProjectDocumentSummary {
  id: string
  name: string
  kind: string
  uploadedAt: string
}