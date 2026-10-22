/**
 * Release-manifest validation for the Huaqiu DSH plugin monorepo.
 *
 * Pure, dependency-free functions shared by the pre-publish gate
 * (`scripts/check-publish.mjs`) and its tests. The manifest is the
 * machine-readable source of truth for HQ Edge's remote plugin discovery
 * (hq-edge docs/tasks/dsh-plugin-discovery-and-update-with-hq-edge-update-reporting.md
 * §4.1), so it must never drift from the actual publishable set, the lockstep
 * version, or the plugin patch contracts.
 */

/**
 * Lightweight SemVer range validator for the centralized release manifest.
 *
 * The repo deliberately has no runtime dependency on `semver`, and the
 * pre-publish gate must stay runnable with plain Node. Supported forms:
 *
 *   - exact:               "0.5.21"
 *   - caret / tilde:       "^0.5.21" / "~0.5.21"
 *   - comparator chains:   ">=0.2.0", ">=0.2.0 <0.4.0", ">=0.2.0 <0.4.0 || ^1.0.0"
 *   - wildcard / any:      "*", ">=0"
 *
 * A version component is `\d+` (optionally pre-release/build suffix).
 */
const SEMVER_PART = String.raw`\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`
const COMPARATOR = String.raw`(?:\^|~|>=|<=|>|<|=)?\s*(${SEMVER_PART}|x|X|\*)`
const RANGE_UNIT = new RegExp(String.raw`^${COMPARATOR}(?:\s+${COMPARATOR})*$`)
const ANY_RANGE = /^(x|X|\*|\s*)$/

/** True when `range` is a syntactically valid SemVer range. */
export function isValidSemverRange(range) {
  if (typeof range !== 'string' || range.length === 0) return false
  if (ANY_RANGE.test(range)) return true
  return range.split('||').every((alternative) => {
    const trimmed = alternative.trim()
    if (trimmed.length === 0) return false
    return RANGE_UNIT.test(trimmed)
  })
}

/** Valid host enum values for a plugin entry's `hosts` field. */
export const RELEASE_HOSTS = new Set(['hq-eda', 'kicad', 'generic', 'all'])

const SEMVER_LIKE = /^\d+\.\d+\.\d+/

/**
 * Validate a parsed release manifest against the real workspace.
 *
 * @param {object} manifest parsed `plugins-release-manifest.json`
 * @param {object} ctx
 * @param {{name:string, version:string}[]} ctx.dshPlugins real DSH plugins
 *        (packages declaring a `dsh` config)
 * @param {(pkg: any) => string[]} ctx.pluginEntryInjects inject-list reader
 *        (returns service names injected by the package's cordis.patch.yml)
 * @returns {string[]} human-readable failure messages (empty = valid)
 */
export function validateReleaseManifest(manifest, ctx) {
  const failures = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['plugins-release-manifest.json: not an object']
  }
  if (manifest.schemaVersion !== 1) {
    failures.push(`plugins-release-manifest.json: schemaVersion must be 1 (got ${JSON.stringify(manifest.schemaVersion)})`)
  }

  const setVersion = manifest.pluginSetVersion
  if (typeof setVersion !== 'string' || !SEMVER_LIKE.test(setVersion)) {
    failures.push(`plugins-release-manifest.json: pluginSetVersion must be a semver string (got ${JSON.stringify(setVersion)})`)
  }

  const pluginSet = ctx.dshPlugins ?? []
  const pluginNames = new Set(pluginSet.map((p) => p.name))
  const manifestNames = new Set(Object.keys(manifest.plugins ?? {}))

  const notInManifest = [...pluginNames].filter((n) => !manifestNames.has(n)).sort()
  if (notInManifest.length > 0) {
    failures.push(`plugins-release-manifest.json: real DSH plugins missing from manifest: ${notInManifest.join(', ')}`)
  }

  for (const name of manifestNames) {
    const entry = manifest.plugins?.[name]
    const pkg = pluginSet.find((p) => p.name === name)
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      failures.push(`plugins-release-manifest.json: ${name}: entry must be an object`)
      continue
    }
    if (pkg && entry.version !== pkg.version) {
      failures.push(`plugins-release-manifest.json: ${name}: version ${entry.version} does not match package version ${pkg.version}`)
    } else if (!pkg && typeof entry.version !== 'string') {
      failures.push(`plugins-release-manifest.json: ${name}: version must be a string`)
    }
    // if (setVersion && entry.version !== setVersion) {
    //   failures.push(`plugins-release-manifest.json: ${name}: version ${entry.version} must equal pluginSetVersion ${setVersion} while lockstep is in effect`)
    // }

    if (!Array.isArray(entry.hosts) || entry.hosts.length === 0) {
      failures.push(`plugins-release-manifest.json: ${name}: hosts must be a non-empty array`)
    } else {
      const badHost = entry.hosts.find((h) => !RELEASE_HOSTS.has(h))
      if (badHost) failures.push(`plugins-release-manifest.json: ${name}: invalid host ${JSON.stringify(badHost)} (expected one of ${[...RELEASE_HOSTS].join(', ')})`)
    }

    if (typeof entry.requiresHqEdge !== 'boolean') {
      failures.push(`plugins-release-manifest.json: ${name}: requiresHqEdge must be a boolean`)
    } else if (pkg) {
      const injectsHqEdge = ctx.pluginEntryInjects?.(pkg)?.includes('hqEdge') ?? false
      if (entry.requiresHqEdge !== injectsHqEdge) {
        failures.push(
          `plugins-release-manifest.json: ${name}: requiresHqEdge ${entry.requiresHqEdge} does not match cordis.patch.yml inject ${injectsHqEdge ? 'containing' : 'without'} hqEdge`,
        )
      }
    }

    for (const key of ['minHqEdge', 'maxHqEdge', 'minDsh']) {
      const value = entry[key]
      if (value === null || value === undefined) continue
      if (!isValidSemverRange(value)) {
        failures.push(`plugins-release-manifest.json: ${name}: ${key} is not a valid semver range (${JSON.stringify(value)})`)
      }
    }
  }

  return failures
}
