import { describe, expect, it } from 'vitest'
import {
  applyDelta,
  consumeCopilotkit,
  exportModuleGraphZip,
  handleEvent,
} from '../src/sse.js'
import { resolveConfig } from '../src/config.js'

describe('applyDelta', () => {
  it('applies only top-level replace/add/remove ops', () => {
    const state: Record<string, unknown> = { keep: 1 }
    applyDelta([
      { op: 'replace', path: '/design_name', value: 'Board' },
      { op: 'add', path: '/module_count', value: 3 },
      { op: 'remove', path: '/keep' },
      { op: 'replace', path: '/nested/a', value: 99 }, // ignored (not top-level)
    ], state)
    expect(state).toEqual({ design_name: 'Board', module_count: 3 })
  })
})

describe('handleEvent', () => {
  it('applies STATE_SNAPSHOT wholesale', () => {
    const state: Record<string, unknown> = {}
    handleEvent({ type: 'STATE_SNAPSHOT', snapshot: { design_name: 'X', module_graph: { m: 1 } } }, state)
    expect(state).toEqual({ design_name: 'X', module_graph: { m: 1 } })
  })
  it('collects text deltas and lifecycle signals', () => {
    const r1 = handleEvent({ type: 'TEXT_MESSAGE_CONTENT', delta: 'hello' }, {})
    expect(r1.text).toBe('hello')
    const r2 = handleEvent({ type: 'RUN_FINISHED' }, {})
    expect(r2.finished).toBe(true)
    const r3 = handleEvent({ type: 'RUN_ERROR', error: 'boom' }, {})
    expect(r3.error).toBe('boom')
    expect(handleEvent({ type: 'OTHER' }, {})).toEqual({})
  })
})

describe('consumeCopilotkit', () => {
  it('accumulates state from an SSE stream and surfaces text', async () => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        const chunks = [
          'data: ' + JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', delta: 'working' }) + '\n\n',
          'data: ' + JSON.stringify({ type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/design_name', value: 'Alarm' }] }) + '\n\n',
          'data: ' + JSON.stringify({ type: 'STATE_SNAPSHOT', snapshot: { schFiles: [{ filename: 'A.kicad_sch', content: '(kicad)' }] } }) + '\n\n',
          'data: ' + JSON.stringify({ type: 'RUN_FINISHED' }) + '\n\n',
        ]
        for (const c of chunks) controller.enqueue(encoder.encode(c))
        controller.close()
      },
    })
    const fetchImpl = async () => new Response(stream, { status: 200 })
    const { state, finished, text } = await consumeCopilotkit('https://x/api/copilotkit', {}, {}, {
      fetchImpl: fetchImpl as never,
      timeoutMs: 5000,
    })
    expect(text).toBe('working')
    expect(finished).toBe(true)
    expect(state.design_name).toBe('Alarm')
    expect(state.schFiles).toEqual([{ filename: 'A.kicad_sch', content: '(kicad)' }])
  })

  it('throws when the agent reports a RUN_ERROR', async () => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'RUN_ERROR', error: 'bad design' }) + '\n\n'))
        controller.close()
      },
    })
    const fetchImpl = async () => new Response(stream, { status: 200 })
    await expect(consumeCopilotkit('https://x/api/copilotkit', {}, {}, {
      fetchImpl: fetchImpl as never,
      timeoutMs: 5000,
    })).rejects.toThrow(/reported an error: bad design/)
  })

  it('throws on a non-200 response', async () => {
    const fetchImpl = async () => new Response('nope', { status: 500 })
    await expect(consumeCopilotkit('https://x/api/copilotkit', {}, {}, {
      fetchImpl: fetchImpl as never,
      timeoutMs: 5000,
    })).rejects.toThrow(/HTTP 500/)
  })
})

describe('exportModuleGraphZip', () => {
  it('POSTs the module graph and returns the zip bytes', async () => {
    const calls: Array<{ url: string; body: unknown; headers: Record<string, string> }> = []
    const zip = Buffer.from('PK fake zip')
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
        headers: init?.headers as Record<string, string>,
      })
      return new Response(zip, { status: 200 })
    }
    const config = resolveConfig({})
    const buf = await exportModuleGraphZip('https://x/export-zip', { modules: [] }, config, { userId: 'u1', userToken: 't1' }, {
      fetchImpl: fetchImpl as never,
      timeoutMs: 5000,
    })
    expect(buf.equals(zip)).toBe(true)
    expect(calls[0]!.url).toBe('https://x/export-zip')
    expect(calls[0]!.body).toEqual({ modules: [] })
    expect(calls[0]!.headers['x-user-id']).toBe('u1')
    expect(calls[0]!.headers['x-user-token']).toBe('t1')
  })

  it('throws on a non-200 zip response', async () => {
    const fetchImpl = async () => new Response('{"error":"boom"}', { status: 400 })
    await expect(exportModuleGraphZip('https://x/export-zip', { modules: [] }, resolveConfig({}), { userId: 'u1', userToken: 't1' }, {
      fetchImpl: fetchImpl as never,
      timeoutMs: 5000,
    })).rejects.toThrow(/HTTP 400 — boom/)
  })
})
