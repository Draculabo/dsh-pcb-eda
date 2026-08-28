/**
 * `@huaqiu/dsh-auth` — browser half (the Phase 0A POC).
 *
 * Opens the auth.eda.cn login page in an overlay iframe, STRICTLY validates
 * the postMessage origin, caches credentials in localStorage (reload restore),
 * and pushes them to the node half over the plugin-owned webServer routes.
 * Provides the client-side `huaqiuAuth` service mirroring the node surface.
 */
import { createAuthStorage } from './storage.js'
import { createWebServerAuthTransport } from './transport.js'
import { createAuthClient, type AuthClient } from './client.js'

export const inject = ['@deepseek-ai/dsh-client-runtime']

/** Minimal structural client context (dsh-client-runtime provides this). */
export interface ClientContext {
  provide?(name: string, value: unknown): () => void
}

export function apply(ctx: ClientContext): () => void {
  const client: AuthClient = createAuthClient({
    storage: createAuthStorage(localStorage),
    transport: createWebServerAuthTransport(),
    windowLike: window,
    documentLike: document,
  })

  const disposeProvide = ctx.provide?.('huaqiuAuth', { auth: client.auth })
  void client.restore()

  return () => {
    disposeProvide?.()
    client.dispose()
  }
}
