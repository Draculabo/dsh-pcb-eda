// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { triggerDownload } from '../src/client/ecad.js'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('triggerDownload', () => {
  it('cleans up the anchor and object URL when the click fails', () => {
    vi.useFakeTimers()

    const createObjectURL = vi.fn(() => 'blob:artifact')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    })

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('download blocked')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    triggerDownload('symbol.kicad_sym', '(kicad_symbol_lib)')

    expect(click).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('a')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.advanceTimersByTime(2000)

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:artifact')
  })
})
