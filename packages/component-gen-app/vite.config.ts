import { defineConfig } from 'vite'

// Standalone web build: a self-contained bundle (index.html → main.tsx) that
// the `@huaqiu/component-gen-server` standalone server serves alongside the
// `/api/v1/huaqiu/component-gen/*` routes. No DSH imports at all.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
