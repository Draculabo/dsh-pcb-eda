import { describe, expect, it } from 'vitest'
import { apply, inject, name } from '../src/index.js'
import { agentIds } from '../src/config.js'

type Tool = { name: string }

function ctxStub() {
  const registered: unknown[] = []
  return {
    registered,
    ctx: {
      tools: { register: (d: unknown) => (registered.push(d), () => {}) },
      huaqiuAuth: {
        auth: {
          isAuthenticated: () => true,
          getAccessToken: async () => 'tok-1',
          getUserInfo: async () => ({ id: 'u1', token: 'tok-1' }),
          login: async () => {},
          logout: async () => {},
          onAuthStateChanged: () => () => {},
        },
      },
      huaqiuArtifacts: {
        create: async () => ({ id: 'art', type: 'zip', filename: 'x.zip', size: 1 }),
        get: async () => null,
        readContent: async () => null,
        delete: async () => {},
        deleteAll: async () => 0,
      },
    } as Record<string, unknown>,
  }
}

describe('@huaqiu/dsh-tool-schematic-gen plugin', () => {
  it('exposes the expected node plugin shape', () => {
    expect(name).toBe('@huaqiu/dsh-tool-schematic-gen')
    expect(inject).toEqual(['tools', 'huaqiuAuth', 'huaqiuArtifacts'])
    expect(agentIds.SCHEMATIC).toBe('schemagen')
    expect(agentIds.SYSTEM).toBe('modular_circuit')
  })

  it('registers the two generation tools', () => {
    const { ctx, registered } = ctxStub()
    const dispose = apply(ctx as never)
    const names = (registered as Tool[]).map((t) => t.name)
    expect(names).toEqual([
      'generate_schematic_from_description',
      'generate_system_module_graph',
    ])
    expect(typeof dispose).toBe('function')
  })

  it('throws loudly when the auth service is missing', () => {
    const { ctx } = ctxStub()
    expect(() => apply({ ...ctx, huaqiuAuth: undefined } as never)).toThrow(/huaqiuAuth/)
  })

  it('throws loudly when the artifacts service is missing', () => {
    const { ctx } = ctxStub()
    expect(() => apply({ ...ctx, huaqiuArtifacts: undefined } as never)).toThrow(/huaqiuArtifacts/)
  })

  it('has no @hqedge dependency and no demo credentials', async () => {
    const fs = await import('node:fs/promises')
    const [source, manifest] = await Promise.all([
      fs.readFile(new URL('../src/index.ts', import.meta.url), 'utf8'),
      fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ])
    expect(source).not.toMatch(/from\s+['"]@hqedge/)
    const deps = {
      ...JSON.parse(manifest).dependencies,
      ...JSON.parse(manifest).peerDependencies,
      ...JSON.parse(manifest).devDependencies,
    }
    expect(Object.keys(deps).some((k) => k.startsWith('@hqedge'))).toBe(false)
  })
})
