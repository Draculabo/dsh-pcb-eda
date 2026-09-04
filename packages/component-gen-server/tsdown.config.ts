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
    // the backend and serves the app bundle. Imported only on demand.
    entry: { standalone: './src/standalone.ts' },
    format: ['esm'],
    dts: true,
    clean: false,
    deps: { neverBundle: [/^@deepseek-ai\//] },
    outDir: 'lib',
  },
])
