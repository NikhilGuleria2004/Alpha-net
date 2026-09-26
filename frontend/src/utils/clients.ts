import type { Client } from '../types/client'
import type { Project } from '../types/project'

// Helpers for relating the normalized `clients` collection back to projects.
// Mirrors normalizeClientName() in backend/src/services/client.service.ts so the
// UI groups projects exactly the way the backend dedupes client names.

export function normalizeClientName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

// A project belongs to a client when its normalized FK matches, or — for legacy
// projects that have no clientId yet (pre-Phase 1 backfill) — when its free-text
// `client` string still normalizes to the same name.
export function getProjectsForClient(client: Client, projects: Project[]): Project[] {
  return projects.filter((project) =>
    project.clientId
      ? project.clientId === client.id
      : normalizeClientName(project.client) === client.normalizedName,
  )
}
