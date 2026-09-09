import { describe, expect, it } from 'vitest'
import { downloadFilenameFor } from '../src/client/parse.js'

describe('downloadFilenameFor', () => {
  it('falls back for whitespace-only design names', () => {
    expect(downloadFilenameFor('schematic', null, '   ')).toBe('generated.kicad_sch')
  })

  it('trims surrounding whitespace from derived download names', () => {
    expect(downloadFilenameFor('system', null, '  power-board  ')).toBe('power-board.zip')
  })
})
