/**
 * Huaqiu EDA plugin-update DSH plugin (node half) — `@huaqiu/dsh-tool-plugin-update`.
 *
 * Thin adapter between the DSH Web update UI and the hq-edge plugin-update
 * API (task dsh-plugin-discovery-and-update-with-hq-edge-update-reporting.md
 * §7). The browser half mounts the sidebar toolbutton (badge = actionable
 * count) and the review/confirm/ignore view; every request it makes lands on
 * this package's same-origin prefix routes, which forward to hq-edge.
 *
 * ── Architectural boundary ─────────────────────────────────────────────────
 * All update logic is owned ONCE by hq-edge (discovery, compatibility,
 * ignore persistence, the install transaction with cross-process lock and
 * atomic activation). This plugin is a thin adapter: no manifest fetching, no
 * registry calls, no download/verify code, no `@hqedge/*` dependency. It only
 * talks to hq-edge through the edge-bridge (`ctx.hqEdge.baseUrl`), matching
 * the `@huaqiu/dsh-tool-quote` / `@huaqiu/dsh-eda-host` convention.
 *
 * `hqEdge` is a REQUIRED inject: without the bridge the update UI reports
 * "hq-edge is not reachable" rather than showing stale data.
 *
 * @module @huaqiu/dsh-tool-plugin-update
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { getLogger, type PluginLogger } from '@huaqiu/dsh-plugin-log'
import { createUpdateForwarder, UPDATE_ROUTE_PREFIX } from './routes.js'

/** Plugin id — matches package.json. */
export const name = '@huaqiu/dsh-tool-plugin-update'

/** Cordis services this half depends on: hq-edge bridge (REQUIRED) + the DSH
 *  webServer surface that hosts the same-origin forwarding routes. */
export const inject = ['hqEdge', 'webServer'] as const

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Provided by the hq-edge `edge-bridge` plugin (the HOST). `baseUrl` is
     * the loopback HQ Edge endpoint, e.g. "http://localhost:18080". Read
     * lazily on every request.
     */
    hqEdge: { baseUrl?: string }
  }
}

/** Shared component name for the unified DSH-plugin log. */
const COMPONENT = 'dsh-tool-plugin-update'

let _log: PluginLogger | null = null
function log(): PluginLogger {
  if (_log === null) _log = getLogger(COMPONENT)
  return _log
}

/**
 * Host plugin body — register the forwarding routes.
 *
 * The HQ Edge endpoint is resolved lazily per request from `ctx.hqEdge`
 * (edge-bridge). When the bridge is absent the plugin refuses to load: an
 * update UI without a host would only mislead.
 *
 * @param ctx - real cordis context (node side).
 * @returns disposer — unregisters the routes on plugin dispose.
 */
export function apply(ctx: Context): () => void {
  const hq = ctx.hqEdge
  if (!hq || typeof hq.baseUrl !== 'string' || hq.baseUrl.trim().length === 0) {
    throw new Error(
      '@huaqiu/dsh-tool-plugin-update requires a usable hq-edge context: the ' +
        'edge-bridge plugin did not provide ctx.hqEdge.baseUrl. The update UI ' +
        'cannot work without hq-edge — check that the bridge started.',
    )
  }

  const getHqEdgeBaseUrl = (): string | undefined => {
    const current = ctx.hqEdge
    return current?.baseUrl && current.baseUrl.trim().length > 0 ? current.baseUrl : undefined
  }

  const disposers: Array<() => void> = []
  if (ctx.webServer && typeof ctx.webServer.register === 'function') {
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'prefix',
        path: UPDATE_ROUTE_PREFIX,
        handler: createUpdateForwarder(getHqEdgeBaseUrl),
      }),
    )
  } else {
    log().warn('webServer unavailable — plugin-update routes are not exposed; the sidebar UI cannot load data')
  }

  log().info('applying dsh-tool-plugin-update node half', {
    routePrefix: UPDATE_ROUTE_PREFIX,
    hqEdgeBaseUrl: getHqEdgeBaseUrl() ?? null,
  })

  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // best-effort teardown
      }
    }
  }
}
