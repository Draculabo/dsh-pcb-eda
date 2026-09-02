/**
 * Pure projection layer for the symbol/footprint generation HIT card.
 *
 * No DOM, no React — these helpers are unit-testable and mirror the frozen
 * `ToolCallBlock` → `{ phase, result }` projection used by the original
 * hq-edge client (`docs/research/dsh/research-improve-gen-hit.md §K`).
 *
 * Result shapes produced by the node half (`src/tools.ts`):
 *   { status:'generated', kind, fileUrl, filename, artifact:{id,type,filename,size}, content?, pkgType?, dimensions?, note?, serviceMessage? }
 *   { status:'needs_confirmation', kind:'footprint', pkgType, fileName, dimensions, agentNote }
 *   { status:'cancelled', kind:'footprint', pkgType, fileName, ... }
 *   { status:'needs_auth', kind:'symbol'|'footprint', hint }
 *
 * `note` is user-safe status detail; `agentNote` is an agent-only directive and
 * is deliberately NOT rendered (see the `src/tools.ts` module header).
 */

import { FIELD_LABEL_KEY, type Translate } from './i18n.js'

/** Minimal tool-call block read by the card (frozen wire shape subset). */
export interface ContentBlockLike {
  type?: string
  text?: string
}

export interface ToolBlockLike {
  content?: readonly ContentBlockLike[]
  isError?: boolean
  error?: { code?: string } | null
}

export interface ArtifactRef {
  id: string
  type: string | null
  filename: string | null
  size: number | null
}

export interface GenResult {
  status: string | null
  kind: string | null
  artifact: ArtifactRef | null
  content: string | null
  fileUrl: string | null
  filename: string | null
  pkgType: string | null
  fileName: string | null
  dimensions: Record<string, unknown> | null
  /** Safe to show a human: degradation / status detail. */
  note: string | null
  /**
   * Agent-only directive (what to call next, what not to repeat in the reply).
   * The card MUST NOT render this — see `src/tools.ts` module header.
   */
  agentNote: string | null
  serviceMessage: string | null
}

export type ProjectedPhase =
  | { phase: 'generating' }
  | { phase: 'failed'; message: string }
  | { phase: 'needs_confirmation'; result: GenResult }
  | { phase: 'needs_auth'; result: GenResult }
  | { phase: 'completed'; result: GenResult }
  | { phase: 'cancelled'; result: GenResult }
  | { phase: 'unknown' }

/** First text block of a settled tool result (renderJsonText output). */
export function resultTextOf(block: ToolBlockLike | undefined): string {
  const content = block?.content
  if (!Array.isArray(content)) return ''
  for (const c of content) {
    if (c && c.type === 'text' && typeof c.text === 'string') return c.text
  }
  return ''
}

function firstLine(text: string): string {
  const t = text.trim()
  const nl = t.indexOf('\n')
  return nl === -1 ? t : t.slice(0, nl)
}

/** Parse the generation tool result JSON into a structured shape. */
export function parseGenResult(text: string): GenResult | null {
  const t = text.trim()
  if (t === '') return null
  let v: unknown
  try {
    v = JSON.parse(t)
  } catch {
    return null
  }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const obj = v as Record<string, unknown>

  const status = typeof obj.status === 'string' ? obj.status : null
  let kind = typeof obj.kind === 'string' ? obj.kind : null
  if (kind === null) {
    const rawArtType = obj.artifact && typeof obj.artifact === 'object'
      ? (obj.artifact as Record<string, unknown>).type : null
    if (rawArtType === 'symbol' || rawArtType === 'footprint' || rawArtType === 'schematic' || rawArtType === 'pcb') {
      kind = rawArtType
    }
  }

  let artifact: ArtifactRef | null = null
  if (obj.artifact && typeof obj.artifact === 'object') {
    const a = obj.artifact as Record<string, unknown>
    const aid = typeof a.id === 'string' ? a.id : null
    if (aid) {
      artifact = {
        id: aid,
        type: typeof a.type === 'string' ? a.type : (kind ?? null),
        filename: typeof a.filename === 'string' ? a.filename : null,
        size: typeof a.size === 'number' && Number.isFinite(a.size) && a.size >= 0 ? a.size : null,
      }
    }
  }

  const content = (typeof obj.content === 'string' && obj.content.trim() !== '') ? obj.content : null
  const fileUrl = typeof obj.fileUrl === 'string' ? obj.fileUrl : null
  const filename = typeof obj.filename === 'string' ? obj.filename
    : (artifact?.filename ?? null)

  let dimensions: Record<string, unknown> | null = null
  if (obj.dimensions && typeof obj.dimensions === 'object' && !Array.isArray(obj.dimensions)) {
    dimensions = obj.dimensions as Record<string, unknown>
  }

  return {
    status,
    kind,
    artifact,
    content,
    fileUrl,
    filename,
    pkgType: typeof obj.pkgType === 'string' ? obj.pkgType : null,
    fileName: typeof obj.fileName === 'string' ? obj.fileName : null,
    dimensions,
    note: typeof obj.note === 'string' ? obj.note : null,
    agentNote: typeof obj.agentNote === 'string' ? obj.agentNote : null,
    serviceMessage: typeof obj.serviceMessage === 'string' ? obj.serviceMessage : null,
  }
}

/**
 * Project the authoritative DSH `ToolCallBlock` into the HIT state model.
 *   RunningToolCall (no `content`)              → generating
 *   ToolResultNode isError                       → failed
 *   status:'generated'                           → completed
 *   status:'needs_confirmation'                  → needs_confirmation
 *   status:'needs_auth'                          → needs_auth
 *   status:'cancelled'                           → cancelled
 *   unparseable                                  → failed (surfaces raw text)
 */
export function projectToolCall(block: ToolBlockLike | undefined): ProjectedPhase {
  if (!block || typeof block !== 'object') return { phase: 'unknown' }
  if (!Array.isArray(block.content)) {
    // RunningToolCall — the tool/call event arrived, tool/result has not.
    return { phase: 'generating' }
  }
  if (block.isError === true) {
    const errText = resultTextOf(block)
    const errCode = block.error && typeof block.error.code === 'string' ? block.error.code : null
    return {
      phase: 'failed',
      message: firstLine(errText) || (errCode ? `tool error: ${errCode}` : 'generation failed'),
    }
  }
  const text = resultTextOf(block)
  const parsed = parseGenResult(text)
  if (!parsed) {
    return { phase: 'failed', message: firstLine(text) || 'unparseable tool result' }
  }
  if (parsed.status === 'generated') return { phase: 'completed', result: parsed }
  if (parsed.status === 'needs_confirmation') return { phase: 'needs_confirmation', result: parsed }
  if (parsed.status === 'needs_auth') return { phase: 'needs_auth', result: parsed }
  if (parsed.status === 'cancelled') return { phase: 'cancelled', result: parsed }
  if (parsed.kind) return { phase: 'completed', result: parsed }
  return { phase: 'failed', message: `unexpected tool status: ${parsed.status}` }
}

/** Humanize a camelCase / snake_case key for display. */
export function humanizeKey(key: string): string {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase())
}

/**
 * Localized label for a dimension key.
 *
 * `humanizeKey()` alone always produced English ("body_length" → "Body
 * length") even in a Chinese UI, because the label was derived from the key's
 * spelling rather than looked up in the locale pack. This resolves the key
 * against `FIELD_LABEL_KEY` first and only falls back to `humanizeKey()` for
 * names the agent invented.
 *
 * A `_max` / `_min` suffix is split off and re-applied through
 * `field.maxOf` / `field.minOf`, so `d_max` and `d_min` share one translated
 * base label instead of needing their own entries.
 */
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

/** Default download filename for a kind when the result has none. */
export function defaultFilenameFor(kind: string | null, artifactId: string | null): string {
  let suffix = 'txt'
  if (kind === 'symbol') suffix = 'kicad_sym'
  else if (kind === 'footprint') suffix = 'kicad_mod'
  else if (kind === 'schematic') suffix = 'kicad_sch'
  else if (kind === 'pcb') suffix = 'kicad_pcb'
  const base = artifactId ?? 'generated'
  return `${base}.${suffix}`
}

export function formatBytes(n: number | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Short stable hash for inline content (used as a render srcKey). */
export function hashString(s: string): string {
  let h = 5381
  const str = String(s)
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
