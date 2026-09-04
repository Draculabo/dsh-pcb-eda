import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    // Main entry: routes/jobs/history/backend — no DSH-plugin imports (the
    // DSH plugin mounts these; the standalone subpath wires the backend).
    entry: ['./src/index.ts'],
    format: ['esm'],
    dts: true,
    deps: { neverBundle: [/^@deepseek-ai\//] },
    outDir: 'lib',
  },
  {
    // Standalone server: reuses the plugin's generation functions to build
    // the backend and serves the app bundle. The plugin is externalized
    // (peer dep) and this entry is dts-less, so this builds without the
    // plugin's lib — breaking the server↔plugin build cycle deterministically
    // (pnpm builds server first, then the plugin that depends on it).
    entry: { standalone: './src/standalone.ts' },
    format: ['esm'],
    dts: false,
    clean: false,
    deps: { neverBundle: [/^@deepseek-ai\//, /^@huaqiu\/dsh-tool-symbol-footprint$/] },
    outDir: 'lib',
  },
])
