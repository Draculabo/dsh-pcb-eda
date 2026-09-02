import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.js'

describe('artifact plugin registration', () => {
  it('rolls back the provided service when route registration fails', () => {
    const disposeService = vi.fn()
    const routeError = new Error('route registration failed')
    const ctx = {
      provide: vi.fn(() => disposeService),
      webServer: {
        register: vi.fn(() => {
          throw routeError
        }),
      },
      effect: vi.fn((setup: () => unknown) => setup()),
    } as unknown as Context

    expect(() => apply(ctx)).toThrow(routeError)
    expect(disposeService).toHaveBeenCalledTimes(1)
  })
})
