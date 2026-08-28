// Phase 0 client stub: proves the client bundle builds and exports the DSH
// client-module shape. The React HIT (schematic card + zip download +
// ECAD preview via iframe) lands in Phase 3.
export const inject = ['@deepseek-ai/dsh-client-runtime']

export function apply(): void {
  // Phase 3: ctx.slots.inject('tool.call.toolview', ...) keyed HITs.
}
