import { defineConfig } from 'vitest/config'

// Phase 0: single config, node environment default. Client tests annotate
// `// @vitest-environment jsdom` per file when they arrive (Phase 3).
// No `include` override: default globs discover `**/*.test.ts` everywhere
// (node_modules excluded by default), which works both from the workspace
// root and from each package directory.
export default defineConfig({
  test: {
    environment: 'node',
  },
})
