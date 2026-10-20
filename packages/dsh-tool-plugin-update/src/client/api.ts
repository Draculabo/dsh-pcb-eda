/**
 * Plugin-update API client (browser half).
 *
 * Every call is a same-origin fetch against the DSH webServer prefix route
 * (`/api/v1/huaqiu/plugin-update/…`) which the node half forwards to hq-edge.
 * Response shapes mirror hq-edge `apps/server/src/routes/plugin-updates.ts`.
 *
 * @module
 */
import { normalizePluginUpdateReport } from './version.js'

export const UPDATE_BASE = '/api/v1/huaqiu/plugin-update'

export interface PluginUpdateItem {
  name: string
  /** Version installed in the active bundle; null when the plugin is absent. */
  currentVersion: string | null
  availableVersion: string
  /**
   * Server state. `update` is re-checked on arrival against the SemVer
   * direction rule (`version.ts`): an offer that is not strictly newer than
   * `currentVersion` is demoted to `current`, so the panel and the badge can
   * never offer a downgrade even against an older hq-edge.
   */
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
  /** SHA-256 of the release archive, lowercase hex (64 chars). */
  sha256: string
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
  /**
   * Where the runtime-update manifest is read from. Optional: an older hq-edge
   * does not send it, and the panel must degrade to a read-only source row.
   */
  source?: RuntimeUpdateSource
}

/**
 * The runtime-update manifest source, editable from this panel.
 *
 * `origin` says which URL is in effect: `override` is a URL the user set here
 * (persisted by hq-edge per host), `config` is the packaged/env default, and
 * `unset` means runtime updates are not configured at all.
 */
export interface RuntimeUpdateSource {
  /** The manifest URL currently in effect; empty when none is known. */
  url: string
  origin: 'override' | 'config' | 'unset'
  /** The URL configuration supplies, independent of any user override. */
  configuredUrl: string
  /** True when a user override is shadowing the configured URL. */
  override: boolean
}

/**
 * The plugin release-manifest source (the gitee
 * `plugins-release-manifest.json` by default) — same shape and same edit flow
 * as {@link RuntimeUpdateSource}, because hq-edge serves both from one shared
 * type.
 */
export type PluginUpdateSource = RuntimeUpdateSource

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
  /**
   * Where the plugin release manifest is read from. Optional: an older
   * hq-edge does not send it, and the panel must degrade to no source row.
   */
  pluginSource?: PluginUpdateSource
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
  return request<PluginUpdateReport>('/report').then(normalizePluginUpdateReport)
}

/** POST an explicit refresh; returns the freshly computed report. */
export function checkUpdates(): Promise<PluginUpdateReport> {
  return request<PluginUpdateReport>('/check', { method: 'POST' }).then(normalizePluginUpdateReport)
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

/**
 * GET the runtime-update manifest source: the URL in effect, its origin
 * (`override` | `config` | `unset`) and the configured URL behind it.
 *
 * Read-only upstream, so this is open like `/report` — only the mutation
 * below is loopback-guarded (and reaches it same-origin anyway).
 */
export function getRuntimeUpdateSource(): Promise<RuntimeUpdateSource> {
  return request<RuntimeUpdateSource>('/runtime-source')
}

/**
 * POST a new runtime-update manifest URL, or `""` to clear a user override
 * and fall back to the configured URL.
 *
 * hq-edge validates the URL itself (`https` required except for loopback, no
 * embedded credentials) and answers 422 with a message meant for a person —
 * this client surfaces it verbatim rather than pre-validating, so the rule
 * lives in exactly one place. A successful answer is the NEW source; the
 * caller must then re-run discovery, because the cached report still names
 * the old manifest's offer.
 */
export function setRuntimeUpdateSource(url: string): Promise<RuntimeUpdateSource> {
  return request<RuntimeUpdateSource>('/runtime-source', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

/**
 * GET the plugin release-manifest source: the URL discovery reads, its origin
 * (`override` | `config` | `unset`) and the configured URL behind it. Same
 * open/read-only contract as the runtime source.
 */
export function getPluginUpdateSource(): Promise<PluginUpdateSource> {
  return request<PluginUpdateSource>('/plugin-source')
}

/**
 * POST a new plugin release-manifest URL, or `""` to clear a user override.
 *
 * hq-edge persists the override per host AND re-runs discovery in the
 * background, so the next report (and the sidebar badge) already reflect the
 * new manifest. This client still re-checks explicitly after a save — the
 * background pass is a safety net for other consumers, not a substitute.
 */
export function setPluginUpdateSource(url: string): Promise<PluginUpdateSource> {
  return request<PluginUpdateSource>('/plugin-source', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}
