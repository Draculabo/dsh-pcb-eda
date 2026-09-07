/**
 * Placement compatibility — shared by every generation tool that can produce
 * a placeable EDA artifact (`component-gen-app`, `dsh-tool-schematic-gen`,
 * `dsh-tool-symbol-footprint`).
 *
 * This is the **frontend** copy of the rule. It exists purely to decide whether
 * to *render* the `Place` action. HQ Edge enforces the same matrix
 * server-side, so this is never a security boundary — it is UX only.
 *
 * Deliberately NOT imported from HQ Edge: the frontend package owns its own
 * compatibility helper (see the task's Phase 4 notes). The two matrices must
 * stay in sync, so `canPlaceArtifact` is covered by a full-matrix test here.
 *
 * @module
 */

/** Artifact classes that can be placed into an EDA editor. */
export const PLACEABLE_ARTIFACT_TYPES = ['schematic', 'symbol', 'footprint'] as const

export type PlaceableArtifactType = (typeof PLACEABLE_ARTIFACT_TYPES)[number]

/**
 * Editor contexts an HQ Edge instance may be serving.
 * Mirrors HQ Edge's `EditorType` (`config/hostContext.ts`).
 */
export type EditorType = 'sch' | 'pcb' | 'symbol' | 'footprint' | 'generic'

/**
 * Editors each artifact type may be placed into.
 *
 * | Artifact  | sch | pcb | symbol | footprint | generic |
 * |-----------|-----|-----|--------|-----------|---------|
 * | schematic | yes | no  | no     | no        | no      |
 * | symbol    | yes | no  | yes    | no        | no      |
 * | footprint | no  | yes | no     | yes       | no      |
 *
 * `generic` appears in no row: HQ Edge may be inside *some* EDA host without
 * knowing which editor, so placement must fail closed.
 */
const COMPATIBLE_EDITORS: Record<PlaceableArtifactType, ReadonlySet<EditorType>> = {
  schematic: new Set<EditorType>(['sch']),
  symbol: new Set<EditorType>(['sch', 'symbol']),
  footprint: new Set<EditorType>(['pcb', 'footprint']),
}

/**
 * Can `artifactType` be placed into the editor identified by `editorType`?
 *
 * Fails closed: an unrecognized artifact or editor type yields `false`.
 */
export function canPlaceArtifact(
  artifactType: PlaceableArtifactType,
  editorType: EditorType,
): boolean {
  const allowed = COMPATIBLE_EDITORS[artifactType]
  return allowed ? allowed.has(editorType) : false
}

/**
 * Coerce an unknown value to a {@link PlaceableArtifactType}, or `null` when
 * it is not placeable (`pcb` and `zip` artifacts have no placement support).
 */
export function parsePlaceableArtifactType(value: unknown): PlaceableArtifactType | null {
  if (typeof value !== 'string') return null
  return (PLACEABLE_ARTIFACT_TYPES as readonly string[]).includes(value)
    ? (value as PlaceableArtifactType)
    : null
}

/**
 * The placement request the frontend sends to HQ Edge (via edge-bridge).
 *
 * It carries only *what* to place — never an editor type, target host, or EDA
 * URL: HQ Edge owns all of that.
 */
export interface PlaceArtifactRequest {
  type: PlaceableArtifactType
  /** HQ Edge-resolvable URI — from `huaqiuArtifacts.getDownloadUri(id)`. */
  artifactUri: string
  /** Original filename, when the URI path is opaque (e.g. `content`). */
  filename?: string
  /** Root schematic filename — overrides the zip-derived root (system designs). */
  root?: string
}

// ── hqEdge place seam ───────────────────────────────────────────────────────

/** Structural view of the `hqEdge` CLIENT service (edge-bridge browser half). */
export interface HqEdgePlaceLike {
  context?: {
    getCurrent?(): { targetHost?: string; editorType?: string } | null
    getTargetHost?(): string
    getEditorType?(): string
  }
  placeArtifact?(request: PlaceArtifactRequest): Promise<unknown>
}

/** Everything a card needs to render + fire the Place action, or null. */
export interface PlaceSupport {
  editorType: string
  place(request: PlaceArtifactRequest): Promise<unknown>
}

/**
 * Build the Place support for `artifactType` from a lazily-resolved `hqEdge`.
 *
 * Returns null when `getHqEdge` is unavailable (standalone DSH has no
 * edge-bridge, hence no `hqEdge` service). Otherwise returns a GETTER so
 * callers resolve the service lazily — plugin load order and HQ Edge restarts
 * both resolve correctly at click time. The getter yields null when
 * placement is unavailable or the current editor cannot accept the artifact
 * type (the card hides the button in that case).
 *
 * Editor gating is UX-only; HQ Edge re-enforces the matrix server-side (409).
 */
export function placeSupportOf(
  getHqEdge: (() => HqEdgePlaceLike | undefined) | undefined,
  artifactType: PlaceableArtifactType,
): (() => PlaceSupport | null) | null {
  if (typeof getHqEdge !== 'function') return null
  return () => {
    let hqEdge: HqEdgePlaceLike | undefined
    try {
      hqEdge = getHqEdge()
    } catch {
      return null
    }
    if (!hqEdge || typeof hqEdge.placeArtifact !== 'function') return null
    let editorType = ''
    try {
      editorType = hqEdge.context?.getEditorType?.() ?? hqEdge.context?.getCurrent?.()?.editorType ?? ''
    } catch {
      return null
    }
    if (!editorType || !canPlaceArtifact(artifactType, editorType as EditorType)) return null
    return {
      editorType,
      place: (request) => hqEdge.placeArtifact!(request),
    }
  }
}
