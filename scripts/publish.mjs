#!/usr/bin/env node
/**
 * Publish the Huaqiu DSH plugin set to npm.
 *
 * Follows the community release patterns (dsh-openpencil `publish-release.mjs`
 * + DSH-better-sidebar `release.yml`): validate the shared version, run the
 * full gate, then publish each package in dependency order with idempotency —
 * a version already on npm is skipped, never re-published.
 *
 * Publish order (leaf deps first):
 *   dsh-auth → dsh-artifacts → dsh-tool-part-search
 *            → dsh-tool-symbol-footprint → dsh-tool-schematic-gen
 *
 * Usage:
 *   node scripts/publish.mjs [--dry-run] [--provenance] [--tag vX.Y.Z]
 *
 *   --dry-run     build + pack + check only; never touches npm
 *   --provenance  pnpm publish --provenance (npm Trusted Publishing / OIDC)
 *   --tag vX.Y.Z  require every package version to equal X.Y.Z
 *
 * Auth: npmjs OIDC (set registry-url + id-token in CI) or NODE_AUTH_TOKEN.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const provenance = argv.includes('--provenance')
const tagIndex = argv.indexOf('--tag')
const inlineTagArg = argv.find((a) => a.startsWith('--tag='))
const tagArg = inlineTagArg?.slice('--tag='.length)
  ?? (tagIndex >= 0 ? argv[tagIndex + 1] : undefined)
if ((inlineTagArg !== undefined || tagIndex >= 0) && (!tagArg || tagArg.startsWith('-'))) {
  console.error('FATAL: --tag requires a value such as v1.2.3')
  process.exit(1)
}

const PACKAGES = [
  'dsh-auth',
  'dsh-artifacts',
  'dsh-tool-part-search',
  'dsh-tool-symbol-footprint',
  'dsh-tool-schematic-gen',
]

const run = (cmd, args, opts = {}) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  execFileSync(cmd, args, { stdio: 'inherit', cwd: opts.cwd ?? root, ...opts })
}

// ── 1. Version validation ────────────────────────────────────────────────────
const versions = new Set()
const manifests = {}
for (const pkg of PACKAGES) {
  const p = join(root, 'packages', pkg, 'package.json')
  const m = JSON.parse(readFileSync(p, 'utf8'))
  manifests[pkg] = m
  versions.add(m.version)
}
if (versions.size !== 1) {
  console.error('FATAL: package versions out of sync:', [...versions].join(', '))
  process.exit(1)
}
const version = [...versions][0]
if (tagArg) {
  run('node', ['scripts/check-release-version.mjs', version, '--tag', tagArg])
} else {
  run('node', ['scripts/check-release-version.mjs', version])
}
console.log(`\nPublishing @huaqiu/*@${version} (${dryRun ? 'DRY-RUN' : 'LIVE'})`)

// ── 2. Gate: build + integrity ───────────────────────────────────────────────
run('pnpm', ['-r', 'build'])
run('node', ['scripts/check-publish.mjs'])

// ── 3. Publish (dependency order, idempotent) ────────────────────────────────
for (const pkg of PACKAGES) {
  const manifest = manifests[pkg]
  const dir = join(root, 'packages', pkg)

  // Skip if this exact version is already on the registry (idempotent).
  if (!dryRun) {
    try {
      const existing = execFileSync('npm', ['view', `${manifest.name}@${version}`, 'version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      if (existing.length > 0) {
        console.log(`\nskip ${manifest.name}@${version} — already published`)
        continue
      }
    } catch {
      /* not found → publish */
    }
  }

  run('pnpm', ['--dir', dir, 'pack', '--pack-destination', join(root, 'dist')])
  if (dryRun) {
    console.log(`\n[dry-run] would publish ${manifest.name}@${version}`)
    continue
  }

  const args = ['--dir', dir, 'publish', '--no-git-checks', '--access', 'public']
  if (provenance) args.push('--provenance')
  const registry = process.env.npm_config_registry || process.env.NPM_CONFIG_REGISTRY
  if (registry) args.push('--registry', registry)
  run('pnpm', args)
  console.log(`✓ published ${manifest.name}@${version}`)
}

console.log(`\nDone. @huaqiu/*@${version} ${dryRun ? 'validated (nothing published)' : 'published'}.`)
