import { describe, expect, it } from 'vitest'
import type {
  EdaModels,
  Part,
  PartSearchPage,
  PartIdentifier,
  SearchPartsOptions,
  SupplyOffer,
} from '@huaqiu/part-search'
import type { PartSearchServiceLike } from '../src/service.js'
import { createPartSearchTools } from '../src/tools.js'

/** A stub service recording calls so the adapter contract is locked. */
function createStubService() {
  const calls: string[] = []
  const service: PartSearchServiceLike = {
    async searchParts(options: SearchPartsOptions) {
      calls.push(`searchParts:${JSON.stringify(options)}`)
      return { page: 1, pageSize: 10, pages: 1, total: 1, items: [] }
    },
    async getPart(input: PartIdentifier, language?: string) {
      calls.push(`getPart:${input.manufacturerId}/${input.mpn}/${language ?? ''}`)
      return {} as Part
    },
    async getEdaModels(input: PartIdentifier, language?: string) {
      calls.push(`getEdaModels:${input.manufacturerId}/${input.mpn}/${language ?? ''}`)
      return {} as EdaModels
    },
    async getSupplyChain(parts: readonly PartIdentifier[]) {
      calls.push(`getSupplyChain:${parts.length}`)
      return [] as SupplyOffer[]
    },
  }
  return { service, calls }
}

type Tool = {
  name: string
  execute(args: unknown): Promise<unknown>
  output: { render(args: unknown, value: unknown): unknown[] }
}

describe('createPartSearchTools', () => {
  it('returns the four part-search tools in stable order', () => {
    const { service } = createStubService()
    const tools = createPartSearchTools(service) as unknown as Tool[]
    expect(tools.map((t) => t.name)).toEqual([
      'search_hqsch_parts',
      'get_hqsch_part',
      'get_hqsch_part_models',
      'get_hqsch_supply_chain',
    ])
  })

  it('maps snake_case args to the service for search', async () => {
    const { service, calls } = createStubService()
    const tools = createPartSearchTools(service) as unknown as Tool[]
    const result = await tools[0]!.execute({
      query: 'STM32F103',
      page: 2,
      page_size: 20,
      require_eda_model: true,
      requirements: { footprint: true },
      language: 'en',
    })
    expect(result).toEqual({ page: 1, pageSize: 10, pages: 1, total: 1, items: [] })
    expect(calls).toEqual([
      'searchParts:{"query":"STM32F103","page":2,"pageSize":20,"requireEdaModel":true,"requirements":{"footprint":true},"language":"en"}',
    ])
  })

  it('forwards undefined optional args untouched (library defaults apply)', async () => {
    const { service, calls } = createStubService()
    const tools = createPartSearchTools(service) as unknown as Tool[]
    await tools[0]!.execute({ query: '0402 10k resistor' })
    expect(calls).toEqual(['searchParts:{"query":"0402 10k resistor"}'])
  })

  it('maps manufacturer_id/mpn/language for detail and models', async () => {
    const { service, calls } = createStubService()
    const tools = createPartSearchTools(service) as unknown as Tool[]
    await tools[1]!.execute({ manufacturer_id: '7189', mpn: 'STM32F410T8Y6TR', language: 'zh' })
    await tools[2]!.execute({ manufacturer_id: '7189', mpn: 'STM32F410T8Y6TR' })
    expect(calls).toEqual([
      'getPart:7189/STM32F410T8Y6TR/zh',
      'getEdaModels:7189/STM32F410T8Y6TR/',
    ])
  })

  it('maps the parts array for supply-chain (batched)', async () => {
    const { service, calls } = createStubService()
    const tools = createPartSearchTools(service) as unknown as Tool[]
    await tools[3]!.execute({
      parts: [
        { manufacturer_id: '7189', mpn: 'STM32F103C8T6' },
        { manufacturer_id: '1944', mpn: 'LD1117S33TR' },
      ],
    })
    expect(calls).toEqual(['getSupplyChain:2'])
  })

  it('renders every canonical value as a single text block', async () => {
    const { service } = createStubService()
    const tools = createPartSearchTools(service) as unknown as Tool[]
    const value = { page: 1, pageSize: 10, pages: 1, total: 0, items: [] }
    const blocks = tools[0]!.output.render({ query: 'x' }, value) as Array<{ type: string; text: string }>
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.type).toBe('text')
    expect(JSON.parse(blocks[0]!.text)).toEqual(value)
  })

  it('strips undefined optional fields so the canonical value is lossless JSON', async () => {
    const service: PartSearchServiceLike = {
      async searchParts() {
        // Mirrors the library normalizer: optional fields are `undefined`.
        return {
          page: 1,
          pageSize: 10,
          pages: 1,
          total: 1,
          items: [{ mpn: 'X', manufacturer: { id: '1', name: 'M' }, huaqiuPn: undefined, datasheetUrl: undefined }],
        } as unknown as PartSearchPage
      },
      async getPart() {
        return {} as Part
      },
      async getEdaModels() {
        return {} as EdaModels
      },
      async getSupplyChain() {
        return [] as SupplyOffer[]
      },
    }
    const tools = createPartSearchTools(service) as unknown as Tool[]
    const result = await tools[0]!.execute({ query: 'X' })
    // undefined must be gone; JSON round-trip must succeed.
    expect(JSON.stringify(result)).not.toContain('undefined')
    expect(JSON.parse(JSON.stringify(result))).toEqual(
      JSON.parse('{"page":1,"pageSize":10,"pages":1,"total":1,"items":[{"mpn":"X","manufacturer":{"id":"1","name":"M"}}]}'),
    )
  })
})
