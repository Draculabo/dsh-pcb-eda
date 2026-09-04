/**
 * `@huaqiu/component-gen-server` — HTTP routes for the component-gen API.
 *
 * Mounted by the DSH plugin on `ctx.webServer` (kind 'prefix',
 * `/api/v1/huaqiu/component-gen`) and by the standalone server. Route paths
 * are parsed from `req.url` manually (DSH `WebRoute` supports only exact /
 * prefix — no `:param`). CORS-free: everything is same-origin in both hosts.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ComponentGenBackend } from './backend.js'
import { HistoryStore, newImageId } from './history.js'
import { JobStore, runGeneration, type JobMeta } from './jobs.js'
import {
  COMPONENT_GEN_ROUTE_PREFIX, MAX_IMAGE_BYTES,
  type ComponentGenConfig, type HistoryPatch, type HistoryQuery, type JobEvent,
  type JobState, type StartJobRequest,
} from './types.js'

export interface ComponentGenHandlerDeps {
  backend: ComponentGenBackend
  history: HistoryStore
  hostMode?: boolean
  getAccessToken?: () => Promise<string | null>
}

export type ComponentGenHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function pathnameOf(url: string | undefined): string {
  const u = url ?? ''
  const q = u.indexOf('?')
  return (q >= 0 ? u.slice(0, q) : u).replace(/\/+$/, '')
}

function jsonBodyOf<T>(text: string): T {
  return JSON.parse(text || '{}') as T
}

/** Write one SSE frame and flush. */
function sse(res: ServerResponse, event: string, payload: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
}

function isFinal(status: JobState['status']): boolean {
  return status === 'needs_confirmation' || status === 'completed' || status === 'failed' || status === 'cancelled'
}

/** Map a current job state to its replay SSE event (or null when queued/running). */
function replayEventOf(state: JobState): JobEvent | null {
  if (state.status === 'needs_confirmation') {
    return { type: 'needs_confirmation', dimensions: state.dimensions ?? {}, pkgType: state.pkgType ?? null, fileName: state.fileName ?? null, at: state.updatedAt }
  }
  if (state.status === 'completed') return { type: 'completed', job: state, at: state.updatedAt }
  if (state.status === 'failed') return { type: 'failed', error: state.error ?? 'generation failed', result: state.result, at: state.updatedAt }
  if (state.status === 'cancelled') return { type: 'cancelled', at: state.updatedAt }
  return null
}

export function createComponentGenHandler(deps: ComponentGenHandlerDeps): ComponentGenHandler {
  const store = new JobStore()

  return async (req, res) => {
    const raw = pathnameOf(req.url)
    if (!raw.startsWith(COMPONENT_GEN_ROUTE_PREFIX)) {
      sendJson(res, 404, { error: 'not found' })
      return
    }
    const path = raw.slice(COMPONENT_GEN_ROUTE_PREFIX.length) || '/'
    const method = req.method ?? 'GET'

    try {
      // GET /config
      if (method === 'GET' && path === '/config') {
        const cfg: ComponentGenConfig = {
          hostMode: deps.hostMode === true,
          capabilities: { symbol: true, footprint: true },
          limits: { imageBytes: MAX_IMAGE_BYTES },
        }
        sendJson(res, 200, cfg)
        return
      }

      // POST /jobs
      if (method === 'POST' && path === '/jobs') {
        const body = jsonBodyOf<StartJobRequest>(await readBody(req))
        if (!body || (body.kind !== 'symbol' && body.kind !== 'extract-footprint' && body.kind !== 'generate-footprint')) {
          sendJson(res, 400, { error: 'invalid job kind (expected symbol | extract-footprint | generate-footprint)' })
          return
        }
        const input = body.input ?? {}
        if (input.imageDataUrl && input.imageDataUrl.length > MAX_IMAGE_BYTES) {
          sendJson(res, 413, { error: 'image too large', detail: `max ${MAX_IMAGE_BYTES} bytes` })
          return
        }
        const meta: JobMeta = {}
        if (input.imageDataUrl) {
          const imageId = newImageId()
          await deps.history.saveImage(imageId, input.imageDataUrl)
          meta.imageId = imageId
        }
        const state = store.create({ kind: body.kind, input }, meta)
        void runGeneration(store, deps.backend, deps.history, state.id, { kind: body.kind, input }, meta).catch((err) => {
          console.warn('[component-gen] background run failed', String((err as Error)?.message || err))
        })
        res.writeHead(202, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ jobId: state.id }))
        return
      }

      // GET /jobs/:id
      const jobGet = /^\/jobs\/([^/]+)$/.exec(path)
      if (method === 'GET' && jobGet) {
        const state = store.get(jobGet[1]!)
        if (!state) { sendJson(res, 404, { error: 'job not found' }); return }
        sendJson(res, 200, state)
        return
      }

      // GET /jobs/:id/events (SSE)
      const jobEvents = /^\/jobs\/([^/]+)\/events$/.exec(path)
      if (method === 'GET' && jobEvents) {
        const id = jobEvents[1]!
        const state = store.get(id)
        if (!state) { sendJson(res, 404, { error: 'job not found' }); return }
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        })
        res.write(': ok\n\n')

        // Replay current state first (covers jobs that finished pre-subscribe).
        const replay = replayEventOf(state)
        if (replay) sse(res, replay.type, replay)
        if (isFinal(state.status)) {
          res.end()
          return
        }

        const unsub = store.subscribe(id, (e) => {
          sse(res, e.type, e)
          if (e.type === 'needs_confirmation' || e.type === 'completed' || e.type === 'failed' || e.type === 'cancelled') {
            unsub?.()
            res.end()
          }
        })
        req.on('close', () => unsub?.())
        return
      }

      // DELETE /jobs/:id
      const jobDel = /^\/jobs\/([^/]+)$/.exec(path)
      if (method === 'DELETE' && jobDel) {
        const ok = store.abort(jobDel[1]!)
        sendJson(res, ok ? 200 : 404, { ok })
        return
      }

      // GET /history
      if (method === 'GET' && path === '/history') {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const query: HistoryQuery = {
          limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
          cursor: url.searchParams.get('cursor'),
        }
        sendJson(res, 200, await deps.history.list(query))
        return
      }

      // GET /history/:imageId/image
      // `:imageId` is the stored thumbnail id (`img_…`), not a history entry
      // id — the client's `ports.inputImage` sends it directly.
      const histImage = /^\/history\/([^/]+)\/image$/.exec(path)
      if (method === 'GET' && histImage) {
        const img = await deps.history.readImage(histImage[1]!)
        if (!img) { sendJson(res, 404, { error: 'image not found' }); return }
        res.writeHead(200, { 'content-type': img.mime, 'cache-control': 'public, max-age=3600' })
        res.end(Buffer.from(img.bytes))
        return
      }

      // GET /history/:id
      const histGet = /^\/history\/([^/]+)$/.exec(path)
      if (method === 'GET' && histGet) {
        const entry = await deps.history.get(histGet[1]!)
        if (!entry) { sendJson(res, 404, { error: 'history not found' }); return }
        sendJson(res, 200, entry)
        return
      }

      // PATCH /history/:id
      const histPatch = /^\/history\/([^/]+)$/.exec(path)
      if (method === 'PATCH' && histPatch) {
        const patch = jsonBodyOf<HistoryPatch>(await readBody(req))
        const entry = await deps.history.patch(histPatch[1]!, patch)
        if (!entry) { sendJson(res, 404, { error: 'history not found' }); return }
        sendJson(res, 200, entry)
        return
      }

      // DELETE /history/:id
      const histDel = /^\/history\/([^/]+)$/.exec(path)
      if (method === 'DELETE' && histDel) {
        await deps.history.delete(histDel[1]!)
        sendJson(res, 200, { ok: true })
        return
      }

      sendJson(res, 404, { error: 'not found' })
    } catch (err) {
      sendJson(res, 500, { error: 'internal error', detail: String(err) })
    }
  }
}
