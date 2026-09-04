/**
 * `@huaqiu/component-gen-app` — ECAD canvas preview of a generated artifact.
 *
 * The host supplies the artifact text via `ports.artifactContent`; this
 * component renders it with the bundled ecad-renderer and releases the viewer
 * on unmount / src change.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { renderArtifactToCanvas, sizeCanvasFor } from '../lib/ecad.js'
import type { Translate } from '../copy/index.js'

export interface PreviewStageProps {
  kind: string | null
  content: string
  srcKey: string | null
  t: Translate
}

export function PreviewStage({ kind, content, srcKey, t }: PreviewStageProps): ReactElement {
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
        // Wait one layout frame so the canvas has its final CSS size.
        await new Promise((resolve) => {
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resolve)
          else setTimeout(resolve, 16)
        })
        if (cancelled || canvas !== canvasRef.current) return
        sizeCanvasFor(canvas)
        disposeViewer = await renderArtifactToCanvas(kind ?? 'symbol', content, canvas)
        if (cancelled || canvas !== canvasRef.current) return
        setView({ view: 'ready', message: '' })
      } catch (e) {
        if (!cancelled) {
          console.warn('[hq-component-gen] preview render failed', e)
          setView({ view: 'error', message: String((e as Error)?.message || e) })
        }
      }
    })()
    return () => {
      cancelled = true
      try { disposeViewer?.() } catch { /* ignore */ }
    }
  }, [srcKey, kind, content])

  const overlay =
    view.view === 'loading'
      ? <div className="hq-genhit__stage-msg">{t('app.loading')}</div>
      : view.view === 'error'
        ? <div className="hq-genhit__stage-msg hq-genhit__stage-msg--error">{t('app.error')}{view.message}</div>
        : null

  return (
    <div className={`hq-genhit__stage hq-genhit__stage--${kind ?? 'symbol'}`}>
      <canvas ref={canvasRef} className="hq-genhit__canvas" />
      {overlay}
    </div>
  )
}
