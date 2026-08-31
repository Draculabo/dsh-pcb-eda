import type { Context } from '@deepseek-ai/cordis'
import { createPartSearch } from './service.js'
import { createPartSearchTools } from './tools.js'

export const name = '@huaqiu/dsh-tool-part-search'
export const inject = ['tools'] as const

const LOG_TAG = '[dsh-part-search]'

export function apply(ctx: Context): () => void {
  if (!ctx.tools || typeof ctx.tools.register !== 'function') {
    throw new Error('@huaqiu/dsh-tool-part-search requires the DSH `tools` service (ctx.tools.register).')
  }

  const service = createPartSearch()
  const disposers = createPartSearchTools(service).map((tool) => ctx.tools.register(tool))

  // eslint-disable-next-line no-console
  console.log(LOG_TAG, 'registered agent tools', { tools: disposers.length })

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
