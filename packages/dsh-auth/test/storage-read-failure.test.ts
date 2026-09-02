import { describe, expect, it, vi } from 'vitest'
import { createAuthStorage } from '../src/client/storage.js'

describe('createAuthStorage', () => {
  it('treats storage read failures as an empty credential cache', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('storage access denied')
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    expect(createAuthStorage(storage).get()).toBeNull()
    expect(storage.getItem).toHaveBeenCalledWith('huaqiu.dsh.auth')
    expect(storage.removeItem).not.toHaveBeenCalled()
  })
})
