/**
 * `@huaqiu/dsh-artifacts` — DSH plugin entry.
 *
 * Provides the `huaqiuArtifacts` service (node tools call it in-process; no
 * HTTP loopback) and mounts the read-only preview routes on `ctx.webServer`
 * for the browser UI.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { HuaqiuArtifactService, type HuaqiuArtifacts } from './service.js'
import { ARTIFACTS_ROUTE_PREFIX, createArtifactsHandler } from './routes.js'

export const name = '@huaqiu/dsh-artifacts'
export const inject = ['webServer'] as const

export interface HuaqiuArtifactsConfig {
  baseDir?: string
  maxBytes?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    huaqiuArtifacts: HuaqiuArtifacts
  }
}

export function apply(ctx: Context, config: HuaqiuArtifactsConfig = {}): void {
  const service = new HuaqiuArtifactService(config)
  ctx.effect(() => ctx.provide('huaqiuArtifacts', service))

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ARTIFACTS_ROUTE_PREFIX,
    handler: createArtifactsHandler(service),
  }))
}
