/**
 * `@huaqiu/component-gen-app` — auth gate over `ComponentGenPorts.auth`.
 *
 * The app only knows the public `@huaqiu/dsh-auth` surface (the host wires it):
 * read state, subscribe to changes, trigger the existing login flow. It never
 * implements auth itself.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
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
  const authGeneration = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    const generation = ++authGeneration.current
    try {
      const ok = await ports.auth.isAuthenticated()
      if (generation !== authGeneration.current) {
        return
      }
      setPhase(ok ? 'authenticated' : 'unauthenticated')
      if (!ok) {
        setUser(null)
        return
      }
      const nextUser = await ports.auth.getUserInfo()
      if (generation === authGeneration.current) {
        setUser(nextUser)
      }
    } catch {
      if (generation === authGeneration.current) {
        setPhase('unauthenticated')
        setUser(null)
      }
    }
  }, [ports])

  useEffect(() => {
    void refresh()
    const unsub = ports.auth.onAuthStateChanged((authenticated) => {
      const generation = ++authGeneration.current
      setPhase(authenticated ? 'authenticated' : 'unauthenticated')
      if (authenticated) {
        void ports.auth.getUserInfo().then((nextUser) => {
          if (generation === authGeneration.current) {
            setUser(nextUser)
          }
        })
      } else {
        setUser(null)
      }
    })
    return () => {
      ++authGeneration.current
      unsub()
    }
  }, [ports, refresh])

  const login = useCallback(() => {
    void ports.auth.login()
  }, [ports])

  return { phase, user, login, refresh }
}
