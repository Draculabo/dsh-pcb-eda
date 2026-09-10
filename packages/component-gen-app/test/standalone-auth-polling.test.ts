// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createStandaloneAuth } from '../src/main.js'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('does not start another auth poll while the previous request is pending', async () => {
  vi.useFakeTimers()
  let resolveFirst: ((response: Response) => void) | undefined
  const firstResponse = new Promise<Response>((resolve) => {
    resolveFirst = resolve
  })
  const fetchMock = vi.fn()
    .mockReturnValueOnce(firstResponse)
    .mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: false, user: null }),
    } as Response)
  vi.stubGlobal('fetch', fetchMock)

  createStandaloneAuth()
  expect(fetchMock).toHaveBeenCalledTimes(1)

  await vi.advanceTimersByTimeAsync(6000)
  expect(fetchMock).toHaveBeenCalledTimes(1)

  resolveFirst!({
    ok: true,
    json: async () => ({ authenticated: false, user: null }),
  } as Response)
  await Promise.resolve()

  await vi.advanceTimersByTimeAsync(2000)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
