import { describe, expect, it, vi } from 'vitest'
import { InMemoryHuaqiuAuthService } from '../src/service.js'

describe('InMemoryHuaqiuAuthService', () => {
  it('starts unauthenticated and reports null credentials', async () => {
    const svc = new InMemoryHuaqiuAuthService()
    expect(svc.auth.isAuthenticated()).toBe(false)
    expect(await svc.auth.getAccessToken()).toBeNull()
    expect(await svc.auth.getUserInfo()).toBeNull()
  })

  it('stores credentials and exposes them via the auth capability', async () => {
    const svc = new InMemoryHuaqiuAuthService()
    svc.setCredentials({ id: 'u1', token: 'tok-1', nickname: 'Alice' })
    expect(svc.auth.isAuthenticated()).toBe(true)
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
    expect(svc.auth.isAuthenticated()).toBe(false)
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
