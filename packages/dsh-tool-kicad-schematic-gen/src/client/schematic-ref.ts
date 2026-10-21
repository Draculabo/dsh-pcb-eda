/**
 * `@huaqiu/dsh-tool-kicad-schematic-gen` — the `@schematic-gen` reference source.
 *
 * Migrated from the retired `@huaqiu/dsh-tool-schematic-gen` plugin (its online
 * SSE agents were removed with the package). The chip identity, the `@`
 * trigger, the clipboard projection and the menu row are preserved verbatim so
 * existing drafts and the composer UX keep working. The one deliberate change:
 * the chip's model text is now the bare clipboard token — the semantics that
 * used to ride in the payload (pin the `kicad-schematic-design` skill instead
 * of the deleted online tools `generate_schematic_from_description` /
 * `generate_system_module_graph`, forbid hand-written KiCad files, defer to
 * the user's words) moved to the node half's `huaqiu:schematic-gen`
 * system-prompt section; see {@link SCHEMATIC_GEN_SERIALIZED} and
 * `src/prompt.ts`.
 *
 * One module owns the identity of the chip, its menu row, and the model text
 * the chip expands to at submit time. Registering the source is MANDATORY, not
 * cosmetic: DSH's submit plane routes every chip to its owner's codec and
 * rejects the whole send when the owner or its codec is missing
 * (`InputTriggerController.serializeReference` — "no serializer for reference
 * source"). A chip inserted without a registered source would therefore block
 * the user's message instead of degrading quietly.
 *
 * The registration is also ORDER-sensitive: the trigger service is provided by
 * a plugin whose own dependency chain is longer than ours, so reading it once
 * at `apply()` time can find nothing. The entry therefore declares
 * `inputTriggers` in its `inject` (cordis parks the plugin until the provider
 * exists) and retries briefly if it still arrives late.
 *
 * Registering it also buys the typed path for free: the user can type `@` and
 * pick *Generate schematic* (生成原理图 under a Chinese UI) from a group beside
 * *Files & folders* / *Sessions*.
 *
 * Everything the pipeline needs is declared STRUCTURALLY — no DSH package is
 * imported, so the client bundle stays pure. The one import,
 * `@huaqiu/dsh-sidebar-entry`, is our own plain library and is covered by
 * `alwaysBundle`; it is read for the host `<html lang>`, which is how the chip
 * label follows the UI language.
 *
 * @module
 */

import { detectHostLocale, type HostLocale } from '@huaqiu/dsh-sidebar-entry'

/** Menu group / chip owner name (unique per trigger char). */
export const SCHEMATIC_GEN_SOURCE = 'schematic-gen'

/** Owner-scoped reference id carried by the chip. */
export const SCHEMATIC_GEN_REF = 'generate'

/**
 * Inline chip label and menu candidate name — the ENGLISH copy, exported for
 * tests and for callers that need a stable literal.
 *
 * Never use it as the rendered string: `schematicGenLabel()` is the localized
 * accessor. The label used to BE this constant, which is why the chip in the
 * composer stayed English under a Chinese UI — the sidebar row, the tooltip and
 * the HIT card were all localized, and only the chip they insert was not.
 */
export const SCHEMATIC_GEN_LABEL = 'Generate schematic'

/**
 * Browser-console tag — greppable so the chip's language can be traced end to
 * end in the DSH WebView without a debugger.
 *
 * Every line is `console.debug` and every helper is wrapped, so a host without
 * a console (or one that rejects the payload) can never break the plugin.
 */
const TRACE = '[schematic-gen:ref]'

/** Emit one trace line. Never throws. */
function trace(event: string, payload?: unknown): void {
  try {
    // eslint-disable-next-line no-console
    console.debug(TRACE, event, payload ?? '')
  } catch {
    /* a non-console host must never break the composer */
  }
}

/**
 * Localized chip label / menu candidate name.
 *
 * Read fresh on every call rather than captured at registration: the chip is
 * created on a user gesture (button click or menu pick), so the language at
 * that moment is the language the user is looking at. zh is the fallback,
 * matching the sidebar row and the HIT card.
 */
export function schematicGenLabel(lang: HostLocale | undefined = detectHostLocale()): string {
  const label = lang === 'en' ? 'Generate schematic' : '生成原理图'
  // The one line that answers "why is my chip English": it shows both what the
  // host reported (`<html lang>`) and what we rendered from it.
  trace('label', { hostLang: lang ?? null, htmlLang: readHtmlLang(), label })
  return label
}

/** `<html lang>` as the plugin sees it, for the trace (null when unavailable). */
function readHtmlLang(): string | null {
  try {
    return document.documentElement?.getAttribute('lang') ?? null
  } catch {
    return null
  }
}

/** Clipboard / draft-persistence projection of the chip. */
export const SCHEMATIC_GEN_CLIPBOARD = '@schematic-gen'

/** Trigger char this source binds to. */
export const SCHEMATIC_GEN_TRIGGER = '@'

/** Menu group display order (lower = higher in the list). */
export const SCHEMATIC_GEN_ORDER = 10

/** Menu/group candidate description — the English copy (see {@link schematicGenDescription}). */
export const SCHEMATIC_GEN_DESCRIPTION = 'Generate a KiCad schematic from a description'

/** Localized menu/group candidate description (zh fallback, like the label). */
export function schematicGenDescription(lang: HostLocale | undefined = detectHostLocale()): string {
  return lang === 'en'
    ? 'Generate a KiCad schematic from a description'
    : '根据描述生成 KiCad 原理图'
}

/**
 * Model form of the chip: what the agent actually reads at the chip's position
 * in the user message — the clipboard token itself, nothing more.
 *
 * This is the idiomatic mention pattern (DSH's own draft tests serialize a
 * reference to its ref), and it is deliberate on two counts:
 *
 * 1. **Whatever `serialize` returns lands in the USER message** — the submit
 *    plane splices it over the chip's clipboard range — so a long payload is
 *    noise the user reads back in their own transcript on every send.
 * 2. **The token has no semantics of its own**, so the semantics cannot live
 *    here; they live in the node half's `huaqiu:schematic-gen` system-prompt
 *    section (see `src/prompt.ts`), which defines the token, pins the
 *    `kicad-schematic-design` skill, and carries the guardrails.
 *
 * History: the chip first shipped a 6-line `<schematic-gen intent=…>` block,
 * then a 3-line trimmed form, and now delegates entirely to the section. The
 * retired plugin pinned deleted online tools here
 * (`generate_schematic_from_description` / `generate_system_module_graph`);
 * nothing in this constant may ever name a tool again — the skill pin is the
 * section's job.
 */
export const SCHEMATIC_GEN_SERIALIZED = SCHEMATIC_GEN_CLIPBOARD

/** Menu/group candidate description. */
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

/**
 * The `ReferenceInsert` this source produces on pick (and on button click).
 *
 * The label is resolved against the host UI language at call time, so the chip
 * that lands in the composer reads in the language the user is currently in.
 */
export function schematicGenInsert(lang?: HostLocale): ReferenceInsertLike {
  const insert = {
    source: SCHEMATIC_GEN_SOURCE,
    ref: SCHEMATIC_GEN_REF,
    label: schematicGenLabel(lang),
    clipboardText: SCHEMATIC_GEN_CLIPBOARD,
  }
  trace('insert', insert)
  return insert
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
 *
 * `getLang` defaults to the host `<html lang>` read and is called fresh on
 * every `candidates()` / `onPick()`, so a language change takes effect without
 * re-registering the source (and without a locale-service dependency). It is a
 * parameter so tests can pin the language without a DOM.
 *
 * @param extraCandidates - optional extra rows merged ahead of the built-in one.
 * @returns the source, ready for `registerSource`.
 */
export function createSchematicGenSource(
  extraCandidates: readonly CandidateLike[] = [],
  getLang: () => HostLocale | undefined = detectHostLocale,
): SchematicGenSource {
  return {
    trigger: SCHEMATIC_GEN_TRIGGER,
    name: SCHEMATIC_GEN_SOURCE,
    order: SCHEMATIC_GEN_ORDER,
    showGroupTitle: true,
    candidates: () => {
      const lang = getLang()
      const rows = [
        ...extraCandidates,
        {
          name: schematicGenLabel(lang),
          description: schematicGenDescription(lang),
        },
      ]
      trace('candidates', rows)
      return Promise.resolve(rows)
    },
    onPick: () => {
      const insert = schematicGenInsert(getLang())
      trace('onPick', insert)
      return { insert }
    },
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
  return registerSchematicGenSourceTracked(registry).dispose
}

/** Outcome of one registration attempt. */
export interface SchematicGenRegistration {
  /** Whether the source is now live in the trigger roster. */
  readonly registered: boolean
  /** Unregister (a no-op when the attempt did not register). */
  readonly dispose: () => void
}

/**
 * One registration attempt, reported instead of swallowed.
 *
 * {@link registerSchematicGenSource} is the disposer-only view for callers that
 * do not care; this is the same attempt with the outcome visible, which is what
 * a caller needs to decide whether a chip may be inserted at all — an
 * unregistered source makes every send fail (see the module header).
 *
 * @param registry - `ctx.get('inputTriggers')`, or undefined.
 * @returns whether the registration landed, plus its disposer.
 */
export function registerSchematicGenSourceTracked(registry: unknown): SchematicGenRegistration {
  if (
    registry === undefined || registry === null ||
    typeof (registry as InputTriggerRegistryLike).registerSource !== 'function'
  ) {
    return { registered: false, dispose: () => {} }
  }
  try {
    const dispose = (registry as InputTriggerRegistryLike).registerSource(createSchematicGenSource())
    return {
      registered: true,
      dispose: typeof dispose === 'function' ? dispose : () => {},
    }
  } catch {
    // Already registered (duplicate trigger/name) — the existing owner keeps
    // serving our chips, which is the correct outcome.
    return { registered: true, dispose: () => {} }
  }
}

/** Scheduler seam for {@link registerSchematicGenSourceWhenReady} (tests inject fakes). */
export interface RegistrationRetryHooks {
  /** Poll interval while the trigger service is still absent. */
  intervalMs?: number
  /** Give up after this many polls; default 80 (≈20 s at 250 ms). */
  maxAttempts?: number
  /** Timer constructor; defaults to the host `setInterval`. */
  setTimer?: (fn: () => void, ms: number) => unknown
  /** Timer destructor; defaults to the host `clearInterval`. */
  clearTimer?: (handle: unknown) => void
  /** Trace sink; defaults to this module's {@link trace}. */
  trace?: (event: string, payload?: unknown) => void
}

/** Live registration handle returned by {@link registerSchematicGenSourceWhenReady}. */
export interface SchematicGenSourceBinding {
  /** Whether the source is registered RIGHT NOW (re-read on every call). */
  registered(): boolean
  /** Stop retrying and unregister. */
  dispose(): void
}

/**
 * Host timer, or undefined where there is none.
 *
 * The retry is browser-only machinery, and the built bundle is also evaluated
 * in bare hosts (the vm-based card test, a non-DOM worker) where `setInterval`
 * does not exist. Those must degrade to "not registered yet" — a throw here
 * would take the whole client half down, which is the failure mode this module
 * exists to prevent.
 */
function hostTimer(): { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void } | undefined {
  if (typeof setInterval !== 'function' || typeof clearInterval !== 'function') return undefined
  return {
    set: (fn, ms) => setInterval(fn, ms),
    clear: (handle) => clearInterval(handle as never),
  }
}

/**
 * Register the source, polling while the trigger service has not activated yet.
 *
 * Why this exists: activation is service-availability driven, and
 * `inputTriggers` is provided by a plugin (`dsh-client-ui-input-trigger`) whose
 * own dependency chain is far longer than ours. A plugin that reads the service
 * exactly once at `apply()` time and finds it absent registers NOTHING —
 * silently. The chip then lands in the composer (insertion only needs
 * `conversation`) and the send dies on
 * `slash: no serializer for reference source "schematic-gen"`, because the
 * controller routes every chip to its owner's codec. Declaring `inputTriggers`
 * in the plugin's `inject` is the primary fix (cordis then parks this plugin
 * until the provider exists); this poll is the belt-and-braces path for a
 * provider that arrives later than that declaration could promise.
 *
 * @param getRegistry - returns the current `ctx.get('inputTriggers')` value.
 * @param hooks - scheduler/trace seams.
 * @returns a live binding whose `registered()` the caller may consult.
 */
export function registerSchematicGenSourceWhenReady(
  getRegistry: () => unknown,
  hooks: RegistrationRetryHooks = {},
): SchematicGenSourceBinding {
  const intervalMs = hooks.intervalMs ?? 250
  const maxAttempts = hooks.maxAttempts ?? 80
  const traceFn = hooks.trace ?? trace
  const timer = hooks.setTimer !== undefined && hooks.clearTimer !== undefined
    ? { set: hooks.setTimer, clear: hooks.clearTimer }
    : hostTimer()

  let current: SchematicGenRegistration = registerSchematicGenSourceTracked(getRegistry())
  let handle: unknown
  let attempts = 0
  let stopped = false

  const stopTimer = (): void => {
    if (handle === undefined || timer === undefined) return
    timer.clear(handle)
    handle = undefined
  }

  const dispose = (): void => {
    stopped = true
    stopTimer()
    current.dispose()
  }

  if (current.registered) {
    return { registered: () => true, dispose }
  }

  if (timer === undefined) {
    // No timer host: the caller's `registered()` stays false and the sidebar
    // click declines to insert, which is the honest outcome — a chip that
    // cannot be submitted is worse than no chip.
    traceFn('no timer host — source registration not retried')
    return { registered: () => false, dispose }
  }

  traceFn('waiting for inputTriggers', { intervalMs, maxAttempts })
  handle = timer.set(() => {
    if (stopped) return
    attempts += 1
    const next = registerSchematicGenSourceTracked(getRegistry())
    if (next.registered) {
      // The earlier attempt registered nothing, so it carries no disposer of
      // its own — only the winning registration needs unregistering.
      current = next
      stopTimer()
      traceFn('registered (late)', { attempts })
      return
    }
    if (attempts >= maxAttempts) {
      stopTimer()
      traceFn('source registration gave up', { attempts })
    }
  }, intervalMs)

  return {
    registered: () => current.registered,
    dispose,
  }
}
