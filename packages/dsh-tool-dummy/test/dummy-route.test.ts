/**
 * Tests for the dummy plugin's node half (the discovery-test fixture).
 *
 * An in-process node:http server mounts the exported handler exactly like
 * `ctx.webServer.register` does, and the probe payload is asserted against
 * the package's own declared version — the value a discovery test uses to
 * tell which published build is live.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createDummyHandler,
  DUMMY_ROUTE_PREFIX,
  buildProbePayload,
  name,
} from '../src/index.js'

let server: Server
let baseUrl = ''

beforeEach(async () => {
  server = createServer((req, res) => {
    if ((req.url ?? '').startsWith(DUMMY_ROUTE_PREFIX)) {
      createDummyHandler()(req, res)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('dummy node half', () => {
  it('declares the plugin id and the webServer-only inject', () => {
    expect(name).toBe('@huaqiu/dsh-tool-dummy')
    expect(DUMMY_ROUTE_PREFIX).toBe('/api/v1/huaqiu/dummy')
  })

  it('builds a probe payload carrying the declared package version', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string
    }
    const payload = buildProbePayload()
    expect(payload.name).toBe('@huaqiu/dsh-tool-dummy')
    expect(payload.version).toBe(manifest.version)
    expect(payload.route).toBe(DUMMY_ROUTE_PREFIX)
    expect(Number.isNaN(Date.parse(payload.time))).toBe(false)
  })

  it('answers GET on the probe route with JSON', async () => {
    const response = await fetch(`${baseUrl}${DUMMY_ROUTE_PREFIX}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    const payload = (await response.json()) as { name: string; version: string }
    expect(payload.name).toBe('@huaqiu/dsh-tool-dummy')
    expect(payload.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('404s anything outside the probe prefix', async () => {
    const response = await fetch(`${baseUrl}/api/v1/huaqiu/other`)
    expect(response.status).toBe(404)
  })
})
