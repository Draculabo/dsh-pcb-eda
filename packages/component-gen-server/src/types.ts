/**
 * `@huaqiu/component-gen-server` — shared domain types.
 *
 * These mirror `@huaqiu/component-gen-app/src/ports.ts` (structurally
 * identical, JSON interop) but are owned by the server as the authority.
 */

export type ComponentGenPage = 'symbol' | 'footprint'

export type JobKind = 'symbol' | 'extract-footprint' | 'generate-footprint'

export type JobStatus =
  | 'queued'
  | 'running'
  | 'needs_confirmation'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface JobInput {
  imageDataUrl?: string
  instruction?: string
  packageType?: string
  dimensions?: Record<string, number>
  fileName?: string
  edited?: Record<string, boolean>
}

export interface JobState {
  id: string
  kind: JobKind
  status: JobStatus
  progress?: string
  result?: Record<string, unknown>
  dimensions?: Record<string, unknown>
  pkgType?: string | null
  fileName?: string | null
  error?: string
  createdAt: string
  updatedAt: string
}

export type JobEvent =
  | { type: 'progress'; message: string; at: string }
  | { type: 'needs_confirmation'; dimensions: Record<string, unknown>; pkgType?: string | null; fileName?: string | null; at: string }
  | { type: 'completed'; job: JobState; at: string }
  | { type: 'failed'; error: string; result?: Record<string, unknown>; at: string }
  | { type: 'cancelled'; at: string }

export interface StartJobRequest {
  kind: JobKind
  input: JobInput
}

export interface HistoryQuery {
  limit?: number
  cursor?: string | null
}

export interface HistoryPage {
  entries: HistoryEntry[]
  nextCursor?: string | null
}

export interface HistoryEntry {
  id: string
  kind: 'symbol' | 'footprint'
  createdAt: string
  status: 'generated' | 'failed' | 'cancelled'
  input: {
    imageId?: string
    instruction?: string
    packageType?: string
    dimensions?: Record<string, number>
  }
  edited?: Record<string, boolean>
  result?: {
    artifactId: string
    filename: string
    fileUrl?: string
    size?: number
  }
  error?: string
}

export interface HistoryPatch {
  status?: HistoryEntry['status']
  result?: HistoryEntry['result']
  error?: string
  edited?: Record<string, boolean>
}

export interface ComponentGenConfig {
  hostMode: boolean
  capabilities: { symbol: boolean; footprint: boolean }
  limits: { imageBytes: number }
}

export const COMPONENT_GEN_ROUTE_PREFIX = '/api/v1/huaqiu/component-gen'

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
