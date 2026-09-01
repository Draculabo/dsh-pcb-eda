/**
 * `@huaqiu/dsh-auth` — node plugin entry.
 *
 * Provides the `huaqiuAuth` service (capability, not token transport) and
 * mounts the browser→node credential routes on `ctx.webServer`.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { InMemoryHuaqiuAuthService, type HuaqiuAuthService } from './service.js'
import { AUTH_ROUTE_PREFIX, createAuthHandler } from './routes.js'
import type { HuaqiuAuthConfig } from './host.js'

export type { HuaqiuAuthApi, HuaqiuAuthService, HuaqiuUserInfo } from './service.js'
export type { HuaqiuAuthConfig } from './host.js'

export const name = '@huaqiu/dsh-auth'
export const inject = ['webServer'] as const

declare module '@deepseek-ai/cordis' {
  interface Context {
    huaqiuAuth: HuaqiuAuthService
  }
}

/**
 * @param ctx cordis context
 * @param config overlay `config` (hq-edge supervisor injects `hqEdgeBaseUrl`
 *   here). When present with a base URL, the plugin runs in HQ Edge host mode:
 *   the node half fetches the credential from HQ Edge instead of waiting for a
 *   browser login. Env (`HQ_EDGE_BASE_URL` …) is the fallback for installs
 *   without a supervisor (spec §6.4).
 */
export function apply(ctx: Context, config?: Partial<HuaqiuAuthConfig>): void {
  const service = new InMemoryHuaqiuAuthService(config)
  ctx.effect(() => ctx.provide('huaqiuAuth', service))

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: AUTH_ROUTE_PREFIX,
    handler: createAuthHandler(service),
  }))
}
