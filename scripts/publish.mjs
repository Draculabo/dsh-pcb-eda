#!/usr/bin/env node
/**
 * Publish the Huaqiu DSH package set to npm.
 *
 * Follows the community release patterns (dsh-openpencil `publish-release.mjs`
 * + DSH-better-sidebar `release.yml`): validate the shared version, run the
 * full gate, then publish every package in dependency order with idempotency —
 * a version already on npm is skipped, never re-published.
 *
 * The package set is discovered from `packages/*` (every non-private package
 * is published, since the repo is public), and the publish order is computed
 * by a topological sort over in-workspace `dependencies` so leaf packages go
 * first. Peer/dev/optional dependencies do not constrain order.
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
import { join } from 'node:path'
import { publishablePackages, repoRoot } from './lib/packages.mjs'

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const provenance = argv.includes('--provenance')
const tagIndex = argv.indexOf('--tag')
const tagArg = argv.find((a) => a.startsWith('--tag='))?.split('=')[1]
  ?? (tagIndex >= 0 ? argv[tagIndex + 1] : undefined)

const run = (cmd, args, opts = {}) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  execFileSync(cmd, args, { stdio: 'inherit', cwd: opts.cwd ?? repoRoot, ...opts })
}

/**
 * Order the discovered packages so that `dependencies` (in-workspace siblings)
 * are published before their consumers. Leaves-first topological sort; falls
 * back to alphabetical order when a dependency cycle exists among
 * `dependencies` (should not happen — peer/dev cycles are ignored by design).
 */
function topoOrder(pkgs) {
  const byName = new Map(pkgs.map((p) => [p.name, p]))
  const names = new Set(byName.keys())
  const order = []
  const state = new Map() // name -> 'visiting' | 'done'
  const visit = (name, chain) => {
    const st = state.get(name)
    if (st === 'done') return
    if (st === 'visiting') throw new Error(`dependency cycle among publishable packages: ${[...chain, name].join(' → ')}`)
    state.set(name, 'visiting')
    const pkg = byName.get(name)
    if (pkg) {
      const deps = pkg.manifest.dependencies ?? {}
      for (const dep of Object.keys(deps)) {
        if (names.has(dep)) visit(dep, [...chain, name])
      }
    }
    state.set(name, 'done')
    order.push(name)
  }
  for (const name of names) {
    try {
      visit(name, [])
    } catch (err) {
      console.warn(`warn: ${err.message} — falling back to alphabetical order`)
      return pkgs.slice().sort((a, b) => a.name.localeCompare(b.name))
    }
  }
  return order.map((name) => byName.get(name))
}

// ── 1. Version validation ────────────────────────────────────────────────────
const pkgs = publishablePackages()
if (pkgs.length === 0) {
  console.error('FATAL: no publishable packages discovered under packages/')
  process.exit(1)
}
const versions = new Set(pkgs.map((p) => p.version))
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
console.log(`\nPublishing ${pkgs.map((p) => p.name).join(', ')} @${version} (${dryRun ? 'DRY-RUN' : 'LIVE'})`)

// ── 2. Gate: build + integrity ───────────────────────────────────────────────
run('pnpm', ['-r', 'build'])
run('node', ['scripts/check-publish.mjs'])

// ── 3. Publish (dependency order, idempotent) ────────────────────────────────
for (const pkg of topoOrder(pkgs)) {
  const manifest = pkg.manifest
  const dir = pkg.dir

  // Skip if this exact version is already on the registry (idempotent).
  if (!dryRun) {
    try {
      const existing = execFileSync('npm', ['view', `${pkg.name}@${version}`, 'version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      if (existing.length > 0) {
        console.log(`\nskip ${pkg.name}@${version} — already published`)
        continue
      }
    } catch {
      /* not found → publish */
    }
  }

  run('pnpm', ['--dir', dir, 'pack', '--pack-destination', join(repoRoot, 'dist')])
  if (dryRun) {
    console.log(`\n[dry-run] would publish ${pkg.name}@${version}`)
    continue
  }

  const args = ['--dir', dir, 'publish', '--no-git-checks', '--access', 'public']
  if (provenance) args.push('--provenance')
  const registry = process.env.npm_config_registry || process.env.NPM_CONFIG_REGISTRY
  if (registry) args.push('--registry', registry)
  run('pnpm', args)
  console.log(`✓ published ${pkg.name}@${version}`)
}

console.log(`\nDone. ${pkgs.length} package(s) @${version} ${dryRun ? 'validated (nothing published)' : 'published'}.`)
