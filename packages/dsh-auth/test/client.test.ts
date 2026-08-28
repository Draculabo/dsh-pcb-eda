// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { AUTH_ORIGIN, parseAuthMessage, handleAuthMessage, type AuthTokenPayload } from '../src/client/lib.js'
import { createAuthStorage } from '../src/client/storage.js'
import { createAuthClient } from '../src/client/client.js'

const validEnvelope = {
  category: 1,
  data: {
    type: 'update_access_token',
    data: { userId: 'u1', token: 'tok-1', nickname: 'Alice', expires_at: 9999999999 },
  },
}

function makeClient() {
  const pushes: unknown[] = []
  const transport = {
    pushSession: vi.fn(async (info: AuthTokenPayload) => { pushes.push(['session', info]) }),
    pushLogout: vi.fn(async () => { pushes.push(['logout']) }),
  }
  const storage = createAuthStorage(localStorage)
  const listeners: Array<(e: MessageEvent) => void> = []
  const windowLike = {
    addEventListener: vi.fn((_t: string, fn: (e: MessageEvent) => void) => listeners.push(fn)),
    removeEventListener: vi.fn(() => undefined),
  }
  const iframes: Array<{ remove: () => void; src: string; style: { cssText: string } }> = []
  const documentLike = {
    createElement: vi.fn(() => {
      const el = { remove: vi.fn(), src: '', style: { cssText: '' } }
      iframes.push(el)
      return el
    }),
    body: { appendChild: vi.fn() },
  }
  const client = createAuthClient({
    storage,
    transport,
    windowLike: windowLike as never,
    documentLike: documentLike as never,
  })
  return { client, transport, storage, windowLike, documentLike, iframes, listeners }
}

function eventLike(origin: string, data: unknown): MessageEvent {
  return { origin, data } as MessageEvent
}

describe('parseAuthMessage / handleAuthMessage', () => {
  it('parses a valid token envelope from a JSON string (auth.eda.cn form)', () => {
    const msg = parseAuthMessage(JSON.stringify(validEnvelope))
    expect(msg).toEqual({
      kind: 'token',
      info: { id: 'u1', token: 'tok-1', nickname: 'Alice', expiresAt: 9999999999 },
    })
  })

  it('parses an object envelope with id instead of userId', () => {
    const msg = parseAuthMessage({ category: 1, data: { type: 'update_access_token', data: { id: 'x', token: 't' } } })
    expect(msg).toEqual({ kind: 'token', info: { id: 'x', token: 't' } })
  })

  it('recognizes logout and close_dialog', () => {
    expect(parseAuthMessage({ category: 1, data: { type: 'logout', data: null } })).toEqual({ kind: 'logout' })
    expect(parseAuthMessage({ category: 1, data: { type: 'close_dialog', data: null } })).toEqual({ kind: 'close' })
  })

  it('rejects malformed / unknown envelopes', () => {
    expect(parseAuthMessage('not json')).toBeNull()
    expect(parseAuthMessage(null)).toBeNull()
    expect(parseAuthMessage({ category: 2, data: { type: 'logout' } })).toBeNull()
    expect(parseAuthMessage({ category: 1, data: { type: 'unknown' } })).toBeNull()
    expect(parseAuthMessage({ category: 1, data: { type: 'update_access_token', data: { token: '' } } })).toBeNull()
  })

  it('rejects messages from a non-auth.eda.cn origin (wrong-origin negative test)', () => {
    expect(handleAuthMessage(eventLike('https://evil.example', validEnvelope))).toBeNull()
    expect(handleAuthMessage(eventLike('https://auth.eda.cn.evil.example', validEnvelope))).toBeNull()
    expect(handleAuthMessage(eventLike('http://auth.eda.cn', validEnvelope))).toBeNull()
  })

  it('accepts messages only from the exact trusted origin', () => {
    expect(handleAuthMessage(eventLike(AUTH_ORIGIN, validEnvelope))).toEqual({ kind: 'token', info: expect.any(Object) })
  })
})

describe('createAuthStorage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('round-trips and expires', () => {
    const storage = createAuthStorage(localStorage)
    expect(storage.get()).toBeNull()
    storage.set({ id: 'u', token: 't' })
    expect(storage.get()).toEqual({ id: 'u', token: 't' })
    storage.clear()
    expect(storage.get()).toBeNull()
  })

  it('drops expired tokens (5-day parity)', () => {
    const storage = createAuthStorage(localStorage)
    storage.set({ id: 'u', token: 't', expiresAt: Math.floor(Date.now() / 1000) - 10 })
    expect(storage.get()).toBeNull()
  })
})

describe('auth client behaviors (acceptance groups A–D)', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('group A: token message → stored + pushed to node + iframe closed', async () => {
    const { client, transport, storage, iframes } = makeClient()
    client.auth.login()
    expect(iframes).toHaveLength(1) // overlay opened

    client.handleMessageEvent(eventLike(AUTH_ORIGIN, JSON.stringify(validEnvelope)))
    expect(storage.get()).toEqual({ id: 'u1', token: 'tok-1', nickname: 'Alice', expiresAt: 9999999999 })
    expect(transport.pushSession).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok-1', id: 'u1' }))
    expect(iframes[0]!.remove).toHaveBeenCalled() // closed after success
  })

  it('wrong-origin message is ignored entirely (no store, no push, iframe stays)', () => {
    const { client, transport, storage, iframes } = makeClient()
    client.auth.login()
    client.handleMessageEvent(eventLike('https://evil.example', validEnvelope))
    expect(storage.get()).toBeNull()
    expect(transport.pushSession).not.toHaveBeenCalled()
    expect(iframes[0]!.remove).not.toHaveBeenCalled()
  })

  it('group B: a new login overwrites the previous credentials', () => {
    const { client, storage } = makeClient()
    client.handleMessageEvent(eventLike(AUTH_ORIGIN, validEnvelope))
    const second = { category: 1, data: { type: 'update_access_token', data: { userId: 'u2', token: 'tok-2' } } }
    client.handleMessageEvent(eventLike(AUTH_ORIGIN, second))
    expect(storage.get()).toEqual({ id: 'u2', token: 'tok-2' })
  })

  it('group C: logout clears local state and pushes logout to node', async () => {
    const { client, transport, storage } = makeClient()
    client.handleMessageEvent(eventLike(AUTH_ORIGIN, validEnvelope))
    await client.auth.logout()
    expect(storage.get()).toBeNull()
    expect(transport.pushLogout).toHaveBeenCalled()
    expect(await client.auth.getAccessToken()).toBeNull()
  })

  it('group D: restore() re-pushes persisted credentials on boot (reload restore)', async () => {
    const { client, transport } = makeClient()
    client.handleMessageEvent(eventLike(AUTH_ORIGIN, validEnvelope)) // persists to localStorage
    client.dispose()

    const { client: client2, transport: transport2 } = makeClient()
    await client2.restore()
    expect(transport2.pushSession).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok-1' }))
    expect(await client2.auth.getAccessToken()).toBe('tok-1')
  })

  it('registering the window message listener wires live events', () => {
    const { client, listeners } = makeClient()
    expect(listeners).toHaveLength(1)
    client.dispose()
  })

  it('onAuthStateChanged fires on login/logout', async () => {
    const { client } = makeClient()
    const seen: unknown[] = []
    client.auth.onAuthStateChanged((info) => seen.push(info))
    client.handleMessageEvent(eventLike(AUTH_ORIGIN, validEnvelope))
    await client.auth.logout()
    expect(seen).toEqual([
      expect.objectContaining({ token: 'tok-1' }),
      null,
    ])
  })
})
