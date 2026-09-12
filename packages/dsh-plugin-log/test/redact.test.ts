import { describe, expect, it } from 'vitest'
import { redact, REDACTED } from '../src/redact.js'

describe('redact', () => {
  it('replaces credential-ish field values at any depth', () => {
    const out = redact({
      token: 'abc',
      nested: { authorization: 'Bearer x', keep: 'me', deeper: { apiKey: 'k', ok: 1 } },
    }) as Record<string, any>

    expect(out.token).toBe(REDACTED)
    expect(out.nested.authorization).toBe(REDACTED)
    expect(out.nested.deeper.apiKey).toBe(REDACTED)
    // Innocent neighbours survive — the log must stay readable.
    expect(out.nested.keep).toBe('me')
    expect(out.nested.deeper.ok).toBe(1)
  })

  it('handles the key spellings we actually emit', () => {
    const out = redact({
      accessToken: 'a',
      refresh_token: 'b',
      'x-user-token': 'c',
      password: 'd',
      cookie: 'e',
      credential: 'f',
      secret: 'g',
      apiKey: 'h',
      api_key: 'i',
    }) as Record<string, unknown>

    expect(Object.values(out).every((v) => v === REDACTED)).toBe(true)
  })

  it('does NOT redact `huaqiuAuth` and other innocent names containing "auth"', () => {
    const out = redact({ huaqiuAuth: 'present', authMode: 'host', author: 'me' }) as Record<string, unknown>
    expect(out.huaqiuAuth).toBe('present')
    expect(out.authMode).toBe('host')
    expect(out.author).toBe('me')
  })

  it('redacts a bearer header embedded in an ordinary string', () => {
    const out = redact({ headers: ['Authorization: Bearer abcdef123456'] }) as Record<string, string[]>
    expect(out.headers![0]).toContain(REDACTED)
    expect(out.headers![0]).not.toContain('abcdef123456')
  })

  it('redacts every inline credential in the same string', () => {
    expect(redact('Bearer abcdef123456 then Basic zyxwvuts9876')).toBe(
      `Bearer ${REDACTED} then Basic ${REDACTED}`,
    )
  })

  it('redacts a bare opaque secret blob but keeps paths and URLs', () => {
    expect(redact('21ce59a4-2d69-5b0c-b1ea-6fe3c0d012a4-6a97bb81')).toBe(REDACTED)
    expect(redact('/Users/admin/code/hq-edge/dist/edge-headless')).toBe('/Users/admin/code/hq-edge/dist/edge-headless')
    expect(redact('http://localhost:3000/api/v1/auth/token')).toBe('http://localhost:3000/api/v1/auth/token')
  })

  it('is cycle-safe and depth-limited', () => {
    const cyclic: Record<string, unknown> = { name: 'x' }
    cyclic.self = cyclic
    expect((redact(cyclic) as Record<string, unknown>).self).toBe('[circular]')

    let deep: Record<string, unknown> = { leaf: 1 }
    for (let i = 0; i < 20; i += 1) deep = { child: deep }
    expect(redact(deep)).toEqual(expect.anything())
  })

  it('never throws on exotic values', () => {
    expect(() => redact(Object.create(null))).not.toThrow()
    expect(() => redact(new Error('boom'))).not.toThrow()
    const throwing = { get bad() { throw new Error('nope') } }
    expect(() => redact({ throwing })).not.toThrow()
  })
})
