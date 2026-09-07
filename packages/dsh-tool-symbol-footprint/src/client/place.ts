/**
 * Place-action seam for the symbol/footprint generation HIT card.
 *
 * Thin re-export of the shared, browser-safe placement module
 * (`@huaqiu/dsh-artifacts/placement`): the frontend compatibility matrix plus
 * the lazy `hqEdge` service accessor. Kept as a local module so the card's
 * import paths stay stable and the client bundle only ever pulls the pure
 * subpath — the package root exports the cordis plugin entry, which must not
 * be bundled into the browser.
 *
 * @module
 */
export {
  placeSupportOf,
  type HqEdgePlaceLike,
  type PlaceSupport,
} from '@huaqiu/dsh-artifacts/placement'
