import { describe, expect, it } from 'vitest'
import { parseSchResult } from '../src/client/parse.js'

describe('parseSchResult result counts', () => {
  it('normalizes invalid system-design counts to null', () => {
    const result = parseSchResult(JSON.stringify({
      status: 'generated',
      kind: 'system',
      design_name: 'sensor-node',
      module_count: -1,
      connection_count: 2.5,
      zipArtifact: {
        id: 'art_123',
        type: 'zip',
        filename: 'sensor-node.zip',
        size: 128,
      },
    }))

    expect(result).toEqual({
      status: 'generated',
      kind: 'system',
      artifact: {
        id: 'art_123',
        type: 'zip',
        filename: 'sensor-node.zip',
        size: 128,
      },
      designName: 'sensor-node',
      fileCount: null,
      moduleCount: null,
      connectionCount: null,
      note: null,
      agentNote: null,
    })
  })
})
