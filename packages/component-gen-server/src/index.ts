/**
 * `@huaqiu/component-gen-server` — public API.
 *
 * The shared component-gen HTTP surface. The DSH plugin mounts
 * `createComponentGenRoutes(deps)` on its `webServer`; the standalone server
 * (./standalone) wires the same routes + dsh-auth + dsh-artifacts + app bundle
 * into one node:http server.
 */
export {
  createComponentGenHandler,
  type ComponentGenHandler,
  type ComponentGenHandlerDeps,
} from './routes.js'
export { JobStore, runGeneration, type JobMeta, type RunOutcome } from './jobs.js'
export { HistoryStore, parseDataUrl, newHistoryId, newImageId } from './history.js'
export type { ComponentGenBackend, GenerationExec } from './backend.js'
export {
  COMPONENT_GEN_ROUTE_PREFIX,
  MAX_IMAGE_BYTES,
  type ComponentGenConfig,
  type ComponentGenPage,
  type HistoryEntry,
  type HistoryPage,
  type HistoryPatch,
  type HistoryQuery,
  type JobEvent,
  type JobInput,
  type JobKind,
  type JobState,
  type StartJobRequest,
} from './types.js'
import { createComponentGenHandler, type ComponentGenHandlerDeps } from './routes.js'
import { COMPONENT_GEN_ROUTE_PREFIX } from './types.js'

export interface ComponentGenWebRoute {
  kind: 'prefix'
  path: string
  handler: ReturnType<typeof createComponentGenHandler>
}

/** Build the DSH `webServer.register(...)` route object. */
export function createComponentGenRoutes(deps: ComponentGenHandlerDeps): ComponentGenWebRoute {
  return {
    kind: 'prefix',
    path: COMPONENT_GEN_ROUTE_PREFIX,
    handler: createComponentGenHandler(deps),
  }
}
