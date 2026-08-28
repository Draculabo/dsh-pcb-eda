/**
 * Huaqiu part-search service adapter — the thin separation between the
 * `@huaqiu/part-search` library and the DSH tool layer.
 *
 * The library (`PartSearchService`) is the single implementation of the Huaqiu
 * public part-search API and returns the normalized domain model. This module
 * only:
 *
 *   - owns the client lifecycle (one shared service instance per plugin),
 *   - narrows the surface to what the four tools call,
 *   - stays DSH-free (no cordis imports) so it is trivially unit-testable.
 *
 * The upstream base URL is intentionally NOT configurable here: the library
 * hardcodes `https://kiapi.eda.cn` and the whole point of Phase 1 is that the
 * plugin is a self-contained, public, unauthenticated capability.
 *
 * @module @huaqiu/dsh-tool-part-search/service
 */

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

/**
 * The operations the four DSH tools need. Declared as a structural interface so
 * tests can inject a stub without touching the network.
 */
export interface PartSearchServiceLike {
  searchParts(options: SearchPartsOptions): Promise<PartSearchPage>
  getPart(input: PartIdentifier, language?: string): Promise<Part>
  getEdaModels(input: PartIdentifier, language?: string): Promise<EdaModels>
  getSupplyChain(parts: readonly PartIdentifier[]): Promise<SupplyOffer[]>
}

/** Options for {@link createPartSearchService}. */
export type PartSearchServiceOptions = PartSearchClientOptions

/**
 * Create the Huaqiu part-search service used by all four tools.
 *
 * @param options - optional client options (language / timeout / fetch / logger).
 *   Omitted in production so the library defaults apply (global fetch, 15s
 *   timeout, zh). Tests pass a stub `fetch` or replace the returned instance.
 * @returns a ready-to-use service.
 */
export function createPartSearch(options?: PartSearchServiceOptions): PartSearchServiceLike {
  return createPartSearchService(options)
}

export type { Part, PartIdentifier, PartSearchPage, SearchPartsOptions, SupplyOffer }
