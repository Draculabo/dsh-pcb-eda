/**
 * `@huaqiu/component-gen-app` — standalone browser entry (vite).
 *
 * Served by `@huaqiu/component-gen-server` alongside the API. Opens the page
 * from `?page=symbol|footprint`. Auth is read from the dsh-auth session route
 * the standalone server mounts (`/api/v1/huaqiu/auth/session`); login opens
 * the official auth.eda.cn page. See the standalone README for the auth
 * flow (the production DSH/EDA integrations use the real dsh-auth client).
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ComponentGenApp } from './App.js'
import { createHttpPorts } from './api/component-gen-client.js'
import { injectAppStyles } from './styles/inject.js'
import type { ComponentGenAuthPort, ComponentGenPage, ComponentGenPorts } from './ports.js'

injectAppStyles()

const AUTH_BASE = '/api/v1/huaqiu/auth'

/** Read auth state from the dsh-auth session route (standalone server). */
function createStandaloneAuth(): ComponentGenAuthPort {
  let pollTimer: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<(authenticated: boolean) => void>()
  const readState = async (): Promise<{ authenticated: boolean; user: { nickname?: string } | null }> => {
    try {
      const res = await fetch(`${AUTH_BASE}/session`, { headers: { accept: 'application/json' } })
      if (!res.ok) return { authenticated: false, user: null }
      const body = (await res.json()) as { authenticated?: boolean; user?: { nickname?: string } | null }
      return { authenticated: body.authenticated === true, user: body.user ?? null }
    } catch {
      return { authenticated: false, user: null }
    }
  }
  const startPolling = (): void => {
    if (pollTimer) return
    let last = false
    void readState().then((s) => { last = s.authenticated })
    pollTimer = setInterval(() => {
      void readState().then((s) => {
        if (s.authenticated !== last) {
          last = s.authenticated
          for (const cb of [...listeners]) cb(s.authenticated)
        }
      })
    }, 2000)
  }
  startPolling()
  return {
    async isAuthenticated() { return (await readState()).authenticated },
    async getUserInfo() { return (await readState()).user },
    async login() {
      // Official login page in a new tab; the dsh-auth session route is the
      // source of truth the poller watches.
      window.open('https://auth.eda.cn/', '_blank', 'noopener')
    },
    onAuthStateChanged(cb) {
      listeners.add(cb)
      return () => { listeners.delete(cb) }
    },
  }
}

function params(): URLSearchParams {
  return new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
}

function mount(): void {
  const rootEl = document.getElementById('root')
  if (!rootEl) return
  const page: ComponentGenPage = params().get('page') === 'symbol' ? 'symbol' : 'footprint'
  const lang = params().get('lang') ?? undefined
  const ports: ComponentGenPorts = createHttpPorts({
    base: '/api/v1/huaqiu/component-gen',
    artifactsBase: '/api/v1/huaqiu/artifacts',
    auth: createStandaloneAuth(),
  })
  createRoot(rootEl).render(
    <StrictMode>
      <ComponentGenApp ports={ports} page={page} lang={lang} showHistory />
    </StrictMode>,
  )
}

mount()
