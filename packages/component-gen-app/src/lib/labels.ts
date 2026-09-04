/**
 * `@huaqiu/component-gen-app` — localized dimension-key labels.
 *
 * Ported from `dsh-tool-symbol-footprint` (parse.ts fieldLabel + i18n.ts
 * FIELD_LABEL_KEY). `humanizeKey()` alone always produced English labels in a
 * Chinese UI, so keys resolve through the copy pack's `field.*` section first
 * and only fall back to `humanizeKey()` for names the agent invented.
 */
import type { Translate } from '../copy/index.js'

/** Humanize a camelCase / snake_case key for display. */
export function humanizeKey(key: string): string {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase())
}

/** canonical (lowercased, separators stripped) dimension key → copy key. */
export const FIELD_LABEL_KEY: Record<string, string> = {
  w: 'field.width',
  width: 'field.width',
  h: 'field.height',
  height: 'field.height',
  l: 'field.length',
  length: 'field.length',
  d: 'field.depth',
  depth: 'field.depth',
  e: 'field.span',
  span: 'field.span',
  bodywidth: 'field.bodyWidth',
  bodylength: 'field.bodyLength',
  bodyheight: 'field.bodyHeight',
  boardwidth: 'field.boardWidth',
  boardheight: 'field.boardHeight',
  overallwidth: 'field.overallWidth',
  overalllength: 'field.overallLength',
  overallheight: 'field.overallHeight',
  pitch: 'field.pitch',
  pitchx: 'field.pitchX',
  pitchy: 'field.pitchY',
  pitchd: 'field.pitch',
  pitche: 'field.pitch',
  leadpitch: 'field.leadPitch',
  padwidth: 'field.padWidth',
  padlength: 'field.padLength',
  padheight: 'field.padHeight',
  leadwidth: 'field.leadWidth',
  leadlength: 'field.leadLength',
  leadspan: 'field.leadSpan',
  pincount: 'field.pinCount',
  pins: 'field.pinCount',
  totalpins: 'field.pinCount',
  n: 'field.pinCount',
  nmax: 'field.pinCount',
  rows: 'field.rows',
  row: 'field.rows',
  columns: 'field.columns',
  column: 'field.columns',
  col: 'field.columns',
  cols: 'field.columns',
  standoff: 'field.standoff',
}

/** Localized label for a dimension key (`w`/`width` → 宽度, …). */
export function fieldLabel(key: string, t: Translate): string {
  const raw = String(key)
  const bounds = /^(.*?)_(max|min)$/i.exec(raw)
  if (bounds) {
    const base = fieldLabel(bounds[1]!, t)
    return t(bounds[2]!.toLowerCase() === 'max' ? 'field.maxOf' : 'field.minOf', { field: base })
  }
  const canonical = raw.toLowerCase().replace(/[\s_-]+/g, '')
  const copyKey = FIELD_LABEL_KEY[canonical]
  return copyKey ? t(copyKey) : humanizeKey(raw)
}
