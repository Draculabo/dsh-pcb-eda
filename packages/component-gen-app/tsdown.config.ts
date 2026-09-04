import { defineConfig } from 'tsdown'

export default defineConfig({
  // Portable library build: ESM + d.ts, React kept external so the DSH web
  // shell and the standalone bundle both supply it at runtime.
  entry: ['./src/index.ts'],
  format: ['esm'],
  dts: true,
  platform: 'browser',
  deps: { neverBundle: [/^react$/, /^react\//] },
  outDir: 'lib',
})
