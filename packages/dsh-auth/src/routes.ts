/**
 * HTTP adapter: receives the browser-pushed credentials and serves the node
 * auth state (probe / boot restore). Same-origin through `ctx.webServer`:
 *
 *   POST /api/v1/huaqiu/auth/session   body { token, userInfo? }  → cache set
 *   POST /api/v1/huaqiu/auth/logout                                → cache cleared
 *   GET  /api/v1/huaqiu/auth/session   → { authenticated, user }
 *
 * These routes are the browser→node transport for Phase 0A (start-p0.md §4:
 * smallest supported extension point — `apiProxy`'s dispatch table is closed,
 * so a plugin-owned `webServer` route is the documented channel).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { HuaqiuAuthService, HuaqiuUserInfo } from './service.js'

export const AUTH_ROUTE_PREFIX = '/api/v1/huaqiu/auth'

const MAX_SESSION_BODY_BYTES = 64 * 1024

export type AuthHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false

    req.on('data', (chunk: Buffer) => {
      if (tooLarge) {
        return
      }
      size += chunk.length
      if (size > MAX_SESSION_BODY_BYTES) {
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(tooLarge ? null : Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function normalizeUserInfo(data: Record<string, unknown>): HuaqiuUserInfo | null {
  const token = typeof data.token === 'string' && data.token.length > 0 ? data.token : null
  const id = typeof data.userId === 'string' && data.userId.length > 0
    ? data.userId
    : typeof data.userId === 'number' && Number.isFinite(data.userId) ? String(data.userId)
    : typeof data.id === 'string' && data.id.length > 0 ? String(data.id)
    : typeof data.id === 'number' && Number.isFinite(data.id) ? String(data.id)
    : null
  if (!token || !id) return null
  const nickname = typeof data.nickname === 'string' && data.nickname.length > 0 ? data.nickname : undefined
  return { id, token, ...(nickname ? { nickname } : {}) }
}

export function createAuthHandler(service: HuaqiuAuthService): AuthHandler {
  return async (req, res) => {
    try {
      const url = req.url ?? ''
      const q = url.indexOf('?')
      const pathname = (q >= 0 ? url.slice(0, q) : url).replace(/\/+$/, '')

      if (req.method === 'POST' && pathname === `${AUTH_ROUTE_PREFIX}/session`) {
        const rawBody = await readBody(req)
        if (rawBody === null) {
          sendJson(res, 413, { error: 'request body too large' })
          return
        }
        const body = JSON.parse(rawBody || '{}') as Record<string, unknown>
        const info = normalizeUserInfo(body)
        if (!info) {
          sendJson(res, 400, { error: 'token and userId are required' })
          return
        }
        service.setCredentials(info)
        sendJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && pathname === `${AUTH_ROUTE_PREFIX}/logout`) {
        service.invalidate()
        sendJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'GET' && pathname === `${AUTH_ROUTE_PREFIX}/session`) {
        const user = await service.auth.getUserInfo()
        const authenticated = service.auth.isAuthenticated()
        sendJson(res, 200, { authenticated, user })
        return
      }

      sendJson(res, 404, { error: 'not found' })
    } catch (err) {
      sendJson(res, 500, { error: 'internal error', detail: String(err) })
    }
  }
}
