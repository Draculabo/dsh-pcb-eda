import { describe, expect, it } from 'vitest'
import { parseGenResult } from '../src/client/parse.js'

describe('parseGenResult artifact size', () => {
  it('drops invalid artifact sizes while preserving the artifact projection', () => {
    const negative = parseGenResult(JSON.stringify({
      status: 'generated',
      kind: 'symbol',
      artifact: {
        id: 'art_1234',
        type: 'symbol',
        filename: 'part.kicad_sym',
        size: -1,
      },
    }))
    const overflow = parseGenResult('{"status":"generated","kind":"symbol","artifact":{"id":"art_1234","type":"symbol","filename":"part.kicad_sym","size":1e400}}')

    expect(negative?.artifact).toEqual({
      id: 'art_1234',
      type: 'symbol',
      filename: 'part.kicad_sym',
      size: null,
    })
    expect(overflow?.artifact).toEqual({
      id: 'art_1234',
      type: 'symbol',
      filename: 'part.kicad_sym',
      size: null,
    })
  })

  it('preserves valid zero-byte artifact sizes', () => {
    const result = parseGenResult(JSON.stringify({
      status: 'generated',
      kind: 'symbol',
      artifact: {
        id: 'art_1234',
        type: 'symbol',
        filename: 'part.kicad_sym',
        size: 0,
      },
    }))

    expect(result?.artifact).toEqual({
      id: 'art_1234',
      type: 'symbol',
      filename: 'part.kicad_sym',
      size: 0,
    })
  })
})
