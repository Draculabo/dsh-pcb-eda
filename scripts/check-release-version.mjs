#!/usr/bin/env node
/**
 * Release version validation for the Huaqiu DSH plugin set.
 *
 * Every publishable `@huaqiu/dsh-*` package must share the requested version,
 * and the Git tag (`vX.Y.Z`) must match it. The private root package.json is a
 * release marker too — mismatches are warned, not fatal, so a stray root edit
 * never blocks a release.
 *
 * Usage:
 *   node scripts/check-release-version.mjs <version> [--tag vX.Y.Z]
 *
 * Exit 0 on success, 1 on any publishable mismatch.
 */
import { readFileSync } from 'node:fs'
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

const argv = process.argv.slice(2)
const requested = argv.find((a) => !a.startsWith('-'))
const tagIndex = argv.indexOf('--tag')
const tagArg = argv.find((a) => a.startsWith('--tag='))?.split('=')[1]
  ?? (tagIndex >= 0 ? argv[tagIndex + 1] : undefined)

if (!requested) {
  console.error('usage: node scripts/check-release-version.mjs <version> [--tag vX.Y.Z]')
  process.exit(1)
}
if (!/^\d+\.\d+\.\d+$/.test(requested)) {
  console.error(`FATAL: invalid version "${requested}" (expected X.Y.Z)`)
  process.exit(1)
}

let failures = 0

// Git tag match (when provided).
if (tagArg) {
  const expectedTag = `v${requested}`
  const actual = tagArg.replace(/^refs\/tags\//, '')
  if (actual !== expectedTag) {
    console.error(`FATAL: tag "${actual}" does not match version "${requested}" (expected ${expectedTag})`)
    process.exit(1)
  }
  console.log(`check-release-version: tag ${actual} matches version ${requested}`)
}

// Publishable packages must agree exactly.
for (const pkg of PACKAGES) {
  const p = join(root, 'packages', pkg, 'package.json')
  const manifest = JSON.parse(readFileSync(p, 'utf8'))
  if (manifest.version !== requested) {
    console.error(`FATAL: ${manifest.name} is v${manifest.version}, expected v${requested}`)
    failures += 1
  } else {
    console.log(`check-release-version: ok ${manifest.name}@${manifest.version}`)
  }
}

// Root (private) marker — warn only.
const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (rootManifest.version !== requested) {
  console.warn(`check-release-version: warn root package.json is v${rootManifest.version} (marker only, not published)`)
} else {
  console.log(`check-release-version: ok root marker v${rootManifest.version}`)
}

if (failures > 0) {
  console.error(`\ncheck-release-version: ${failures} failure(s)`)
  process.exit(1)
}
console.log('\ncheck-release-version: all packages OK')