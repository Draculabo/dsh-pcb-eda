/**
 * Browser-safe placement seam for the symbol/footprint HIT card.
 *
 * Re-export placement helpers from the browser-safe subpath instead of the
 * package root, which also exports the Cordis plugin entry.
 */
export {
  placeSupportOf,
  type HqEdgePlaceLike,
  type PlaceSupport,
} from '@huaqiu/dsh-artifacts/placement'
