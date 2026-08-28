/**
 * `@huaqiu/dsh-tool-schematic-gen` — CopilotKit SSE consumption and the
 * export-zip POST (dependency-free; `fetch` is injected).
 *
 * @module @huaqiu/dsh-tool-schematic-gen
 */
import type { EdaAccount, SchematicGenConfig } from './config.js'
import { buildExportHeaders } from './config.js'

/** Overall SSE / zip budget — design agents run for minutes. */
export const HTTP_TIMEOUT_MS = 600_000

// ── STATE_DELTA application ──────────────────────────────────────────────────

/**
 * Apply one `STATE_DELTA` op set to the accumulating state. Only **top-level**
 * patches (`/key`) are applied; nested paths are ignored because the final
 * `STATE_SNAPSHOT` is authoritative for the deliverable fields.
 */
export function applyDelta(delta: unknown, state: Record<string, unknown>): void {
  if (!Array.isArray(delta)) return
  for (const op of delta) {
    if (!op || typeof op !== 'object') continue
    const record = op as { op?: unknown; path?: unknown; value?: unknown }
    const path = typeof record.path === 'string' ? record.path : ''
    const m = /^\/([^/]+)$/.exec(path)
    if (!m) continue
    const key = m[1]!
    if (record.op === 'remove') delete state[key]
    else if (record.op === 'add' || record.op === 'replace') state[key] = record.value
  }
}

export interface HandleEventResult {
  text?: string
  finished?: boolean
  error?: string
}

/**
 * Handle one decoded SSE event, mutating `state` and returning any text /
 * lifecycle signals for the caller to aggregate.
 */
export function handleEvent(evt: unknown, state: Record<string, unknown>): HandleEventResult {
  if (!evt || typeof evt !== 'object') return {}
  const record = evt as { type?: unknown; snapshot?: unknown; delta?: unknown; error?: unknown; message?: unknown }
  const type = record.type
  if (type === 'STATE_SNAPSHOT') {
    if (record.snapshot && typeof record.snapshot === 'object') {
      Object.assign(state, record.snapshot)
    }
    return {}
  }
  if (type === 'STATE_DELTA') {
    applyDelta(record.delta, state)
    return {}
  }
  if (type === 'TEXT_MESSAGE_CONTENT') {
    return { text: typeof (evt as { delta?: unknown }).delta === 'string' ? (evt as { delta: string }).delta : '' }
  }
  if (type === 'RUN_FINISHED') {
    return { finished: true }
  }
  if (type === 'RUN_ERROR') {
    return { error: typeof record.error === 'string' ? record.error : (typeof record.message === 'string' ? record.message : 'unknown run error') }
  }
  return {}
}

/** Parse one `data: …` SSE block into event(s) and route them through `handleEvent`. */
function dispatchRaw(raw: string, state: Record<string, unknown>, accumulate: { text: string; finished: boolean; error: string }): void {
  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (!payload) continue
    let evt: unknown
    try {
      evt = JSON.parse(payload)
    } catch {
      continue // keep-alives / comments are ignored
    }
    const r = handleEvent(evt, state)
    if (r.text) accumulate.text += r.text
    if (r.finished) accumulate.finished = true
    if (r.error) accumulate.error = r.error
  }
}

/** Decode a chunk, split on SSE boundaries, dispatch complete events, return
 *  the unterminated remainder. */
function feed(chunkStr: string, state: Record<string, unknown>, leftover: string, acc: { text: string; finished: boolean; error: string }): string {
  const combined = leftover + chunkStr
  const parts = combined.split(/\r?\n\r?\n/)
  const newLeftover = parts.pop() || ''
  for (const raw of parts) {
    if (raw.trim().length === 0) continue
    dispatchRaw(raw, state, acc)
  }
  return newLeftover
}

export interface ConsumeOptions {
  signal?: AbortSignal | null
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/**
 * POST to the CopilotKit endpoint and consume the SSE stream until it ends or
 * the budget elapses, accumulating the agent state.
 */
export async function consumeCopilotkit(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  options: ConsumeOptions = {},
): Promise<{ state: Record<string, unknown>; finished: boolean; text: string }> {
  const { signal, timeoutMs = HTTP_TIMEOUT_MS, fetchImpl = fetch } = options
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error('schematic-gen: the design agent did not finish within ' + timeoutMs + 'ms')),
    timeoutMs,
  )
  let onAbort: (() => void) | null = null
  if (signal) {
    if (signal.aborted) controller.abort()
    else {
      onAbort = () => controller.abort()
      signal.addEventListener('abort', onAbort, { once: true })
    }
  }

  let res: Response
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (onAbort && signal) signal.removeEventListener('abort', onAbort)
    throw new Error('schematic-gen: failed to reach the design API: ' + String((err as Error)?.message || err))
  }

  if (!res || !res.ok) {
    clearTimeout(timer)
    if (onAbort && signal) signal.removeEventListener('abort', onAbort)
    throw new Error('schematic-gen: the design API returned HTTP ' +
      String(res && res.status) + ' (expected 200 with an SSE stream)')
  }
  if (!res.body || typeof res.body.getReader !== 'function') {
    clearTimeout(timer)
    if (onAbort && signal) signal.removeEventListener('abort', onAbort)
    throw new Error('schematic-gen: the design API response had no stream body')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const state: Record<string, unknown> = {}
  const acc = { text: '', finished: false, error: '' }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf = feed(decoder.decode(value, { stream: true }), state, buf, acc)
    }
    // Flush a final event not terminated by a blank line.
    if (buf.length > 0) dispatchRaw(buf, state, acc)
  } finally {
    clearTimeout(timer)
    if (onAbort && signal) signal.removeEventListener('abort', onAbort)
    try { await reader.cancel() } catch { /* already done */ }
  }

  if (acc.error) {
    throw new Error('schematic-gen: the design agent reported an error: ' + acc.error +
      (acc.text ? ' — ' + acc.text.slice(0, 300) : ''))
  }
  return { state, finished: acc.finished, text: acc.text }
}

export interface ExportZipOptions {
  signal?: AbortSignal | null
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/**
 * POST the module graph to the production export-zip route and return the zip
 * as a Buffer. The route reads `req.json()` as the `MODULE_GRAPH` and responds
 * with `application/zip`.
 */
export async function exportModuleGraphZip(
  exportZipUrl: string,
  moduleGraph: Record<string, unknown>,
  config: SchematicGenConfig,
  account: EdaAccount,
  options: ExportZipOptions = {},
): Promise<Buffer> {
  const { signal, timeoutMs = HTTP_TIMEOUT_MS, fetchImpl = fetch } = options
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error('schematic-gen: the export-zip service did not respond within ' + timeoutMs + 'ms')),
    timeoutMs,
  )
  let onAbort: (() => void) | null = null
  if (signal) {
    if (signal.aborted) controller.abort()
    else {
      onAbort = () => controller.abort()
      signal.addEventListener('abort', onAbort, { once: true })
    }
  }

  let res: Response
  try {
    res = await fetchImpl(exportZipUrl, {
      method: 'POST',
      headers: buildExportHeaders(config, account),
      body: JSON.stringify(moduleGraph),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (onAbort && signal) signal.removeEventListener('abort', onAbort)
    throw new Error('schematic-gen: failed to export the module graph to zip: ' +
      String((err as Error)?.message || err))
  } finally {
    clearTimeout(timer)
    if (onAbort && signal) signal.removeEventListener('abort', onAbort)
  }

  if (!res || !res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: unknown }
      detail = typeof j.error === 'string' ? j.error : ''
    } catch { /* not JSON */ }
    throw new Error('schematic-gen: the export-zip service returned HTTP ' +
      String(res && res.status) + (detail ? ' — ' + detail : ''))
  }
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}
