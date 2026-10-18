/**
 * Tests for the per-route timeout budget in `src/routes.ts`.
 *
 * `POST /runtime-update/request` is not a quick RPC: hq-edge re-reads the
 * manifest, downloads the whole runtime bundle, verifies its SHA-512 and
 * extracts it before answering `202`. Measured end-to-end: 56 s. Under the
 * generic 30 s budget the forwarder aborted it mid-flight and the panel showed
 * "hq-edge request timed out after 30000ms" for an update that was in fact
 * still running.
 *
 * These tests drive the clock with fake timers rather than waiting in real
 * time, and they deliberately live in their own file: the forwarding tests in
 * `routes.test.ts` await real sockets, which fake timers would stall.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createUpdateForwarder,
  RUNTIME_REQUEST_TIMEOUT_MS,
  UPDATE_ROUTE_PREFIX,
} from '../src/routes.js'

interface FakeRes {
  statusCode: number
  body: string
  writeHead(status: number, headers?: unknown): FakeRes
  end(payload?: string): FakeRes
}

function fakeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 0,
    body: '',
    writeHead(status: number): FakeRes {
      res.statusCode = status
      return res
    },
    end(payload?: string): FakeRes {
      res.body = payload ?? ''
      return res
    },
  }
  return res
}

function asResponse(res: FakeRes): ServerResponse {
  return res as unknown as ServerResponse
}

/** Minimal request: method + url, with an optional body stream. */
function fakeReq(method: string, url: string, body?: string): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(body)])
  return Object.assign(stream, { method, url }) as unknown as IncomingMessage
}

/** Behave like the platform fetch: reject with AbortError once aborted. */
function abortableFetch(): (_url: string, init?: { signal?: AbortSignal }) => Promise<Response> {
  return (_url: string, init?: { signal?: AbortSignal }) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'))
      })
    })
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  // Only the clock is faked — stream and microtask machinery stays real.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('plugin-update forwarder timeout budget', () => {
  it('does not abort a runtime-update request at the 30 s default', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    // Must honour the abort signal: a mock that ignores it stays pending after
    // the budget expires, and the 504 the test is looking for never appears.
    fetchMock.mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((resolve, reject) => {
          void gate.then(() =>
            resolve(
              new Response(JSON.stringify({ requestId: 'runtime-update-1' }), { status: 202 }),
            ),
          )
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'))
          })
        }),
    )

    const res = fakeRes()
    const handler = createUpdateForwarder(() => 'http://127.0.0.1:1')
    const done = handler(
      fakeReq('POST', `${UPDATE_ROUTE_PREFIX}/runtime-request`, '{"targetVersion":"0.2.12"}'),
      asResponse(res),
    )

    // Well past the generic budget: a 504 here is exactly the bug.
    await vi.advanceTimersByTimeAsync(45_000)
    expect(res.statusCode).toBe(0)

    release()
    await done
    expect(res.statusCode).toBe(202)
    expect(JSON.parse(res.body)).toMatchObject({ requestId: 'runtime-update-1' })
  })

  it('still aborts an ordinary route at the 30 s default', async () => {
    fetchMock.mockImplementation(abortableFetch())

    const res = fakeRes()
    const handler = createUpdateForwarder(() => 'http://127.0.0.1:1')
    const done = handler(fakeReq('GET', `${UPDATE_ROUTE_PREFIX}/report`), asResponse(res))

    await vi.advanceTimersByTimeAsync(30_000)
    expect(res.statusCode).toBe(504)
    expect(JSON.parse(res.body).error).toContain('30000')
    await done
  })

  it('aborts a runtime-update request at its own, larger budget', async () => {
    fetchMock.mockImplementation(abortableFetch())

    const res = fakeRes()
    const handler = createUpdateForwarder(() => 'http://127.0.0.1:1')
    const done = handler(
      fakeReq('POST', `${UPDATE_ROUTE_PREFIX}/runtime-request`, '{"targetVersion":"0.2.12"}'),
      asResponse(res),
    )

    await vi.advanceTimersByTimeAsync(RUNTIME_REQUEST_TIMEOUT_MS + 1)
    expect(res.statusCode).toBe(504)
    expect(JSON.parse(res.body).error).toContain(String(RUNTIME_REQUEST_TIMEOUT_MS))
    await done
  })
})
