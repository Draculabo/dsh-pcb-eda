/**
 * `@huaqiu/component-gen-app` — auth gate over `ComponentGenPorts.auth`.
 *
 * The app only knows the public `@huaqiu/dsh-auth` surface (the host wires it):
 * read state, subscribe to changes, trigger the existing login flow. It never
 * implements auth itself.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ComponentGenPorts } from '../ports.js'

export type AuthPhase = 'unknown' | 'authenticated' | 'unauthenticated'

export interface UseAuthGateResult {
  phase: AuthPhase
  user: { nickname?: string } | null
  login: () => void
  /** re-check immediately (used after login dialog closes). */
  refresh: () => Promise<void>
}

export function useAuthGate(ports: ComponentGenPorts): UseAuthGateResult {
  const [phase, setPhase] = useState<AuthPhase>('unknown')
  const [user, setUser] = useState<{ nickname?: string } | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const ok = await ports.auth.isAuthenticated()
      setPhase(ok ? 'authenticated' : 'unauthenticated')
      setUser(ok ? await ports.auth.getUserInfo() : null)
    } catch {
      setPhase('unauthenticated')
      setUser(null)
    }
  }, [ports])

  useEffect(() => {
    void refresh()
    const unsub = ports.auth.onAuthStateChanged((authenticated) => {
      setPhase(authenticated ? 'authenticated' : 'unauthenticated')
      if (authenticated) void ports.auth.getUserInfo().then(setUser)
      else setUser(null)
    })
    return unsub
  }, [ports, refresh])

  const login = useCallback(() => {
    void ports.auth.login()
  }, [ports])

  return { phase, user, login, refresh }
}
