// Phase 0 client stub: proves the client bundle builds and exports the DSH
// client-module shape. The React HIT (GenHitCard + DimensionEditor + ECAD
// preview) lands in Phase 3.
export const inject = ['@deepseek-ai/dsh-client-runtime']

export function apply(): void {
  // Phase 3: ctx.slots.inject('tool.call.toolview', ...) keyed HITs.
}
