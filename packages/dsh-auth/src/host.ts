/**
 * HQ Edge host mode for `dsh-auth`.
 *
 * In standalone DSH, credentials arrive only when the user logs in through the
 * browser (auth.eda.cn iframe → postMessage → `webServer` route →
 * `setCredentials`). That means the node half is empty until a browser tab
 * focuses the card, and every tool returns `needs_auth` in the gap — including
 * across a process restart (the in-memory cache is gone).
 *
 * Host mode removes that gap. When HQ Edge is the host, it already holds the
 * operator-supplied token + user id, and exposes them on a loopback route. The
 * node half fetches them on boot and is authoritative immediately, without
 * waiting for a browser. The browser half is untouched — host mode is *mode*,
 * not API (spec §5/§14).
 *
 * Resolution order inside `getUserInfo()` (spec §6.2):
 *   1. host session   — HQ Edge configured → fetch + cache (TTL)
 *   2. pushed session — what the browser half sent (today's behaviour)
 *   3. persisted file — node-side `~/.dsh/auth/session.json`, written on every set
 *   4. null           → tools return needs_auth
 */

export interface HuaqiuAuthConfig {
  /** HQ Edge base URL, e.g. "http://localhost:18080". Absent → standalone. */
  hqEdgeBaseUrl?: string
  /** Path on the host; default "/api/v1/auth/token". */
  hostAuthPath?: string
  /** Seconds a host session is reused before re-fetching. Default 300. */
  hostSessionTtlSeconds?: number
}

export const DEFAULT_HOST_AUTH_PATH = '/api/v1/auth/token'
export const DEFAULT_HOST_TTL_SECONDS = 300

/**
 * Resolve the effective config: overlay `config` (highest) > env (safety net
 * for non-supervisor installs) > defaults. Centralised here so only `dsh-auth`
 * inspects these variables (spec §8).
 */
export function resolveHostConfig(
  config?: Partial<HuaqiuAuthConfig> | null,
  env: NodeJS.ProcessEnv = process.env,
): HuaqiuAuthConfig {
  const baseUrl = config?.hqEdgeBaseUrl
    ?? env.HQ_EDGE_BASE_URL
    ?? ''
  const hostAuthPath = config?.hostAuthPath
    ?? env.HQ_EDGE_AUTH_PATH
    ?? DEFAULT_HOST_AUTH_PATH
  const ttlRaw = config?.hostSessionTtlSeconds ?? env.HQ_EDGE_HOST_TTL_SECONDS
  let ttl = DEFAULT_HOST_TTL_SECONDS
  if (typeof ttlRaw === 'number' && Number.isFinite(ttlRaw) && ttlRaw > 0) {
    ttl = ttlRaw
  } else if (typeof ttlRaw === 'string' && ttlRaw.trim().length > 0) {
    const parsed = Number(ttlRaw.trim())
    if (Number.isFinite(parsed) && parsed > 0) {
      ttl = parsed
    }
  }
  return { hqEdgeBaseUrl: baseUrl, hostAuthPath, hostSessionTtlSeconds: ttl }
}

export interface HostSession {
  info: ResolvedHostUser
  fetchedAt: number
}

export interface ResolvedHostUser {
  id: string
  token: string
  nickname?: string
}

/**
 * Fetches and caches the host (HQ Edge) session. The cache is memory-only with a
 * TTL; the loopback GET is cheap and the token is static, so we never persist it.
 */
export class HostSessionResolver {
  private cache: HostSession | null = null

  constructor(
    readonly baseUrl: string,
    readonly path: string,
    readonly ttlMs: number,
    private readonly doFetch: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  /** Host mode is active iff a base URL was configured. */
  get enabled(): boolean {
    return this.baseUrl.length > 0
  }

  async resolve(): Promise<ResolvedHostUser | null> {
    if (!this.enabled) return null
    const now = Date.now()
    if (this.cache !== null && now - this.cache.fetchedAt < this.ttlMs) {
      return this.cache.info
    }
    try {
      const res = await this.doFetch(`${this.baseUrl}${this.path}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
      })
      if (!res.ok) return this.cache?.info ?? null
      const data = await res.json() as Record<string, unknown>
      const info = normalizeHostUser(data)
      if (!info) return this.cache?.info ?? null
      this.cache = { info, fetchedAt: now }
      return info
    } catch {
      // Network error: fall back to a previously cached value if we have one.
      return this.cache?.info ?? null
    }
  }

  /** Drop the cached value so the next `resolve()` re-fetches (reactive invalidation). */
  clear(): void {
    this.cache = null
  }
}

function asId(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.length > 0) return raw
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  return null
}

/** Parse the host route payload into a credential, tolerating key-name drift. */
export function normalizeHostUser(data: Record<string, unknown>): ResolvedHostUser | null {
  const token = typeof data.token === 'string' && data.token.length > 0
    ? data.token
    : null
  const id = asId(data.userId)
    ?? asId(data.id)
    ?? asId(data.user_id)
  if (!token || !id) return null
  const nickname = typeof data.nickname === 'string' && data.nickname.length > 0
    ? data.nickname
    : undefined
  return { id, token, ...(nickname ? { nickname } : {}) }
}
