import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/styles/inject.js', () => ({ injectAppStyles: vi.fn() }))
vi.mock('react-dom/client', () => ({ createRoot: vi.fn() }))

describe('standalone auth', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('rejects malformed user values from the session response', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('document', { getElementById: () => null })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      authenticated: true,
      user: 'not-an-object',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    const { createStandaloneAuth } = await import('../src/main.js')
    const auth = createStandaloneAuth()

    expect(await Promise.all([
      auth.isAuthenticated(),
      auth.getUserInfo(),
    ])).toEqual([true, null])
  })
})
