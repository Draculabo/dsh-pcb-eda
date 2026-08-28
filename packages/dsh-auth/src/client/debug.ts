/**
 * Lightweight debug/log layer for the huaqiu auth client.
 *
 * Every significant handshake step writes a ring-buffered entry AND a
 * console line prefixed with `[huaqiu-auth]`, so a session that "completed
 * login" but still shows the gate can be traced precisely:
 *
 *   1. did the window listener receive the auth.eda.cn message?
 *      → `window-message` (origin + data preview)
 *   2. did the envelope parse?
 *      → `message-parsed` / `message-rejected` (with reason)
 *   3. was it stored?  → `storage-set` / `storage-clear`
 *   4. did the node push succeed? → `node-push` / `node-push-failed` (+ HTTP status)
 *   5. auth state → `auth-state`
 *
 * The last 200 entries are also exposed on the window as
 * `window.__huaqiuAuthDebug` (`.list()` / `.clear()`) so the user can paste
 * the trace even if the console has scrolled past it.
 */

const MAX_ENTRIES = 200

export interface DebugEntry {
  /** epoch ms */
  t: number
  /** short event name */
  e: string
  /** optional payload (stringified preview) */
  d?: string
}

const buffer: DebugEntry[] = []

function preview(value: unknown): string | undefined {
  if (value === undefined) return undefined
  try {
    if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}…` : value
    if (value instanceof Error) return `${value.name}: ${value.message}`
    const s = JSON.stringify(value)
    if (s === undefined) return String(value)
    return s.length > 400 ? `${s.slice(0, 400)}…` : s
  } catch {
    return String(value)
  }
}

/** Log a debug event (ring-buffered + console). */
export function dbg(event: string, detail?: unknown): void {
  const d = preview(detail)
  const entry: DebugEntry = { t: Date.now(), e: event, ...(d !== undefined ? { d } : {}) }
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES)
  // eslint-disable-next-line no-console
  console.info(`[huaqiu-auth] ${event}${d !== undefined ? ` ${d}` : ''}`)
}

/** Expose the trace on the window for copy/paste debugging. */
export function attachDebugGlobal(target: unknown): void {
  try {
    const win = target as {
      __huaqiuAuthDebug?: { list(): DebugEntry[]; clear(): void }
    }
    win.__huaqiuAuthDebug = {
      list: () => buffer.slice(),
      clear: () => {
        buffer.length = 0
      },
    }
  } catch {
    /* non-window target in tests — ignore */
  }
}
