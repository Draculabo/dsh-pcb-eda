import { defineConfig } from 'tsdown'

const CLIENT_ID = '@huaqiu/dsh-tool-plugin-update'

export default defineConfig([
  {
    // Node half: forwards the hq-edge plugin-update API over the DSH
    // webServer prefix routes (thin adapter, no provider logic).
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
