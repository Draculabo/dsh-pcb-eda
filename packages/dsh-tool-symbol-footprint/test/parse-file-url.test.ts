import { describe, expect, it } from 'vitest'
import { parseGenResult } from '../src/client/parse.js'

describe('parseGenResult file URL projection', () => {
  it('normalizes an empty file URL to null', () => {
    expect(parseGenResult(JSON.stringify({
      status: 'generated',
      kind: 'footprint',
      fileUrl: '   ',
      filename: 'QFN.kicad_mod',
    }))).toEqual({
      status: 'generated',
      kind: 'footprint',
      artifact: null,
      content: null,
      fileUrl: null,
      filename: 'QFN.kicad_mod',
      pkgType: null,
      fileName: null,
      dimensions: null,
      note: null,
      agentNote: null,
      serviceMessage: null,
    })
  })
})
