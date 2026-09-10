import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveArtifact } from '../src/client/ecad.js'

describe('resolveArtifact', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects non-object metadata responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => null,
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveArtifact('artifact-1')).rejects.toThrow('artifact metadata invalid response')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves valid metadata and content', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ type: 'footprint', filename: 'part.kicad_mod' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '(footprint "part")',
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveArtifact('artifact-1')).resolves.toEqual({
      id: 'artifact-1',
      type: 'footprint',
      filename: 'part.kicad_mod',
      content: '(footprint "part")',
    })
  })
})
