import { describe, expect, it } from 'vitest'
import { bytesToBase64 } from '../src/client/b64.js'

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

describe('bytesToBase64 (Open in EDA transport)', () => {
  it('round-trips a small byte array', () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x61, 0x62])
    expect(fromB64(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('round-trips across the chunk boundary (64 KiB)', () => {
    const bytes = new Uint8Array(0x10000 + 37)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 256
    expect(fromB64(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('matches the canonical base64 for a known string', () => {
    const bytes = new TextEncoder().encode('PK\x03\x04 fake zip')
    expect(bytesToBase64(bytes)).toBe('UEsDBCBmYWtlIHppcA==')
  })

  it('handles an empty array', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('')
  })
})
