#!/usr/bin/env node
/**
 * Workspace-wide version bump for the Huaqiu DSH plugin set.
 *
 * The five `@huaqiu/dsh-*` packages are released as one unit (auth/artifacts
 * are peer-dependencies of the tool packages, so their versions must move
 * together). This script keeps every package.json — plus the private root
 * package.json as a release marker — on the same version, and rewrites the
 * in-workspace `@huaqiu/*` peer references (which are hardcoded like `^0.0.0`
 * and would otherwise be broken at publish time) to `^<newVersion>`.
 *
 * Usage:
 *   node scripts/bump.mjs [major|minor|patch] [--apply]   # semver bump
 *   node scripts/bump.mjs 0.3.1 [--apply]                # explicit version
 *
 * Dry-run by default: prints every planned change without writing. Pass
 * `--apply` to write the files, refresh the lockfile, and print the git
 * commands for tagging the release.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES = [
  'dsh-auth',
  'dsh-artifacts',
  'dsh-tool-part-search',
  'dsh-tool-symbol-footprint',
  'dsh-tool-schematic-gen',
]
const MANIFESTS = [join(root, 'package.json'), ...PACKAGES.map((p) => join(root, 'packages', p, 'package.json'))]

/** Sibling @huaqiu packages that must be rewritten when the version moves. */
const SIBLING_NAMES = PACKAGES.map((p) => {
  const raw = JSON.parse(readFileSync(join(root, 'packages', p, 'package.json'), 'utf8'))
  return raw.name
})

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const writeJson = (p, data) => writeFileSync(p, JSON.stringify(data, null, 2) + '\n')

function semverBump(current, kind) {
  const parts = String(current).split('.').map((n) => parseInt(n, 10) || 0)
  if (kind === 'major') { parts[0] += 1; parts[1] = 0; parts[2] = 0 }
  else if (kind === 'minor') { parts[1] += 1; parts[2] = 0 }
  else if (kind === 'patch') { parts[2] += 1 }
  else throw new Error(`unknown bump kind: ${kind} (expected major|minor|patch)`)
  return parts.join('.')
}

function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const positional = argv.filter((a) => !a.startsWith('-'))
  if (positional.length !== 1) {
    console.error('usage: node scripts/bump.mjs [major|minor|patch|<version>] [--apply]')
    process.exit(1)
  }
  const target = positional[0]

  // Current versions — normally all manifests agree.
  const manifests = MANIFESTS.map((p) => ({ path: p, data: readJson(p) }))
  const versions = new Set(manifests.map((m) => m.data.version).filter(Boolean))
  const explicit = /^\d+\.\d+\.\d+$/.test(target)
  let current
  if (versions.size === 1) {
    current = [...versions][0]
  } else if (explicit) {
    // Out-of-sync workspace (e.g. part-search already published at 0.1.0
    // while the others are at 0.0.0): an explicit version force-resyncs all.
    current = `out-of-sync (${[...versions].join(', ')})`
    console.warn(`warn: workspace versions out of sync (${[...versions].join(', ')}) — resyncing all to ${target}`)
  } else {
    console.error(`FATAL: workspace versions are out of sync (${[...versions].join(', ')}).`)
    console.error('Pass an explicit version to force-resync, e.g.  node scripts/bump.mjs 0.1.0 --apply')
    process.exit(1)
  }
  const next = explicit ? target : semverBump(current, target)
  console.log(`bump: ${current} → ${next}${apply ? '' : '  (dry-run; add --apply to write)'}\n`)

  const plan = []
  for (const { path, data } of manifests) {
    const rel = path.slice(root.length + 1)
    const changes = { version: [data.version, next] }
    // Rewrite in-workspace @huaqiu/* references in dep maps (keep workspace:).
    for (const depKey of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const map = data[depKey]
      if (!map || typeof map !== 'object') continue
      for (const name of Object.keys(map)) {
        if (!SIBLING_NAMES.includes(name)) continue
        if (map[name] === 'workspace:*') continue
        const oldRange = map[name]
        if (oldRange !== `^${next}`) changes[`${depKey}.${name}`] = [oldRange, `^${next}`]
      }
    }
    if (Object.keys(changes).length > 0) plan.push({ rel, changes })
  }

  for (const { rel, changes } of plan) {
    console.log(`  ${rel}`)
    for (const [key, [oldV, newV]] of Object.entries(changes)) {
      console.log(`    ${key}: ${oldV} → ${newV}`)
    }
  }

  if (!apply) {
    console.log('\nNo files were written.')
    return
  }

  for (const { path, data } of manifests) {
    if (data.version) data.version = next
    for (const depKey of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const map = data[depKey]
      if (!map || typeof map !== 'object') continue
      for (const name of Object.keys(map)) {
        if (!SIBLING_NAMES.includes(name) || map[name] === 'workspace:*') continue
        map[name] = `^${next}`
      }
    }
    writeJson(path, data)
  }

  // Refresh pnpm-lock.yaml so `--frozen-lockfile` CI stays green.
  console.log('\nrefreshing lockfile (pnpm install --no-frozen-lockfile)…')
  execFileSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: root, stdio: 'inherit' })

  console.log(`\nNext steps (tag MUST match package.json version):`)
  console.log(`  git add -A`)
  console.log(`  git commit -m "chore: release v${next}"`)
  console.log(`  git tag v${next}`)
  console.log(`  git push origin main --tags`)
  console.log(`\nThe push of tag v${next} triggers .github/workflows/release.yml.`)
}

main()
