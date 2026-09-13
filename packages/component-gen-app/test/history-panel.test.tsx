// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HistoryPanel } from '../src/components/HistoryPanel.js'
import type { ComponentGenPorts, HistoryEntry } from '../src/ports.js'
import type { Translate } from '../src/copy/index.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const OLD_ENTRY: HistoryEntry = {
  id: 'old-entry',
  kind: 'symbol',
  createdAt: '2026-09-13T10:00:00.000Z',
  status: 'generated',
  input: {},
  result: { artifactId: 'old-artifact', filename: 'old.kicad_sym' },
}

const NEW_ENTRY: HistoryEntry = {
  id: 'new-entry',
  kind: 'symbol',
  createdAt: '2026-09-13T11:00:00.000Z',
  status: 'generated',
  input: {},
  result: { artifactId: 'new-artifact', filename: 'new.kicad_sym' },
}

function portsWithHistory(history: ComponentGenPorts['history']): ComponentGenPorts {
  return {
    config: async () => ({
      hostMode: false,
      capabilities: { symbol: true, footprint: true },
      limits: { imageBytes: 4 * 1024 * 1024 },
    }),
    auth: {
      isAuthenticated: async () => true,
      getUserInfo: async () => null,
      login: async () => {},
      onAuthStateChanged: () => () => {},
    },
    startJob: async () => { throw new Error('not expected') },
    jobEvents: () => () => {},
    abortJob: async () => {},
    history,
    historyEntry: async () => null,
    patchHistory: async () => { throw new Error('not expected') },
    deleteHistory: async () => {},
    artifactContent: async () => '',
    inputImage: async () => '',
  }
}

const t = ((key: string) => key) as Translate
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

it('ignores a history response from a replaced ports instance', async () => {
  let resolveOld: ((value: { entries: HistoryEntry[]; nextCursor: null }) => void) | undefined
  const oldHistory = new Promise<{ entries: HistoryEntry[]; nextCursor: null }>((resolve) => {
    resolveOld = resolve
  })
  const oldPorts = portsWithHistory(async () => oldHistory)
  const newPorts = portsWithHistory(async () => ({ entries: [NEW_ENTRY], nextCursor: null }))
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(<HistoryPanel ports={oldPorts} t={t} onReopen={() => {}} />)
  })

  await act(async () => {
    root!.render(<HistoryPanel ports={newPorts} t={t} onReopen={() => {}} />)
  })

  expect(container.textContent).toContain('new.kicad_sym')
  expect(container.textContent).not.toContain('old.kicad_sym')

  await act(async () => {
    resolveOld!({ entries: [OLD_ENTRY], nextCursor: null })
    await oldHistory
  })

  expect(container.textContent).toContain('new.kicad_sym')
  expect(container.textContent).not.toContain('old.kicad_sym')
})
