import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/client/index.ts'],
  format: ['esm'],
  dts: true,
  deps: { neverBundle: [/^react$/, /^react\//, /^@deepseek-ai\//] },
  // @huaqiu/dsh-auth + @huaqiu/dsh-artifacts are separate plugins resolved via
  // DSH installation (peer); @huaqiu/ecad-renderer is bundled in Phase 3.
  outDir: 'lib',
})
