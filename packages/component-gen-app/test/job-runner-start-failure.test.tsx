// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ComponentGenPorts } from '../src/ports.js'
import { useJobRunner, type UseJobRunnerResult } from '../src/hooks/useJobRunner.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let latest: UseJobRunnerResult | undefined
let root: Root | undefined

function Harness({ ports }: { ports: ComponentGenPorts }) {
  latest = useJobRunner(ports)
  return null
}

function failingPorts(): ComponentGenPorts {
  return {
    config: async () => ({
      hostMode: true,
      capabilities: { symbol: true, footprint: true },
      limits: { imageBytes: 4 * 1024 * 1024 },
    }),
    startJob: async () => {
      throw new Error('job service unavailable')
    },
    jobEvents: () => () => {},
    abortJob: async () => {},
    history: async () => ({ entries: [] }),
    historyEntry: async () => null,
    patchHistory: async () => {
      throw new Error('not expected')
    },
    deleteHistory: async () => {},
    artifactContent: async () => '',
    inputImage: async () => '',
    auth: {
      isAuthenticated: async () => true,
      getUserInfo: async () => null,
      login: async () => {},
      onAuthStateChanged: () => () => {},
    },
  }
}

beforeEach(() => {
  latest = undefined
  document.body.innerHTML = ''
})

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount()
    })
    root = undefined
  }
  latest = undefined
  document.body.innerHTML = ''
})

it('surfaces start failures instead of leaving the runner pending', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(<Harness ports={failingPorts()} />)
  })

  await act(async () => {
    await latest!.run({ kind: 'symbol', input: { imageDataUrl: 'data:image/png;base64,AAAA' } })
  })

  expect(latest).toMatchObject({
    phase: 'failed',
    progress: '',
    dimensions: null,
    pkgType: null,
    fileName: null,
    result: {},
    error: 'job service unavailable',
    jobId: null,
  })
})
