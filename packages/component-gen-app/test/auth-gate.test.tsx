// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useAuthGate } from '../src/hooks/useAuthGate.js'
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

it('ignores user info that resolves after a newer auth state change', async () => {
  let listener: ((authenticated: boolean) => void) | undefined
  let resolveUser: ((user: { nickname?: string } | null) => void) | undefined
  const ports = {
    auth: {
      isAuthenticated: async () => false,
      getUserInfo: () => new Promise<{ nickname?: string } | null>((resolve) => {
        resolveUser = resolve
      }),
      login: async () => {},
      onAuthStateChanged: (next: (authenticated: boolean) => void) => {
        listener = next
        return () => {}
      },
    },
  } as ComponentGenPorts

  function Harness() {
    const auth = useAuthGate(ports)
    useEffect(() => {}, [auth])
    return <div data-phase={auth.phase}>{auth.user?.nickname ?? 'anonymous'}</div>
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(<Harness />)
  })

  await act(async () => {
    listener!(true)
  })
  expect(container.textContent).toBe('anonymous')
  expect(container.firstElementChild?.getAttribute('data-phase')).toBe('authenticated')

  await act(async () => {
    listener!(false)
    resolveUser!({ nickname: 'stale-user' })
    await Promise.resolve()
  })

  expect(container.textContent).toBe('anonymous')
  expect(container.firstElementChild?.getAttribute('data-phase')).toBe('unauthenticated')
})
