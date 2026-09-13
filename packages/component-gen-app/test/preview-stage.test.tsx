// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const ecad = vi.hoisted(() => ({
  renderArtifactToCanvas: vi.fn(),
  sizeCanvasFor: vi.fn(),
}))

vi.mock('../src/utils/ecad.js', () => ecad)

import { PreviewStage } from '../src/components/PreviewStage.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  ecad.renderArtifactToCanvas.mockReset()
  ecad.sizeCanvasFor.mockReset()
})

afterEach(() => {
  if (root) {
    act(() => { root!.unmount() })
    root = undefined
  }
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

it('disposes a viewer that finishes rendering after the preview is unmounted', async () => {
  let resolveRender: ((dispose: () => void) => void) | undefined
  ecad.renderArtifactToCanvas.mockImplementation(() => new Promise<() => void>((resolve) => {
    resolveRender = resolve
  }))

  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(
      <PreviewStage
        kind="footprint"
        content="(footprint \"SOP-8\")"
        srcKey="artifact-1"
        t={(key) => key}
      />,
    )
    await Promise.resolve()
  })

  expect(ecad.renderArtifactToCanvas).toHaveBeenCalledTimes(1)
  expect(resolveRender).toBeTypeOf('function')

  act(() => {
    root!.unmount()
    root = undefined
  })

  const dispose = vi.fn()
  await act(async () => {
    resolveRender!(dispose)
    await Promise.resolve()
  })

  expect(dispose).toHaveBeenCalledTimes(1)
})
