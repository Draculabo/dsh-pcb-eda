#!/usr/bin/env node
/**
 * Pre-publish integrity gate for the Huaqiu DSH plugin set (workspace-wide).
 *
 * Adapted from the community pattern (dsh-git-worktree `check-publish.mjs`):
 * validates — for every publishable package — that the built entry + client
 * bundle exist, that the Host mount patch is declared and actually shipped in
 * `files`, that exports resolve, and that no `@hqedge/*` reference survives
 * anywhere. `--require-clean` additionally demands a clean git tree (used by
 * release CI so the tarball is built from exactly what was reviewed).
 *
 * Usage:
 *   node scripts/check-publish.mjs [--require-clean]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireClean = process.argv.includes('--require-clean')

const PACKAGES = [
  'dsh-auth',
  'dsh-artifacts',
  'dsh-tool-part-search',
  'dsh-tool-symbol-footprint',
  'dsh-tool-schematic-gen',
]

let failures = 0
const fail = (msg) => { console.error(`check-publish: FAIL: ${msg}`); failures += 1 }
const ok = (msg) => console.log(`check-publish: ok: ${msg}`)

function includedByFiles(manifest, target) {
  const normalized = String(target).replace(/^\.\//, '').replaceAll('\\', '/')
  if (normalized === 'package.json') return true
  return (manifest.files ?? []).some((entry) => {
    const e = String(entry).replace(/^\.\//, '').replaceAll('\\', '/').replace(/\/$/, '')
    return normalized === e || normalized.startsWith(`${e}/`)
  })
}

function findLegacyReferences(dir) {
  const matches = []
  const pending = [dir]

  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) {
      continue
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') {
          pending.push(path)
        }
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      if (readFileSync(path).includes('@hqedge/')) {
        matches.push(relative(dir, path).replaceAll('\\', '/'))
      }
    }
  }

  return matches
}

// 1. Clean-tree guard (release lane only).
if (requireClean) {
  try {
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
    if (status.length > 0) fail(`git tree is not clean — release must be built from a tagged, committed state:\n${status}`)
    else ok('git tree is clean')
  } catch (e) {
    fail(`could not read git status: ${String(e?.message || e)}`)
  }
}

// 2. Per-package integrity.
for (const pkg of PACKAGES) {
  const dir = join(root, 'packages', pkg)
  const pj = join(dir, 'package.json')
  if (!existsSync(pj)) { fail(`${pkg}/package.json missing`); continue }
  const manifest = JSON.parse(readFileSync(pj, 'utf8'))

  for (const path of findLegacyReferences(dir)) {
    fail(`${pkg}: legacy @hqedge reference found in ${path}`)
  }

  if (typeof manifest.name !== 'string' || manifest.name !== `@huaqiu/${pkg}`) {
    fail(`${pkg}: name must be "@huaqiu/${pkg}"`)
  }
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    fail(`${pkg}: invalid version ${manifest.version}`)
  }

  // Host mount patch — declared and shipped.
  const patchRel = manifest.dsh?.bundle?.patch
  if (typeof patchRel !== 'string' || patchRel.length === 0) {
    fail(`${pkg}: dsh.bundle.patch is missing`)
  } else {
    if (!existsSync(join(dir, patchRel))) fail(`${pkg}: dsh.bundle.patch file missing (${patchRel})`)
    if (!includedByFiles(manifest, patchRel)) fail(`${pkg}: ${patchRel} is not covered by files[] (it must ship in the tarball)`)
  }

  // Built entry (node half).
  const mainRel = manifest.main || 'lib/index.mjs'
  if (!existsSync(join(dir, mainRel))) fail(`${pkg}: built entry missing (${mainRel}) — run pnpm -r build first`)
  const typesRel = manifest.types || 'lib/index.d.mts'
  if (!existsSync(join(dir, typesRel))) fail(`${pkg}: built types missing (${typesRel})`)

  // Client bundle (dual-face packages).
  if (manifest.dsh?.client && !existsSync(join(dir, 'lib/client.js'))) {
    fail(`${pkg}: dsh.client is declared but lib/client.js is missing`)
  }

  // Exports resolve to shipped files.
  if (manifest.exports && typeof manifest.exports === 'object') {
    const seen = new Set()
    const targets = []
    const collect = (o) => {
      for (const [cond, v] of Object.entries(o)) {
        if (typeof v === 'string') { targets.push([cond, v]); continue }
        if (v && typeof v === 'object') collect(v)
        else fail(`${pkg}: malformed exports.${cond}`)
      }
    }
    collect(manifest.exports)
    for (const [cond, target] of targets) {
      if (seen.has(target)) continue
      seen.add(target)
      if (target === 'package.json') continue
      if (!includedByFiles(manifest, target)) fail(`${pkg}: exports.${cond} → ${target} is not covered by files[]`)
      if (!existsSync(join(dir, target))) fail(`${pkg}: exports.${cond} → ${target} does not exist`)
    }
  }

  ok(`@huaqiu/${pkg} v${manifest.version} — entry/client/patch/exports/clean`)
}

if (failures > 0) {
  console.error(`\ncheck-publish: ${failures} failure(s)`)
  process.exit(1)
}
console.log('\ncheck-publish: all packages OK')
