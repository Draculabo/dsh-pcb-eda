import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm'],
  dts: true,
  // Phase 0: no client bundle yet. Externalization policy for @huaqiu/dsh-*
  // peers and bundled libraries is decided in Phase 3/4 (see spec §9).
  outDir: 'lib',
})
