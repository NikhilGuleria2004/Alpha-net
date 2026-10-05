import type { Client } from '../types/client'
import type { Project } from '../types/project'

/**
 * Client ↔ project helpers (EMSFrontend.md §7.6–7.7).
 *
 * Ported from the sibling `utils/clients.ts`: `normalizeClientName` mirrors
 * the backend dedup key so the EMS groups projects exactly the way the shared
 * database dedupes client names — this is what keeps EMS-created clients
 * visible to the timesheet platform and vice-versa.
 */

export function normalizeClientName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Generate the next human-readable Client ID (`CL-2026-###`). */
export function nextClientId(year: number, sequence: number): string {
  return `CL-${year}-${String(sequence).padStart(3, '0')}`
}

// A project belongs to a client when its normalized FK matches, or — for
// legacy projects with no clientId yet — when its free-text `client` string
// still normalizes to the same name.
export function getProjectsForClient(client: Client, projects: Project[]): Project[] {
  return projects.filter((project) =>
    project.clientId
      ? project.clientId === client.id
      : normalizeClientName(project.client) === client.normalizedName,
  )
}
