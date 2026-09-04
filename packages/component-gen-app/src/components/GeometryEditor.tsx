/**
 * `@huaqiu/component-gen-app` — interactive package-dimension editor.
 *
 * Faithful port of the `dsh-tool-symbol-footprint` rich-HIT geometry editor
 * (packageSilhouette + pointerToViewBox + the two-way-bound W/H handle + field
 * editor). DSH-agnostic: `onConfirm(values, edited)` / `onCancel()` are the
 * only ways back to the caller — the app itself is the driver (single-HIL).
 */
import { Fragment, memo, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  bgaGrid, classifyDimensions, clampDimension, dimensionBounds, formatDimension,
  normalizeDimensions, numVal, parseDimension, pinCountOf, pkgFamilyLabel,
  rectFromValues, summaryOf, toleranceOf, validateDimensions, type DimensionValues,
} from '../lib/dims.js'
import { fieldLabel } from '../lib/labels.js'
import type { Translate } from '../copy/index.js'

export interface GeometryEditorProps {
  dimensions: Record<string, unknown>
  pkgType?: string | null
  fileName?: string | null
  disabled?: boolean
  t: Translate
  onConfirm: (values: DimensionValues, edited: Record<string, boolean>) => void
  onCancel: () => void
}

function pointerToViewBox(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect()
  const x = rect.width > 0 ? (clientX - rect.left) * (viewW / rect.width) : 0
  const y = rect.height > 0 ? (clientY - rect.top) * (viewH / rect.height) : 0
  return { x, y }
}

const COUNT_KEYS = new Set(['pin_count', 'pins', 'pinCount', 'rows', 'row', 'columns', 'column', 'cols', 'n_max', 'n', 'count', 'total_pins'])

function packageSilhouette(
  pkgType: string | null,
  values: DimensionValues,
  geom: { x: number; y: number; w: number; h: number },
): ReactElement[] {
  const type = String(pkgType || '').toLowerCase()
  const bodyX = geom.x
  const bodyY = geom.y
  const bodyW = geom.w
  const bodyH = geom.h
  const padL = Math.max(2, Math.min(7, Math.round(Math.min(bodyW, bodyH) * 0.07)))
  const nodes: ReactElement[] = []
  nodes.push(
    <rect key="body" className="hq-genhit__body" x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx={2} />,
  )
  const pins = pinCountOf(values, 8)
  const perSide = Math.max(2, Math.ceil(pins / 2))

  const side = (edge: 'L' | 'R' | 'T' | 'B'): ReactElement[] => {
    const arr: ReactElement[] = []
    if (edge === 'L' || edge === 'R') {
      const len = Math.min(padL, bodyW * 0.22)
      const x0 = edge === 'L' ? bodyX - len : bodyX + bodyW
      for (let i = 0; i < perSide; i++) {
        const y = bodyY + (i + 0.5) * (bodyH / perSide)
        const ph = Math.max(1.6, (bodyH / perSide) * 0.55)
        arr.push(<rect key={edge + i} className="hq-genhit__pad" x={x0} y={y - ph / 2} width={len} height={ph} rx={1} />)
      }
    } else {
      const len2 = Math.min(padL, bodyH * 0.22)
      const y0 = edge === 'T' ? bodyY - len2 : bodyY + bodyH
      for (let j = 0; j < perSide; j++) {
        const x = bodyX + (j + 0.5) * (bodyW / perSide)
        const pw = Math.max(1.6, (bodyW / perSide) * 0.55)
        arr.push(<rect key={edge + j} className="hq-genhit__pad" x={x - pw / 2} y={y0} width={pw} height={len2} rx={1} />)
      }
    }
    return arr
  }

  if (type === 'bga') {
    const g = bgaGrid(values, Math.max(2, Math.round(Math.sqrt(pins))))
    const ballR = Math.max(0.9, Math.min(bodyW, bodyH) / (Math.max(g.rows, g.cols) * 3.4))
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        nodes.push(
          <circle
            key={`ball${r}_${c}`}
            className="hq-genhit__ball"
            cx={bodyX + (c + 0.5) * (bodyW / g.cols)}
            cy={bodyY + (r + 0.5) * (bodyH / g.rows)}
            r={ballR}
          />,
        )
      }
    }
  } else if (type === 'qfn' || type === 'son') {
    const ep = Math.min(bodyW * 0.55, bodyH * 0.55)
    nodes.push(
      <rect
        key="epad"
        className="hq-genhit__epad"
        x={bodyX + (bodyW - ep) / 2}
        y={bodyY + (bodyH - ep) / 2}
        width={ep}
        height={ep}
        rx={1}
      />,
    )
    const edges = type === 'son' ? (['L', 'R'] as const) : (['L', 'R', 'T', 'B'] as const)
    for (const e of edges) nodes.push(...side(e))
  } else if (type === 'qfp' || type === 'plcc') {
    nodes.push(...side('L'), ...side('R'), ...side('T'), ...side('B'))
  } else {
    nodes.push(...side('L'), ...side('R'))
  }
  return nodes
}

/** dims.ts `summaryOf` addresses the plugin's `card.editor.*` keys — remap. */
function editorT(t: Translate): (key: string, params?: Record<string, unknown>) => string {
  return (key, params) => t(key.replace(/^card\.editor\./, 'editor.'), params)
}

export const GeometryEditor = memo(function GeometryEditor(props: GeometryEditorProps): ReactElement {
  const { dimensions, pkgType = null, fileName = null, disabled = false, t, onConfirm, onCancel } = props
  const normalized = useMemo(() => normalizeDimensions(dimensions), [dimensions])
  const { widthKey, heightKey } = normalized

  const [values, setValues] = useState<DimensionValues>(() => normalized.values)
  const [fieldText, setFieldText] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const k of normalized.numericKeys) m[k] = formatDimension(normalized.values[k])
    return m
  })
  const [invalid, setInvalid] = useState<Record<string, boolean>>({})
  const [edited, setEdited] = useState<Record<string, boolean>>({})
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [drag, setDrag] = useState<{
    mode: 'W' | 'H' | 'WH'
    startX: number
    startY: number
    startW: number
    startH: number
    rectW: number
    rectH: number
  } | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const VIEW_W = 360
  const VIEW_H = 230
  const PAD = 34
  const geom = rectFromValues(values, widthKey, heightKey, VIEW_W, VIEW_H, PAD)
  const labelFor = (key: string): string => fieldLabel(key, t)
  const fieldUnit = (key: string): string => (COUNT_KEYS.has(key) ? '' : t('editor.unit'))

  const withKey = (obj: Record<string, number>, key: string, value: number): Record<string, number> => {
    const out = { ...obj }
    out[key] = value
    return out
  }
  const withKeyBool = (obj: Record<string, boolean>, key: string, value: boolean): Record<string, boolean> => {
    const out = { ...obj }
    out[key] = value
    return out
  }

  function startDrag(mode: 'W' | 'H' | 'WH') {
    return (ev: React.PointerEvent<SVGElement>): void => {
      if (disabled || !svgRef.current) return
      ev.preventDefault()
      const view = pointerToViewBox(svgRef.current, ev.clientX, ev.clientY, VIEW_W, VIEW_H)
      setDrag({
        mode,
        startX: view.x,
        startY: view.y,
        startW: widthKey && values[widthKey] != null ? values[widthKey] : 1,
        startH: heightKey && values[heightKey] != null ? values[heightKey] : 1,
        rectW: geom.w,
        rectH: geom.h,
      })
      try { svgRef.current.setPointerCapture(ev.pointerId) } catch { /* ignore */ }
    }
  }

  function onPointerMove(ev: React.PointerEvent<SVGSVGElement>): void {
    if (!drag || !svgRef.current) return
    const view = pointerToViewBox(svgRef.current, ev.clientX, ev.clientY, VIEW_W, VIEW_H)
    let next = values
    let nextEdited = edited
    if (drag.mode === 'W' || drag.mode === 'WH') {
      if (widthKey) {
        const bW = dimensionBounds(widthKey)
        const newW = clampDimension(drag.startW + (view.x - drag.startX) * (drag.startW / drag.rectW), bW.min, bW.max)
        next = withKey(next, widthKey, newW)
        nextEdited = withKeyBool(nextEdited, widthKey, true)
      }
    }
    if (drag.mode === 'H' || drag.mode === 'WH') {
      if (heightKey) {
        const bH = dimensionBounds(heightKey)
        const newH = clampDimension(drag.startH + (view.y - drag.startY) * (drag.startH / drag.rectH), bH.min, bH.max)
        next = withKey(next, heightKey, newH)
        nextEdited = withKeyBool(nextEdited, heightKey, true)
      }
    }
    if (next !== values) setValues(next)
    if (nextEdited !== edited) setEdited(nextEdited)
  }

  function endDrag(): void {
    setDrag(null)
  }

  function onFieldChange(key: string, ev: React.ChangeEvent<HTMLInputElement>): void {
    const raw = ev.target.value
    setFieldText((prev) => ({ ...prev, [key]: raw }))
    const n = parseDimension(raw)
    if (n == null) {
      setInvalid((prev) => ({ ...prev, [key]: true }))
      return
    }
    const bounds = dimensionBounds(key)
    setInvalid((prev) => ({ ...prev, [key]: false }))
    setValues((prev) => withKey(prev, key, clampDimension(n, bounds.min, bounds.max)))
    setEdited((prev) => withKeyBool(prev, key, true))
  }

  function onFieldBlur(key: string): void {
    setFieldText((prev) => ({ ...prev, [key]: formatDimension(values[key]) }))
    setInvalid((prev) => ({ ...prev, [key]: false }))
  }

  function focusField(key: string): void {
    if (disabled || typeof document === 'undefined') return
    const el = document.querySelector(`.hq-genhit__field-input[data-field="${key}"]`) as HTMLInputElement | null
    if (el && el.focus) {
      el.focus()
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  const hasInvalid = Object.values(invalid).some(Boolean)

  const topY = geom.y - 16
  const leftX = geom.x - 16
  const wMid = geom.x + geom.w / 2
  const hMid = geom.y + geom.h / 2
  const wLabel = widthKey && values[widthKey] != null ? `${formatDimension(values[widthKey])} ${t('editor.unit')}` : ''
  const hLabel = heightKey && values[heightKey] != null ? `${formatDimension(values[heightKey])} ${t('editor.unit')}` : ''
  const arrow = (pts: string): ReactElement => <polygon className="hq-genhit__arrow" points={pts} />
  const tolText = (key: string | null): string => {
    const tol = toleranceOf(values, key)
    if (!tol || tol.min == null || tol.max == null || tol.min === tol.max) return ''
    return `${formatDimension(tol.min)}\u2013${formatDimension(tol.max)} ${t('editor.unit')}`
  }
  const wTolText = tolText(widthKey)
  const hTolText = tolText(heightKey)

  const groups = classifyDimensions(normalized.numericKeys, widthKey, heightKey)
  const essentialKeys: string[] = []
  if (widthKey) essentialKeys.push(widthKey)
  if (heightKey) essentialKeys.push(heightKey)
  for (const ek of groups.essential) {
    if (ek !== widthKey && ek !== heightKey) essentialKeys.push(ek)
  }
  const advancedKeys = groups.advanced

  const renderField = (key: string): ReactElement => {
    const bounds = dimensionBounds(key)
    return (
      <div
        className={`hq-genhit__field${invalid[key] ? ' hq-genhit__field--invalid' : ''}`}
        key={key}
        title={invalid[key] ? t('editor.validationInvalid') : undefined}
      >
        <label
          className={`hq-genhit__field-label${edited[key] ? ' hq-genhit__field-label--edited' : ''}`}
          onClick={() => focusField(key)}
        >
          {labelFor(key)}
        </label>
        {edited[key]
          ? <span className="hq-genhit__field-tag hq-genhit__field-tag--edited">{t('editor.editedTag')}</span>
          : <span className="hq-genhit__field-tag hq-genhit__field-tag--ai">{t('editor.aiTag')}</span>}
        <input
          className="hq-genhit__field-input"
          data-field={key}
          type="number"
          inputMode="decimal"
          min={bounds.min}
          max={bounds.max}
          step={0.1}
          value={fieldText[key] == null ? '' : fieldText[key]}
          disabled={disabled}
          onChange={(ev) => onFieldChange(key, ev)}
          onBlur={() => onFieldBlur(key)}
        />
        <span className="hq-genhit__field-unit">{fieldUnit(key)}</span>
      </div>
    )
  }

  const issues = validateDimensions(values)
  const seen = new Set<string>()
  const uniqueIssues = issues.filter((it) => {
    if (seen.has(it.key)) return false
    seen.add(it.key)
    return true
  })
  const issueTexts = uniqueIssues.map((it) => {
    const codeLabel = it.code === 'min_gt_max' ? t('editor.issueMinGtMax')
      : it.code === 'out_of_range' ? t('editor.issueOutOfRange')
      : t('editor.validationInvalid')
    return `${labelFor(it.key)}: ${codeLabel}`
  })
  const totalIssues = issueTexts.length + (hasInvalid ? 1 : 0)

  const canEditGeometry = !!(widthKey && heightKey)
  const summaryParts = summaryOf(values, widthKey, heightKey, editorT(t))

  return (
    <div className="hq-genhit__editor">
      {canEditGeometry
        ? (
          <svg
            ref={svgRef}
            className="hq-genhit__geom"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <line className="hq-genhit__dimline" x1={geom.x} y1={topY} x2={geom.x + geom.w} y2={topY} />
            {arrow(`${geom.x},${topY} ${geom.x + 7},${topY - 3} ${geom.x + 7},${topY + 3}`)}
            {arrow(`${geom.x + geom.w},${topY} ${geom.x + geom.w - 7},${topY - 3} ${geom.x + geom.w - 7},${topY + 3}`)}
            <text
              className={`hq-genhit__dimlabel${widthKey ? ' hq-genhit__dimlabel--clickable' : ''}`}
              x={wMid}
              y={topY - 8}
              textAnchor="middle"
              onClick={widthKey ? () => focusField(widthKey) : undefined}
            >
              {wLabel}
            </text>
            {wTolText ? <text className="hq-genhit__tol" x={wMid} y={topY + 12} textAnchor="middle">{wTolText}</text> : null}
            <line className="hq-genhit__dimline" x1={leftX} y1={geom.y} x2={leftX} y2={geom.y + geom.h} />
            {arrow(`${leftX},${geom.y} ${leftX - 3},${geom.y + 7} ${leftX + 3},${geom.y + 7}`)}
            {arrow(`${leftX},${geom.y + geom.h} ${leftX - 3},${geom.y + geom.h - 7} ${leftX + 3},${geom.y + geom.h - 7}`)}
            <text
              className={`hq-genhit__dimlabel${heightKey ? ' hq-genhit__dimlabel--clickable' : ''}`}
              x={leftX - 8}
              y={hMid}
              textAnchor="middle"
              transform={`rotate(-90 ${leftX - 8} ${hMid})`}
              onClick={heightKey ? () => focusField(heightKey) : undefined}
            >
              {hLabel}
            </text>
            {hTolText
              ? <text className="hq-genhit__tol" x={leftX + 12} y={hMid} textAnchor="middle" transform={`rotate(-90 ${leftX + 12} ${hMid})`}>{hTolText}</text>
              : null}
            {packageSilhouette(pkgType, values, geom).map((node, ni) => (
              <Fragment key={node.key ?? `sil${ni}`}>{node}</Fragment>
            ))}
            <circle className="hq-genhit__handle" cx={geom.x + geom.w} cy={geom.y + geom.h / 2} r={6} onPointerDown={startDrag('W')} />
            <circle className="hq-genhit__handle hq-genhit__handle--h" cx={geom.x + geom.w / 2} cy={geom.y + geom.h} r={6} onPointerDown={startDrag('H')} />
            <circle className="hq-genhit__handle hq-genhit__handle--wh" cx={geom.x + geom.w} cy={geom.y + geom.h} r={7} onPointerDown={startDrag('WH')} />
          </svg>
        )
        : null}
      {canEditGeometry ? <div className="hq-genhit__drag-hint">{t('editor.dragHint')}</div> : null}
      <div className="hq-genhit__pkg">
        {pkgFamilyLabel(pkgType) ? <span className="hq-genhit__badge hq-genhit__badge--pkg">{pkgFamilyLabel(pkgType)}</span> : null}
        <span className="hq-genhit__pkg-meta">{t('editor.pins', { count: pinCountOf(values, 0) })}</span>
        {summaryParts.map((part, pi) => (
          <span className="hq-genhit__pkg-meta hq-genhit__pkg-meta--sep" key={`sum${pi}`}>· {part}</span>
        ))}
      </div>
      {essentialKeys.length > 0 ? <div className="hq-genhit__fields">{essentialKeys.map(renderField)}</div> : null}
      {advancedKeys.length > 0
        ? (
          <div className="hq-genhit__adv">
            <button
              type="button"
              className="hq-genhit__adv-toggle"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              aria-expanded={advancedOpen ? 'true' : 'false'}
            >
              {(advancedOpen ? '\u25be ' : '\u25b8 ') + t('editor.advanced') + ` (${advancedKeys.length})`}
            </button>
            {advancedOpen ? <div className="hq-genhit__fields hq-genhit__fields--adv">{advancedKeys.map(renderField)}</div> : null}
          </div>
        )
        : null}
      <div className={`hq-genhit__validation${totalIssues > 0 ? ' hq-genhit__validation--warn' : ''}`}>
        {totalIssues > 0
          ? (
            <span>
              {t('editor.validationIssue', { n: totalIssues })}
              {issueTexts.length > 0 ? <span className="hq-genhit__validation-detail">{issueTexts[0]}</span> : null}
            </span>
          )
          : <span>{t('editor.validationOk')}</span>}
      </div>
      <div className="hq-genhit__actions">
        <button type="button" className="hq-genhit__act" onClick={() => onConfirm(values, edited)} disabled={disabled || hasInvalid}>
          ✓ {t('editor.confirmLabel')}
        </button>
        <button type="button" className="hq-genhit__act" onClick={onCancel} disabled={disabled}>
          ✕ {t('editor.cancelLabel')}
        </button>
      </div>
    </div>
  )
})
