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

// Exact payload shape auth.eda.cn actually posts: userId/id are NUMBERS.
// Regression for the login that was rejected with `update_access_token-missing-id`.
const realAuthEdaCnEnvelope = {
  category: 1,
  data: {
    type: 'update_access_token',
    data: {
      userId: 6216935,
      expires_at: 1788359214,
      agreeCollectIP: false,
      token: '0494009e-edbc-5f52-99e3-ae5544f051e-6a919aad',
      id: 6215935,
      username: 'jf_66463080',
      nickname: '老铁',
    },
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

  it('accepts a valid envelope regardless of origin (offline deployment — no origin gate)', () => {
    // Offline DSH deployment: the origin is intentionally not gated (webviews
    // may report an opaque origin for the embedded auth.eda.cn iframe). A
    // well-formed envelope is accepted from any origin; garbage is still
    // rejected by envelope validation.
    expect(handleAuthMessage(eventLike('https://evil.example', validEnvelope))).toEqual({ kind: 'token', info: expect.any(Object) })
    expect(handleAuthMessage(eventLike('null', validEnvelope))).toEqual({ kind: 'token', info: expect.any(Object) })
    expect(handleAuthMessage(eventLike(AUTH_ORIGIN, validEnvelope))).toEqual({ kind: 'token', info: expect.any(Object) })
    // Malformed envelopes are still rejected regardless of origin.
    expect(handleAuthMessage(eventLike('https://evil.example', 'not json'))).toBeNull()
    expect(handleAuthMessage(eventLike(AUTH_ORIGIN, { category: 2, data: { type: 'logout' } }))).toBeNull()
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

  it('accepts a valid envelope from any origin and closes the overlay (offline deployment)', () => {
    const { client, transport, storage, iframes } = makeClient()
    client.auth.login()
    client.handleMessageEvent(eventLike('null', validEnvelope)) // opaque webview origin
    expect(storage.get()).toEqual({ id: 'u1', token: 'tok-1', nickname: 'Alice', expiresAt: 9999999999 })
    expect(transport.pushSession).toHaveBeenCalled()
    expect(iframes[0]!.remove).toHaveBeenCalled()
  })

  it('accepts the REAL auth.eda.cn payload where userId/id are numbers (regression)', () => {
    const { client, transport, storage } = makeClient()
    client.handleMessageEvent(eventLike(AUTH_ORIGIN, JSON.stringify(realAuthEdaCnEnvelope)))
    expect(storage.get()).toEqual({
      id: '6215935',
      token: '0494009e-edbc-5f52-99e3-ae4ef00f051e-6a919aad',
      nickname: '老铁',
      expiresAt: 1788359214,
    })
    expect(transport.pushSession).toHaveBeenCalledWith(expect.objectContaining({ id: '6215935' }))
  })

  it('still ignores malformed envelopes (no store, no push, iframe stays)', () => {
    const { client, transport, storage, iframes } = makeClient()
    client.auth.login()
    client.handleMessageEvent(eventLike('https://evil.example', 'not an envelope'))
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

  it('syncNow() re-pushes persisted credentials when the node half was reset', async () => {
    const { client, transport } = makeClient()
    client.handleMessageEvent(eventLike(AUTH_ORIGIN, validEnvelope)) // persists to localStorage (+1 push)
    await client.syncNow() // healing re-push (+1)
    expect(transport.pushSession).toHaveBeenCalledTimes(2)
    expect(transport.pushSession).toHaveBeenLastCalledWith(expect.objectContaining({ token: 'tok-1', id: 'u1' }))
    // A further sync pushes again (idempotent re-push for healing).
    await client.syncNow()
    expect(transport.pushSession).toHaveBeenCalledTimes(3)
  })

  it('syncNow() is a no-op when nothing is stored', async () => {
    const { client, transport } = makeClient()
    await client.syncNow()
    expect(transport.pushSession).not.toHaveBeenCalled()
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
