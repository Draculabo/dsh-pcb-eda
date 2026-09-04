/**
 * Pure geometry/dimension model for the interactive footprint dimension
 * editor (rich-hit). Two-way-bound: the SVG package silhouette and the numeric
 * inputs are two views of the same `values` map. Drag a handle → values
 * change; type in an input → geometry re-renders. Only "confirm"/"cancel" go
 * back to the model.
 */

/** Per-key mm bounds used to keep edited values sane. */
const DIM_BOUNDS: Record<string, { min: number; max: number }> = {
  W: { min: 0.1, max: 500 },
  L: { min: 0.1, max: 500 },
  width: { min: 0.1, max: 500 },
  height: { min: 0.1, max: 500 },
  bodyWidth: { min: 0.1, max: 500 },
  bodyLength: { min: 0.1, max: 500 },
  pitch: { min: 0.05, max: 100 },
}

export function dimensionBounds(key: string): { min: number; max: number } {
  return DIM_BOUNDS[key] ?? { min: 0.01, max: 1000 }
}

export function clampDimension(value: number, min: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  if (n < min) return min
  if (n > max) return max
  return n
}

/** Parse a dimension string (allows a trailing unit like "6.2mm"). Null when invalid. */
export function parseDimension(text: string): number | null {
  const m = text.trim().match(/^([+-]?(\d+(\.\d+)?|\.\d+))([^0-9]*)$/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** Format a number for display: max 2 decimals, no trailing zeros. */
export function formatDimension(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  return String(Math.round(value * 100) / 100)
}

/** A dimension map with all scalar values coerced to numbers. */
export type DimensionValues = Record<string, number>

/** Geometry key picks among a dimension map. */
export interface DimensionGeometry {
  widthKey: string | null
  heightKey: string | null
  otherKeys: string[]
  numericKeys: string[]
}

/**
 * Pick the geometry keys among a dimension map: a width-like key and a
 * height-like key (rendered as the draggable board outline) and the rest.
 */
export function pickGeometry(dimensions: DimensionValues): DimensionGeometry {
  let widthKey: string | null = null
  let heightKey: string | null = null
  const numericKeys: string[] = []
  const widthCandidates = ['W', 'width', 'Width', 'D', 'd_max', 'd_min', 'bodyWidth', 'body_width', 'bodyLength', 'body_length', 'boardWidth', 'E', 'e_max', 'e_min']
  const heightCandidates = ['H', 'L', 'height', 'Height', 'Length', 'E', 'e_max', 'e_min', 'bodyLength', 'body_length', 'bodyWidth', 'body_width', 'boardHeight', 'D', 'd_max', 'd_min']

  for (const k of Object.keys(dimensions)) {
    const v = dimensions[k]
    const n = typeof v === 'number' ? v : (typeof v === 'string' ? parseDimension(v) : null)
    if (n == null) continue
    numericKeys.push(k)
  }
  for (const c of widthCandidates) {
    if (!widthKey && dimensions[c] != null) widthKey = c
  }
  for (const c of heightCandidates) {
    if (c !== widthKey && dimensions[c] != null) { heightKey = c; break }
  }
  const otherKeys = numericKeys.filter((k) => k !== widthKey && k !== heightKey)
  return { widthKey, heightKey, otherKeys, numericKeys }
}

/** Normalize a dimension map into numeric values + geometry key picks. */
export function normalizeDimensions(dimensions: Record<string, unknown> | null): DimensionGeometry & { values: DimensionValues } {
  const values: DimensionValues = {}
  if (dimensions && typeof dimensions === 'object' && !Array.isArray(dimensions)) {
    for (const k of Object.keys(dimensions)) {
      const v = dimensions[k]
      const n = typeof v === 'number' ? v : (typeof v === 'string' ? parseDimension(v) : null)
      if (n != null) values[k] = n
    }
  }
  const geom = pickGeometry(values)
  return { values, ...geom }
}

/**
 * Fit a W×H rectangle into a viewBox, preserving aspect ratio and leaving
 * padding for the dimension lines. Returns {x,y,w,h} in viewBox units.
 */
export function rectFromValues(
  values: DimensionValues,
  widthKey: string | null,
  heightKey: string | null,
  viewW: number,
  viewH: number,
  pad: number,
): { x: number; y: number; w: number; h: number } {
  let W = widthKey && values[widthKey] != null ? values[widthKey] : 1
  let H = heightKey && values[heightKey] != null ? values[heightKey] : 1
  if (W <= 0) W = 1
  if (H <= 0) H = 1
  const availW = Math.max(1, viewW - pad * 2)
  const availH = Math.max(1, viewH - pad * 2)
  const scale = Math.min(availW / W, availH / H)
  const w = W * scale
  const h = H * scale
  return { x: (viewW - w) / 2, y: (viewH - h) / 2, w, h }
}

/** Structured message sent back to the agent when the user confirms. */
export function dimensionConfirmMessage(
  pkgType: string | null,
  fileName: string | null,
  values: DimensionValues,
  edited: Record<string, boolean>,
): string {
  const label = pkgType || fileName || 'the component'
  const parts = Object.keys(values).map((k) => `${k}=${formatDimension(values[k])}`)
  let msg = `The user confirmed the footprint dimensions for ${label}: ${parts.join(', ')}. ` +
    'Call generate_footprint_from_dimensions with exactly these dimensions now.'
  const editedKeys = Object.keys(edited).filter((k) => edited[k])
  if (editedKeys.length > 0) {
    msg += ` The user manually changed: ${editedKeys.join(', ')}.`
  }
  return msg
}

/** Structured message sent back to the agent when the user declines. */
export function dimensionDeclineMessage(pkgType: string | null, fileName: string | null): string {
  const label = pkgType || fileName || 'the component'
  return `The user declined to generate a footprint from the extracted dimensions for ${label}. ` +
    'Do not generate a footprint without new instructions.'
}

/** First positive numeric value across alias keys, else the fallback. */
export function numVal(values: DimensionValues, keys: string[], fallback: number): number {
  for (const key of keys) {
    const v = values[key]
    const n = typeof v === 'number' ? v : (typeof v === 'string' ? parseDimension(v) : null)
    if (n != null && Number.isFinite(n) && n > 0) return n
  }
  return fallback
}

/** Pin count from the dimension map (aliases: pin_count, pins, pinCount, n_max…). */
export function pinCountOf(values: DimensionValues, fallback: number): number {
  const n = numVal(values, ['pin_count', 'pins', 'pinCount', 'n_max', 'n'], -1)
  return n >= 0 ? Math.max(2, Math.round(n)) : fallback
}

/** BGA ball-grid rows/columns (aliases: rows, columns, cols). */
export function bgaGrid(values: DimensionValues, fallback: number): { rows: number; cols: number } {
  let rows = Math.round(numVal(values, ['rows', 'row'], fallback))
  let cols = Math.round(numVal(values, ['columns', 'col', 'cols'], fallback))
  if (!(rows > 0)) rows = fallback
  if (!(cols > 0)) cols = fallback
  return { rows, cols }
}

/** Human-readable package-family label for the editor's info row. */
export function pkgFamilyLabel(pkgType: string | null): string {
  return String(pkgType || '').toUpperCase()
}

const PITCH_KEYS = new Set(['pitch', 'pitch_d', 'pitch_e', 'lead_pitch', 'pitch_x', 'e'])
const PIN_KEYS = new Set(['pin_count', 'pins', 'pinCount', 'total_pins'])

/**
 * Split the numeric keys into the small "essential" set (body W/H, pitch,
 * pin count) and the rest, which fold into a collapsible "Advanced" section.
 */
export function classifyDimensions(
  numericKeys: string[],
  widthKey: string | null,
  heightKey: string | null,
): { essential: string[]; advanced: string[] } {
  const essential: string[] = []
  const advanced: string[] = []
  for (const k of numericKeys) {
    if (k === widthKey || k === heightKey || PITCH_KEYS.has(k) || PIN_KEYS.has(k)) {
      if (!essential.includes(k)) essential.push(k)
    } else if (!advanced.includes(k)) {
      advanced.push(k)
    }
  }
  return { essential, advanced }
}

/**
 * Find the min/max tolerance partner for a body dimension key, e.g.
 * `d_max` → `d_min`. Returns { min, max } or null when no partner exists.
 */
export function toleranceOf(values: DimensionValues, key: string | null): { min: number; max: number } | null {
  if (!key || !values || typeof values !== 'object') return null
  let lo: number | null = null
  let hi: number | null = null
  if (/_(max|min)$/.test(key)) {
    const base = key.replace(/_(max|min)$/, '')
    const loKey = `${base}_min`
    const hiKey = `${base}_max`
    const loV = values[loKey]
    const hiV = values[hiKey]
    if (loV != null) lo = loV
    if (hiV != null) hi = hiV
  } else {
    const loV = values[`${key}_min`]
    const hiV = values[`${key}_max`]
    if (loV != null) lo = loV
    if (hiV != null) hi = hiV
  }
  if (lo == null && hi == null) return null
  return { min: lo != null ? lo : (hi as number), max: hi != null ? hi : (lo as number) }
}

/** Structural validation of the dimension set. */
export function validateDimensions(values: DimensionValues): Array<{ key: string; code: 'out_of_range' | 'min_gt_max' | 'invalid' }> {
  const issues: Array<{ key: string; code: 'out_of_range' | 'min_gt_max' | 'invalid' }> = []
  for (const key of Object.keys(values)) {
    const v = values[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      issues.push({ key, code: 'invalid' })
      continue
    }
    const b = dimensionBounds(key)
    if (v < b.min || v > b.max) issues.push({ key, code: 'out_of_range' })
  }
  const pairs: Array<[string, string]> = [['d_min', 'd_max'], ['e_min', 'e_max'], ['a_min', 'a_max'], ['b_min', 'b_max'], ['l_min', 'l_max']]
  for (const [lo, hi] of pairs) {
    const loV = values[lo]
    const hiV = values[hi]
    if (loV != null && hiV != null && loV > hiV) {
      issues.push({ key: hi, code: 'min_gt_max' })
    }
  }
  return issues
}

/** Compact summary used in the package info row: body W×H, pitch and pins. */
export function summaryOf(
  values: DimensionValues,
  widthKey: string | null,
  heightKey: string | null,
  t: (key: string, params?: Record<string, unknown>) => string,
): string[] {
  const parts: string[] = []
  const bodyW = widthKey && values[widthKey] != null ? formatDimension(values[widthKey]) : null
  const bodyH = heightKey && values[heightKey] != null ? formatDimension(values[heightKey]) : null
  if (bodyW != null && bodyH != null) {
    parts.push(`${t('card.editor.body')} ${bodyW} \u00d7 ${bodyH} ${t('card.editor.unit')}`)
  }
  const pitch = numVal(values, ['pitch', 'pitch_d', 'pitch_e', 'lead_pitch', 'pitch_x', 'e'], -1)
  if (pitch >= 0) parts.push(`${t('card.editor.pitch')} ${formatDimension(pitch)} ${t('card.editor.unit')}`)
  return parts
}
