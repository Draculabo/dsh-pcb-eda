import { defineConfig } from 'tsdown'

const CLIENT_ID = '@huaqiu/dsh-tool-dummy'

export default defineConfig([
  {
    // Node half: the probe route on `ctx.webServer` (no providers, no logic).
    entry: ['./src/index.ts'],
    format: ['esm'],
    dts: true,
    deps: { neverBundle: [/^@deepseek-ai\//] },
    outDir: 'lib',
  },
  {
    // Browser half: DSH client-module bundle (classic script, self-registering).
    name: `${CLIENT_ID}/client`,
    entry: { client: './src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: [/^@deepseek-ai\//],
      // @huaqiu/dsh-sidebar-entry is the shared family sidebar-entry helper —
      // a plain library module (never self-registers), so bundle it in.
      alwaysBundle: [/^@huaqiu\/dsh-sidebar-entry$/],
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
