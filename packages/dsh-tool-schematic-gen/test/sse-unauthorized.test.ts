import { describe, expect, it, vi } from 'vitest'
import { consumeCopilotkit } from '../src/sse.js'

describe('consumeCopilotkit unauthorized invalidation', () => {
  it('invalidates cached credentials on HTTP 401', async () => {
    const onUnauthorized = vi.fn()
    const fetchImpl = async () => new Response('unauthorized', { status: 401 })

    await expect(consumeCopilotkit('https://x/api/copilotkit', {}, {}, {
      fetchImpl: fetchImpl as never,
      onUnauthorized,
      timeoutMs: 5000,
    })).rejects.toThrow(/HTTP 401/)

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('does not invalidate credentials for other HTTP errors', async () => {
    const onUnauthorized = vi.fn()
    const fetchImpl = async () => new Response('forbidden', { status: 403 })

    await expect(consumeCopilotkit('https://x/api/copilotkit', {}, {}, {
      fetchImpl: fetchImpl as never,
      onUnauthorized,
      timeoutMs: 5000,
    })).rejects.toThrow(/HTTP 403/)

    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})
