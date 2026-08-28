/**
 * `@huaqiu/dsh-tool-schematic-gen` — the two agent-visible tools.
 *
 * Faithful TypeScript port of the `hq-edge` plugin's tool bodies, adapted to
 * the published DSH plugin surface:
 *   - the eda.cn account always comes from the `huaqiuAuth` service (no demo
 *     credentials — migration plan review #9);
 *   - generated artifacts are stored in the `huaqiuArtifacts` service
 *     (in-process, not a loopback);
 *   - tools are `defineTool` with `output.schema = { type: 'json' }` and a
 *     structured (lossless-JSON) result.
 *
 * Tools:
 *   generate_schematic_from_description   description → KiCad schematic
 *   generate_system_module_graph          description → module graph → KiCad zip
 *
 * @module @huaqiu/dsh-tool-schematic-gen
 */
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { HuaqiuAuthService } from '@huaqiu/dsh-auth'
import type { CreateArtifactResult, HuaqiuArtifacts } from '@huaqiu/dsh-artifacts'
import {
  agentIds,
  buildHeaders,
  buildRunBody,
  sanitizeZipBaseName,
  type EdaAccount,
  type SchematicGenConfig,
} from './config.js'
import { consumeCopilotkit, exportModuleGraphZip, HTTP_TIMEOUT_MS } from './sse.js'

/** Structural alias of the DSH `JsonValue` (see part-search Phase 1 §15.2.1). */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

/** The normalized domain values are lossless-JSON plain objects except that
 *  optional fields are `undefined`, which fails DSH's lossless-JSON validation. */
function asJson<T>(value: T): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}

/** Console tag for log filtering. */
const LOG_TAG = '[dsh-schematic-gen]'

/** Agent-facing timeout hints. */
export const TOOL_TIMEOUT_MS = {
  generate_schematic_from_description: HTTP_TIMEOUT_MS,
  generate_system_module_graph: HTTP_TIMEOUT_MS,
} as const

/** Zip files up to this size are inlined as a base64 data URL on fallback;
 *  larger ones are written to a temp file and returned by path. */
export const MAX_INLINE_ZIP_BYTES = 1_000_000

function renderJson(_args: unknown, value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(value) }]
}

// ── Runtime environment ──────────────────────────────────────────────────────

export interface SchematicGenDeps {
  fetchImpl?: typeof fetch
  writeFileImpl?: (path: string, data: Buffer | string) => Promise<void>
  tmpDirImpl?: () => string
  uuidImpl?: () => string
}

export interface SchematicGenEnv {
  config: SchematicGenConfig
  /** `huaqiuAuth` node service — the eda.cn account capability. */
  auth: HuaqiuAuthService['auth']
  /** `huaqiuArtifacts` node service — preview-artifact store. */
  artifacts: HuaqiuArtifacts
  timeoutMs: number
  deps?: SchematicGenDeps
}

/** Resolve the eda.cn account from the auth capability (no baked-in creds). */
async function resolveAccount(auth: HuaqiuAuthService['auth']): Promise<EdaAccount | null> {
  if (!auth || typeof auth.getUserInfo !== 'function') return null
  try {
    const info = await auth.getUserInfo()
    if (info && typeof info.id === 'string' && typeof info.token === 'string' && info.id.length > 0 && info.token.length > 0) {
      return { userId: info.id, userToken: info.token }
    }
    return null
  } catch (err) {
    console.warn(LOG_TAG, 'could not resolve the eda.cn account', String((err as Error)?.message || err))
    return null
  }
}

/** Fresh run id, injectable for tests. */
function newRunId(env: SchematicGenEnv): string {
  return typeof env.deps?.uuidImpl === 'function' ? env.deps.uuidImpl() : randomUUID()
}

/** Store a generated artifact in the user-wide preview store (in-process). */
async function createPreviewArtifact(
  env: SchematicGenEnv,
  type: 'schematic' | 'zip',
  filename: string,
  content: string,
  contentEncoding?: 'utf8' | 'base64',
): Promise<CreateArtifactResult> {
  if (!env.artifacts || typeof env.artifacts.create !== 'function') {
    throw new Error('schematic-gen: huaqiuArtifacts service unavailable — cannot store preview artifact')
  }
  return env.artifacts.create({ type, filename, content, contentEncoding })
}

// ── Deliverable extraction ───────────────────────────────────────────────────

export interface SchematicSheet {
  filename: string
  content: string
}

export interface ExtractedSchematic {
  outProject: string
  project_achieve_url: string
  kicadPro: string
  schFiles: SchematicSheet[]
  error: string
}

/**
 * Pull the schematic deliverable out of the final agent state. `schFiles`
 * carry the `.kicad_sch` content inline, so the text is returned verbatim.
 */
export function extractSchematic(state: Record<string, unknown>): ExtractedSchematic {
  const rawFiles = Array.isArray(state.schFiles) ? state.schFiles : []
  const schFiles = rawFiles
    .map((f) => {
      const file = f && typeof f === 'object' ? f as Record<string, unknown> : {}
      return {
        filename: typeof file.filename === 'string' ? file.filename : '',
        content: typeof file.content === 'string'
          ? file.content
          : (typeof file.content === 'object' && file.content !== null
            ? JSON.stringify(file.content)
            : String(file.content ?? '')),
      }
    })
    .filter((f) => f.filename.length > 0)
  return {
    outProject: typeof state.outProject === 'string' ? state.outProject : '',
    project_achieve_url: typeof state.project_achieve_url === 'string' ? state.project_achieve_url : '',
    kicadPro: typeof state.kicadPro === 'string' ? state.kicadPro : '',
    schFiles,
    error: typeof state.error === 'string' ? state.error : '',
  }
}

/** Pull the module graph out of the final system-design state. */
export function extractModuleGraph(state: Record<string, unknown>): Record<string, unknown> | null {
  const mg = state && state.module_graph
  return mg && typeof mg === 'object' ? (mg as Record<string, unknown>) : null
}

// ── Shared tail: materialize schematic artifacts ─────────────────────────────

interface MaterializedSchematic {
  schFiles: Array<{ filename: string; content?: string }>
  schArtifacts?: Array<{ id: string; type: string; filename: string; size: number }>
  note?: string
}

/**
 * Store each `.kicad_sch` sheet as a preview artifact and return the
 * structured result. Artifact creation is BEST-EFFORT and non-fatal: on any
 * failure the raw content is preserved inline so the result card can still
 * render it.
 */
async function materializeSchematicArtifacts(env: SchematicGenEnv, schFiles: SchematicSheet[]): Promise<MaterializedSchematic> {
  const outFiles: Array<{ filename: string; content?: string }> = schFiles.map((f) => ({ filename: f.filename }))
  const artifacts: Array<{ id: string; type: string; filename: string; size: number }> = []
  let anyFailed = false
  let errorNote = ''

  for (let i = 0; i < schFiles.length; i++) {
    const file = schFiles[i]!
    try {
      const created = await createPreviewArtifact(env, 'schematic', file.filename, file.content)
      artifacts.push({ id: created.id, type: created.type, filename: created.filename, size: created.size })
    } catch (storeErr) {
      anyFailed = true
      outFiles[i]!.content = file.content // data-loss guard
      const msg = String((storeErr as Error)?.message || storeErr)
      errorNote += (errorNote ? '; ' : '') + file.filename + ': ' + msg
    }
  }

  const result: MaterializedSchematic = { schFiles: outFiles }
  if (artifacts.length > 0) result.schArtifacts = artifacts
  if (anyFailed) {
    result.note = 'Preview artifact storage partially or fully unavailable (' + errorNote + '). ' +
      'Sheets without an artifact id still carry their source inline, so the result card can ' +
      'render them directly. Full source is always in the project zip/export.'
  }
  return result
}

// ── Tool bodies ──────────────────────────────────────────────────────────────

/**
 * Structured `needs_auth` result returned when the eda.cn login is missing —
 * the signal that makes login a human-in-the-loop step. The web client
 * (dsh-auth client half) renders a login card with an embedded auth.eda.cn
 * iframe for this result; the model asks the user to complete the login and
 * then retries the tool. Throwing here would hide that HIT surface.
 */
export function needsAuth(kind: 'schematic' | 'system'): Record<string, unknown> {
  return {
    status: 'needs_auth',
    kind,
    hint:
      'This tool requires a Huaqiu EDA (eda.cn) login. The web client is showing ' +
      'a login card with an embedded eda.cn login iframe — ask the user to complete ' +
      'the login there (or use the 华秋EDA login button in the sidebar), then call ' +
      'this tool again.',
  }
}

/**
 * `generate_schematic_from_description` body — stream `schemagen`, extract the
 * inline `.kicad_sch` files, then store each sheet as a preview artifact.
 */
export async function runGenerateSchematic(
  args: Record<string, unknown>,
  exec: { signal?: AbortSignal } | undefined,
  env: SchematicGenEnv,
): Promise<Record<string, unknown>> {
  const account = await resolveAccount(env.auth)
  if (!account) return needsAuth('schematic')
  const threadId = newRunId(env)
  const body = buildRunBody(
    agentIds.SCHEMATIC,
    typeof args.description === 'string' ? args.description : '',
    env.config,
    account,
    typeof args.user_language === 'string' ? args.user_language : undefined,
    threadId,
  )
  const { state, text } = await consumeCopilotkit(env.config.copilotkitUrl, body, buildHeaders(env.config, account, threadId), {
    signal: exec?.signal,
    timeoutMs: env.timeoutMs,
    fetchImpl: env.deps?.fetchImpl,
  })
  const extracted = extractSchematic(state)
  if (extracted.error) {
    throw new Error('schematic-gen: the schematic agent finished with an error: ' + extracted.error +
      (text ? ' — ' + text.slice(0, 300) : ''))
  }
  if (extracted.schFiles.length === 0) {
    throw new Error('schematic-gen: the schematic agent produced no .kicad_sch files.' +
      (text ? ' Assistant said: ' + text.slice(0, 300) : ''))
  }
  const materialized = await materializeSchematicArtifacts(env, extracted.schFiles)
  const result: Record<string, unknown> = {
    status: 'generated',
    kind: 'schematic',
    design_name: extracted.outProject || '',
    schFiles: materialized.schFiles,
    schArtifacts: materialized.schArtifacts,
    kicadPro: extracted.kicadPro,
    project_achieve_url: extracted.project_achieve_url,
  }
  if (materialized.note) result.note = materialized.note
  return result
}

/**
 * `generate_system_module_graph` body — stream `modular_circuit`, extract the
 * module graph, POST it to export-zip, return the KiCad project zip stored as
 * a `zip` preview artifact.
 */
export async function runGenerateSystem(
  args: Record<string, unknown>,
  exec: { signal?: AbortSignal } | undefined,
  env: SchematicGenEnv,
): Promise<Record<string, unknown>> {
  const account = await resolveAccount(env.auth)
  if (!account) return needsAuth('system')
  const threadId = newRunId(env)
  const body = buildRunBody(
    agentIds.SYSTEM,
    typeof args.description === 'string' ? args.description : '',
    env.config,
    account,
    typeof args.user_language === 'string' ? args.user_language : undefined,
    threadId,
  )
  const { state, text } = await consumeCopilotkit(env.config.copilotkitUrl, body, buildHeaders(env.config, account, threadId), {
    signal: exec?.signal,
    timeoutMs: env.timeoutMs,
    fetchImpl: env.deps?.fetchImpl,
  })
  const moduleGraph = extractModuleGraph(state)
  if (!moduleGraph) {
    const errState = typeof state.error === 'string' && state.error ? state.error : ''
    throw new Error('schematic-gen: the system design agent produced no module_graph.' +
      (errState ? ' Error: ' + errState : '') +
      (text ? ' Assistant said: ' + text.slice(0, 300) : ''))
  }

  const zipBuf = await exportModuleGraphZip(env.config.exportZipUrl, moduleGraph, env.config, account, {
    signal: exec?.signal,
    timeoutMs: env.timeoutMs,
    fetchImpl: env.deps?.fetchImpl,
  })

  const designName = typeof state.design_name === 'string' && state.design_name
    ? state.design_name
    : 'circuit'
  const connectionCount = typeof state.connection_count === 'number'
    ? state.connection_count
    : (Array.isArray(moduleGraph.connections) ? moduleGraph.connections.length : 0)
  const moduleNames = Array.isArray(moduleGraph.modules)
    ? (moduleGraph.modules as Array<Record<string, unknown>>)
      .map((m) => (m && typeof m.name === 'string' ? m.name : ''))
      .filter((n) => n.length > 0)
    : []

  const result: Record<string, unknown> = {
    status: 'generated',
    kind: 'system',
    design_name: designName,
    module_count: moduleNames.length,
    connection_count: connectionCount,
    module_names: moduleNames,
    zip_bytes: zipBuf.length,
  }
  const notes: string[] = []

  // Store the project zip as a `zip` preview artifact (primary). Keeping the
  // zip OUT of the JSON keeps the result small — inlining base64 used to
  // truncate the tool result and fail the card.
  let zipArtifact: { id: string; type: string; filename: string; size: number } | null = null
  try {
    const safeName = sanitizeZipBaseName(designName)
    const created = await createPreviewArtifact(env, 'zip', safeName + '.zip', zipBuf.toString('base64'), 'base64')
    zipArtifact = { id: created.id, type: created.type, filename: created.filename, size: created.size }
  } catch (storeErr) {
    notes.push('Could not store the project zip as an artifact (' +
      String((storeErr as Error)?.message || storeErr) + '); kept it in the result instead.')
  }

  if (zipArtifact) {
    result.zipArtifact = zipArtifact
  } else {
    // Fallback (artifact store unavailable): inline the zip when small,
    // otherwise write to a temp file and return the path.
    if (zipBuf.length <= MAX_INLINE_ZIP_BYTES) {
      result.zip = 'data:application/zip;base64,' + zipBuf.toString('base64')
    } else {
      const safeName = sanitizeZipBaseName(designName)
      const fileName = 'hq-eda-' + safeName + '-' + newRunId(env).slice(0, 8) + '.zip'
      const dir = (env.deps?.tmpDirImpl && env.deps.tmpDirImpl()) || tmpdir()
      const filePath = join(dir, fileName)
      try {
        await (env.deps?.writeFileImpl || writeFile)(filePath, zipBuf)
        result.zip_path = filePath
      } catch (err) {
        result.zip = 'data:application/zip;base64,' + zipBuf.toString('base64')
        notes.push('Could not write the zip to a temp file (' +
          String((err as Error)?.message || err) + '); returned inline instead.')
      }
    }
  }
  if (notes.length > 0) result.note = notes.join(' ')
  return result
}

/** Agent-awareness note about the eda.cn login gate, appended to both tool
 *  descriptions: a `needs_auth` result surfaces a login HIT (embedded eda.cn
 *  iframe card) — wait for the user to log in, then retry. Never invent
 *  credentials or fake success. */
const AUTH_GATE_NOTE =
  'AUTH: This tool requires a Huaqiu EDA (eda.cn) account. If the result has ' +
  'status "needs_auth", the web client is showing a login card with an embedded ' +
  'eda.cn login iframe (the human-in-the-loop step). Ask the user to complete the ' +
  'login there or via the 华秋EDA login button in the sidebar (you may use ' +
  'ask_user_question with options "已登录，请重试" / "取消" to wait), then call this ' +
  'tool again. Never invent credentials and never claim success when the result ' +
  'is needs_auth.'

// ── Tool definitions ─────────────────────────────────────────────────────────

function createSchematicTool(env: SchematicGenEnv) {
  return defineTool({
    name: 'generate_schematic_from_description',
    description:
      'Generate a KiCad schematic (.kicad_sch files) from a natural-language ' +
      'description of a circuit or sub-circuit — e.g. "design a 5V LM7805 linear ' +
      'regulator power supply with input and output filter capacitors". Calls the ' +
      'online HQ-EDA schematic generation agent and returns ' +
      'schFiles (filename references), schArtifacts (preview artifact references ' +
      'with id/type/filename/size per sheet), kicadPro and project_achieve_url. ' +
      'Use this when the user asks to draw, generate or create a circuit ' +
      'schematic from a description (not from an image — for that use the ' +
      'symbol/footprint tools). ' +
      'IMPORTANT: The generated schematic renders automatically as a result card ' +
      'in the web client — an interactive canvas preview per sheet (multi-sheet ' +
      'results get a sheet tab bar) and a download button for the current sheet. ' +
      'Do NOT paste the schematic source, file URLs, or any fenced code block ' +
      'into your reply; just note in one line that the schematic was generated ' +
      'and how many sheets it has. ' + AUTH_GATE_NOTE,
    parameters: {
      description: {
        type: 'string',
        required: true,
        description: 'The circuit design prompt, in natural language. Be specific about components, voltages and any required behaviour.',
      },
      user_language: {
        type: 'string',
        description: 'Optional UI/language hint for the agent (e.g. "简体中文" or "English"). Defaults to 简体中文.',
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args, exec) {
      return asJson(await runGenerateSchematic(args, exec, env))
    },
    timeoutMs: TOOL_TIMEOUT_MS.generate_schematic_from_description,
  })
}

function createSystemTool(env: SchematicGenEnv) {
  return defineTool({
    name: 'generate_system_module_graph',
    description:
      'Generate a hardware system design (module graph) from a natural-language ' +
      'description — e.g. "design a small smart alarm clock". Calls the online ' +
      'HQ-EDA system-design agent, which plans the modules, searches/selects ' +
      'parts, wires the connections, and produces a module graph; the graph is ' +
      'then exported to a KiCad project zip. Returns: a zipArtifact reference ' +
      '(preview-artifact id of the full project zip — the zip is never inlined ' +
      'into the conversation) and a summary (design name, module count, ' +
      'connection count, module names). Use this when the user wants a whole ' +
      'system/module-level design, not a single schematic or symbol. ' +
      'IMPORTANT: The generated system design renders automatically as a result ' +
      'card in the web client — a canvas preview of the project root schematic ' +
      '(fetched from the zip artifact) and a Download button for the full ' +
      'project zip. Do NOT paste the schematic source, file URLs, or any fenced ' +
      'code block into your reply; just note in one line that the design was ' +
      'generated, its module count, and that the project zip is downloadable ' +
      'from the card. ' + AUTH_GATE_NOTE,
    parameters: {
      description: {
        type: 'string',
        required: true,
        description: 'The system design prompt, in natural language. Describe the product or function you want, e.g. "an ESP32-C3 based smart fan".',
      },
      user_language: {
        type: 'string',
        description: 'Optional UI/language hint for the agent (e.g. "简体中文" or "English"). Defaults to 简体中文.',
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args, exec) {
      return asJson(await runGenerateSystem(args, exec, env))
    },
    timeoutMs: TOOL_TIMEOUT_MS.generate_system_module_graph,
  })
}

/** Build the two tool definitions against a runtime env. */
export function createSchematicGenTools(env: SchematicGenEnv) {
  return [
    createSchematicTool(env),
    createSystemTool(env),
  ]
}
