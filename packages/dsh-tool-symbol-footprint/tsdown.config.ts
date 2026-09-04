import { defineConfig } from 'tsdown'

const CLIENT_ID = '@huaqiu/dsh-tool-symbol-footprint'

export default defineConfig([
  {
    // Node half: ESM tool entry (tool definitions).
    entry: ['./src/index.ts'],
    format: ['esm'],
    dts: true,
    deps: { neverBundle: [/^@deepseek-ai\//] },
    outDir: 'lib',
  },
  {
    // Browser half: DSH client-module bundle (classic script, self-registering).
    // @huaqiu/dsh-auth + @huaqiu/dsh-artifacts are separate plugins resolved
    // via DSH installation (peer); @huaqiu/ecad-renderer is bundled in Phase 3.
    name: `${CLIENT_ID}/client`,
    entry: { client: './src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    // react stays external (platform seed word), @deepseek-ai stays external
    // (provided by the DSH platform). @huaqiu/component-gen-app is a peer
    // dependency, so tsdown would otherwise externalize it — but it is a plain
    // library (not a plugin) that never registers itself in the DSH client
    // module table, so it MUST be bundled into this client bundle or the
    // runtime fails with "missed the module table". Force-bundle it here.
    deps: {
      neverBundle: [/^react$/, /^react\//, /^@deepseek-ai\//],
      alwaysBundle: [/^@huaqiu\/component-gen-app$/],
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
