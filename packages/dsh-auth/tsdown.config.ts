import { defineConfig } from 'tsdown'

const CLIENT_ID = '@huaqiu/dsh-auth'

export default defineConfig([
  {
    // Node half: ESM plugin entry (webServer route provider + service).
    entry: ['./src/index.ts'],
    format: ['esm'],
    dts: true,
    deps: { neverBundle: [/^@deepseek-ai\//] },
    outDir: 'lib',
  },
  {
    // Browser half: DSH client-module bundle. Loaded as a CLASSIC script by
    // the web shell; must register itself via window.__ModuleLoader__.load.
    // Mirrors @deepseek-ai/dsh-client-*/tsdown.client.ts: cjs + browser,
    // entry pinned to lib/client.js, exports live on module.exports.
    name: `${CLIENT_ID}/client`,
    entry: { client: './src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: { neverBundle: [/^@deepseek-ai\//, 'react', 'react-dom', /^react\//] },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
