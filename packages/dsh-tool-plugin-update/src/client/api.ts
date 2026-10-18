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

/**
 * One downloadable HQ Edge runtime distribution, as hq-edge reports it
 * (`RuntimeUpdateEntry` in `apps/server/src/dsh/PluginUpdateService.ts`).
 *
 * Note the shape: `runtime.latest` is this ENTRY OBJECT, not a bare version
 * string. Reading it as a string is what once rendered "[object Object]".
 */
export interface RuntimeUpdateEntry {
  /** Clean SemVer of the available distribution. */
  version: string
  /** SHA-512 of the release archive, lowercase hex (128 chars). */
  hash: string
  /** Platform the archive targets: win | darwin | linux | all. */
  platform: string
  /** Optional CPU architecture: x64 | arm64 (absent = any). */
  arch?: string
  /** Exact absolute HTTPS URL of the release archive. */
  url: string
}

export interface RuntimeUpdateInfo {
  configured: boolean
  currentVersion?: string | null
  /** The latest compatible distribution, or null when the manifest had none. */
  latest?: RuntimeUpdateEntry | null
  updateAvailable: boolean
  checkedAt?: string | null
  lastError?: string | null
}

/**
 * The latest runtime version to display, or null when there is none.
 *
 * hq-edge sends the full release entry; an older or future server could send
 * a bare string. Both are accepted here so the facts row can never again fall
 * back to `String(object)` — i.e. "[object Object]" — in the DOM.
 */
export function runtimeLatestVersion(
  runtime: RuntimeUpdateInfo | null | undefined,
): string | null {
  const latest: unknown = runtime?.latest
  if (typeof latest === 'string') return latest.length > 0 ? latest : null
  if (latest !== null && typeof latest === 'object' && 'version' in latest) {
    const version = (latest as { version?: unknown }).version
    if (typeof version === 'string' && version.length > 0) return version
  }
  return null
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

/**
 * The outcome of a user-confirmed HQ Edge runtime update.
 *
 * hq-edge answers `202 { requestId, targetVersion, state: 'accepted' }` and
 * then shuts itself down for the EDA host to swap the runtime, so a success
 * here means "accepted", not "installed". Failures arrive as 409 (already
 * updating → `busy`), 422 (preflight/manifest/download refused) or 503.
 */
export interface RuntimeUpdateRequestResult {
  requestId?: string
  targetVersion?: string
  state?: string
  ok?: boolean
  error?: string
  busy?: boolean
}

/** POST the user-confirmed HQ Edge runtime update for one target version. */
export function requestRuntimeUpdate(
  targetVersion: string,
): Promise<RuntimeUpdateRequestResult> {
  return request<RuntimeUpdateRequestResult>('/runtime-request', {
    method: 'POST',
    body: JSON.stringify({ targetVersion }),
  })
}

/** POST unignore for the set version (reverses an ignore). */
export function unignoreOffer(setVersion: string): Promise<unknown> {
  return request<unknown>('/unignore', { method: 'POST', body: JSON.stringify({ setVersion }) })
}
