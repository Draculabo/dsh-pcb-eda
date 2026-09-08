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

/**
 * Keep the DSH adapter on the public part-search service boundary so callers can
 * substitute the service structurally in tests without coupling to DSH types.
 */
export function createPartSearch(options?: PartSearchServiceOptions): PartSearchServiceLike {
  return createPartSearchService(options)
}

export type { Part, PartIdentifier, PartSearchPage, SearchPartsOptions, SupplyOffer }
