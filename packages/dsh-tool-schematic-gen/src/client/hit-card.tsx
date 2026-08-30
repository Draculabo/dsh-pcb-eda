/**
 * Keyed `tool.call.toolview` HIT card for schematic generation (both
 * `generate_schematic_from_description` and `generate_system_module_graph`).
 *
 * Faithful React/TS port of the hq-edge `GenHit` card for schematics, adapted
 * to the published DSH slot contract (`ToolCallOwnerProps` + `sessionId`).
 * "Regenerate" sends a user message back to the agent through
 * `sessions.binding(sessionId).session.prompt(...)`; the node `ask()` stays
 * the single source of truth. The `needs_auth` phase renders an inline login
 * card (display + guidance; the auth plugin owns the credential handshake).
 *
 * Preview: a single `.kicad_sch` sheet renders via `renderSchematic`; a system
 * design zip renders via `renderProjectFromZip` (root sheet auto-selected).
 */
import { memo, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  projectToolCall, formatBytes, downloadFilenameFor,
  type SchResult, type ToolBlockLike,
} from './parse.js'
import { type Translate, useT } from './i18n.js'
import {
  resolveArtifactText, resolveArtifactBytes, renderSheetToCanvas,
  renderProjectZipToCanvas, sizeCanvasFor, downloadText, downloadBytes,
} from './ecad.js'
import { useLocale, useTheme } from './theme.js'
import { buildLoginUrl, loginIframeBackground } from './login-url.js'
import { LiveProgress } from './stack-frame.jsx'

/** Login-state view used by the needs_auth card (from the auth plugin's shared localStorage). */
export interface AuthStateLike {
  authenticated: boolean
  nickname?: string
}

export type PromptSender = (sessionId: string | undefined, message: string) => Promise<unknown>

const TOOL_SCHEMATIC = 'generate_schematic_from_description'
const TOOL_SYSTEM = 'generate_system_module_graph'

export interface GenHitProps {
  toolName: string
  block?: ToolBlockLike
  sessionId?: string
  /**
   * Tool call id from the `tool.call.toolview` slot. DSH guarantees it is
   * "stable across running and settled forms", and it is the SAME string the
   * node half receives as `ToolRunContext.callId` — which is exactly what the
   * progress store is keyed by. No callId means no live stack, but the card
   * still renders.
   */
  callId?: string
  inspect?: () => void
  authState?: AuthStateLike
  sendPrompt?: PromptSender
}

function kindOf(toolName: string): 'schematic' | 'system' {
  return toolName === TOOL_SYSTEM ? 'system' : 'schematic'
}

function kindTitleKey(kind: string | null): string {
  return kind === 'system' ? 'card.title.system' : 'card.title.schematic'
}

function kindLabel(kind: string | null, t: Translate): string {
  return kind === 'system' ? t('card.kind.system') : t('card.kind.schematic')
}

function StatusDot({ state }: { state: 'ongoing' | 'error' | 'done' }): ReactElement {
  const color = state === 'done' ? 'var(--dsw-alias-state-success-primary, #34a853)'
    : state === 'error' ? 'var(--dsw-alias-state-error-primary, #d93025)'
    : 'var(--dsw-alias-state-running-primary, #1a73e8)'
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: color }} />
}

function statusText(phase: string, t: Translate): string {
  if (phase === 'generating') return t('card.status.generating')
  if (phase === 'failed') return t('card.status.failed')
  return t('card.status.generated')
}

function header(kind: string | null, phase: string, t: Translate): ReactElement {
  const dot = phase === 'generating' ? 'ongoing' : phase === 'failed' ? 'error' : 'done'
  return (
    <div className="hq-sch__header">
      <span className="hq-sch__icon">⇶</span>
      <span className="hq-sch__title">{t(kindTitleKey(kind))}</span>
      <span className="hq-sch__status">
        <StatusDot state={dot} />
        <span>{statusText(phase, t)}</span>
      </span>
    </div>
  )
}

function summary(result: SchResult, t: Translate): ReactElement | null {
  const badges: ReactElement[] = []
  if (result.kind) badges.push(<span className="hq-sch__badge" key="kind">{kindLabel(result.kind, t)}</span>)
  if (result.designName) badges.push(<span className="hq-sch__badge hq-sch__badge--mono" key="design">{result.designName}</span>)
  if (result.kind === 'system') {
    if (result.moduleCount != null) badges.push(<span className="hq-sch__badge" key="mod">{t('card.meta.modules', { count: result.moduleCount })}</span>)
    if (result.connectionCount != null) badges.push(<span className="hq-sch__badge" key="conn">{t('card.meta.connections', { count: result.connectionCount })}</span>)
  } else if (result.fileCount != null) {
    badges.push(<span className="hq-sch__badge" key="files">{t('card.meta.sheets', { count: result.fileCount })}</span>)
  }
  const size = result.artifact?.size
  if (size != null) {
    const sizeText = formatBytes(size)
    if (sizeText) badges.push(<span className="hq-sch__badge" key="size">{sizeText}</span>)
  }
  if (badges.length === 0) return null
  return <div className="hq-sch__summary">{badges}</div>
}

// ── canvas preview ──────────────────────────────────────────────────────────

interface PreviewPayload {
  kind: 'schematic' | 'system'
  source: string | null
  bytes: Uint8Array | null
  srcKey: string
}

function PreviewStage({ payload, t }: { payload: PreviewPayload; t: Translate }): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [view, setView] = useState<{ view: 'loading' | 'ready' | 'error'; message: string }>({ view: 'loading', message: '' })

  useEffect(() => {
    let cancelled = false
    let disposeViewer: (() => void) | null = null
    setView({ view: 'loading', message: '' })
    ;(async () => {
      try {
        const canvas = canvasRef.current
        if (!canvas) return
        await new Promise((resolve) => {
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resolve)
          else setTimeout(resolve, 16)
        })
        if (cancelled || canvas !== canvasRef.current) return
        sizeCanvasFor(canvas)
        if (payload.kind === 'system' && payload.bytes) {
          disposeViewer = await renderProjectZipToCanvas(payload.bytes, canvas)
        } else if (payload.source) {
          disposeViewer = await renderSheetToCanvas(payload.source, canvas)
        } else {
          throw new Error('no preview source')
        }
        if (cancelled || canvas !== canvasRef.current) return
        setView({ view: 'ready', message: '' })
      } catch (e) {
        if (!cancelled) {
          console.warn('[hq-schematic-gen] preview render failed', e)
          setView({ view: 'error', message: String((e as Error)?.message || e) })
        }
      }
    })()
    return () => {
      cancelled = true
      try { disposeViewer?.() } catch { /* ignore */ }
    }
  }, [payload.srcKey, payload.kind, payload.source, payload.bytes])

  const overlay =
    view.view === 'loading'
      ? <div className="hq-sch__stage-msg">{t('card.preview.loading')}</div>
      : view.view === 'error'
        ? <div className="hq-sch__stage-msg">{t('card.preview.renderError')}{view.message}</div>
        : null

  return (
    <div className="hq-sch__stage">
      <canvas ref={canvasRef} className="hq-sch__canvas" />
      {overlay}
    </div>
  )
}

// ── needs_auth login card ───────────────────────────────────────────────────

function LoginCard({ toolName, authState, t }: { toolName: string; authState?: AuthStateLike; t: Translate }): ReactElement {
  const dark = useTheme()
  const locale = useLocale()
  // FILL mode (`fill=full`): this card IS the surface, so let the embed paint
  // it edge-to-edge with its own `bg-background`. Without it the embed's
  // `grid-rows-[20px_1fr_20px]` wrapper leaves two transparent strips above
  // and below the form, which read as white gaps in dark theme.
  const src = useMemo(
    () => buildLoginUrl({ lang: locale, theme: dark ? 'dark' : 'light' }),
    [locale, dark],
  )
  // Force a full remount on a theme/locale flip: Chrome keeps the old embed
  // loaded when only `src` changes (the embed is a Next.js page that reads
  // its URL params once on mount), silently ignoring the new `fill`/`theme`.
  const remountKey = `${locale}|${dark ? 'd' : 'l'}`

  return (
    <div className="hq-sch">
      <div className="hq-sch__header">
        <span className="hq-sch__icon">⇶</span>
        <span className="hq-sch__title">{t('card.auth.title')}</span>
      </div>
      <div className="hq-sch__login">
        <p className="hq-sch__login-desc">{t('card.auth.desc', { tool: toolName })}</p>
        <p className="hq-sch__login-status" style={{ color: authState?.authenticated ? '#1677ff' : '#d4380d' }}>
          {authState?.authenticated
            ? t('card.auth.loggedIn', {
                nickname: authState.nickname ? t('card.nicknameSep', { nickname: authState.nickname }) : '',
              })
            : t('card.auth.loggedOut')}
        </p>
        <iframe
          key={remountKey}
          src={src}
          title={t('card.auth.title')}
          className="hq-sch__login-iframe"
          style={{ background: loginIframeBackground(dark) }}
          allow="clipboard-write"
        />
      </div>
    </div>
  )
}

// ── main card ──────────────────────────────────────────────────────────────

export const GenHit = memo(function GenHit(props: GenHitProps): ReactElement {
  const t = useT()
  const state = projectToolCall(props.block)
  const result = state.phase === 'completed' ? state.result : null
  const artifactKey = result?.artifact?.id ?? null

  // Resolve preview payload from the artifact (epoch-guarded).
  const [payload, setPayload] = useState<{
    phase: 'idle' | 'loading' | 'ready' | 'error' | 'missing'
    source: string | null
    bytes: Uint8Array | null
    filename: string | null
    error: string | null
  }>({ phase: 'idle', source: null, bytes: null, filename: null, error: null })

  useEffect(() => {
    if (state.phase !== 'completed' || !result || !artifactKey) return
    let cancelled = false
    setPayload({ phase: 'loading', source: null, bytes: null, filename: null, error: null })
    ;(async () => {
      try {
        const kind = result.kind ?? 'schematic'
        if (kind === 'system') {
          const art = await resolveArtifactBytes(artifactKey)
          if (cancelled) return
          setPayload({ phase: 'ready', source: null, bytes: art.bytes, filename: art.filename, error: null })
        } else {
          const art = await resolveArtifactText(artifactKey)
          if (cancelled) return
          setPayload({ phase: 'ready', source: art.text, bytes: null, filename: art.filename, error: null })
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[hq-schematic-gen] artifact resolve failed', e)
          setPayload({ phase: 'error', source: null, bytes: null, filename: null, error: String((e as Error)?.message || e) })
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifactKey, state.phase])

  const [busy, setBusy] = useState<string | null>(null)

  function onDownload(): void {
    if (busy || payload.phase !== 'ready') return
    const kind = result?.kind ?? 'schematic'
    const filename = downloadFilenameFor(kind, result?.artifact ?? null, result?.designName ?? null)
    setBusy('download')
    try {
      if (kind === 'system' && payload.bytes) {
        downloadBytes(filename, payload.bytes)
      } else if (payload.source != null) {
        downloadText(filename, payload.source)
      }
    } finally {
      setBusy(null)
    }
  }

  function onRegenerate(): void {
    if (busy) return
    setBusy('regenerate')
    const kind = result?.kind ?? 'schematic'
    const prompt = kind === 'system' ? t('card.regeneratePrompt.system') : t('card.regeneratePrompt.schematic')
    const p = props.sendPrompt
      ? props.sendPrompt(props.sessionId, prompt)
      : Promise.reject(new Error('no prompt sender'))
    p.then(
      () => setBusy(null),
      (err) => { console.warn('[hq-schematic-gen] regenerate failed', err); setBusy(null) },
    )
  }

  // needs_auth
  if (state.phase === 'needs_auth') {
    return <LoginCard toolName={props.toolName} authState={props.authState} t={t} />
  }

  const headerKind = result?.kind ?? kindOf(props.toolName)

  // generating — a run takes 10+ minutes, so show live progress rather than a
  // frozen label. `LiveProgress` owns its own polling and degrades to the
  // coarse stage ladder when the backend emits no trace events.
  if (state.phase === 'generating') {
    return (
      <div className="hq-sch">
        {header(headerKind, 'generating', t)}
        <LiveProgress callId={props.callId} kind={headerKind === 'system' ? 'system' : 'schematic'} t={t} />
      </div>
    )
  }

  // failed
  if (state.phase === 'failed') {
    return (
      <div className="hq-sch">
        {header(headerKind, 'failed', t)}
        <div className="hq-sch__error">{'message' in state ? state.message : t('card.error.toolFailed')}</div>
        <div className="hq-sch__actions">
          <button type="button" className="hq-sch__act" onClick={onRegenerate} disabled={busy === 'regenerate'}>
            ↻ {t('card.error.retry')}
          </button>
        </div>
      </div>
    )
  }

  // completed
  if (!result) {
    return <div className="hq-sch">{header(headerKind, 'failed', t)}</div>
  }

  let preview: ReactElement
  if (payload.phase === 'ready' && (payload.source != null || payload.bytes != null)) {
    const srcKey = artifactKey ?? 'preview'
    preview = (
      <PreviewStage
        payload={{ kind: result.kind === 'system' ? 'system' : 'schematic', source: payload.source, bytes: payload.bytes, srcKey }}
        t={t}
      />
    )
  } else if (payload.phase === 'loading') {
    preview = <div className="hq-sch__stage"><div className="hq-sch__stage-msg">{t('card.preview.loading')}</div></div>
  } else if (payload.phase === 'error') {
    preview = <div className="hq-sch__stage"><div className="hq-sch__stage-msg">{t('card.preview.resolveError')}{payload.error}</div></div>
  } else {
    preview = <div className="hq-sch__stage"><div className="hq-sch__stage-msg">{t('card.preview.missing')}</div></div>
  }

  const canDownload = payload.phase === 'ready' && (payload.source != null || payload.bytes != null)

  return (
    <div className="hq-sch">
      {header(result.kind, 'completed', t)}
      {summary(result, t)}
      {preview}
      {result.note ? <div className="hq-sch__note">{result.note}</div> : null}
      <div className="hq-sch__actions">
        <button type="button" className="hq-sch__act" onClick={onDownload} disabled={!canDownload || busy === 'download'}>
          ⭳ {busy === 'download' ? t('card.action.downloading') : t('card.action.download')}
        </button>
        <button type="button" className="hq-sch__act" onClick={onRegenerate} disabled={busy === 'regenerate'}>
          ↻ {busy === 'regenerate' ? t('card.action.regenerating') : t('card.action.regenerate')}
        </button>
        {typeof props.inspect === 'function'
          ? <button type="button" className="hq-sch__act" onClick={() => props.inspect?.()}>{t('card.action.inspect')}</button>
          : null}
      </div>
    </div>
  )
})
