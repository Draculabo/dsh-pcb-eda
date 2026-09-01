/**
 * Node-side `huaqiuAuth` service.
 *
 * Holds the credential used by the tools (`getAccessToken()` → `x-user-token`,
 * `getUserInfo()` → `x-user-id`). Two sources feed it:
 *
 *  - **pushed** — the browser half owns the login flow (auth.eda.cn iframe +
 *    postMessage) and pushes credentials over a plugin-owned `webServer` route
 *    (`setCredentials`).
 *  - **host** — when HQ Edge is the host, the node half fetches the operator
 *    token directly from HQ Edge's loopback route (host mode, `src/host.ts`).
 *
 * `huaqiuAuth.auth` is a capability (`isAuthenticated`/`getAccessToken`/
 * `getUserInfo`), NOT a promise that the browser and node tokens are the same
 * value (migration plan review #7).
 *
 * Resolution order inside `getUserInfo()` (spec §6.2):
 *   1. host session   — HQ Edge configured → fetch + cache (TTL)
 *   2. pushed session — what the browser half sent
 *   3. persisted file — `~/.dsh/auth/session.json`, written on every set
 *   4. null           → tools return needs_auth
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import {
  HostSessionResolver,
  resolveHostConfig,
  type HuaqiuAuthConfig,
  type ResolvedHostUser,
} from './host.js'

export interface HuaqiuUserInfo {
  id: string
  token: string
  nickname?: string
}

export interface HuaqiuAuthApi {
  isAuthenticated(): boolean
  getAccessToken(): Promise<string | null>
  getUserInfo(): Promise<HuaqiuUserInfo | null>
  /** Node-side no-op: login always happens in the browser. */
  login(): Promise<void>
  logout(): Promise<void>
  onAuthStateChanged(listener: (info: HuaqiuUserInfo | null) => void): () => void
}

export interface HuaqiuAuthService {
  auth: HuaqiuAuthApi
  /** Node-only setters used by the webServer route handlers. */
  setCredentials(info: HuaqiuUserInfo): void
  invalidate(): void
}

const PERSIST_FILE = 'session.json'
const PERSIST_DIR = () => dshHomePath('auth')

/**
 * Returns the persisted session, or null if absent/unreadable. Best-effort: a
 * corrupt or unreadable file is treated as "no session" rather than thrown.
 */
function readPersisted(): HuaqiuUserInfo | null {
  try {
    const file = join(PERSIST_DIR(), PERSIST_FILE)
    if (!existsSync(file)) return null
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : null
    const token = typeof raw.token === 'string' && raw.token.length > 0 ? raw.token : null
    if (!id || !token) return null
    const nickname = typeof raw.nickname === 'string' && raw.nickname.length > 0
      ? raw.nickname
      : undefined
    return { id, token, ...(nickname ? { nickname } : {}) }
  } catch {
    return null
  }
}

function writePersisted(info: HuaqiuUserInfo): void {
  try {
    const dir = PERSIST_DIR()
    mkdirSync(dir, { recursive: true })
    const file = join(dir, PERSIST_FILE)
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(info), 'utf8')
    renameSync(tmp, file)
  } catch {
    /* persistence is best-effort; never break the auth flow over a disk error */
  }
}

function deletePersisted(): void {
  try {
    const file = join(PERSIST_DIR(), PERSIST_FILE)
    if (existsSync(file)) rmSync(file, { force: true })
  } catch {
    /* best-effort */
  }
}

export class InMemoryHuaqiuAuthService implements HuaqiuAuthService {
  private current: HuaqiuUserInfo | null = null
  private listeners = new Set<(info: HuaqiuUserInfo | null) => void>()
  private readonly host: HostSessionResolver

  constructor(
    config?: Partial<HuaqiuAuthConfig> | null,
    opts?: { fetchImpl?: typeof fetch },
  ) {
    const resolved = resolveHostConfig(config)
    this.host = new HostSessionResolver(
      resolved.hqEdgeBaseUrl ?? '',
      resolved.hostAuthPath ?? '/api/v1/auth/token',
      (resolved.hostSessionTtlSeconds ?? 300) * 1000,
      opts?.fetchImpl,
    )
  }

  readonly auth: HuaqiuAuthApi = {
    isAuthenticated: () => this.host.enabled || this.current !== null || readPersisted() !== null,
    getAccessToken: async () => (await this.resolve())?.token ?? null,
    getUserInfo: async () => this.resolve(),
    login: async () => {
      /* login is a browser action */
    },
    logout: async () => this.invalidate(),
    onAuthStateChanged: (listener) => this.on(listener),
  }

  /** Spec §6.2 resolution order: host → pushed → persisted → null. */
  private async resolve(): Promise<HuaqiuUserInfo | null> {
    if (this.host.enabled) {
      const host = await this.host.resolve()
      if (host) return toUserInfo(host)
    }
    if (this.current) return this.current
    return readPersisted()
  }

  setCredentials(info: HuaqiuUserInfo): void {
    this.current = info
    void writePersisted(info)
    this.emit()
  }

  invalidate(): void {
    const was = this.host.enabled || this.current !== null || readPersisted() !== null
    this.current = null
    this.host.clear()
    deletePersisted()
    if (was) this.emit()
  }

  private on(listener: (info: HuaqiuUserInfo | null) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    const snapshot = this.current
    for (const listener of this.listeners) listener(snapshot)
  }
}

function toUserInfo(host: ResolvedHostUser): HuaqiuUserInfo {
  return {
    id: host.id,
    token: host.token,
    ...(host.nickname !== undefined ? { nickname: host.nickname } : {}),
  }
}
