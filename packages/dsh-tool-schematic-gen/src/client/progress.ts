/**
 * Browser half of the live-progress channel.
 *
 * The node half writes progress into a `ProgressStore` keyed by the tool call
 * id and serves it from a same-origin route; this module polls that route and
 * hands the result to the card. Same-origin, so no token and no CORS.
 *
 * Polling (rather than SSE) is deliberate: the route already exists for the
 * artifact flow, the payload is tiny, and a poll survives a dropped
 * connection without any reconnect logic. The interval is slow because a run
 * lasts minutes, not seconds.
 */
import { useEffect, useRef, useState } from 'react'
import type { ProgressDoc } from '../progress.js'

/** Must match `PROGRESS_ROUTE_PREFIX` in src/routes.ts. */
export const PROGRESS_ROUTE_PREFIX = '/api/v1/huaqiu/schematic-gen/progress'

/** Steady-state poll interval. A run takes minutes; sub-second polling is waste. */
export const POLL_INTERVAL_MS = 1500

/** Longest interval we will back off to after repeated failures. */
export const MAX_BACKOFF_MS = 15_000

/**
 * How long to keep asking when the route answers 404.
 *
 * A 404 is normal for the first second or two (the tool body may still be
 * resolving the eda.cn account before it registers), but if it never registers
 * we must stop rather than poll the app for the next ten minutes.
 */
export const MISSING_GIVE_UP_MS = 120_000

export type ProgressPhase = 'idle' | 'loading' | 'gave-up' | 'live' | 'missing' | 'error'

export interface ProgressState {
  phase: ProgressPhase
  doc: ProgressDoc | null
  error: string | null
}

const IDLE: ProgressState = { phase: 'idle', doc: null, error: null }

/**
 * Poll one run's progress while `active`.
 *
 * Stops as soon as the run reports a terminal status, and backs off on
 * transport failure so a missing/unreachable route cannot spin the UI.
 */
export function useProgress(callId: string | undefined, active: boolean): ProgressState {
  const [state, setState] = useState<ProgressState>(IDLE)

  useEffect(() => {
    if (!active || !callId) {
      setState(IDLE)
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let delay = POLL_INTERVAL_MS
    const controller = new AbortController()
    const startedAt = Date.now()
    let missingSince: number | null = null

    const schedule = (): void => {
      if (cancelled) return
      timer = setTimeout(run, delay)
    }

    const run = async (): Promise<void> => {
      if (cancelled) return
      try {
        const url = `${PROGRESS_ROUTE_PREFIX}/${encodeURIComponent(callId)}`
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
          credentials: 'same-origin',
        })
        if (cancelled) return

        if (res.status === 404) {
          // The run has not registered yet (the tool body may still be
          // resolving the account) or has already been swept. Keep trying
          // for a bounded window — just slower.
          if (missingSince === null) missingSince = Date.now()
          if (Date.now() - missingSince > MISSING_GIVE_UP_MS) {
            setState({ phase: 'gave-up', doc: null, error: null })
            return
          }
          delay = Math.min(Math.round(delay * 1.5), MAX_BACKOFF_MS)
          setState({ phase: 'missing', doc: null, error: null })
          schedule()
          return
        }
        if (!res.ok) throw new Error(`progress route returned HTTP ${res.status}`)

        const doc = (await res.json()) as ProgressDoc
        if (cancelled) return
        delay = POLL_INTERVAL_MS
        missingSince = null
        setState({ phase: 'live', doc, error: null })
        // Terminal — the card has the real result now; stop polling.
        if (doc.status !== 'running') return
        schedule()
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        // Same bounded window as the 404 path: a route that is simply absent
        // must not spin the UI for the length of the run.
        if (Date.now() - startedAt > MISSING_GIVE_UP_MS) {
          setState({ phase: 'gave-up', doc: null, error: String((err as Error)?.message || err) })
          return
        }
        delay = Math.min(Math.round(delay * 1.5), MAX_BACKOFF_MS)
        setState({ phase: 'error', doc: null, error: String((err as Error)?.message || err) })
        schedule()
      }
    }

    setState({ phase: 'loading', doc: null, error: null })
    void run()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      controller.abort()
    }
  }, [callId, active])

  return state
}

/**
 * Shared ticker that re-renders on a fixed cadence while `active`.
 *
 * Lifted out of the stack renderer (a documented limitation of the
 * hq-eda-ai original, which owned its `setInterval` inside the list
 * component) so every frame at any depth can show a live duration without
 * each one running its own timer.
 */
export function useNow(active: boolean, intervalMs = 200): number {
  const [now, setNow] = useState<number>(() => Date.now())
  const intervalRef = useRef(intervalMs)
  intervalRef.current = intervalMs

  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), intervalRef.current)
    return () => clearInterval(id)
  }, [active])

  return now
}

/** Wall-clock elapsed time since `startedAt`, ticking while `active`. */
export function useElapsed(startedAt: number | null | undefined, active: boolean): number {
  const now = useNow(active, 500)
  if (startedAt === null || startedAt === undefined) return 0
  return Math.max(0, now - startedAt)
}
