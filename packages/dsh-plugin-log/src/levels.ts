/**
 * Log levels for `@huaqiu/dsh-plugin-log`.
 *
 * Four levels only — enough to separate "noise while debugging" from "someone
 * must look at this", and few enough that a reader of the log file can filter
 * with a single grep.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Levels ordered from most to least verbose. */
export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error']

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

/** Numeric rank of a level — higher means more severe. */
export function levelRank(level: LogLevel): number {
  return RANK[level]
}

/**
 * Parse a level from an arbitrary (env-supplied) value.
 *
 * Unparseable or empty input falls back instead of throwing: a bad
 * `DSH_PLUGIN_LOG_LEVEL` in a customer environment must degrade to "log
 * normally", never to "crash the plugin host".
 */
export function parseLevel(value: unknown, fallback: LogLevel): LogLevel {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  return (LOG_LEVELS as readonly string[]).includes(normalized)
    ? (normalized as LogLevel)
    : fallback
}

/** True when `level` is at least as severe as `threshold`. */
export function isEnabled(level: LogLevel, threshold: LogLevel): boolean {
  return levelRank(level) >= levelRank(threshold)
}
