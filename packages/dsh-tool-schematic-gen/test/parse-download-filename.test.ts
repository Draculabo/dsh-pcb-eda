import { describe, expect, it } from 'vitest'
import { downloadFilenameFor } from '../src/client/parse.js'

describe('downloadFilenameFor', () => {
  it('falls back when the design name is only whitespace', () => {
    expect([
      downloadFilenameFor('system', null, '   \n\t'),
      downloadFilenameFor('schematic', null, '   \n\t'),
      downloadFilenameFor(null, null, '   \n\t'),
    ]).toEqual([
      'generated.zip',
      'generated.kicad_sch',
      'generated.txt',
    ])
  })

  it('preserves non-empty design names without rewriting them', () => {
    expect(downloadFilenameFor('system', null, '  board  ')).toBe('  board  .zip')
  })
})
