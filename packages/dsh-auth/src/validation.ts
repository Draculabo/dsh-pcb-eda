/**
 * Token validation for `@huaqiu/dsh-auth`.
 *
 * Single authoritative validation path shared by standalone (auth.eda.cn) and
 * HQ Edge host credentials. Uses the existing Huaqiu endpoint
 *
 *   GET https://www.eda.cn/api/token/validate?token=<token>
 *   → { code, message, result: boolean }
 *
 * (the same endpoint consumed by `NextChat/app/auth/is_token_valid.ts`; probe:
 *   `curl "https://www.eda.cn/api/token/validate?token=__dummy__"` → 200
 *   `{"code":200000,"message":"success","result":false}`).
 *
 * Local expiry is a cheap pre-check only (never authoritative). Remote
 * validation is authoritative, short-lived in-memory cached, and never
 * persisted. Network / 5xx failures are reported as `unavailable` — they are
 * NOT converted into "token invalid", so a transient network blip never forces
 * the user to log in again.
 */
/**
 * Outcome of an authoritative token validation.
 *
 * - `valid`       — the Huaqiu API accepted the token.
 * - `invalid`     — the token is definitively rejected/expired.
 * - `unavailable` — validation could not be performed (network/5xx); the token
 *                   is NOT declared invalid (spec §17/§18).
 */
export type AuthValidationResult =
  | { status: 'valid'; userId?: string; expiresAt?: number }
  | { status: 'invalid'; reason: 'expired' | 'unauthorized' | 'forbidden' | 'invalid' }
  | { status: 'unavailable'; error: Error }

/** Default remote validation TTL — spec §8 (30–60s); 60s chosen. */
export const DEFAULT_VALIDATION_TTL_MS = 60_000
/** Existing Huaqiu token-validation endpoint (see header). */
export const DEFAULT_VALIDATE_URL = 'https://www.eda.cn/api/token/validate'

export interface TokenValidatorOptions {
  /** Remote-validation cache TTL in ms. Default `DEFAULT_VALIDATION_TTL_MS`. */
  ttlMs?: number
  /** Validation endpoint. Default `DEFAULT_VALIDATE_URL`. */
  validateUrl?: string
  /** Injectable fetch (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** Injectable clock (tests). Defaults to Date.now. */
  now?: () => number
}

interface ValidationCacheEntry {
  result: AuthValidationResult
  at: number
}

/**
 * Classifies the HTTP status of the validation request.
 *
 * 401 → unauthorized; 403 → forbidden; any other non-ok status (incl. 5xx) →
 * unavailable. A 2xx body of `{ result: false }` → unauthorized (the endpoint
 * does not distinguish expired vs revoked, so we use the generic
 * `unauthorized` reason; local expiry is the only source of `expired`).
 */
function classifyStatus(status: number): AuthValidationResult {
  if (status === 401) return { status: 'invalid', reason: 'unauthorized' }
  if (status === 403) return { status: 'invalid', reason: 'forbidden' }
  return { status: 'unavailable', error: new Error(`token validation HTTP ${status}`) }
}

export class TokenValidator {
  private readonly ttlMs: number
  private readonly validateUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  /** token → { result, at }; in-memory only, never persisted (spec §8). */
  private readonly cache = new Map<string, ValidationCacheEntry>()
  /** token → in-flight promise; coalesces concurrent validate() calls (§16). */
  private readonly inFlight = new Map<string, Promise<AuthValidationResult>>()

  constructor(options: TokenValidatorOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_VALIDATION_TTL_MS
    this.validateUrl = options.validateUrl ?? DEFAULT_VALIDATE_URL
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.now = options.now ?? (() => Date.now())
  }

  /**
   * Cheap local expiry check — an optimization, not authoritative validation.
   * Unknown expiry ⇒ not assumed invalid (spec §6).
   */
  isLocallyExpired(expiresAt?: number): boolean {
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return false
    return expiresAt * 1000 <= this.now()
  }

  /**
   * Validate a token. Cached within TTL; a single in-flight request is shared
   * by concurrent callers. Never treats a network failure as "invalid".
   */
  async validate(token: string, session?: { expiresAt?: number }): Promise<AuthValidationResult> {
    if (!token) return { status: 'invalid', reason: 'invalid' }

    // Local expiry first — no remote call (spec §6/§7).
    if (this.isLocallyExpired(session?.expiresAt)) {
      this.cache.delete(token)
      return { status: 'invalid', reason: 'expired' }
    }

    // Fresh cache hit within TTL.
    const cached = this.cache.get(token)
    if (cached && this.now() - cached.at < this.ttlMs) {
      return cached.result
    }

    // Reuse an in-flight request instead of stacking duplicates (§16).
    const inFlight = this.inFlight.get(token)
    if (inFlight) return inFlight

    const promise = this.validateRemotely(token)
    this.inFlight.set(token, promise)
    try {
      const result = await promise
      this.cache.set(token, { result, at: this.now() })
      return result
    } finally {
      this.inFlight.delete(token)
    }
  }

  /** Drop cached/in-flight validation for a token (or all when omitted). */
  invalidate(token?: string): void {
    if (token === undefined) {
      this.cache.clear()
      this.inFlight.clear()
      return
    }
    this.cache.delete(token)
    this.inFlight.delete(token)
  }

  /** Resolve a currently-cached result (no remote call), or null. */
  peek(token: string): AuthValidationResult | null {
    const cached = this.cache.get(token)
    if (!cached) return null
    if (this.now() - cached.at >= this.ttlMs) {
      this.cache.delete(token)
      return null
    }
    return cached.result
  }

  private async validateRemotely(token: string): Promise<AuthValidationResult> {
    const url = new URL(this.validateUrl)
    url.searchParams.set('token', token)
    let res: Response
    try {
      res = await this.fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
      })
    } catch (err) {
      // Network failure — NOT "token invalid" (spec §17). Do not force a login
      // merely because the network is temporarily unavailable.
      return { status: 'unavailable', error: err as Error }
    }

    if (!res.ok) return classifyStatus(res.status)

    let body: unknown
    try {
      body = await res.json()
    } catch (err) {
      return { status: 'unavailable', error: new Error(`token validation: unparseable response (${String(err)})`) }
    }

    const result = typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>).result
      : undefined
    if (result === true) {
      return { status: 'valid' }
    }
    // 2xx but the token is not accepted (`result` missing/false).
    return { status: 'invalid', reason: 'unauthorized' }
  }
}
