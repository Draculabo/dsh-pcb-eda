/**
 * `@huaqiu/component-gen-app` — ECAD preview + download helpers.
 *
 * The preview pipeline is bundled (offline-friendly): `@huaqiu/ecad-renderer`
 * (subpath entries, self-contained ESM) + `@huaqiu/kicad-sexpr-parser` are
 * bundled by tsdown.
 *
 * Unlike the plugin HIT card, artifact TEXT is not fetched from a hardcoded
 * route here — the host supplies it through `ComponentGenPorts.artifactContent`
 * (HTTP or standalone), so this module stays transport-agnostic.
 */
import type { schematicProto } from '@huaqiu/kicad-sexpr-parser'
import type { boardProto } from '@huaqiu/kicad-sexpr-parser'
import { BoardParser, SchematicParser } from '@huaqiu/kicad-sexpr-parser'
import { renderSymbol } from '@huaqiu/ecad-renderer/symbol'
import { renderFootprint } from '@huaqiu/ecad-renderer/footprint'

function wrapFootprintInBoard(src: string): string {
  return `(kicad_pcb (version 20240108) (generator "huaqiu-dsh") ${src})`
}

function parseSymbol(source: string): schematicProto.I_LibSymbol {
  const sp = new SchematicParser()
  if (typeof sp.parseLibSymbols !== 'function') {
    throw new Error('parseLibSymbols is not a method on SchematicParser')
  }
  const symbols = sp.parseLibSymbols(source)
  if (!symbols || symbols.length === 0) throw new Error('no symbols found in .kicad_sym source')
  return symbols[0]!
}

function parseFootprint(source: string): boardProto.I_Footprint {
  const bp = new BoardParser()
  if (typeof bp.parse !== 'function') throw new Error('parse is not a method on BoardParser')
  const toParse = /^\s*\(\s*kicad_pcb\b/.test(source) ? source : wrapFootprintInBoard(source)
  const board = bp.parse(toParse)
  if (!board || !Array.isArray(board.footprints) || board.footprints.length === 0) {
    throw new Error('no footprints found in wrapped kicad_pcb source')
  }
  return board.footprints[0]!
}

/**
 * Render a single generated artifact (symbol/footprint) onto a canvas. Returns
 * the renderer dispose handle so the caller can release the viewer.
 */
export async function renderArtifactToCanvas(
  kind: string,
  content: string,
  canvas: HTMLCanvasElement,
): Promise<() => void> {
  let dispose: (() => void) | undefined
  if (kind === 'symbol') {
    const sym = parseSymbol(content)
    const r = await renderSymbol(sym, { canvas, interactive: true })
    dispose = () => r.dispose()
  } else if (kind === 'footprint') {
    const fp = parseFootprint(content)
    const r = await renderFootprint(fp, { canvas, interactive: true })
    dispose = () => r.dispose()
  } else {
    throw new Error(`unsupported preview kind: ${kind}`)
  }
  return () => { try { dispose?.() } catch { /* ignore */ } }
}

/** Size a canvas to its CSS box (device-pixel-ratio aware). */
export function sizeCanvasFor(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1
  const cssW = canvas.clientWidth || 720
  const cssH = canvas.clientHeight || 320
  canvas.width = Math.max(100, Math.floor(cssW * dpr))
  canvas.height = Math.max(100, Math.floor(cssH * dpr))
}

/** Trigger a browser download of a text artifact. */
export function triggerDownload(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
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
    console.warn('[hq-cga] download failed', err)
  }
}
