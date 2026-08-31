import {
  createPartSearchService,
  type EdaModels,
  type Part,
  type PartIdentifier,
  type PartSearchClientOptions,
  type PartSearchPage,
  type SearchPartsOptions,
  type SupplyOffer,
} from '@huaqiu/part-search'

export interface PartSearchServiceLike {
  searchParts(options: SearchPartsOptions): Promise<PartSearchPage>
  getPart(input: PartIdentifier, language?: string): Promise<Part>
  getEdaModels(input: PartIdentifier, language?: string): Promise<EdaModels>
  getSupplyChain(parts: readonly PartIdentifier[]): Promise<SupplyOffer[]>
}

export type PartSearchServiceOptions = PartSearchClientOptions

export function createPartSearch(options?: PartSearchServiceOptions): PartSearchServiceLike {
  return createPartSearchService(options)
}

export type { Part, PartIdentifier, PartSearchPage, SearchPartsOptions, SupplyOffer }
