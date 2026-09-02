/**
 * Shared fetch stub for auth tests.
 *
 * `isAuthenticated()` now performs remote token validation, so tests that touch
 * the auth capability must never hit the real `www.eda.cn` network. This stub
 * routes the shared `fetchImpl` seam by URL:
 *
 *   - `.../api/token/validate`  → the Huaqiu token-validation endpoint
 *   - anything else             → the HQ Edge host route
 */
import { vi } from 'vitest'

export interface AuthFetchBehavior {
  /** Payload served on the HQ Edge host route (`null` → 401). */
  hostPayload?: Record<string, unknown> | null
  /** `result` value served on the token-validation endpoint. */
  validateResult?: boolean
  /** HTTP status served on the token-validation endpoint. */
  validateStatus?: number
  /** Throw on every request to simulate a network failure. */
  throwNetwork?: boolean
}

export function authFetch(behavior: AuthFetchBehavior = {}): typeof fetch {
  const {
    hostPayload = { token: 'host-tok', userId: 'host-u' },
    validateResult = true,
    validateStatus = 200,
    throwNetwork = false,
  } = behavior

  return vi.fn(async (input: RequestInfo | URL) => {
    if (throwNetwork) throw new Error('network unavailable')
    const url = String(input)
    if (url.includes('/api/token/validate')) {
      const ok = validateStatus >= 200 && validateStatus < 300
      return { ok, status: validateStatus, json: async () => ({ result: validateResult }) } as Response
    }
    if (hostPayload === null) {
      return { ok: false, status: 401, json: async () => ({}) } as Response
    }
    return { ok: true, status: 200, json: async () => hostPayload } as Response
  }) as unknown as typeof fetch
}
