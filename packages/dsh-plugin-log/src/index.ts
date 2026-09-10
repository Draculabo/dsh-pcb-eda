/**
 * `@huaqiu/dsh-plugin-log` — one server-side log for every Huaqiu DSH plugin.
 *
 * ## Why this exists
 *
 * Plugin diagnostics used to live only in the browser console: each plugin's
 * browser half logged to `console.*`, and the node half — the half that
 * actually owns credentials, HTTP routes and agent tools — logged nothing at
 * all outside the DSH process's stdout, which HQ Edge only captures as an
 * opaque text blob. When a `deepseek-harness` upgrade broke credential
 * propagation, the only way to see what the node half resolved was to add
 * temporary prints and re-run.
 *
 * This package gives every plugin one shared, file-backed, cross-platform log
 * inside the current HQ Edge log tree:
 *
 *   <HQ_EDGE_HOME>/logs/dsh-plugins/dsh-plugins.log      (current)
 *   <HQ_EDGE_HOME>/logs/dsh-plugins/dsh-plugins.1.log    (previous, after rotation)
 *
 * ## HQ Edge home resolution
 *
 * The directory comes from the inlined `@hqedge/paths` resolution
 * (`src/paths.ts`): the same root every HQ Edge runtime uses, so plugin logs
 * land inside the current HQ Edge log tree:
 *
 *   <HQ_EDGE_HOME>/logs/dsh-plugins/dsh-plugins.log      (current)
 *   <HQ_EDGE_HOME>/logs/dsh-plugins/dsh-plugins.1.log    (previous, after rotation)
 *
 * Resolution honours the same overrides as the rest of HQ Edge:
 *
 *   explicit `configure({ dir })`  >  $DSH_PLUGIN_LOG_DIR  >  $HQ_EDGE_LOG_DIR / $HQ_EDGE_HOME
 *
 * HQ Edge runs DSH with `HQ_EDGE_HOME` set to its own per-user data directory,
 * so plugin logs live next to the rest of that installation's state and never
 * in the user's default home.
 *
 * ## Cross-platform notes
 *
 *  - Pure `node:fs` / `node:os` / `node:path` — no native modules, no shelling
 *    out, nothing that differs between macOS, Linux and Windows but the path
 *    separators (handled by `node:path`).
 *  - Rotation uses unlink-then-rename, because Windows cannot rename over an
 *    existing file.
 *  - File names never embed `:` or other Windows-illegal characters.
 *  - If the log directory cannot be created (read-only install, locked-down
 *    profile) we fall back to the OS temp dir, and if that also fails we keep
 *    logging to the console. A logging failure must never take a plugin down.
 *
 * ## Safety
 *
 *  - Every field passes through `redact()`: credential-shaped keys and values
 *    are replaced with `[redacted]`, so the log is safe to share.
 *  - `getLogger()` never throws. Neither does any log call.
 */

import {
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getHqEdgeHome, getLogDir } from './paths.js'

import { isEnabled, parseLevel, type LogLevel } from './levels.js'
import { redact } from './redact.js'

export type { LogLevel } from './levels.js'
export { LOG_LEVELS, levelRank, parseLevel } from './levels.js'
export { redact, REDACTED } from './redact.js'

/** Arbitrary structured context attached to a log record. */
export type LogFields = Record<string, unknown>

/** The logger surface every plugin codes against. */
export interface PluginLogger {
  readonly component: string
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** Derive a logger that always carries `fields`. */
  child(fields: LogFields): PluginLogger
}

export interface LoggingOptions {
  /** Override the log directory (highest precedence, beats every env var). */
  dir?: string
  /** Base file name inside the directory. Default `dsh-plugins.log`. */
  fileName?: string
  /** Minimum file level. Default from `$DSH_PLUGIN_LOG_LEVEL`, else `info`. */
  level?: LogLevel
  /**
   * Minimum level mirrored to the console. HQ Edge captures DSH's stdout, so
   * this is how a plugin surfaces a problem without anyone opening a file.
   * Default from `$DSH_PLUGIN_LOG_CONSOLE`, else `warn`.
   */
  consoleLevel?: LogLevel | 'off'
  /** Rotate once the current file exceeds this many bytes. Default 5 MiB. */
  maxBytes?: number
  /** Number of files kept (current + rotated). Default 4. */
  maxFiles?: number
}

const DEFAULT_FILE_NAME = 'dsh-plugins.log'
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
const DEFAULT_MAX_FILES = 4
const DEFAULT_LEVEL: LogLevel = 'info'
const DEFAULT_CONSOLE_LEVEL: LogLevel = 'warn'

// ── configuration ───────────────────────────────────────────────────────────

interface ResolvedConfig {
  dir: string
  fileName: string
  level: LogLevel
  consoleLevel: LogLevel | 'off'
  maxBytes: number
  maxFiles: number
}

/**
 * Process-wide logger state, held on `globalThis`.
 *
 * Plugins are built independently, so each one gets its OWN bundled copy of
 * this module. Without a shared home, "one unified log" would degrade into one
 * sink (and one rotation counter) per plugin. Keying the state off a
 * `Symbol.for` on `globalThis` makes every copy — bundled, external, or
 * duplicated across installs — cooperate inside the same DSH process.
 */
const STATE_KEY = Symbol.for('@huaqiu/dsh-plugin-log/state')

interface LogState {
  override: Partial<LoggingOptions> | null
  resolved: ResolvedConfig | null
  sink: FileSink | null
  bootstrapped: boolean
}

function state(): LogState {
  const g = globalThis as Record<symbol, unknown>
  const existing = g[STATE_KEY] as LogState | undefined
  if (existing) return existing
  const fresh: LogState = { override: null, resolved: null, sink: null, bootstrapped: false }
  g[STATE_KEY] = fresh
  return fresh
}

const getOverride = (): Partial<LoggingOptions> | null => state().override
const setOverride = (value: Partial<LoggingOptions> | null): void => { state().override = value }
const getSink = (): FileSink | null => state().sink
const setSink = (value: FileSink | null): void => { state().sink = value }

/**
 * Programmatically configure logging. Call before the first `getLogger()`;
 * later calls take effect on the next `resetLogging()` (tests, host re-init).
 */
export function configureLogging(options: LoggingOptions): void {
  setOverride({ ...(getOverride() ?? {}), ...options })
  state().resolved = null
}

/** Forget all configuration and cached loggers. Test/teardown helper. */
export function resetLogging(): void {
  const s = state()
  s.override = null
  s.resolved = null
  s.sink = null
  s.bootstrapped = false
}

function env(name: string): string | undefined {
  const value = process.env[name]
  return value !== undefined && value.trim().length > 0 ? value.trim() : undefined
}

function readInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Pick the log directory, honouring every override in precedence order.
 * Falls back to the OS temp directory when the DSH home is not writable — a
 * plugin that cannot log to its preferred location still logs somewhere.
 */
function resolveLogDir(explicit?: string): { dir: string; fallback: boolean } {
  const candidates: string[] = []
  if (explicit !== undefined && explicit.length > 0) candidates.push(explicit)
  const fromEnv = env('DSH_PLUGIN_LOG_DIR')
  if (fromEnv) candidates.push(fromEnv)
  // Inside the current HQ Edge log tree (honours $HQ_EDGE_HOME / $HQ_EDGE_LOG_DIR
  // through the inlined paths resolver), so plugin logs follow the host install.
  candidates.push(getLogDir('dsh-plugins'))
  candidates.push(join(tmpdir(), 'hq-dsh-plugins', 'logs'))

  for (let i = 0; i < candidates.length; i += 1) {
    const dir = candidates[i]
    if (!dir) continue
    try {
      mkdirSync(dir, { recursive: true })
      return { dir, fallback: i > 0 }
    } catch {
      /* read-only or locked-down — try the next candidate */
    }
  }

  // Nothing is writable. Report the last candidate; the sink degrades to
  // console output rather than failing.
  const last = candidates[candidates.length - 1]
  return { dir: last ?? '.', fallback: true }
}

function currentConfig(): ResolvedConfig {
  const s = state()
  if (s.resolved) return s.resolved
  const o = s.override
  const { dir } = resolveLogDir(o?.dir)
  const consoleRaw = o?.consoleLevel ?? env('DSH_PLUGIN_LOG_CONSOLE')
  s.resolved = {
    dir,
    fileName: o?.fileName ?? env('DSH_PLUGIN_LOG_FILE') ?? DEFAULT_FILE_NAME,
    level: o?.level ?? parseLevel(env('DSH_PLUGIN_LOG_LEVEL'), DEFAULT_LEVEL),
    consoleLevel:
      o?.consoleLevel === 'off'
        ? 'off'
        : consoleRaw === 'off' || consoleRaw === 'none' || consoleRaw === '0'
          ? 'off'
          : consoleRaw === 'all' || consoleRaw === '1' || consoleRaw === 'true'
            ? 'debug'
            : parseLevel(consoleRaw, DEFAULT_CONSOLE_LEVEL),
    maxBytes: o?.maxBytes ?? readInt(env('DSH_PLUGIN_LOG_MAX_BYTES'), DEFAULT_MAX_BYTES),
    maxFiles: o?.maxFiles ?? readInt(env('DSH_PLUGIN_LOG_MAX_FILES'), DEFAULT_MAX_FILES),
  }
  return s.resolved
}

/** Absolute path of the current log file, or `null` before first use. */
export function logFilePath(): string | null {
  const s = getSink()
  return s ? s.path : null
}

/** Absolute directory plugin logs are written to. */
export function logDir(): string {
  return currentConfig().dir
}

// ── file sink ───────────────────────────────────────────────────────────────

/**
 * Serialized appender with size-based rotation.
 *
 * Writes are chained on a single promise so concurrent log calls from different
 * plugins in the same process can never interleave or race the rotation.
 */
class FileSink {
  readonly path: string
  private queue: Promise<void> = Promise.resolve()
  private bytes: number

  constructor(
    private readonly dir: string,
    private readonly fileName: string,
    private readonly maxBytes: number,
    private readonly maxFiles: number,
  ) {
    this.path = join(dir, fileName)
    this.bytes = this.currentSize()
  }

  private currentSize(): number {
    try {
      return statSync(this.path).size
    } catch {
      return 0
    }
  }

  /** Rotate when appending `next` bytes would exceed the cap. */
  private rotateIfNeeded(next: number): void {
    if (this.maxBytes <= 0) return
    if (this.bytes + next <= this.maxBytes) return
    try {
      // Shift: .2 -> .3, .1 -> .2, current -> .1 (oldest is dropped).
      for (let i = this.maxFiles - 1; i >= 1; i -= 1) {
        const from = i === 1 ? join(this.dir, this.fileName) : this.rotated(i - 1)
        const to = this.rotated(i)
        if (!exists(from)) continue
        // Windows cannot rename over an existing file — remove the target first.
        if (exists(to)) rmSync(to, { force: true })
        renameSync(from, to)
      }
      this.bytes = this.currentSize()
    } catch {
      // Rotation is best-effort: never lose the write because of it.
    }
  }

  private rotated(index: number): string {
    const dot = this.fileName.lastIndexOf('.')
    const stem = dot > 0 ? this.fileName.slice(0, dot) : this.fileName
    const ext = dot > 0 ? this.fileName.slice(dot) : ''
    return join(this.dir, `${stem}.${index}${ext}`)
  }

  /** Enqueue one already-serialized line. Never rejects. */
  write(line: string): void {
    const size = Buffer.byteLength(line, 'utf8')
    this.bytes += size
    this.queue = this.queue
      .then(async () => {
        this.rotateIfNeeded(size)
        await appendFile(this.path, line, 'utf8')
      })
      .catch(() => {
        /* a full or locked disk must never surface as a plugin failure */
      })
  }

  /** Wait for everything enqueued so far to reach the file. */
  flush(): Promise<void> {
    return this.queue
  }
}

function exists(path: string): boolean {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

function currentSink(): FileSink {
  const existing = getSink()
  if (existing) return existing
  const cfg = currentConfig()
  const created = new FileSink(cfg.dir, cfg.fileName, cfg.maxBytes, cfg.maxFiles)
  setSink(created)
  return created
}

/** Wait for all pending writes to land (shutdown hooks, tests). */
export async function flushLogs(): Promise<void> {
  await getSink()?.flush()
}

// ── logger ──────────────────────────────────────────────────────────────────

function consoleMethod(level: LogLevel): 'log' | 'info' | 'warn' | 'error' {
  if (level === 'error') return 'error'
  if (level === 'warn') return 'warn'
  if (level === 'info') return 'info'
  return 'log'
}

function createLogger(component: string, defaults: LogFields): PluginLogger {
  const emit = (level: LogLevel, message: string, fields?: LogFields): void => {
    try {
      const cfg = currentConfig()
      if (!isEnabled(level, cfg.level) && !(cfg.consoleLevel !== 'off' && isEnabled(level, cfg.consoleLevel))) {
        return
      }

      const record: LogFields = {
        ts: new Date().toISOString(),
        level,
        component,
        pid: process.pid,
        msg: message,
      }
      if (Object.keys(defaults).length > 0) Object.assign(record, defaults)
      if (fields && Object.keys(fields).length > 0) Object.assign(record, fields)

      const safe = redact(record) as LogFields

      if (isEnabled(level, cfg.level)) {
        currentSink().write(`${JSON.stringify(safe)}\n`)
      }
      if (cfg.consoleLevel !== 'off' && isEnabled(level, cfg.consoleLevel)) {
        const { msg, ...rest } = safe
        // eslint-disable-next-line no-console
        console[consoleMethod(level)](`[${component}] ${String(msg)}`, rest)
      }
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

/**
 * Get (or create) the logger for `component`.
 *
 * `component` should be the short plugin name used everywhere else in its
 * output — `dsh-auth`, `dsh-artifacts`, `dsh-schematic-gen` — so the unified
 * file can be filtered with a single grep.
 */
export function getLogger(component: string, defaults: LogFields = {}): PluginLogger {
  bootstrap()
  return createLogger(component, defaults)
}

// ── boot banner ─────────────────────────────────────────────────────────────

/**
 * Write one record describing where this process is logging.
 *
 * This is the line that makes the next "we upgraded deepseek-harness and
 * something stopped syncing" investigation cheap: it pins the DSH home, the
 * resolved log file, the platform and the DSH/plugin versions in use at the
 * moment the first plugin touched the log.
 */
function bootstrap(): void {
  const s = state()
  if (s.bootstrapped) return
  s.bootstrapped = true
  const cfg = currentConfig()
  const logger = createLogger('dsh-plugin-log', {})
  let hqEdgeHome: string | null = null
  try {
    hqEdgeHome = getHqEdgeHome()
  } catch {
    hqEdgeHome = null
  }
  logger.info('plugin log ready', {
    logFile: join(cfg.dir, cfg.fileName),
    logDir: cfg.dir,
    hqEdgeHome,
    level: cfg.level,
    consoleLevel: cfg.consoleLevel,
    pid: process.pid,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  })
}
