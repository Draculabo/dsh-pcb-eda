/**
 * `@huaqiu/dsh-tool-dummy` — node half.
 *
 * A deliberately minimal DSH plugin whose only job is to be DISCOVERABLE:
 * it exists so the remote plugin-discovery pipeline (hq-edge fetches the
 * centralized release manifest, compares it against the active bundle,
 * and offers installs/updates in the PluginUpdate view) can be exercised
 * end to end with a package that is known-good but carries no product
 * behaviour of its own.
 *
 * What it does prove once installed and activated:
 *   * the node half loaded — it answers `GET /api/v1/huaqiu/dummy`;
 *   * the browser half loaded — the sidebar row and its probe panel work;
 *   * the version reported by the route is the PUBLISHED version, so a
 *     discovery test can tell exactly which build is live.
 *
 * No `hqEdge` bridge, no credentials, no agent tools: `webServer` is the
 * only injected service, which keeps the compatibility surface trivial.
 *
 * @module @huaqiu/dsh-tool-dummy
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'

/** Plugin id — matches package.json. */
export const name = '@huaqiu/dsh-tool-dummy'

/** Cordis services this half depends on: the DSH webServer surface that
 *  hosts the same-origin probe route. */
export const inject = ['webServer'] as const

/** Same-origin prefix route mounted by the node half. */
export const DUMMY_ROUTE_PREFIX = '/api/v1/huaqiu/dummy'

/** One probe response: which build is live, and where it answered from. */
export interface DummyProbePayload {
  name: string
  version: string
  route: string
  time: string
}

/**
 * This plugin's declared version from `package.json`, or null when
 * unreadable (never throws — a probe must still answer).
 */
export function pluginVersion(): string | null {
  try {
    const manifestUrl = new URL('../package.json', import.meta.url)
    const manifest = JSON.parse(readFileSync(fileURLToPath(manifestUrl), 'utf8')) as {
      version?: unknown
    }
    return typeof manifest.version === 'string' && manifest.version.length > 0
      ? manifest.version
      : null
  } catch {
    return null
  }
}

/** Build the probe payload for the current moment. */
export function buildProbePayload(): DummyProbePayload {
  return {
    name,
    version: pluginVersion() ?? 'unknown',
    route: DUMMY_ROUTE_PREFIX,
    time: new Date().toISOString(),
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * The route handler, exported for tests (an in-process node:http server
 * mounts it directly, exactly like `ctx.webServer.register` does).
 */
export function createDummyHandler(): (req: IncomingMessage, res: ServerResponse) => void {
  return (_req, res) => {
    sendJson(res, 200, buildProbePayload())
  }
}

/**
 * Host plugin body — register the probe route.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: DUMMY_ROUTE_PREFIX,
    handler: createDummyHandler(),
  }), 'dsh-tool-dummy: probe route')
}
