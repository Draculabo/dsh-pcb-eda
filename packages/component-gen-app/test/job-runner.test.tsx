// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useJobRunner, type UseJobRunnerResult } from '../src/hooks/useJobRunner.js'
import type { ComponentGenPorts, JobEvent } from '../src/ports.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let latestRunner: UseJobRunnerResult | undefined
let emitEvent: ((event: JobEvent) => void) | undefined
let root: Root | undefined

function fakePorts(): ComponentGenPorts {
  return {
    config: async () => ({
      hostMode: true,
      capabilities: { symbol: true, footprint: true },
      limits: { imageBytes: 4 * 1024 * 1024 },
    }),
    auth: {
      isAuthenticated: async () => true,
      getUserInfo: async () => null,
      login: async () => {},
      onAuthStateChanged: () => () => {},
    },
    startJob: async (req) => ({
      id: 'job-1',
      kind: req.kind,
      status: 'queued',
      createdAt: '2026-09-09T00:00:00.000Z',
      updatedAt: '2026-09-09T00:00:00.000Z',
    }),
    jobEvents: (_jobId, onEvent) => {
      emitEvent = onEvent
      return () => {}
    },
    abortJob: async () => {},
    history: async () => ({ entries: [] }),
    historyEntry: async () => null,
    patchHistory: async () => { throw new Error('not expected') },
    deleteHistory: async () => {},
    artifactContent: async () => '',
    inputImage: async () => '',
  }
}

function Harness({ ports }: { ports: ComponentGenPorts }) {
  latestRunner = useJobRunner(ports)
  return null
}

beforeEach(() => {
  latestRunner = undefined
  emitEvent = undefined
  document.body.innerHTML = ''
})

afterEach(() => {
  if (root) {
    act(() => { root!.unmount() })
    root = undefined
  }
  document.body.innerHTML = ''
})

it('clears confirmation metadata when resetting a job', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(<Harness ports={fakePorts()} />)
  })

  await act(async () => {
    await latestRunner!.run({ kind: 'extract-footprint', input: {} })
  })

  act(() => {
    emitEvent!({
      type: 'needs_confirmation',
      dimensions: { pitch: 1.27 },
      pkgType: 'SOP-8',
      fileName: 'sop8.png',
      at: '2026-09-09T00:00:01.000Z',
    })
  })

  expect(latestRunner!.pkgType).toBe('SOP-8')
  expect(latestRunner!.fileName).toBe('sop8.png')

  act(() => {
    latestRunner!.clear()
  })

  expect(latestRunner!.phase).toBe('idle')
  expect(latestRunner!.dimensions).toBeNull()
  expect(latestRunner!.pkgType).toBeNull()
  expect(latestRunner!.fileName).toBeNull()
})
