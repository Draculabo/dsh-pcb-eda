// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { triggerDownload } from '../src/utils/ecad.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('triggerDownload', () => {
  it('revokes the object URL when triggering the download fails', () => {
    const createObjectURL = vi.fn(() => 'blob:test-download')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('download blocked')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    triggerDownload('artifact.txt', 'content')

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-download')
  })
})
