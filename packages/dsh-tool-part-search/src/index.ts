import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'

export const name = '@huaqiu/dsh-tool-part-search'
export const inject = ['tools'] as const

/**
 * Phase 0 skeleton. Registers a single probe tool so a stock DSH can prove the
 * full packaging path (patch row → load → `ctx.tools.register(defineTool(...))`).
 * The four real part-search tools land in Phase 1.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'huaqiu_phase0_probe',
    description: 'Phase 0 probe for the Huaqiu part-search plugin: proves the package loads and a tool registers on stock DSH.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true },
          phase: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute() {
      return { status: 'ok', phase: 0 }
    },
  }))
}
