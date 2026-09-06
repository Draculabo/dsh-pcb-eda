/** Backend contract shared by hosted and standalone component generation. */
import type { JobKind } from './types.js'

export interface GenerationExec {
  signal?: AbortSignal
}

export interface ComponentGenBackend {
  generateSymbol(args: { imageDataUrl: string; instruction?: string }, exec: GenerationExec): Promise<Record<string, unknown>>
  extractFootprint(args: { imageDataUrl: string; packageType?: string; instruction?: string }, exec: GenerationExec): Promise<Record<string, unknown>>
  generateFootprint(args: { packageType: string; fileName?: string; dimensions: Record<string, number> }, exec: GenerationExec): Promise<Record<string, unknown>>
}

export function kindLabel(kind: JobKind): 'symbol' | 'footprint' {
  return kind === 'symbol' ? 'symbol' : 'footprint'
}
