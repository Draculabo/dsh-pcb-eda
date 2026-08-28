import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/client/index.ts'],
  format: ['esm'],
  dts: true,
  deps: { neverBundle: [/^react$/, /^react\//, /^@deepseek-ai\//] },
  outDir: 'lib',
})
