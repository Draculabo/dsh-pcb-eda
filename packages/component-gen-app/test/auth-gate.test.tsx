// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useAuthGate, type UseAuthGateResult } from '../src/hooks/useAuthGate.js'
import type { ComponentGenPorts } from '../src/ports.js'

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

it('ignores an authenticated user lookup after a newer logout event', async () => {
  let listener: ((authenticated: boolean) => void) | undefined
  let resolveUser: ((user: { nickname: string }) => void) | undefined
  const userInfo = new Promise<{ nickname: string }>((resolve) => {
    resolveUser = resolve
  })
  const ports = {
    auth: {
      isAuthenticated: vi.fn(async () => false),
      getUserInfo: vi.fn(() => userInfo),
      login: vi.fn(async () => {}),
      onAuthStateChanged: vi.fn((nextListener: (authenticated: boolean) => void) => {
        listener = nextListener
        return () => {}
      }),
    },
  } as unknown as ComponentGenPorts
  let latest: Pick<UseAuthGateResult, 'phase' | 'user'> | undefined

  function Harness() {
    const { phase, user } = useAuthGate(ports)
    latest = { phase, user }
    return null
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(<Harness />)
  })
  expect(latest).toEqual({ phase: 'unauthenticated', user: null })

  act(() => {
    listener!(true)
  })
  expect(latest).toEqual({ phase: 'authenticated', user: null })

  act(() => {
    listener!(false)
  })
  expect(latest).toEqual({ phase: 'unauthenticated', user: null })

  await act(async () => {
    resolveUser!({ nickname: 'stale-user' })
    await userInfo
  })

  expect(latest).toEqual({ phase: 'unauthenticated', user: null })
})
