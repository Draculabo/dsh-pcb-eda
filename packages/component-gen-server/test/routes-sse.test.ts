import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { ComponentGenBackend } from '../src/backend.js'
import { HistoryStore } from '../src/history.js'
import { createComponentGenHandler } from '../src/routes.js'
import { COMPONENT_GEN_ROUTE_PREFIX } from '../src/types.js'

describe('GET /jobs/:id/events', () => {
  it('keeps the job subscription until the SSE response closes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-cga-sse-'))
    let resolveGeneration!: (value: Record<string, unknown>) => void
    const generation = new Promise<Record<string, unknown>>((resolve) => {
      resolveGeneration = resolve
    })
    const backend: ComponentGenBackend = {
      generateSymbol: async () => generation,
      extractFootprint: async () => ({ status: 'generated' }),
      generateFootprint: async () => ({ status: 'generated' }),
    }
    const server = http.createServer(
      createComponentGenHandler({ backend, history: new HistoryStore(dir) }),
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const eventsController = new AbortController()
    const timeout = setTimeout(() => eventsController.abort(), 1_000)

    try {
      const start = await fetch(`${base}${COMPONENT_GEN_ROUTE_PREFIX}/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'symbol', input: {} }),
      })
      const { jobId } = await start.json() as { jobId: string }

      const events = await fetch(
        `${base}${COMPONENT_GEN_ROUTE_PREFIX}/jobs/${encodeURIComponent(jobId)}/events`,
        { signal: eventsController.signal },
      )
      const reader = events.body!.getReader()
      const decoder = new TextDecoder()
      let stream = ''

      while (!stream.includes(': ok\n\n')) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        stream += decoder.decode(value, { stream: true })
      }

      resolveGeneration({ status: 'generated' })

      while (!stream.includes('event: completed\n')) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        stream += decoder.decode(value, { stream: true })
      }

      const completedFrame = stream
        .split('\n\n')
        .find((frame) => frame.startsWith('event: completed\n'))
      const data = completedFrame
        ?.split('\n')
        .find((line) => line.startsWith('data: '))

      expect(data).toBeDefined()
      expect(JSON.parse(data!.slice('data: '.length))).toMatchObject({
        type: 'completed',
        job: {
          id: jobId,
          kind: 'symbol',
          status: 'completed',
          result: { status: 'generated' },
        },
      })
    } finally {
      clearTimeout(timeout)
      eventsController.abort()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
