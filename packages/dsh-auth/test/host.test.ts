import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryHuaqiuAuthService } from '../src/service.js'
import { HostSessionResolver, normalizeHostUser, resolveHostConfig } from '../src/host.js'
import { authFetch } from './helpers.js'

// Redirect the persisted-session directory to a temp dir so the disk round-trip
// is real (no mocking of fs) but never touches ~/.dsh.
const TMP = join(tmpdir(), `dsh-auth-host-test-${process.pid}`)
vi.mock('@deepseek-ai/dsh-home-paths', () => ({
  dshHomePath: () => TMP,
}))

beforeEach(() => { rmSync(TMP, { recursive: true, force: true }) })
afterEach(() => { rmSync(TMP, { recursive: true, force: true }) })

function fakeFetchOnce(payload: Record<string, unknown> | null, ok = true) {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 401,
    json: async () => payload,
  })) as unknown as typeof fetch
}

describe('resolveHostConfig', () => {
  it('prefers overlay config over env', () => {
    const c = resolveHostConfig(
      { hqEdgeBaseUrl: 'http://overlay:1' },
      { HQ_EDGE_BASE_URL: 'http://env:2', HQ_EDGE_HOST_TTL_SECONDS: '99' },
    )
    expect(c.hqEdgeBaseUrl).toBe('http://overlay:1')
    // env still fills the unconfigured keys
    expect(c.hostSessionTtlSeconds).toBe(99)
  })

  it('falls back to env when overlay is silent', () => {
    const c = resolveHostConfig(undefined, {
      HQ_EDGE_BASE_URL: 'http://env:2',
      HQ_EDGE_AUTH_PATH: '/x',
    })
    expect(c.hqEdgeBaseUrl).toBe('http://env:2')
    expect(c.hostAuthPath).toBe('/x')
  })

  it('applies defaults when nothing is configured', () => {
    const c = resolveHostConfig(undefined, {})
    expect(c.hqEdgeBaseUrl).toBe('')
    expect(c.hostAuthPath).toBe('/api/v1/auth/token')
    expect(c.hostSessionTtlSeconds).toBe(300)
  })
})

describe('normalizeHostUser', () => {
  it('requires both token and id', () => {
    expect(normalizeHostUser({ token: 't' })).toBeNull()
    expect(normalizeHostUser({ userId: 'u' })).toBeNull()
  })
  it('accepts userId / id / user_id', () => {
    expect(normalizeHostUser({ token: 't', id: 'u' })?.id).toBe('u')
    expect(normalizeHostUser({ token: 't', userId: 'u2' })?.id).toBe('u2')
    expect(normalizeHostUser({ token: 't', user_id: 'u3' })?.id).toBe('u3')
  })
  it('carries nickname', () => {
    expect(normalizeHostUser({ token: 't', id: 'u', nickname: 'Bob' })?.nickname).toBe('Bob')
  })
})

describe('HostSessionResolver', () => {
  it('is disabled and returns null without a base url', async () => {
    const r = new HostSessionResolver('', '/api/v1/auth/token', 300_000)
    expect(r.enabled).toBe(false)
    expect(await r.resolve()).toBeNull()
  })

  it('fetches, caches within TTL, and re-fetches after TTL', async () => {
    const fetchImpl = fakeFetchOnce({ token: 'tok', userId: 'u' })
    const r = new HostSessionResolver('http://hq', '/api/v1/auth/token', 300_000, fetchImpl)
    expect(await r.resolve()).toEqual({ id: 'u', token: 'tok' })
    expect(await r.resolve()).toEqual({ id: 'u', token: 'tok' })
    // second call served from cache → fetch called exactly once
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('clear() forces a re-fetch', async () => {
    const fetchImpl = fakeFetchOnce({ token: 'tok', userId: 'u' })
    const r = new HostSessionResolver('http://hq', '/api/v1/auth/token', 300_000, fetchImpl)
    await r.resolve()
    r.clear()
    await r.resolve()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('falls back to a cached value on network error', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('boom') }) as unknown as typeof fetch
    const r = new HostSessionResolver('http://hq', '/api/v1/auth/token', 300_000, fetchImpl)
    expect(await r.resolve()).toBeNull()
  })
})

describe('InMemoryHuaqiuAuthService host mode', () => {
  it('resolves the host session ahead of a pushed session', async () => {
    const fetchImpl = fakeFetchOnce({ token: 'host-tok', userId: 'host-u' })
    const svc = new InMemoryHuaqiuAuthService(
      { hqEdgeBaseUrl: 'http://hq' },
      { fetchImpl },
    )
    // A browser push should NOT override the authoritative host session.
    svc.setCredentials({ id: 'pushed-u', token: 'pushed-tok' })
    expect(await svc.auth.getAccessToken()).toBe('host-tok')
    expect((await svc.auth.getUserInfo())?.id).toBe('host-u')
  })

  it('falls back to standalone when host config is missing/invalid', async () => {
    const svc = new InMemoryHuaqiuAuthService({ hqEdgeBaseUrl: '' }, { fetchImpl: authFetch() })
    svc.setCredentials({ id: 'u', token: 'tok' })
    expect(await svc.auth.isAuthenticated()).toBe(true)
    expect(await svc.auth.getAccessToken()).toBe('tok')
  })

  it('invalid() clears the host cache so the next resolve re-fetches', async () => {
    const fetchImpl = fakeFetchOnce({ token: 'tok', userId: 'u' })
    const svc = new InMemoryHuaqiuAuthService(
      { hqEdgeBaseUrl: 'http://hq' },
      { fetchImpl },
    )
    await svc.auth.getAccessToken()
    svc.invalidate()
    await svc.auth.getAccessToken()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('InMemoryHuaqiuAuthService node-side persistence', () => {
  it('writes the session to disk on setCredentials', async () => {
    const svc = new InMemoryHuaqiuAuthService()
    svc.setCredentials({ id: 'u', token: 'tok', nickname: 'Al' })
    const file = join(TMP, 'session.json')
    expect(existsSync(file)).toBe(true)
    const written = JSON.parse(readFileSync(file, 'utf8'))
    expect(written).toEqual({ id: 'u', token: 'tok', nickname: 'Al' })
  })

  it('reads the persisted session as a fallback after a restart-like gap', async () => {
    // Simulate a prior session: a fresh service finds the file with no in-memory state.
    mkdirSync(TMP, { recursive: true })
    const file = join(TMP, 'session.json')
    writeFileSync(file, JSON.stringify({ id: 'restored', token: 'rtok' }))
    const svc = new InMemoryHuaqiuAuthService({}, { fetchImpl: authFetch() })
    expect(await svc.auth.isAuthenticated()).toBe(true)
    expect(await svc.auth.getAccessToken()).toBe('rtok')
    expect((await svc.auth.getUserInfo())?.id).toBe('restored')
  })

  it('clears the persisted file on invalidate()', async () => {
    const svc = new InMemoryHuaqiuAuthService()
    svc.setCredentials({ id: 'u', token: 'tok' })
    const file = join(TMP, 'session.json')
    expect(existsSync(file)).toBe(true)
    svc.invalidate()
    expect(existsSync(file)).toBe(false)
    expect(await svc.auth.getUserInfo()).toBeNull()
  })
})
