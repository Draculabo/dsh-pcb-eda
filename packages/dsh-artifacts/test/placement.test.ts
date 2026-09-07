import { describe, expect, it } from 'vitest'
import {
  PLACEABLE_ARTIFACT_TYPES,
  canPlaceArtifact,
  parsePlaceableArtifactType,
  placeSupportOf,
  type EditorType,
  type PlaceableArtifactType,
} from '../src/placement.js'

const EDITORS: EditorType[] = ['sch', 'pcb', 'symbol', 'footprint', 'generic']

describe('PLACEABLE_ARTIFACT_TYPES', () => {
  it('classifies exactly schematic, symbol, footprint and pcb', () => {
    expect(PLACEABLE_ARTIFACT_TYPES).toEqual(['schematic', 'symbol', 'footprint', 'pcb'])
  })
})

describe('canPlaceArtifact — full matrix', () => {
  it('matches the task visibility matrix exactly', () => {
    const matrix = PLACEABLE_ARTIFACT_TYPES.map((artifact) =>
      EDITORS.map((editor) => canPlaceArtifact(artifact, editor)),
    )

    //             sch    pcb    symbol footprint generic
    expect(matrix).toEqual([
      [true, false, false, false, true], //  schematic
      [true, false, true, false, true], //   symbol
      [false, true, false, true, true], //   footprint
      [false, true, false, false, true], //  pcb
    ])
  })
})

describe('canPlaceArtifact — per-artifact expectations', () => {
  it('schematic is only placeable in the schematic editor (plus generic)', () => {
    expect(canPlaceArtifact('schematic', 'sch')).toBe(true)
    expect(canPlaceArtifact('schematic', 'generic')).toBe(true)
    for (const editor of EDITORS.filter((e) => e !== 'sch' && e !== 'generic')) {
      expect(canPlaceArtifact('schematic', editor)).toBe(false)
    }
  })

  it('symbol is placeable in the schematic and symbol editors', () => {
    expect(canPlaceArtifact('symbol', 'sch')).toBe(true)
    expect(canPlaceArtifact('symbol', 'symbol')).toBe(true)
    expect(canPlaceArtifact('symbol', 'pcb')).toBe(false)
    expect(canPlaceArtifact('symbol', 'footprint')).toBe(false)
  })

  it('footprint is placeable in the pcb and footprint editors', () => {
    expect(canPlaceArtifact('footprint', 'pcb')).toBe(true)
    expect(canPlaceArtifact('footprint', 'footprint')).toBe(true)
    expect(canPlaceArtifact('footprint', 'sch')).toBe(false)
    expect(canPlaceArtifact('footprint', 'symbol')).toBe(false)
  })

  it('accepts the generic editor for every artifact type (host supports all by design)', () => {
    // The host contract: a `generic` deployment did not declare a specific
    // editor context and supports ALL placement targets by design — the EDA
    // host is the final authority. Mirrors HQ Edge's server-side matrix.
    for (const artifact of PLACEABLE_ARTIFACT_TYPES) {
      expect(canPlaceArtifact(artifact, 'generic')).toBe(true)
    }
  })

  it('pcb is placeable in the pcb editor (editor-side PCB flow builds on this channel)', () => {
    expect(canPlaceArtifact('pcb', 'pcb')).toBe(true)
    expect(canPlaceArtifact('pcb', 'sch')).toBe(false)
    expect(canPlaceArtifact('pcb', 'symbol')).toBe(false)
    expect(canPlaceArtifact('pcb', 'footprint')).toBe(false)
  })

  it('fails closed for an unknown artifact type', () => {
    expect(canPlaceArtifact('zip' as PlaceableArtifactType, 'pcb')).toBe(false)
  })
})

describe('parsePlaceableArtifactType', () => {
  it('accepts the placeable types', () => {
    expect(parsePlaceableArtifactType('schematic')).toBe('schematic')
    expect(parsePlaceableArtifactType('symbol')).toBe('symbol')
    expect(parsePlaceableArtifactType('footprint')).toBe('footprint')
    expect(parsePlaceableArtifactType('pcb')).toBe('pcb')
  })

  it('rejects non-placeable and malformed values', () => {
    // 'zip' exists in the artifact store but has no placement of its own —
    // it is expanded into schematics before the RPC.
    expect(parsePlaceableArtifactType('zip')).toBeNull()
    expect(parsePlaceableArtifactType('')).toBeNull()
    expect(parsePlaceableArtifactType(undefined)).toBeNull()
    expect(parsePlaceableArtifactType(null)).toBeNull()
    expect(parsePlaceableArtifactType(42)).toBeNull()
    expect(parsePlaceableArtifactType({ type: 'symbol' })).toBeNull()
  })
})

describe('placeSupportOf — the hqEdge place seam', () => {
  const hqEdgeOk = {
    context: { getEditorType: () => 'sch' },
    placeArtifact: async () => ({ ok: true }),
  }

  it('returns null when no hqEdge accessor is provided (standalone DSH)', () => {
    expect(placeSupportOf(undefined, 'symbol')).toBeNull()
  })

  it('returns null when the service is absent at resolve time', () => {
    const support = placeSupportOf(() => undefined, 'symbol')!
    expect(support()).toBeNull()
  })

  it('yields a support whose place() delegates to hqEdge.placeArtifact', async () => {
    const support = placeSupportOf(() => hqEdgeOk, 'schematic')!
    const resolved = support()
    expect(resolved).not.toBeNull()
    expect(resolved!.editorType).toBe('sch')
    await expect(resolved!.place({ type: 'schematic', artifactUri: 'file:///a.kicad_sch' })).resolves.toEqual({ ok: true })
  })

  it('hides Place when the editor cannot accept the artifact type', () => {
    // footprint in a schematic editor -> no support.
    const support = placeSupportOf(() => hqEdgeOk, 'footprint')!
    expect(support()).toBeNull()
  })

  it('falls back to context.getCurrent() when getEditorType is missing', () => {
    const hqEdge = {
      context: { getCurrent: () => ({ targetHost: 'hq-eda', editorType: 'pcb' }) },
      placeArtifact: async () => ({}),
    }
    expect(placeSupportOf(() => hqEdge, 'footprint')!()).not.toBeNull()
    expect(placeSupportOf(() => hqEdge, 'symbol')!()).toBeNull()
  })

  it('treats an empty/unknown editor type as not placeable (fail closed)', () => {
    const hqEdge = { context: { getEditorType: () => '' }, placeArtifact: async () => ({}) }
    expect(placeSupportOf(() => hqEdge, 'symbol')!()).toBeNull()
    const broken = { context: { getEditorType: () => { throw new Error('boom') } }, placeArtifact: async () => ({}) }
    expect(placeSupportOf(() => broken, 'symbol')!()).toBeNull()
  })
})
