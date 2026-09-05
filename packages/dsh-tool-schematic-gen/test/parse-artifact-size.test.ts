import { describe, expect, it } from 'vitest'
import { parseSchResult } from '../src/client/parse.js'

describe('parseSchResult artifact size', () => {
  it('drops an invalid negative artifact size from the projected result', () => {
    const result = parseSchResult(JSON.stringify({
      status: 'generated',
      kind: 'system',
      design_name: 'Power Tree',
      module_count: 2,
      connection_count: 1,
      zipArtifact: {
        id: 'art_1',
        type: 'zip',
        filename: 'power-tree.zip',
        size: -1,
      },
    }))

    expect(result).toEqual({
      status: 'generated',
      kind: 'system',
      artifact: {
        id: 'art_1',
        type: 'zip',
        filename: 'power-tree.zip',
        size: null,
      },
      designName: 'Power Tree',
      fileCount: null,
      moduleCount: 2,
      connectionCount: 1,
      note: null,
      agentNote: null,
    })
  })
})
