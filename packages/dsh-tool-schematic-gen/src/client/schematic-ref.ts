/**
 * `@huaqiu/dsh-tool-schematic-gen` — the `@schematic-gen` reference source.
 *
 * One module owns the identity of the chip, its menu row, and the model text
 * the chip expands to at submit time. Registering the source is MANDATORY, not
 * cosmetic: DSH's submit plane routes every chip to its owner's codec and
 * rejects the whole send when the owner or its codec is missing
 * (`InputTriggerController.serializeReference` — "no serializer for reference
 * source"). A chip inserted without a registered source would therefore block
 * the user's message instead of degrading quietly.
 *
 * Registering it also buys the typed path for free: the user can type `@` and
 * pick *Generate schematic* from a group beside *Files & folders* / *Sessions*.
 *
 * Everything the pipeline needs is declared STRUCTURALLY — no DSH package is
 * imported, so the client bundle stays pure (see `test/client-bundle-purity`).
 *
 * @module
 */

/** Menu group / chip owner name (unique per trigger char). */
export const SCHEMATIC_GEN_SOURCE = 'schematic-gen'

/** Owner-scoped reference id carried by the chip. */
export const SCHEMATIC_GEN_REF = 'generate'

/** Inline chip label (and menu candidate name). */
export const SCHEMATIC_GEN_LABEL = 'Generate schematic'

/** Clipboard / draft-persistence projection of the chip. */
export const SCHEMATIC_GEN_CLIPBOARD = '@schematic-gen'

/** Trigger char this source binds to. */
export const SCHEMATIC_GEN_TRIGGER = '@'

/** Menu group display order (lower = higher in the list). */
export const SCHEMATIC_GEN_ORDER = 10

/**
 * Model form of the chip: what the agent actually reads at the chip's position
 * in the user message.
 *
 * Deliberately an *intent*, never a fabricated design description — the user's
 * own words stay the only source of requirements, and the plugin being loaded
 * is never by itself a reason to generate.
 */
export const SCHEMATIC_GEN_SERIALIZED =
  '<schematic-gen intent="generate_schematic_from_description">\n' +
  'The user explicitly chose Schematic Gen for this request. Produce the design ' +
  'with the `generate_schematic_from_description` tool; for a multi-module or ' +
  'system-level design use `generate_system_module_graph` instead.\n' +
  'Never hand-write .kicad_sch files or KiCad project files yourself — always go ' +
  'through the tools.\n' +
  "Use the user's own words as the design description. If they have not described " +
  'the circuit yet, ask for the requirements instead of assuming them.\n' +
  '</schematic-gen>'

/** Menu/group candidate description. */
export const SCHEMATIC_GEN_DESCRIPTION = 'Generate a KiCad schematic from a description'

/**
 * The frozen `ReferenceInsert` shape DSH's composer consumes.
 *
 * Structural — declared here so the insertion path and the pick path cannot
 * drift apart. `appearance` is intentionally omitted: `ReferenceChip` renders
 * the standard `@` marker when it is undefined, which is exactly the look the
 * shipped `@ Files & folders` chips have.
 */
export interface ReferenceInsertLike {
  readonly source: string
  readonly ref: string
  readonly label: string
  readonly appearance?: 'session' | 'file' | 'folder'
  readonly clipboardText: string
}

/** The `ReferenceInsert` this source produces on pick (and on button click). */
export function schematicGenInsert(): ReferenceInsertLike {
  return {
    source: SCHEMATIC_GEN_SOURCE,
    ref: SCHEMATIC_GEN_REF,
    label: SCHEMATIC_GEN_LABEL,
    clipboardText: SCHEMATIC_GEN_CLIPBOARD,
  }
}

/** Structural view of one `@` menu candidate (DSH `InputTriggerCandidate`). */
export interface CandidateLike {
  readonly name: string
  readonly description?: string
}

/** Structural view of the DSH trigger-source registry (`ctx.inputTriggers`). */
export interface InputTriggerRegistryLike {
  registerSource(src: unknown): () => void
}

/** The source as DSH expects it (structurally typed). */
export interface SchematicGenSource {
  readonly trigger: string
  readonly name: string
  readonly order: number
  readonly showGroupTitle: boolean
  candidates(): Promise<readonly CandidateLike[]>
  onPick(): { readonly insert: ReferenceInsertLike }
  codec: {
    clipboardText(ref: string): string
    serialize(ref: string, signal: unknown): Promise<string>
  }
}

/**
 * Build the source object. Pure — nothing here touches the DOM or the
 * composer, so it is fully unit-testable.
 * @param extraCandidates - optional extra rows merged ahead of the built-in one.
 * @returns the source, ready for `registerSource`.
 */
export function createSchematicGenSource(
  extraCandidates: readonly CandidateLike[] = [],
): SchematicGenSource {
  return {
    trigger: SCHEMATIC_GEN_TRIGGER,
    name: SCHEMATIC_GEN_SOURCE,
    order: SCHEMATIC_GEN_ORDER,
    showGroupTitle: true,
    candidates: () => Promise.resolve([
      ...extraCandidates,
      { name: SCHEMATIC_GEN_LABEL, description: SCHEMATIC_GEN_DESCRIPTION },
    ]),
    onPick: () => ({ insert: schematicGenInsert() }),
    codec: {
      clipboardText: () => SCHEMATIC_GEN_CLIPBOARD,
      serialize: () => Promise.resolve(SCHEMATIC_GEN_SERIALIZED),
    },
  }
}

/**
 * Register the source and return its disposer.
 *
 * Never throws: a missing service, a duplicate registration (a second live
 * copy of this plugin) or a throwing registry must not take the whole client
 * half down. Without a registered source the sidebar button degrades to
 * inserting nothing rather than producing a chip that would block submission.
 * @param registry - `ctx.get('inputTriggers')`, or undefined.
 * @returns disposer (a no-op when registration did not happen).
 */
export function registerSchematicGenSource(registry: unknown): () => void {
  if (
    registry === undefined || registry === null ||
    typeof (registry as InputTriggerRegistryLike).registerSource !== 'function'
  ) {
    return () => {}
  }
  try {
    const dispose = (registry as InputTriggerRegistryLike).registerSource(createSchematicGenSource())
    return typeof dispose === 'function' ? dispose : () => {}
  } catch {
    // Already registered (duplicate trigger/name) — the existing owner keeps
    // serving our chips, which is the correct outcome.
    return () => {}
  }
}
