import { describe, expect, it } from 'vitest'
import { extractFileUrl } from '../src/protocol.js'

describe('extractFileUrl artifact URL fallbacks', () => {
  it('normalizes a flat protocol-relative artifact URL', () => {
    expect(extractFileUrl({ fileUrl: '//cdn.example.com/generated.kicad_sym' }))
      .toBe('https://cdn.example.com/generated.kicad_sym')
  })

  it('falls back to the flat artifact URL when params is malformed JSON', () => {
    expect(extractFileUrl({
      params: '{"fileUrl":',
      fileUrl: 'https://cdn.example.com/generated.kicad_mod',
    })).toBe('https://cdn.example.com/generated.kicad_mod')
  })
})
