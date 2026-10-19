import { defineConfig } from 'tsdown'

// Browser half: DSH client-module bundle (classic script, self-registering via
// the in-source `window.__ModuleLoader__.load({id, factory})` call in
// src/client/index.ts — equivalent to the banner/footer pattern used by the
// other @huaqiu family plugins).
// @huaqiu/dsh-sidebar-entry is a plain family library module (never a DSH
// client plugin, never staged in the bundle's @huaqiu scope), so it MUST be
// bundled into this client bundle or the runtime fails on an undefined global.
export default defineConfig({
  entry: ['src/client/index.ts'],
  outDir: 'lib',
  format: 'iife',
  platform: 'browser',
  clean: false,
  deps: {
    alwaysBundle: [/^@huaqiu\/dsh-sidebar-entry$/],
  },
  outputOptions: { entryFileNames: 'client.js' },
})
