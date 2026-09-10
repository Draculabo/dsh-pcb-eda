/**
 * `@huaqiu/dsh-plugin-log/client` — browser half of the shared plugin log.
 *
 * The browser has no filesystem, so there is nothing to unify: this module
 * keeps the *same* `PluginLogger` surface as the node half (so a plugin can log
 * identically from either half) but writes to the console with a stable
 * `[component] message` prefix and a structured payload as the second
 * argument — which is what the existing client-side debugging already relies on.
 *
 * It also keeps a small in-memory ring of the most recent records. That costs
 * nothing and gives a user something to copy out of the devtools console
 * (`dumpPluginLogs()`) when a file is not available.
 *
 * Redaction is shared with the node half, so a credential can never reach the
 * browser console through this logger either.
 */

import { isEnabled, parseLevel, type LogLevel } from './levels.js'
import { redact } from './redact.js'

export type { LogLevel } from './levels.js'
export type LogFields = Record<string, unknown>

export interface PluginLogger {
  readonly component: string
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  child(fields: LogFields): PluginLogger
}

/** Most recent records kept in memory for `dumpPluginLogs()`. */
const RING_SIZE = 200
const ring: Array<Record<string, unknown>> = []

const DEFAULT_LEVEL: LogLevel = 'debug'

function currentLevel(): LogLevel {
  const global = globalThis as { DSH_PLUGIN_LOG_LEVEL?: string }
  return parseLevel(global.DSH_PLUGIN_LOG_LEVEL, DEFAULT_LEVEL)
}

function consoleMethod(level: LogLevel): 'log' | 'info' | 'warn' | 'error' {
  if (level === 'error') return 'error'
  if (level === 'warn') return 'warn'
  if (level === 'info') return 'info'
  return 'log'
}

function createLogger(component: string, defaults: LogFields): PluginLogger {
  const emit = (level: LogLevel, message: string, fields?: LogFields): void => {
    try {
      if (!isEnabled(level, currentLevel())) return
      const record: Record<string, unknown> = {}
      if (Object.keys(defaults).length > 0) Object.assign(record, defaults)
      if (fields && Object.keys(fields).length > 0) Object.assign(record, fields)
      Object.assign(record, {
        ts: new Date().toISOString(),
        level,
        component,
        msg: message,
      })

      const safe = redact(record) as Record<string, unknown>
      ring.push(safe)
      if (ring.length > RING_SIZE) ring.shift()

      const { msg, ...rest } = safe
      // eslint-disable-next-line no-console
      console[consoleMethod(level)](`[${component}] ${String(msg)}`, rest)
    } catch {
      /* logging must never throw */
    }
  }

  return {
    component,
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    child: (fields) => createLogger(component, { ...defaults, ...fields }),
  }
}

/** Get (or create) the browser logger for `component`. */
export function getLogger(component: string, defaults: LogFields = {}): PluginLogger {
  return createLogger(component, defaults)
}

/** Snapshot of the in-memory ring — handy from the devtools console. */
export function dumpPluginLogs(): Array<Record<string, unknown>> {
  return ring.slice()
}
