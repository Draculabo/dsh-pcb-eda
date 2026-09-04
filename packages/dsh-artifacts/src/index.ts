/**
 * `@huaqiu/dsh-artifacts` — DSH plugin entry.
 *
 * Provides the `huaqiuArtifacts` service (node tools call it in-process; no
 * HTTP loopback) and mounts the read-only preview routes on `ctx.webServer`
 * for the browser UI.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { HuaqiuArtifactService, log, type HuaqiuArtifacts } from './service.js'
import { ARTIFACTS_ROUTE_PREFIX, createArtifactsHandler } from './routes.js'

export type {
  ArtifactMeta,
  ArtifactType,
  CreateArtifactInput,
  CreateArtifactResult,
  HuaqiuArtifacts,
} from './service.js'
export { HuaqiuArtifactService } from './service.js'
export { ARTIFACTS_ROUTE_PREFIX, createArtifactsHandler, type ArtifactsHandler } from './routes.js'

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

  // Boot-time GC: `deleteAll({ onlyExpired: true })` is implemented but nothing
  // ever calls it, so `~/.dsh/artifacts/` (and any migrated location) grows
  // without bound (spec risk R6). Sweep once at startup; never fail startup on a
  // disk error, and never block activation on the scan.
  ctx.effect(() => {
    void service.deleteAll({ onlyExpired: true })
      .then((removed) => { if (removed > 0) log('debug', 'artifacts: expired sweep removed', { removed }) })
      .catch((err) => log('warn', 'artifacts: expired sweep failed', { err }))
    return () => {}
  })
}
