import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveArtifactText } from '../src/client/ecad.js'

describe('resolveArtifactText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports the content response status when artifact content fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        type: 'application/x-kicad-schematic',
        filename: 'example.kicad_sch',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveArtifactText('artifact-1')).rejects.toThrow('artifact content 503')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
