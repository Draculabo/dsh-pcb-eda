import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'

export const name = '@huaqiu/dsh-tool-schematic-gen'
export const inject = ['tools'] as const

/**
 * Phase 0 skeleton. Probe tool only; the two generation tools
 * (generate_schematic / export_schematic_zip) land in Phase 2.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'huaqiu_phase0_probe',
    description: 'Phase 0 probe for the Huaqiu schematic-gen plugin: proves the package loads and a tool registers on stock DSH.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true },
          plugin: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute() {
      return { status: 'ok', plugin: 'schematic-gen' }
    },
  }))
}
