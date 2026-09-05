/**
 * `@huaqiu/component-gen-app` — the single HTTP/SSE client implementing
 * `ComponentGenPorts` against the component-gen server API.
 *
 * The base is injectable: the DSH adapter points it at the same-origin
 * `/api/v1/huaqiu/component-gen` (plugin webServer route), the standalone
 * adapter points it at `http://localhost:<port>/api/v1/huaqiu/component-gen`.
 * No CORS needed in either case — generation is server-side and same-origin.
 */
import type {
  ComponentGenAuthPort,
  ComponentGenConfig,
  ComponentGenPorts,
  HistoryEntry,
  HistoryPage,
  HistoryPatch,
  HistoryQuery,
  JobEvent,
  JobState,
  StartJobRequest,
} from '../ports.js'

const DEFAULT_LIMITS = { imageBytes: 4 * 1024 * 1024 }

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string; detail?: unknown }
      if (body?.error) detail = body.error
      if (body?.detail) detail = `${detail}: ${String(body.detail)}`
    } catch {
      /* non-JSON error body — keep the status message */
    }
    throw new Error(detail)
  }
  return (await res.json()) as T
}

export interface HttpPortsOptions {
  /** component-gen API base, e.g. `/api/v1/huaqiu/component-gen`. */
  base: string
  /** artifacts API base, e.g. `/api/v1/huaqiu/artifacts` (same origin). */
  artifactsBase?: string
  doFetch?: typeof fetch
  auth?: ComponentGenAuthPort
}

/** The shared fetch client. */
export function createHttpPorts(options: HttpPortsOptions): ComponentGenPorts {
  const base = options.base.replace(/\/+$/, '')
  const doFetch = options.doFetch ?? globalThis.fetch.bind(globalThis)
  // Artifacts live under their own prefix on the same origin; derive it from
  // `base` unless the host overrides it.
  const artifactsBase = (options.artifactsBase ?? defaultArtifactsBase(base)).replace(/\/+$/, '')

  const url = (p: string): string => `${base}${p}`
  const artifactUrl = (p: string): string => `${artifactsBase}${p}`

  return {
    async config(): Promise<ComponentGenConfig> {
      const res = await doFetch(url('/config'), { headers: { accept: 'application/json' } })
      const cfg = await readJson<Partial<ComponentGenConfig>>(res)
      return {
        hostMode: cfg.hostMode ?? false,
        capabilities: cfg.capabilities ?? { symbol: true, footprint: true },
        limits: { ...DEFAULT_LIMITS, ...(cfg.limits ?? {}) },
      }
    },

    async startJob(req: StartJobRequest, signal?: AbortSignal): Promise<JobState> {
      const res = await doFetch(url('/jobs'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal,
      })
      if (res.status === 202) {
        const body = (await res.json()) as { jobId?: string }
        // Return a minimal queued JobState; the caller follows /jobs/:id.
        return {
          id: String(body.jobId ?? ''),
          kind: req.kind,
          status: 'queued',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      }
      return readJson<JobState>(res)
    },

    jobEvents(jobId: string, onEvent: (e: JobEvent) => void): () => void {
      const controller = new AbortController()
      const run = async (): Promise<void> => {
        try {
          const res = await doFetch(url(`/jobs/${encodeURIComponent(jobId)}/events`), {
            headers: { accept: 'text/event-stream' },
            signal: controller.signal,
          })
          if (!res.ok || !res.body) {
            onEvent({ type: 'failed', error: `events HTTP ${res.status}`, at: new Date().toISOString() })
            return
          }
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buf = ''
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            let idx: number
            while ((idx = buf.indexOf('\n\n')) >= 0) {
              const frame = buf.slice(0, idx)
              buf = buf.slice(idx + 2)
              const event = parseEvent(frame)
              if (event) onEvent(event)
            }
          }
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') return
          onEvent({ type: 'failed', error: String((err as Error)?.message || err), at: new Date().toISOString() })
        }
      }
      void run()
      return () => controller.abort()
    },

    async abortJob(jobId: string): Promise<void> {
      await doFetch(url(`/jobs/${encodeURIComponent(jobId)}`), { method: 'DELETE' })
    },

    async history(query: HistoryQuery): Promise<HistoryPage> {
      const params = new URLSearchParams()
      if (query.limit !== undefined) params.set('limit', String(query.limit))
      if (query.cursor) params.set('cursor', query.cursor)
      const qs = params.toString()
      const res = await doFetch(url(`/history${qs ? `?${qs}` : ''}`), { headers: { accept: 'application/json' } })
      return readJson<HistoryPage>(res)
    },

    async historyEntry(id: string): Promise<HistoryEntry | null> {
      const res = await doFetch(url(`/history/${encodeURIComponent(id)}`), { headers: { accept: 'application/json' } })
      if (res.status === 404) return null
      return readJson<HistoryEntry>(res)
    },

    async patchHistory(id: string, patch: HistoryPatch): Promise<HistoryEntry> {
      const res = await doFetch(url(`/history/${encodeURIComponent(id)}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      return readJson<HistoryEntry>(res)
    },

    async deleteHistory(id: string): Promise<void> {
      await doFetch(url(`/history/${encodeURIComponent(id)}`), { method: 'DELETE' })
    },

    async artifactContent(artifactId: string): Promise<string> {
      const res = await doFetch(artifactUrl(`/${encodeURIComponent(artifactId)}/content`), {
        headers: { accept: 'text/plain' },
      })
      if (!res.ok) throw new Error(`artifact content HTTP ${res.status}`)
      return res.text()
    },

    async inputImage(imageId: string): Promise<string> {
      const res = await doFetch(url(`/history/${encodeURIComponent(imageId)}/image`), {
        headers: { accept: 'image/*' },
      })
      if (!res.ok) throw new Error(`input image HTTP ${res.status}`)
      const blob = await res.blob()
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('failed to read input image'))
        reader.readAsDataURL(blob)
      })
    },

    auth: options.auth ?? createPassthroughAuth(),
  }
}

/** Derive the artifacts base from the component-gen base path. */
export function defaultArtifactsBase(componentGenBase: string): string {
  // /api/v1/huaqiu/component-gen → /api/v1/huaqiu/artifacts
  return componentGenBase.replace(/\/component-gen\/?$/, '/artifacts')
}

/** Parse one SSE frame (event: / data: lines) into a JobEvent. */
export function parseEvent(frame: string): JobEvent | null {
  let eventName = 'message'
  const dataLines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) eventName = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }
  const data = dataLines.join('\n')
  if (!data) return null
  try {
    const raw = JSON.parse(data) as JobEvent
    if (eventName !== 'message' && raw.type !== eventName) return null
    return raw
  } catch {
    return null
  }
}

/** Default auth port: optimistic (used when the host supplies no auth). */
function createPassthroughAuth(): ComponentGenAuthPort {
  return {
    async isAuthenticated() { return true },
    async getUserInfo() { return null },
    async login() { /* no-op */ },
    onAuthStateChanged() { return () => {} },
  }
}

/** Keep the exported type visible for adapters. */
export type { HistoryEntry, JobState }
