/**
 * Plugin-update API client (browser half).
 *
 * Every call is a same-origin fetch against the DSH webServer prefix route
 * (`/api/v1/huaqiu/plugin-update/…`) which the node half forwards to hq-edge.
 * Response shapes mirror hq-edge `apps/server/src/routes/plugin-updates.ts`.
 *
 * @module
 */

export const UPDATE_BASE = '/api/v1/huaqiu/plugin-update'

export interface PluginUpdateItem {
  name: string
  /** Version installed in the active bundle; null when the plugin is absent. */
  currentVersion: string | null
  availableVersion: string
  state: 'current' | 'update' | 'install' | 'blocked' | 'ignored'
  /** The block reason, or null when the item is not blocked. The server sends a
   *  single code (`"runtime-unknown"`), so it is normalized before use. */
  blockedBy?: string | string[] | null
  ignored?: boolean
  reasons?: string[]
  notes?: string[]
}

export interface RuntimeUpdateInfo {
  configured: boolean
  currentVersion?: string | null
  latest?: string | null
  updateAvailable: boolean
  checkedAt?: string | null
  lastError?: string | null
}

export interface PluginUpdateReport {
  /** The evaluated release set; null while no manifest has been read. */
  manifestVersion: string | null
  pluginSetVersion?: string
  items: PluginUpdateItem[]
  actionableCount: number
  ignoredSet: boolean
  fetchedAt?: string
  lastError?: string | null
  runtime: RuntimeUpdateInfo
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${UPDATE_BASE}${path}`, {
    cache: 'no-store',
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => null)) as T | null
  if (!res.ok) {
    const err = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`
    throw new Error(err)
  }
  if (body === null) throw new Error('empty response')
  return body
}

/** GET the cached (or empty-shell) plugin-update report. */
export function fetchReport(): Promise<PluginUpdateReport> {
  return request<PluginUpdateReport>('/report')
}

/** POST an explicit refresh; returns the freshly computed report. */
export function checkUpdates(): Promise<PluginUpdateReport> {
  return request<PluginUpdateReport>('/check', { method: 'POST' })
}

export interface InstallResult {
  ok: boolean
  installedSetVersion?: string
  installed?: number
  skipped?: number
  restarting?: boolean
  error?: string
}

/** POST the install transaction for the confirmed set version. */
export function installSet(setVersion: string): Promise<InstallResult> {
  return request<InstallResult>('/install', {
    method: 'POST',
    body: JSON.stringify({ setVersion }),
  })
}

/** POST ignore for the current offer (set-scoped, persists across restarts). */
export function ignoreOffer(setVersion: string): Promise<unknown> {
  return request<unknown>('/ignore', { method: 'POST', body: JSON.stringify({ setVersion }) })
}

/** POST unignore for the set version (reverses an ignore). */
export function unignoreOffer(setVersion: string): Promise<unknown> {
  return request<unknown>('/unignore', { method: 'POST', body: JSON.stringify({ setVersion }) })
}
