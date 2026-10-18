/**
 * Same-origin forwarding routes for the plugin-update UI (browser half).
 *
 * Browser → DSH webServer prefix route `/api/v1/huaqiu/plugin-update/…` →
 * this handler → hq-edge loopback HTTP API `/api/v1/plugin-updates/…`.
 *
 * The forwarding is a THIN adapter: hq-edge owns discovery, compatibility,
 * ignore persistence and the install transaction (with its loopback-only
 * protection — every request below originates from this node process on the
 * same host, so the loopback guard is satisfied naturally). This plugin
 * carries no update logic and no `@hqedge/*` dependency.
 *
 * Routes (mirroring hq-edge apps/server/src/routes/plugin-updates.ts):
 *   GET  /plugin-update/report   → GET  /api/v1/plugin-updates
 *   POST /plugin-update/check    → POST /api/v1/plugin-updates/check
 *   POST /plugin-update/install  → POST /api/v1/plugin-updates/install {setVersion}
 *   POST /plugin-update/ignore   → POST /api/v1/plugin-updates/ignore {setVersion}
 *   POST /plugin-update/unignore → POST /api/v1/plugin-updates/unignore {setVersion}
 *   GET  /plugin-update/runtime  → GET  /api/v1/runtime-update
 *   POST /plugin-update/runtime-request
 *                                → POST /api/v1/runtime-update/request {targetVersion}
 *
 * The runtime-update request is user-confirmed in this plugin's review panel:
 * hq-edge validates the version against a fresh manifest, downloads and
 * verifies the bundle, stages it, then hands it to the EDA host and answers
 * `202 Accepted` before shutting itself down to be swapped and relaunched.
 *
 * @module
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

export const UPDATE_ROUTE_PREFIX = '/api/v1/huaqiu/plugin-update'

/** End-to-end budget for one forwarded request, in milliseconds. */
export const DEFAULT_FORWARD_TIMEOUT_MS = 30_000

/**
 * Budget for `POST /runtime-update/request` — deliberately far larger than
 * {@link DEFAULT_FORWARD_TIMEOUT_MS}.
 *
 * This route is not a quick RPC. Before it answers, hq-edge re-reads the
 * update manifest, downloads the entire runtime bundle (hundreds of MB),
 * verifies its SHA-512, extracts it into the shared staging root and validates
 * the layout + version stamp. Measured end-to-end against a local update
 * server: 56 s (16:49:49 → 16:50:45).
 *
 * Under the generic 30 s budget the forwarder aborts mid-flight and answers
 * `504 hq-edge request timed out after 30000ms`, so the panel reports a failure
 * for an update that is still running perfectly well — and which then goes on
 * to complete, swap the runtime and restart HQ Edge underneath the error toast.
 */
export const RUNTIME_REQUEST_TIMEOUT_MS = 600_000

export type BaseUrlResolver = () => string | undefined

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Split the sub-path off the prefix. Returns null on a bad shape. */
function parsePath(req: IncomingMessage): string | null {
  const url = req.url ?? ''
  const q = url.indexOf('?')
  const pathname = q >= 0 ? url.slice(0, q) : url
  if (!pathname.startsWith(UPDATE_ROUTE_PREFIX)) return null
  return pathname.slice(UPDATE_ROUTE_PREFIX.length)
}

/** Read the request body (bounded) as UTF-8 text. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * Map a sub-path to { method, path } on the hq-edge API.
 *
 * `timeoutMs` overrides {@link DEFAULT_FORWARD_TIMEOUT_MS} for routes whose
 * upstream work legitimately outlasts it (only `/runtime-request` today).
 */
function routeFor(sub: string): { method: string; path: string; timeoutMs?: number } | null {
  if (sub === '/report' || sub === '') {
    return { method: 'GET', path: '/api/v1/plugin-updates' }
  }
  if (sub === '/runtime') {
    return { method: 'GET', path: '/api/v1/runtime-update' }
  }
  if (sub === '/runtime-request') {
    return {
      method: 'POST',
      path: '/api/v1/runtime-update/request',
      timeoutMs: RUNTIME_REQUEST_TIMEOUT_MS,
    }
  }
  if (sub === '/check') return { method: 'POST', path: '/api/v1/plugin-updates/check' }
  if (sub === '/install') return { method: 'POST', path: '/api/v1/plugin-updates/install' }
  if (sub === '/ignore') return { method: 'POST', path: '/api/v1/plugin-updates/ignore' }
  if (sub === '/unignore') return { method: 'POST', path: '/api/v1/plugin-updates/unignore' }
  return null
}

/** Create the prefix-route handler forwarding to hq-edge. */
export function createUpdateForwarder(
  baseUrlResolver: BaseUrlResolver,
  timeoutMs: number = DEFAULT_FORWARD_TIMEOUT_MS,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const sub = parsePath(req)
    if (sub === null) {
      sendJson(res, 404, { error: 'not found' })
      return
    }
    const target = routeFor(sub)
    if (target === null) {
      sendJson(res, 404, { error: 'not found' })
      return
    }
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'method not allowed' })
      return
    }
    const base = (baseUrlResolver() ?? '').replace(/\/+$/, '')
    if (base.length === 0) {
      sendJson(res, 503, { error: 'hq-edge is not reachable from this plugin (no base URL)' })
      return
    }
    let body = ''
    if (req.method === 'POST') {
      try {
        body = await readBody(req)
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) })
        return
      }
    }
    const budget = target.timeoutMs ?? timeoutMs
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), budget)
    try {
      const upstream = await fetch(`${base}${target.path}`, {
        method: target.method,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'user-agent': 'hq-edge-dsh-tool-plugin-update/0.5.21',
        },
        ...(body.length > 0 ? { body } : {}),
        signal: controller.signal,
      })
      const upstreamBody = await upstream.text()
      let json: unknown = null
      try {
        json = JSON.parse(upstreamBody)
      } catch {
        json = { raw: upstreamBody.slice(0, 512) }
      }
      sendJson(res, upstream.status, json)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (err instanceof Error && err.name === 'AbortError') {
        sendJson(res, 504, { error: `hq-edge request timed out after ${budget}ms` })
        return
      }
      sendJson(res, 502, { error: `hq-edge request failed: ${message}` })
    } finally {
      clearTimeout(timer)
    }
  }
}
