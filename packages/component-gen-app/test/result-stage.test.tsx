// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ComponentGenPorts } from '../src/ports.js'

vi.mock('../src/components/PreviewStage.js', () => ({
  PreviewStage: ({ content }: { content: string }) => <div data-testid="preview">{content}</div>,
}))

import { ResultStage } from '../src/components/ResultStage.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function fakePorts(): ComponentGenPorts {
  return {
    config: async () => ({
      hostMode: true,
      capabilities: { symbol: true, footprint: true },
      limits: { imageBytes: 4 * 1024 * 1024 },
    }),
    auth: {
      isAuthenticated: async () => true,
      getUserInfo: async () => ({ nickname: 'tester' }),
      login: async () => {},
      onAuthStateChanged: () => () => {},
    },
    startJob: async () => { throw new Error('not expected') },
    jobEvents: () => () => {},
    abortJob: async () => {},
    history: async () => ({ entries: [] }),
    historyEntry: async () => null,
    patchHistory: async () => { throw new Error('not expected') },
    deleteHistory: async () => {},
    artifactContent: async () => '(kicad artifact)',
    inputImage: async () => '',
  }
}

let root: Root | undefined

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  if (root) {
    act(() => { root!.unmount() })
    root = undefined
  }
  document.body.innerHTML = ''
})

it('clears a previous artifact preview when the next result has no artifact', async () => {
  const ports = fakePorts()
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const t = (key: string): string => key

  await act(async () => {
    root!.render(
      <ResultStage
        ports={ports}
        kind="symbol"
        result={{ artifact: { id: 'artifact-1' }, filename: 'first.kicad_sym' }}
        t={t}
        srcKey="first"
      />,
    )
  })

  expect(container.querySelector('[data-testid="preview"]')?.textContent).toBe('(kicad artifact)')

  await act(async () => {
    root!.render(
      <ResultStage
        ports={ports}
        kind="symbol"
        result={{ fileUrl: 'https://example.invalid/generated.kicad_sym' }}
        t={t}
        srcKey="second"
      />,
    )
  })

  expect(container.querySelector('[data-testid="preview"]')).toBeNull()
})
