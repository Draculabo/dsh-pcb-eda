import { describe, expect, it } from 'vitest'
import type { HuaqiuAuthService } from '@huaqiu/dsh-auth'
import type { CreateArtifactResult, HuaqiuArtifacts } from '@huaqiu/dsh-artifacts'
import { resolveConfig } from '../src/config.js'
import { extractModuleGraph, extractSchematic, runGenerateSchematic, runGenerateSystem, type SchematicGenEnv } from '../src/tools.js'
import { HTTP_TIMEOUT_MS } from '../src/sse.js'

function stubAuth(userId = 'u1', token = 'tok-1'): HuaqiuAuthService['auth'] {
  return {
    isAuthenticated: () => true,
    getAccessToken: async () => token,
    getUserInfo: async () => (userId ? { id: userId, token } : null),
    login: async () => {},
    logout: async () => {},
    onAuthStateChanged: () => () => {},
  }
}

function stubArtifacts(store = true): { artifacts: HuaqiuArtifacts; created: CreateArtifactResult[] } {
  const created: CreateArtifactResult[] = []
  const artifacts: HuaqiuArtifacts = {
    create: async (input) => {
      if (!store) throw new Error('store unavailable')
      const c = { id: 'art_' + created.length, type: input.type, filename: input.filename, size: input.content.length }
      created.push(c)
      return c
    },
    get: async () => null,
    readContent: async () => null,
    delete: async () => {},
    deleteAll: async () => 0,
  }
  return { artifacts, created }
}

function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder()
  const body = events.map((e) => 'data: ' + JSON.stringify(e) + '\n\n').join('')
  return new Response(new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode(body)); controller.close() },
  }), { status: 200 })
}

function zipResponse(bytes: Uint8Array): Response {
  return new Response(bytes as unknown as BodyInit, { status: 200 })
}

function makeEnv(overrides: Partial<SchematicGenEnv> = {}): SchematicGenEnv {
  const { artifacts } = stubArtifacts()
  return {
    config: resolveConfig({}),
    auth: stubAuth(),
    artifacts,
    timeoutMs: HTTP_TIMEOUT_MS,
    ...overrides,
  }
}

describe('extractSchematic', () => {
  it('collects inline .kicad_sch files and the project name', () => {
    const out = extractSchematic({
      outProject: 'Proj',
      schFiles: [{ filename: 'A.kicad_sch', content: '(a)' }, { filename: 'B.kicad_sch', content: 123 }],
      error: '',
    })
    expect(out.outProject).toBe('Proj')
    expect(out.schFiles).toEqual([
      { filename: 'A.kicad_sch', content: '(a)' },
      { filename: 'B.kicad_sch', content: '123' },
    ])
  })
  it('tolerates missing files', () => {
    expect(extractSchematic({}).schFiles).toEqual([])
  })
})

describe('extractModuleGraph', () => {
  it('returns the module_graph object or null', () => {
    expect(extractModuleGraph({ module_graph: { modules: [] } })).toEqual({ modules: [] })
    expect(extractModuleGraph({ module_graph: null })).toBeNull()
    expect(extractModuleGraph({})).toBeNull()
  })
})

describe('runGenerateSchematic', () => {
  it('returns needs_auth (not a throw) when there is no eda.cn login', async () => {
    const env = makeEnv({ auth: stubAuth('', '') })
    const result = await runGenerateSchematic({ description: 'x' }, undefined, env)
    expect(result.status).toBe('needs_auth')
    expect(result.kind).toBe('schematic')
    expect(String(result.hint)).toMatch(/login/)
  })

  it('generates and stores each sheet as a preview artifact', async () => {
    const { artifacts, created } = stubArtifacts()
    const env = makeEnv({
      artifacts,
      deps: {
        fetchImpl: async () => sseResponse([
          { type: 'STATE_SNAPSHOT', snapshot: {
            outProject: 'PSU',
            schFiles: [{ filename: 'PSU.kicad_sch', content: '(kicad (version 20231118))' }],
          } },
          { type: 'RUN_FINISHED' },
        ]),
      },
    })
    const result = await runGenerateSchematic({ description: '5V supply' }, undefined, env)
    expect(result.status).toBe('generated')
    expect(result.kind).toBe('schematic')
    expect(result.design_name).toBe('PSU')
    expect((result.schFiles as Array<{ filename: string }>)[0]!.filename).toBe('PSU.kicad_sch')
    expect((result.schArtifacts as Array<{ id: string; type: string }>)[0]).toMatchObject({ type: 'schematic' })
    expect(created).toHaveLength(1)
  })

  it('keeps sheets inline when artifact storage fails', async () => {
    const { artifacts } = stubArtifacts(false)
    const env = makeEnv({
      artifacts,
      deps: {
        fetchImpl: async () => sseResponse([
          { type: 'STATE_SNAPSHOT', snapshot: {
            outProject: 'PSU',
            schFiles: [{ filename: 'PSU.kicad_sch', content: '(kicad)' }],
          } },
          { type: 'RUN_FINISHED' },
        ]),
      },
    })
    const result = await runGenerateSchematic({ description: 'x' }, undefined, env)
    expect(result.status).toBe('generated')
    expect((result.schFiles as Array<{ filename: string; content?: string }>)[0]!.content).toBe('(kicad)')
    expect(result.note).toMatch(/inline/)
  })

  it('throws when the agent produced no files', async () => {
    const env = makeEnv({
      deps: {
        fetchImpl: async () => sseResponse([
          { type: 'STATE_SNAPSHOT', snapshot: { schFiles: [] } },
          { type: 'RUN_FINISHED' },
        ]),
      },
    })
    await expect(runGenerateSchematic({ description: 'x' }, undefined, env)).rejects.toThrow(/no \.kicad_sch files/)
  })
})

describe('runGenerateSystem', () => {
  it('stores the project zip as a zip artifact (never inline)', async () => {
    const { artifacts, created } = stubArtifacts()
    const zip = new Uint8Array([0x50,0x4b,0x03,0x04,1,2,3])
    const env = makeEnv({
      artifacts,
      deps: {
        fetchImpl: async (url: RequestInfo | URL) => {
          if (String(url).includes('copilotkit')) {
            return sseResponse([
              { type: 'STATE_SNAPSHOT', snapshot: {
                design_name: 'STM32F103C8T6迷你开发板',
                module_graph: { modules: [{ name: 'MCU' }, { name: 'LDO' }], connections: [1, 2, 3] },
                connection_count: 3,
              } },
              { type: 'RUN_FINISHED' },
            ])
          }
          return zipResponse(zip)
        },
      },
    })
    const result = await runGenerateSystem({ description: 'an STM32 mini dev board' }, undefined, env)
    expect(result.status).toBe('generated')
    expect(result.kind).toBe('system')
    expect(result.design_name).toBe('STM32F103C8T6迷你开发板')
    expect(result.module_count).toBe(2)
    expect(result.connection_count).toBe(3)
    expect((result.zipArtifact as { filename: string }).filename).toBe('STM32F103C8T6迷你开发板.zip')
    expect(result.zip).toBeUndefined()
    expect(created).toHaveLength(1)
    expect(created[0]!.type).toBe('zip')
  })

  it('falls back to inline zip when the artifact store is unavailable and zip is small', async () => {
    const { artifacts } = stubArtifacts(false)
    const zip = new Uint8Array([1,2,3])
    const env = makeEnv({
      artifacts,
      deps: {
        fetchImpl: async (url: RequestInfo | URL) => {
          if (String(url).includes('copilotkit')) {
            return sseResponse([
              { type: 'STATE_SNAPSHOT', snapshot: { design_name: 'Board', module_graph: { modules: [] }, connection_count: 0 } },
              { type: 'RUN_FINISHED' },
            ])
          }
          return zipResponse(zip)
        },
      },
    })
    const result = await runGenerateSystem({ description: 'x' }, undefined, env)
    expect(result.status).toBe('generated')
    expect(result.zip).toMatch(/^data:application\/zip;base64,/)
    expect(result.zipArtifact).toBeUndefined()
  })

  it('throws when no module_graph came back', async () => {
    const env = makeEnv({
      deps: {
        fetchImpl: async () => sseResponse([
          { type: 'STATE_SNAPSHOT', snapshot: { error: 'the design failed' } },
          { type: 'RUN_FINISHED' },
        ]),
      },
    })
    await expect(runGenerateSystem({ description: 'x' }, undefined, env)).rejects.toThrow(/no module_graph/)
  })

  it('returns needs_auth for the system tool without a login', async () => {
    const env = makeEnv({ auth: stubAuth('', '') })
    const result = await runGenerateSystem({ description: 'x' }, undefined, env)
    expect(result.status).toBe('needs_auth')
    expect(result.kind).toBe('system')
  })
})
