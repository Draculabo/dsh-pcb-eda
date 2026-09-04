/**
 * `@huaqiu/component-gen-app` — reusable generation job runner.
 *
 * Encapsulates the start → SSE-stream → terminal-state lifecycle for one
 * page's active generation. The page calls `run(req)` and reacts to `phase`.
 * `ports.jobEvents` is expected to replay the job's current state first, so a
 * job that finished before subscription still lands correctly.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentGenPorts, HistoryEntry, JobEvent, JobKind, JobState, StartJobRequest } from '../ports.js'

export type GenPhase = 'idle' | 'running' | 'needs_confirmation' | 'completed' | 'failed' | 'cancelled'

export interface UseJobRunnerResult {
  phase: GenPhase
  progress: string
  dimensions: Record<string, unknown> | null
  pkgType: string | null
  fileName: string | null
  result: Record<string, unknown>
  error: string
  jobId: string | null
  run: (req: StartJobRequest) => Promise<void>
  cancel: () => Promise<void>
  clear: () => void
  /** Render an already-generated history entry in the 'completed' stage. */
  loadHistory: (entry: HistoryEntry) => void
}

export function useJobRunner(ports: ComponentGenPorts): UseJobRunnerResult {
  const [phase, setPhase] = useState<GenPhase>('idle')
  const [progress, setProgress] = useState('')
  const [dimensions, setDimensions] = useState<Record<string, unknown> | null>(null)
  const [pkgType, setPkgType] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<Record<string, unknown>>({})
  const [error, setError] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback((): void => {
    unsubRef.current?.()
    unsubRef.current = null
  }, [])

  useEffect(() => cleanup, [cleanup])

  const onEvent = useCallback((e: JobEvent): void => {
    switch (e.type) {
      case 'progress':
        setProgress(e.message)
        break
      case 'needs_confirmation':
        setPhase('needs_confirmation')
        setDimensions(e.dimensions)
        setPkgType(e.pkgType ?? null)
        setFileName(e.fileName ?? null)
        break
      case 'completed':
        setPhase('completed')
        setResult(e.job.result ?? {})
        setProgress('')
        break
      case 'failed':
        setPhase('failed')
        setError(e.error)
        setResult(e.result ?? {})
        setProgress('')
        break
      case 'cancelled':
        setPhase('cancelled')
        setProgress('')
        break
    }
  }, [])

  const run = useCallback(async (req: StartJobRequest): Promise<void> => {
    cleanup()
    setPhase('running')
    setProgress('')
    setDimensions(null)
    setPkgType(null)
    setFileName(null)
    setResult({})
    setError('')
    const job = await ports.startJob(req)
    setJobId(job.id)
    unsubRef.current = ports.jobEvents(job.id, onEvent)
  }, [ports, cleanup, onEvent])

  const cancel = useCallback(async (): Promise<void> => {
    const id = jobId
    if (!id) return
    try { await ports.abortJob(id) } catch { /* best effort */ }
    cleanup()
    setPhase('cancelled')
  }, [ports, jobId, cleanup])

  const clear = useCallback((): void => {
    cleanup()
    setPhase('idle')
    setProgress('')
    setDimensions(null)
    setResult({})
    setError('')
    setJobId(null)
  }, [cleanup])

  const loadHistory = useCallback((entry: HistoryEntry): void => {
    cleanup()
    setPhase('completed')
    setProgress('')
    setDimensions(null)
    setPkgType(entry.input?.packageType ?? null)
    setFileName(null)
    setResult({
      artifact: { id: entry.result?.artifactId },
      filename: entry.result?.filename,
      ...(entry.input?.dimensions ? { dimensions: entry.input.dimensions } : {}),
    })
    setError('')
    // jobId keys the result stage so re-opening a different entry re-renders.
    setJobId(`history:${entry.id}`)
  }, [cleanup])

  return { phase, progress, dimensions, pkgType, fileName, result, error, jobId, run, cancel, clear, loadHistory }
}
