/**
 * ECAD preview + artifact resolution for the schematic/system HIT card.
 *
 * Both renderers come from the bundled `@huaqiu/ecad-renderer` subpaths:
 *   - `renderSchematic`          — single `.kicad_sch` sheet (schematic tool)
 *   - `loadProjectZip`           — system-design project zip; the root sheet
 *     matching the `*.kicad_pro` name is selected and rendered (the published
 *     `renderProjectFromZip` helper is declared in d.ts but not actually
 *     exported by the bundle, so we drive `loadProjectZip` ourselves).
 *
 * Artifact content comes from the `@huaqiu/dsh-artifacts` webServer routes:
 *   GET /api/v1/huaqiu/artifacts/<id>          → { type, filename, encoding }
 *   GET /api/v1/huaqiu/artifacts/<id>/content  → raw bytes (base64 is already
 *     decoded at store time; read as ArrayBuffer, never as text)
 */
import { SchematicParser } from '@huaqiu/kicad-sexpr-parser'
import { renderSchematic } from '@huaqiu/ecad-renderer/schematic'
import { loadProjectZip } from '@huaqiu/ecad-renderer/project'

export interface ResolvedText {
  id: string
  type: string | null
  filename: string | null
  text: string
}

export interface ResolvedBytes {
  id: string
  type: string | null
  filename: string | null
  bytes: Uint8Array
}

/** Resolve an artifact as text content (schematic sheets). */
export async function resolveArtifactText(artifactId: string): Promise<ResolvedText> {
  const metaPath = `/api/v1/huaqiu/artifacts/${encodeURIComponent(artifactId)}`
  const metaRes = await fetch(metaPath)
  if (!metaRes.ok) throw new Error(`artifact metadata ${metaRes.status}`)
  const meta = (await metaRes.json()) as { type?: string; filename?: string; encoding?: string }
  const contentRes = await fetch(`${metaPath}/content`)
  if (!contentRes.ok) throw new Error(`artifact content ${metaRes.status}`)
  const text = await contentRes.text()
  return {
    id: artifactId,
    type: typeof meta.type === 'string' ? meta.type : null,
    filename: typeof meta.filename === 'string' ? meta.filename : null,
    text,
  }
}

/**
 * Resolve an artifact as raw bytes. The artifacts service `/content` route
 * returns the ALREADY-DECODED binary bytes (base64 content is decoded at
 * store time), so we read the response as an ArrayBuffer — never as text.
 */
export async function resolveArtifactBytes(artifactId: string): Promise<ResolvedBytes> {
  const metaPath = `/api/v1/huaqiu/artifacts/${encodeURIComponent(artifactId)}`
  const metaRes = await fetch(metaPath)
  if (!metaRes.ok) throw new Error(`artifact metadata ${metaRes.status}`)
  const meta = (await metaRes.json()) as { type?: string; filename?: string }
  const contentRes = await fetch(`${metaPath}/content`)
  if (!contentRes.ok) throw new Error(`artifact content ${contentRes.status}`)
  const buf = await contentRes.arrayBuffer()
  const bytes = new Uint8Array(buf)
  return {
    id: artifactId,
    type: typeof meta.type === 'string' ? meta.type : null,
    filename: typeof meta.filename === 'string' ? meta.filename : null,
    bytes,
  }
}

function parseSchematic(source: string) {
  const sp = new SchematicParser()
  if (typeof sp.parse !== 'function') throw new Error('SchematicParser.parse is not a function')
  return sp.parse(source)
}

/**
 * Render a single schematic sheet onto a canvas. Returns the renderer dispose.
 */
export async function renderSheetToCanvas(source: string, canvas: HTMLCanvasElement): Promise<() => void> {
  const sch = parseSchematic(source)
  const r = await renderSchematic(sch, { canvas, interactive: true })
  return () => { try { r.dispose() } catch { /* ignore */ } }
}

/**
 * Render a system-design project zip onto a canvas. The published
 * `renderProjectFromZip` is not actually exported by the renderer bundle, so
 * we use the exported `loadProjectZip` (extracts the root schematic matching
 * the `*.kicad_pro` name) and render that sheet via `renderSchematic`.
 */
export async function renderProjectZipToCanvas(zipBytes: Uint8Array, canvas: HTMLCanvasElement): Promise<() => void> {
  const loaded = await loadProjectZip(zipBytes as unknown as Uint8Array<ArrayBuffer>)
  const rootName = typeof loaded.rootSchematic === 'string' ? loaded.rootSchematic : null
  const rootFile = (rootName && loaded.files.find((f) => f.filename === rootName)) || loaded.files[0]
  if (!rootFile || typeof rootFile.content !== 'string') {
    throw new Error('no schematic sheet found in the project zip')
  }
  const sch = parseSchematic(rootFile.content)
  const r = await renderSchematic(sch, { canvas, interactive: true })
  return () => { try { r.dispose() } catch { /* ignore */ } }
}

/** Size a canvas to its CSS box (device-pixel-ratio aware). */
export function sizeCanvasFor(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1
  const cssW = canvas.clientWidth || 720
  const cssH = canvas.clientHeight || 360
  canvas.width = Math.max(100, Math.floor(cssW * dpr))
  canvas.height = Math.max(100, Math.floor(cssH * dpr))
}

/** Trigger a browser download of a text artifact. */
export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  try {
    const blob = new Blob([text], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => { try { URL.revokeObjectURL(url) } catch { /* ignore */ } }, 2000)
  } catch (err) {
    console.warn('[hq-schematic-gen] download failed', err)
  }
}

/** Trigger a browser download of binary bytes. */
export function downloadBytes(filename: string, bytes: Uint8Array, mime = 'application/zip'): void {
  try {
    const blob = new Blob([bytes as BlobPart], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => { try { URL.revokeObjectURL(url) } catch { /* ignore */ } }, 2000)
  } catch (err) {
    console.warn('[hq-schematic-gen] zip download failed', err)
  }
}
