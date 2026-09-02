import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.js'

describe('@huaqiu/dsh-auth plugin entry', () => {
  it('rolls back the provided service when route registration fails', () => {
    const disposeService = vi.fn()
    const registrationError = new Error('route registration failed')
    const ctx = {
      provide: vi.fn(() => disposeService),
      webServer: {
        register: vi.fn(() => {
          throw registrationError
        }),
      },
      effect: (callback: () => unknown) => callback(),
    }

    expect(() => apply(ctx as never)).toThrow(registrationError)
    expect(disposeService).toHaveBeenCalledTimes(1)
  })

  it('disposes the route before removing the provided service', () => {
    const disposalOrder: string[] = []
    let dispose: (() => void) | undefined
    const ctx = {
      provide: vi.fn(() => () => disposalOrder.push('service')),
      webServer: {
        register: vi.fn(() => () => disposalOrder.push('route')),
      },
      effect: (callback: () => unknown) => {
        dispose = callback() as () => void
      },
    }

    apply(ctx as never)
    dispose?.()

    expect(disposalOrder).toEqual(['route', 'service'])
  })
})
