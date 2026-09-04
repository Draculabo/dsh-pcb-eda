// @vitest-environment jsdom
/**
 * Regression guard: clicking a generated history entry's "打开" (reopen) loads
 * the artifact back into the active generation page — the result stage mounts
 * (canvas appears), the artifact text is fetched, and the source input image
 * is restored for regenerate.
 *
 * Previously `App.tsx` wired `onReopen` to a no-op ("detail view TBD").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ComponentGenApp } from '../src/App.js'
import type { ComponentGenPorts, HistoryEntry } from '../src/ports.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ENTRY: HistoryEntry = {
  id: 'fp-1',
  kind: 'footprint',
  createdAt: '2026-09-04T10:00:00.000Z',
  status: 'generated',
  input: { imageId: 'img-1', packageType: 'SOP-8' },
  result: { artifactId: 'art-1', filename: 'SOP-8_3.895x4.9mm_P1.27mm.kicad_mod' },
}

const ENTRY_WITHOUT_INPUT: HistoryEntry = {
  id: 'fp-2',
  kind: 'footprint',
  createdAt: '2026-09-04T10:01:00.000Z',
  status: 'generated',
  input: {},
  result: { artifactId: 'art-2', filename: 'generic.kicad_mod' },
}

function fakePorts(entries: HistoryEntry[] = [ENTRY]): ComponentGenPorts & { artifactIds: string[]; imageIds: string[] } {
  const artifactIds: string[] = []
  const imageIds: string[] = []
  return {
    artifactIds,
    imageIds,
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
    history: async () => ({ entries }),
    historyEntry: async () => null,
    patchHistory: async () => ENTRY,
    deleteHistory: async () => {},
    artifactContent: async (id) => { artifactIds.push(id); return '(footprint "SOP-8")\n  (pad "1" smd rect (at 0 0) (size 1 1))\n)' },
    inputImage: async (id) => { imageIds.push(id); return 'data:image/png;base64,AAAA' },
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

it('reopens a generated history entry into the result stage', async () => {
  const ports = fakePorts()
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(<ComponentGenApp ports={ports} page="footprint" lang="zh" showHistory />)
  })

  // History entry rendered; no result stage yet.
  const item = container.querySelector('.cga-history__item')
  expect(item).toBeTruthy()
  expect(container.querySelector('canvas')).toBeNull()
  expect(ports.artifactIds).toEqual([])

  // Click "打开" on the generated entry.
  const reopenBtn = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => b.textContent?.trim() === '打开')
  expect(reopenBtn).toBeTruthy()

  await act(async () => {
    reopenBtn!.click()
  })

  // Result stage mounted: preview canvas present, artifact + input image fetched.
  expect(container.querySelector('canvas')).not.toBeNull()
  expect(ports.artifactIds).toEqual(['art-1'])
  expect(ports.imageIds).toEqual(['img-1'])
})

it('does not retain input state from a previously reopened entry', async () => {
  const ports = fakePorts([ENTRY, ENTRY_WITHOUT_INPUT])
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(<ComponentGenApp ports={ports} page="footprint" lang="zh" showHistory />)
  })

  const reopenButtons = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .filter((button) => button.textContent?.trim() === '打开')

  await act(async () => {
    reopenButtons[0]!.click()
  })

  expect(container.querySelector<HTMLInputElement>('.cga-field__input')?.value).toBe('SOP-8')
  expect(container.querySelector('.cga-upload__thumb')).not.toBeNull()

  await act(async () => {
    reopenButtons[1]!.click()
  })

  expect(container.querySelector<HTMLInputElement>('.cga-field__input')?.value).toBe('')
  expect(container.querySelector('.cga-upload__thumb')).toBeNull()
})

it('does not leak a reopen request across a page switch', async () => {
  const ports = fakePorts()
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(<ComponentGenApp ports={ports} page="footprint" lang="zh" showHistory />)
  })
  const reopenBtn = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => b.textContent?.trim() === '打开')
  await act(async () => {
    reopenBtn!.click()
  })
  expect(ports.artifactIds).toEqual(['art-1'])

  // Switch to the symbol page — the stale footprint reopen request must not
  // leak and re-open a footprint result on the symbol page.
  await act(async () => {
    root!.render(<ComponentGenApp ports={ports} page="symbol" lang="zh" showHistory />)
  })
  // No additional artifact fetch happened for the switched page.
  expect(ports.artifactIds).toEqual(['art-1'])
})
