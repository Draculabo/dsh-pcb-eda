/**
 * Huaqiu EDA schematic & system-design generation DSH tool plugin (node half) —
 * `@huaqiu/dsh-tool-schematic-gen`.
 *
 * Exposes two agent-visible tools that drive the online HQ-EDA CopilotKit
 * agents (`schemagen`, `modular_circuit`) over SSE:
 *
 *   generate_schematic_from_description   description → KiCad schematic
 *   generate_system_module_graph          description → module graph → KiCad zip
 *
 * ── Architectural boundary (migration plan §1/§8/§9) ───────────────────────────
 * Self-contained DSH plugin: no `@hqedge/*` dependency, no HTTP proxy, and NO
 * demo credentials. The eda.cn account is the `huaqiuAuth` capability
 * (`getUserInfo()` → `x-user-id` / `x-user-token`); generated artifacts are
 * stored in the user-wide `huaqiuArtifacts` service (in-process). The zip
 * artifact is the single source of truth for system designs — never inlined.
 *
 * @module @huaqiu/dsh-tool-schematic-gen
 */
import type { Context } from '@deepseek-ai/cordis'
import type { HuaqiuAuthService } from '@huaqiu/dsh-auth'
import type { HuaqiuArtifacts } from '@huaqiu/dsh-artifacts'
import { createSchematicGenTools, type SchematicGenDeps } from './tools.js'
import { resolveConfig } from './config.js'
import { HTTP_TIMEOUT_MS } from './sse.js'

/** Plugin id — matches package.json. */
export const name = '@huaqiu/dsh-tool-schematic-gen'

/** Cordis services this half depends on. */
export const inject = ['tools', 'huaqiuAuth', 'huaqiuArtifacts'] as const

/** Console tag for filtering in logs. */
const LOG_TAG = '[dsh-schematic-gen]'

export interface SchematicGenPluginConfig {
  /** Endpoint overrides, env-backed. */
  copilotkitUrl?: string
  exportZipUrl?: string
}

/**
 * Host plugin body — register the two generation tools.
 *
 * @param ctx - real cordis context (node side).
 * @returns disposer — unregisters both tools on plugin dispose.
 */
export function apply(ctx: Context, config: SchematicGenPluginConfig = {}): () => void {
  if (!ctx.tools || typeof ctx.tools.register !== 'function') {
    throw new Error('@huaqiu/dsh-tool-schematic-gen requires the DSH `tools` service (ctx.tools.register).')
  }
  if (!ctx.huaqiuAuth || !ctx.huaqiuAuth.auth || typeof ctx.huaqiuAuth.auth.getUserInfo !== 'function') {
    throw new Error(
      '@huaqiu/dsh-tool-schematic-gen requires the `huaqiuAuth` service (provided by @huaqiu/dsh-auth) — ' +
      'the eda.cn account is never baked in.',
    )
  }
  if (!ctx.huaqiuArtifacts || typeof ctx.huaqiuArtifacts.create !== 'function') {
    throw new Error(
      '@huaqiu/dsh-tool-schematic-gen requires the `huaqiuArtifacts` service (provided by @huaqiu/dsh-artifacts).',
    )
  }

  const auth: HuaqiuAuthService = ctx.huaqiuAuth
  const artifacts: HuaqiuArtifacts = ctx.huaqiuArtifacts

  // Fail fast at load time on a misconfigured endpoint override.
  const configOverride: Record<string, string | undefined> = {}
  if (config.copilotkitUrl) configOverride.HQ_EDA_COPILOTKIT_URL = config.copilotkitUrl
  if (config.exportZipUrl) configOverride.HQ_EDA_EXPORT_ZIP_URL = config.exportZipUrl
  const finalConfig = resolveConfig({ ...(typeof process !== 'undefined' ? process.env : undefined), ...configOverride })

  const deps: SchematicGenDeps = {}
  const env = {
    config: finalConfig,
    auth: auth.auth,
    artifacts,
    timeoutMs: HTTP_TIMEOUT_MS,
    deps,
  }

  const disposers = createSchematicGenTools(env).map((tool) => ctx.tools.register(tool))

  // eslint-disable-next-line no-console
  console.log(LOG_TAG, 'registered agent tools', {
    tools: disposers.length,
    copilotkitUrl: finalConfig.copilotkitUrl,
    exportZipUrl: finalConfig.exportZipUrl,
    auth: 'huaqiuAuth',
  })

  return function dispose() {
    for (const disposeTool of disposers) {
      try {
        disposeTool()
      } catch {
        // One failing unregister must not hide the others.
      }
    }
  }
}

/** Exported for tests: the agent ids this plugin drives. */
export { agentIds } from './config.js'
