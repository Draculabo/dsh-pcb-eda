import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { InMemoryHuaqiuAuthService } from '../src/service.js'
import { authFetch } from './helpers.js'

// Isolate the persisted-session directory so `isAuthenticated()`'s file fallback
// never reads a stray `~/.dsh/auth/session.json` from another run.
const TMP = join(tmpdir(), `dsh-auth-service-test-${process.pid}`)
vi.mock('@deepseek-ai/dsh-home-paths', () => ({ dshHomePath: () => TMP }))

describe('InMemoryHuaqiuAuthService', () => {
  beforeEach(() => rmSync(TMP, { recursive: true, force: true }))
  afterEach(() => rmSync(TMP, { recursive: true, force: true }))

  it('starts unauthenticated and reports null credentials', async () => {
    const svc = new InMemoryHuaqiuAuthService()
    expect(svc.hostMode).toBe(false)
    expect(await svc.auth.isAuthenticated()).toBe(false)
    expect(await svc.auth.getAccessToken()).toBeNull()
    expect(await svc.auth.getUserInfo()).toBeNull()
  })

  it('hostMode reflects an HQ Edge host base URL config', () => {
    expect(new InMemoryHuaqiuAuthService().hostMode).toBe(false)
    expect(new InMemoryHuaqiuAuthService({}).hostMode).toBe(false)
    expect(new InMemoryHuaqiuAuthService({ hqEdgeBaseUrl: 'http://localhost:9999' }).hostMode).toBe(true)
  })

  it('stores credentials and exposes them via the auth capability', async () => {
    const svc = new InMemoryHuaqiuAuthService({}, { fetchImpl: authFetch() })
    svc.setCredentials({ id: 'u1', token: 'tok-1', nickname: 'Alice' })
    expect(await svc.auth.isAuthenticated()).toBe(true)
    expect(await svc.auth.getAccessToken()).toBe('tok-1')
    expect(await svc.auth.getUserInfo()).toEqual({ id: 'u1', token: 'tok-1', nickname: 'Alice' })
  })

  it('update replaces the previous credentials (acceptance group B)', async () => {
    const svc = new InMemoryHuaqiuAuthService()
    svc.setCredentials({ id: 'u1', token: 'old' })
    svc.setCredentials({ id: 'u1', token: 'new' })
    expect(await svc.auth.getAccessToken()).toBe('new')
  })

  it('logout invalidates node state (acceptance group C)', async () => {
    const svc = new InMemoryHuaqiuAuthService()
    svc.setCredentials({ id: 'u1', token: 'tok' })
    await svc.auth.logout()
    expect(await svc.auth.isAuthenticated()).toBe(false)
    expect(await svc.auth.getAccessToken()).toBeNull()
  })

  it('notifies listeners on set and invalidate', () => {
    const svc = new InMemoryHuaqiuAuthService()
    const seen: Array<unknown> = []
    svc.auth.onAuthStateChanged((info) => seen.push(info))
    svc.setCredentials({ id: 'u1', token: 't' })
    svc.invalidate()
    expect(seen).toEqual([{ id: 'u1', token: 't' }, null])
  })

  it('onAuthStateChanged returns a working unsubscriber', () => {
    const svc = new InMemoryHuaqiuAuthService()
    const spy = vi.fn()
    const off = svc.auth.onAuthStateChanged(spy)
    off()
    svc.setCredentials({ id: 'u1', token: 't' })
    expect(spy).not.toHaveBeenCalled()
  })
})
