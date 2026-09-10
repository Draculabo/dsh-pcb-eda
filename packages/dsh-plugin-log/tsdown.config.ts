import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    // Node half: the shared file logger every plugin's node half imports.
    entry: ['./src/index.ts'],
    format: ['esm'],
    dts: true,
    outDir: 'lib',
    deps: { neverBundle: [/^@deepseek-ai\//] },
  },
  {
    // Browser half: same `PluginLogger` surface, console-backed. Bundled into
    // whichever client half imports it.
    entry: { client: './src/client.ts' },
    format: ['esm'],
    dts: true,
    outDir: 'lib',
    platform: 'browser',
    clean: false,
  },
])
