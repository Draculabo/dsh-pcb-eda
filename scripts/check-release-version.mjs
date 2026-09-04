#!/usr/bin/env node
/**
 * Release version validation for the Huaqiu DSH package set.
 *
 * Every publishable package under `packages/` must share the requested
 * version, and the Git tag (`vX.Y.Z`) must match it. The private root
 * package.json is a release marker too — mismatches are warned, not fatal, so
 * a stray root edit never blocks a release. The package set is discovered from
 * `packages/*`, so new packages are checked automatically.
 *
 * Usage:
 *   node scripts/check-release-version.mjs <version> [--tag vX.Y.Z]
 *
 * Exit 0 on success, 1 on any publishable mismatch.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { publishablePackages, repoRoot, rootManifestPath } from './lib/packages.mjs'

const argv = process.argv.slice(2)
const requested = argv.find((a) => !a.startsWith('-'))
const tagIndex = argv.indexOf('--tag')
const tagArg = argv.find((a) => a.startsWith('--tag='))?.split('=')[1]
  ?? (tagIndex >= 0 ? argv[tagIndex + 1] : undefined)

if (!requested) {
  console.error('usage: node scripts/check-release-version.mjs <version> [--tag vX.Y.Z]')
  process.exit(1)
}
if (!/^\d+\.\d+\.\d+/.test(requested)) {
  console.error(`FATAL: invalid version "${requested}" (expected X.Y.Z)`)
  process.exit(1)
}

const pkgs = publishablePackages()
if (pkgs.length === 0) {
  console.error('FATAL: no publishable packages discovered under packages/')
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
for (const pkg of pkgs) {
  if (pkg.version !== requested) {
    console.error(`FATAL: ${pkg.name} is v${pkg.version}, expected v${requested}`)
    failures += 1
  } else {
    console.log(`check-release-version: ok ${pkg.name}@${pkg.version}`)
  }
}

// Root (private) marker — warn only.
const rootManifest = JSON.parse(readFileSync(rootManifestPath(), 'utf8'))
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
