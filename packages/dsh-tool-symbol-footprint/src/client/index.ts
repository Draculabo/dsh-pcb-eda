// Phase 0 client stub: proves the client bundle builds and exports the DSH
// client-module shape. The React HIT (GenHitCard + DimensionEditor + ECAD
// preview) lands in Phase 3 and will inject the real `slots` service.
// `inject` here must be REAL service names (the loader treats this array as
// cordis service dependencies), not package names.
export const inject: string[] = []

export function apply(): void {
  // Phase 3: ctx.slots.inject('tool.call.toolview', ...) keyed HITs.
}
