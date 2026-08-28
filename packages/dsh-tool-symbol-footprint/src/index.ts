/**
 * Huaqiu EDA symbol & footprint generation DSH tool plugin (node half) —
 * `@huaqiu/dsh-tool-symbol-footprint`.
 *
 * Exposes three agent-visible tools that drive the online 华秋/eda.cn
 * componentV2 chat backend over WebSocket:
 *
 *   generate_symbol_from_image          image → KiCad schematic symbol
 *   generate_footprint_from_image       image → dimensions → HUMAN → footprint
 *   generate_footprint_from_dimensions  confirmed dimensions → footprint
 *
 * ── Architectural boundary (migration plan §1/§8) ─────────────────────────────
 * Self-contained DSH plugin: no `@hqedge/*` dependency, no HTTP proxy. The
 * token comes from the `huaqiuAuth` service (capability: `getAccessToken()`);
 * generated artifacts are stored in the user-wide `huaqiuArtifacts` service
 * (in-process, not a loopback). The WebSocket transport is Node 22's global
 * `WebSocket`; the endpoint is a whitelist-checked constant (env-overridable).
 *
 * ── Human in the loop ────────────────────────────────────────────────────────
 * A footprint is generated ONLY from dimensions a human has seen. The dimension
 * confirmation UX is owned by the web client card (`needs_confirmation` result);
 * the direct-footprint accept/decline gate uses the `userQuestions` seam
 * opportunistically (`ctx.get`, not `inject`, so the tools still load when the
 * row is disabled).
 *
 * @module @huaqiu/dsh-tool-symbol-footprint
 */
import type { Context } from '@deepseek-ai/cordis'
import type { HuaqiuArtifacts } from '@huaqiu/dsh-artifacts'
import type { HuaqiuAuthService } from '@huaqiu/dsh-auth'
import { createSymbolFootprintTools } from './tools.js'
import type { UserQuestionsLike } from './dimensions.js'
import { resolveEndpoint, packageTypes } from './protocol.js'

/** Plugin id — matches package.json. */
export const name = '@huaqiu/dsh-tool-symbol-footprint'

/** Cordis services this half depends on. `userQuestions` is deliberately NOT
 *  injected — see the HIL note in the file header. */
export const inject = ['tools', 'huaqiuAuth', 'huaqiuArtifacts'] as const

/** Console tag for filtering in logs. */
const LOG_TAG = '[dsh-symbol-footprint]'

export interface SymbolFootprintConfig {
  /** Endpoint override, env-backed (`HQ_EDA_COMPONENT_WS_URL`); still
   *  whitelist-checked. */
  endpoint?: string
}

/**
 * Host plugin body — register the three generation tools.
 *
 * @param ctx - real cordis context (node side).
 * @returns disposer — unregisters all three tools on plugin dispose.
 */
export function apply(ctx: Context, config: SymbolFootprintConfig = {}): () => void {
  if (!ctx.tools || typeof ctx.tools.register !== 'function') {
    throw new Error('@huaqiu/dsh-tool-symbol-footprint requires the DSH `tools` service (ctx.tools.register).')
  }
  if (!ctx.huaqiuAuth || !ctx.huaqiuAuth.auth || typeof ctx.huaqiuAuth.auth.getAccessToken !== 'function') {
    throw new Error(
      '@huaqiu/dsh-tool-symbol-footprint requires the `huaqiuAuth` service (provided by @huaqiu/dsh-auth).',
    )
  }
  if (!ctx.huaqiuArtifacts || typeof ctx.huaqiuArtifacts.create !== 'function') {
    throw new Error(
      '@huaqiu/dsh-tool-symbol-footprint requires the `huaqiuArtifacts` service (provided by @huaqiu/dsh-artifacts).',
    )
  }

  const auth: HuaqiuAuthService = ctx.huaqiuAuth
  const artifacts: HuaqiuArtifacts = ctx.huaqiuArtifacts

  // Fail fast at load time on a misconfigured endpoint override.
  const endpoint = resolveEndpoint(config.endpoint ? { HQ_EDA_COMPONENT_WS_URL: config.endpoint } : undefined)

  const env = {
    auth: auth.auth,
    artifacts,
    deps: { processEnv: typeof process !== 'undefined' ? process.env : undefined },
    getUserQuestions: (): UserQuestionsLike | undefined => {
      try {
        return ctx.get('userQuestions') as UserQuestionsLike | undefined
      } catch {
        return undefined
      }
    },
  }

  const disposers = createSymbolFootprintTools(env).map((tool) => ctx.tools.register(tool))

  // eslint-disable-next-line no-console
  console.log(LOG_TAG, 'registered agent tools', {
    tools: disposers.length,
    endpoint,
    packageTypes: packageTypes.length,
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

/** Exported for tests: the supported package list. */
export { packageTypes }
/** Exported for tests: the wire command types this plugin speaks. */
export { commandTypes, agentActions } from './protocol.js'
