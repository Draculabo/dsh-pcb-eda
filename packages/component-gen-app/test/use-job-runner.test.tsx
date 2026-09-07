// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useJobRunner, type UseJobRunnerResult } from '../src/hooks/useJobRunner.js'
import type { ComponentGenPorts, JobState } from '../src/ports.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount()
    })
    root = undefined
  }
  document.body.innerHTML = ''
})

it('keeps the latest job active when an earlier start resolves later', async () => {
  const pendingStarts: Array<(job: JobState) => void> = []
  const subscriptions: string[] = []
  const ports: ComponentGenPorts = {
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
    startJob: async () => new Promise<JobState>((resolve) => {
      pendingStarts.push(resolve)
    }),
    jobEvents: (jobId) => {
      subscriptions.push(jobId)
      return () => {}
    },
    abortJob: async () => {},
    history: async () => ({ entries: [] }),
    historyEntry: async () => null,
    patchHistory: async () => {
      throw new Error('not expected')
    },
    deleteHistory: async () => {},
    artifactContent: async () => '',
    inputImage: async () => '',
  }

  let runner: UseJobRunnerResult | undefined
  function Harness(): null {
    runner = useJobRunner(ports)
    return null
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<Harness />)
  })

  let firstRun!: Promise<void>
  let secondRun!: Promise<void>
  await act(async () => {
    firstRun = runner!.run({ kind: 'symbol', input: { instruction: 'first' } })
    secondRun = runner!.run({ kind: 'symbol', input: { instruction: 'second' } })
    await Promise.resolve()
  })
  expect(pendingStarts).toHaveLength(2)

  await act(async () => {
    pendingStarts[1]!({
      id: 'job-2',
      kind: 'symbol',
      status: 'running',
      createdAt: '2026-09-07T00:00:01.000Z',
      updatedAt: '2026-09-07T00:00:01.000Z',
    })
    await secondRun
  })
  expect(runner!.jobId).toBe('job-2')
  expect(subscriptions).toEqual(['job-2'])

  await act(async () => {
    pendingStarts[0]!({
      id: 'job-1',
      kind: 'symbol',
      status: 'running',
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    })
    await firstRun
  })
  expect(runner!.jobId).toBe('job-2')
  expect(subscriptions).toEqual(['job-2'])
})
