#!/usr/bin/env node
/**
 * Link every local DSH plugin into the INSTALLED KiCad HQ Edge runtime.
 *
 * This is the ONLY supported dev loop. It replaced the old
 * `update-bundled-plugins:kicad` script, which called
 * `dsh plugin --profile web add <dir>` and thereby broke DSH startup (see
 * "Why not `dsh plugin add`" below).
 *
 * What it does:
 *   1. Builds all workspace packages — plugins ship compiled `lib/` output and
 *      the runtime loads that, not the TypeScript source.
 *   2. Locates the installed KiCad `dsh` shim and asks it for `installRoot`
 *      (`dsh --hq-paths`), with HQ_TARGET_HOST=kicad so the handshake matches
 *      the launcher's.
 *   3. Runs the runtime's OWN `bin/hq-edge-plugins link --packages <this>/packages`,
 *      which junctions each plugin into the user-owned plugin root
 *      (`<HQ Edge home>/dev-plugins`). That root is writable without elevation
 *      — unlike the install tree under `C:\Program Files`.
 *
 * Why not `dsh plugin add`:
 *   `dsh plugin add` writes the package into `dsh.profile.bundles`. dsh-app-boot
 *   then requires every profile bundle's declared `dsh.bundle.patch`
 *   (`cordis.patch.yml`) to exist at
 *   `<dsh-home>/profiles/web/node_modules/<name>/`. HQ Edge re-points that path
 *   at its own materialized bundle on every boot, and that bundle ships only
 *   `package.json` + `lib/` + `skills/`, so the file is missing and DSH exits 1:
 *
 *     dsh: failed to read overlay …\@huaqiu\dsh-analytics\cordis.patch.yml: ENOENT
 *
 *   Built-in plugins are mounted by HQ Edge's generated `--patch` overlay. The
 *   link tool also repairs a profile that already lists them.
 *
 * Usage:
 *   pnpm link-plugins:kicad
 *
 * Prerequisites: KiCad Huaqiu (with the bundled edge-headless runtime) is
 * installed. Do NOT set DSH_HOME in the shell — this script strips it and
 * targets the kicad host home explicitly via HQ_TARGET_HOST.
 */

'use strict'

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoRoot } from './utils/packages.mjs'

/** Child environment: kicad host, no inherited DSH_HOME override. */
function childEnv() {
  const env = { ...process.env, HQ_TARGET_HOST: 'kicad' }
  delete env.DSH_HOME
  return env
}

function run(cmd, args = []) {
  const quotedCmd = /\s/.test(cmd) ? `"${cmd}"` : cmd
  const quoted = args.map((a) => (/\s/.test(a) ? `"${a}"` : a))
  console.log(`> ${quotedCmd} ${quoted.join(' ')}`)
  execSync(`${quotedCmd} ${quoted.join(' ')}`, {
    stdio: 'inherit',
    shell: true, // needed for .cmd shims on Windows
    env: childEnv(),
  })
}

/**
 * Locate the installed KiCad `dsh` shim and return its resolved `installRoot`.
 *
 * Honour HQ_KICAD_DSH_CMD for one-off overrides; fall back to `dsh` on PATH.
 */
function resolveInstallRoot() {
  const candidates = []
  if (process.env.HQ_KICAD_DSH_CMD) candidates.push(process.env.HQ_KICAD_DSH_CMD)
  if (process.platform === 'win32') {
    for (const root of [process.env['ProgramW6432'], process.env['CommonProgramW6432']]) {
      if (root) candidates.push(path.join(root, 'Common Files', 'KiCad', 'bin', 'dsh.cmd'))
      if (root) candidates.push(path.join(root, 'KiCad', 'bin', 'dsh.cmd'))
    }
  }
  let dshCmd = candidates.find((c) => existsSync(c))
  if (!dshCmd) {
    try {
      const which = process.platform === 'win32' ? 'where dsh' : 'which dsh'
      dshCmd = execSync(which, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0)
    } catch {
      /* not on PATH either */
    }
  }
  if (!dshCmd) {
    throw new Error(
      'Installed KiCad `dsh` shim not found.\n' +
        '  Expected C:\\Program Files\\Common Files\\KiCad\\bin\\dsh.cmd (or `dsh` on PATH).\n' +
        '  Install KiCad Huaqiu, or set HQ_KICAD_DSH_CMD to the shim explicitly.',
    )
  }

  const stdout = execSync(`"${dshCmd}" --hq-paths`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    env: childEnv(),
  })
  const res = JSON.parse(stdout)
  if (!res.installRoot) {
    throw new Error(`"${dshCmd}" --hq-paths returned no installRoot — runtime too old?`)
  }
  return { dshCmd, installRoot: res.installRoot, dshHome: res.dshHome }
}

/**
 * The runtime's own link tool. `bin/hq-edge-plugins.cmd` on Windows,
 * `bin/hq-edge-plugins` elsewhere.
 */
function pluginsCliPath(installRoot) {
  const exe = process.platform === 'win32' ? 'hq-edge-plugins.cmd' : 'hq-edge-plugins'
  const full = path.join(installRoot, 'bin', exe)
  if (!existsSync(full)) {
    throw new Error(
      `This runtime has no ${exe} at ${full}.\n` +
        '  It ships with HQ Edge ≥ the release that added the user-owned plugin root.\n' +
        '  Upgrade KiCad Huaqiu, or use hq-edge: cd <hq-edge> && pnpm dsh:plugins:link',
    )
  }
  return full
}

function main() {
  const argv = process.argv.slice(2)
  const command = argv.includes('--unlink') ? 'unlink' : argv.includes('--status') ? 'status' : 'link'

  const { installRoot, dshHome } = resolveInstallRoot()
  console.log(`== Installed runtime: ${installRoot} ==`)
  console.log(`   kicad DSH home: ${dshHome}\n`)

  const cli = pluginsCliPath(installRoot)

  if (command === 'status') {
    run(cli, ['status', '--runtime', installRoot])
    return
  }

  if (command === 'unlink') {
    console.log('== Removing local plugin links ==')
    run(cli, ['unlink', '--runtime', installRoot])
    console.log('\nDone. Restart DSH to return to the released plugin set.')
    return
  }

  console.log('== Building all workspace packages (latest lib/ output) ==')
  run('pnpm', ['-r', 'build'])

  console.log('\n== Linking packages/ into the user-owned plugin root ==')
  run(cli, ['link', '--packages', path.join(repoRoot, 'packages'), '--runtime', installRoot])

  console.log('\nDone. Restart DSH (KiCad → Reset DSH) to load the linked build.')
  console.log('Undo with: pnpm unlink-plugins:kicad')
}

main()
