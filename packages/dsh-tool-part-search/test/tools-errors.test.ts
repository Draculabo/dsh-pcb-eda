import { describe, expect, it } from 'vitest'
import type {
  EdaModels,
  Part,
  PartIdentifier,
  PartSearchPage,
  SearchPartsOptions,
  SupplyOffer,
} from '@huaqiu/part-search'
import type { PartSearchServiceLike } from '../src/service.js'
import { createPartSearchTools } from '../src/tools.js'

type Tool = {
  execute(args: unknown): Promise<unknown>
}

describe('part-search tool errors', () => {
  it('propagates service failures without rewriting them', async () => {
    const error = new Error('upstream unavailable')
    const service: PartSearchServiceLike = {
      async searchParts(_options: SearchPartsOptions): Promise<PartSearchPage> {
        throw error
      },
      async getPart(_input: PartIdentifier, _language?: string): Promise<Part> {
        throw error
      },
      async getEdaModels(_input: PartIdentifier, _language?: string): Promise<EdaModels> {
        throw error
      },
      async getSupplyChain(_parts: readonly PartIdentifier[]): Promise<SupplyOffer[]> {
        throw error
      },
    }
    const tools = createPartSearchTools(service) as unknown as Tool[]

    await expect(tools[0]!.execute({ query: 'STM32' })).rejects.toBe(error)
    await expect(tools[1]!.execute({ manufacturer_id: '7189', mpn: 'STM32F103C8T6' })).rejects.toBe(error)
    await expect(tools[2]!.execute({ manufacturer_id: '7189', mpn: 'STM32F103C8T6' })).rejects.toBe(error)
    await expect(tools[3]!.execute({ parts: [{ manufacturer_id: '7189', mpn: 'STM32F103C8T6' }] })).rejects.toBe(error)
  })
})
