/**
 * Live call-stack renderer (browser half).
 *
 * Port of `hq-eda-ai`'s prototype
 * (`docs/prototype/tool_call_stack_prototype.tsx`) onto the paired trace
 * frames our node half produces, plus the coarse stage ladder that keeps the
 * user informed even when the backend emits no trace events at all.
 *
 * Styling goes through the classes in `theme.js` — client bundles here have no
 * CSS pipeline, so the stylesheet is injected once as a `<style>` tag and
 * every visual decision lives in a DSH design token with a literal fallback.
 */
import { memo, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { ProgressDoc, RunKind } from '../progress.js'
import { buildTree, countStatus, formatDuration, formatElapsed, type StackNode } from './trace-tree.js'
import { useElapsed, useNow, useProgress } from './progress.js'
import type { Translate } from './i18n.js'

// ── one frame ──────────────────────────────────────────────────────────────

function dotClass(status: string): string {
  if (status === 'finished') return 'hq-sch__frame-dot hq-sch__frame-dot--finished'
  if (status === 'failed') return 'hq-sch__frame-dot hq-sch__frame-dot--failed'
  return 'hq-sch__frame-dot hq-sch__frame-dot--running'
}

interface FrameProps {
  node: StackNode
  now: number
  running: boolean
}

const StackFrame = memo(function StackFrame({ node, now, running }: FrameProps): ReactElement {
  const [open, setOpen] = useState(true)
  const hasChildren = node.children.length > 0
  const counts = countStatus(node)

  const isRunning = node.status === 'running'
  const endedAt = node.finishedAt
  const duration = formatDuration(
    endedAt != null ? endedAt - node.startedAt : (running && isRunning ? now - node.startedAt : null),
  )

  const nameClass = isRunning
    ? 'hq-sch__frame-name hq-sch__frame-name--running'
    : 'hq-sch__frame-name hq-sch__frame-name--done'

  const row = (
    <div
      className={hasChildren ? 'hq-sch__frame-row' : 'hq-sch__frame-row hq-sch__frame-row--leaf'}
      onClick={hasChildren ? () => setOpen((v) => !v) : undefined}
      role={hasChildren ? 'button' : undefined}
      aria-expanded={hasChildren ? open : undefined}
    >
      <span className="hq-sch__frame-chev">{hasChildren ? (open ? '▾' : '▸') : ''}</span>
      <span className={dotClass(node.status)} />
      <span className={nameClass} title={node.name}>{node.name}</span>
      <span className="hq-sch__frame-meta">
        {hasChildren && counts.total > 0
          ? <span className="hq-sch__frame-count">{counts.finished}/{counts.total}</span>
          : null}
        {duration ? <span>{duration}</span> : null}
      </span>
    </div>
  )

  if (!hasChildren || !open) return row

  return (
    <div>
      {row}
      <div className="hq-sch__frame-children">
        {node.children.map((child) => (
          <StackFrame key={child.id} node={child} now={now} running={running} />
        ))}
      </div>
    </div>
  )
})

// ── the stack ─────────────────────────────────────────────────────────────

/**
 * The frame list, auto-scrolled so the deepest running span stays visible.
 *
 * A 10-minute run can produce hundreds of frames; without this the container
 * (capped at 320px) would sit pinned at the top showing work finished minutes
 * ago.
 */
function StackList({ nodes, now, running }: { nodes: StackNode[]; now: number; running: boolean }): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!running) return
    const el = ref.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [nodes, running])

  return (
    <div className="hq-sch__stack" ref={ref}>
      {nodes.map((node) => (
        <StackFrame key={node.id} node={node} now={now} running={running} />
      ))}
    </div>
  )
}

// ── stage ladder ──────────────────────────────────────────────────────────

function stepClass(index: number, active: number, failed: boolean): string {
  const base = 'hq-sch__ladder-step'
  if (index < active) return `${base} hq-sch__ladder-step--done`
  if (index > active) return base
  return failed ? `${base} hq-sch__ladder-step--failed` : `${base} hq-sch__ladder-step--active`
}

function StageLadder({ stage, failed }: { stage: ProgressDoc['stage']; failed: boolean }): ReactElement | null {
  if (!stage || stage.total <= 0) return null
  const steps: ReactElement[] = []
  for (let i = 0; i < stage.total; i++) {
    steps.push(<span key={i} className={stepClass(i, stage.index, failed)} />)
  }
  return <div className="hq-sch__ladder">{steps}</div>
}

// ── the whole live block ──────────────────────────────────────────────────

export interface LiveProgressProps {
  /**
   * Tool call id. This is the SAME string `defineTool`'s `ToolRunContext`
   * hands the node half, so it is what correlates node progress to this card.
   */
  callId?: string
  kind: RunKind
  t: Translate
}

/**
 * Progress surface for a run that has not settled yet.
 *
 * Three layers, each independent, so the user always sees *something*:
 *   1. A label naming the current stage, plus a live `m:ss` timer.
 *   2. A coarse ladder derived from the agent's own state keys — works even
 *      when the backend emits no trace events at all.
 *   3. The real call stack, when trace events do arrive.
 */
export function LiveProgress({ callId, kind, t }: LiveProgressProps): ReactElement {
  const { doc } = useProgress(callId, true)

  const running = !doc || doc.status === 'running'
  const now = useNow(running, 250)

  // Before the first poll lands there is no server timestamp; fall back to the
  // moment this card mounted so the timer is never stuck at 0:00.
  const mountedAtRef = useRef<number>(Date.now())
  const startedAt = doc?.startedAt ?? mountedAtRef.current
  const elapsed = useElapsed(startedAt, running)

  const tree = useMemo(() => {
    // `doc.frames` is a fresh array on every poll, so depend on `doc` itself.
    void kind
    return buildTree(doc?.frames ?? [])
  }, [doc, kind])

  const label = doc?.stage
    ? t(`card.stage.${doc.stage.key}`)
    : t('card.progress.waiting')

  return (
    <div>
      <div className="hq-sch__progress">
        <span>{label}</span>
        <span className="hq-sch__progress-timer">{formatElapsed(elapsed)}</span>
      </div>
      <StageLadder stage={doc?.stage ?? null} failed={doc?.status === 'failed'} />
      {tree.length > 0
        ? <StackList nodes={tree} now={now} running={running} />
        : null}
    </div>
  )
}
