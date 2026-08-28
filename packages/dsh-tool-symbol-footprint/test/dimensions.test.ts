import { describe, expect, it } from 'vitest'
import {
  confirmDimensionsWithHuman,
  confirmDirectFootprintWithHuman,
  normalizeDimensions,
  parseDimensionOverrides,
  renderDimensionsForHuman,
  HIL_ACCEPT,
  HIL_CANCEL,
  HIL_CONFIRM,
  HIL_DECLINE,
  HIL_EDIT,
} from '../src/dimensions.js'

describe('normalizeDimensions', () => {
  it('keeps only scalar values as editable dimensions', () => {
    const out = normalizeDimensions({
      fileName: 'SOIC-8.kicad_mod',
      pkgType: 'sop',
      dimensions: { W: 6.2, L: 5.0, label: 'wide', nested: { a: 1 } },
    })
    expect(out).toEqual({
      fileName: 'SOIC-8.kicad_mod',
      pkgType: 'sop',
      dimensions: { W: 6.2, L: 5.0, label: 'wide' },
    })
  })

  it('tolerates missing fields', () => {
    expect(normalizeDimensions(null)).toEqual({ fileName: null, pkgType: null, dimensions: {} })
  })
})

describe('parseDimensionOverrides', () => {
  const current = { W: 6.2, L: 5.0, label: 'wide' }

  it('parses key=value / key: value pairs, case-insensitive', () => {
    const r = parseDimensionOverrides('w=6.4, L : 5.2', current)
    expect(r.overrides).toEqual({ W: 6.4, L: 5.2 })
    expect(r.unknownKeys).toEqual([])
    expect(r.badValues).toEqual([])
  })

  it('reports unknown keys and non-numeric values without applying them', () => {
    const r = parseDimensionOverrides('height=3, W=abc', current)
    expect(r.overrides).toEqual({})
    expect(r.unknownKeys).toEqual(['height'])
    expect(r.badValues).toEqual(['W=abc'])
  })

  it('accepts string values for string slots', () => {
    const r = parseDimensionOverrides('label=standard', current)
    expect(r.overrides).toEqual({ label: 'standard' })
  })

  it('ignores prose and empty input', () => {
    expect(parseDimensionOverrides('', current).overrides).toEqual({})
    expect(parseDimensionOverrides('please fix it', current).overrides).toEqual({})
  })
})

describe('renderDimensionsForHuman', () => {
  it('renders key = value lines', () => {
    expect(renderDimensionsForHuman({ W: 6.2, pitch: 1.27 })).toBe('W = 6.2\npitch = 1.27')
  })
  it('handles empty dimensions', () => {
    expect(renderDimensionsForHuman({})).toMatch(/no dimension values/)
  })
})

describe('confirmDimensionsWithHuman', () => {
  function askStub(answer: { selected?: string[]; custom?: string }) {
    return { ask: async () => ({ answers: [answer] }) }
  }

  it('cancels on the Cancel option', async () => {
    const r = await confirmDimensionsWithHuman(askStub({ selected: [HIL_CANCEL] }), {
      fileName: null,
      pkgType: 'qfn',
      dimensions: { W: 5 },
    })
    expect(r.verdict).toBe('cancelled')
  })

  it('confirms with the extracted dimensions when the human picks Confirm', async () => {
    const r = await confirmDimensionsWithHuman(askStub({ selected: [HIL_CONFIRM] }), {
      fileName: null,
      pkgType: 'sop',
      dimensions: { W: 6.2, L: 5 },
    })
    expect(r.verdict).toBe('confirmed')
    expect(r.dimensions).toEqual({ W: 6.2, L: 5 })
    expect(r.edited).toBe(false)
  })

  it('applies free-text corrections when the human edits', async () => {
    const r = await confirmDimensionsWithHuman(askStub({ selected: [HIL_EDIT], custom: 'W=6.4' }), {
      fileName: null,
      pkgType: 'sop',
      dimensions: { W: 6.2 },
    })
    expect(r.verdict).toBe('confirmed')
    expect(r.dimensions).toEqual({ W: 6.4 })
    expect(r.edited).toBe(true)
  })
})

describe('confirmDirectFootprintWithHuman', () => {
  it('accepts by default and declines on the Decline option', async () => {
    const accepted = await confirmDirectFootprintWithHuman(
      { ask: async () => ({ answers: [{ selected: [HIL_ACCEPT] }] }) },
      { fileUrl: 'https://x/y.kicad_mod' },
    )
    expect(accepted.verdict).toBe('accepted')
    const declined = await confirmDirectFootprintWithHuman(
      { ask: async () => ({ answers: [{ selected: [HIL_DECLINE] }] }) },
      { fileUrl: 'https://x/y.kicad_mod' },
    )
    expect(declined.verdict).toBe('declined')
  })
})
