import { describe, expect, it } from 'vitest'
import { placeSupportOf } from '../src/placement.js'

describe('placeSupportOf editor type normalization', () => {
  it('accepts a valid editor type with surrounding whitespace', async () => {
    const hqEdge = {
      context: { getEditorType: () => '  pcb  ' },
      placeArtifact: async () => ({ placed: true }),
    }

    const support = placeSupportOf(() => hqEdge, 'footprint')!()

    expect(support?.editorType).toBe('pcb')
    await expect(support?.place({
      type: 'footprint',
      artifactUri: 'file:///part.kicad_mod',
    })).resolves.toEqual({ placed: true })
  })
})
