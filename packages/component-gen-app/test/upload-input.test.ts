import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileToDataUrl } from '../src/components/UploadInput.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fileToDataUrl', () => {
  it('rejects when compression cannot satisfy the configured size limit', async () => {
    const oversized = 'data:image/png;base64,' + 'a'.repeat(128)

    class FakeFileReader {
      result: string | ArrayBuffer | null = oversized
      onerror: (() => void) | null = null
      onload: (() => void) | null = null

      readAsDataURL(): void {
        this.onload?.()
      }
    }

    class FakeImage {
      width = 100
      height = 100
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {
        this.onload?.()
      }
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }),
      toDataURL: () => oversized,
    }

    vi.stubGlobal('FileReader', FakeFileReader)
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        expect(tag).toBe('canvas')
        return canvas
      },
    })

    await expect(fileToDataUrl({} as File, 64)).rejects.toThrow(
      'image remains too large after compression',
    )
  })
})
