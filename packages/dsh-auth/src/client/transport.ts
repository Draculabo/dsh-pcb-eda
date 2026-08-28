/**
 * Browser→node credential transport over the plugin-owned webServer routes
 * (same-origin; no CORS, no external dependency). This is the chosen Phase 0A
 * browser→host channel — `apiProxy`'s dispatch table is closed, so a
 * plugin-owned `webServer` route is the smallest supported extension point.
 */
import type { AuthTokenPayload } from './lib.js'

export interface AuthTransport {
  pushSession(info: AuthTokenPayload): Promise<void>
  pushLogout(): Promise<void>
}

export function createWebServerAuthTransport(
  base: string = '/api/v1/huaqiu/auth',
  doFetch: typeof fetch = globalThis.fetch.bind(globalThis),
): AuthTransport {
  return {
    async pushSession(info) {
      const res = await doFetch(`${base}/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: info.token,
          userId: info.id,
          ...(info.nickname !== undefined ? { nickname: info.nickname } : {}),
        }),
      })
      if (!res.ok) throw new Error(`auth push failed: HTTP ${res.status}`)
    },
    async pushLogout() {
      const res = await doFetch(`${base}/logout`, { method: 'POST' })
      if (!res.ok) throw new Error(`auth logout push failed: HTTP ${res.status}`)
    },
  }
}
