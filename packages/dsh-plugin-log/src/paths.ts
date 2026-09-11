/**
 * Inlined from `@hqedge/paths` (hq-edge/packages/paths/src/index.ts) so this
 * plugin stays fully self-contained — no runtime dependency on the published
 * package. Keep in sync when `@hqedge/paths` changes its path conventions.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Shared OS-native path resolution for HQ Edge runtimes.
 *
 * The single source of truth for where HQ Edge places per-user directories.
 * `getHqEdgeHome()` is the root: every other path getter (`getLogBaseDir`,
 * `getLogDir`) is derived from it, so all HQ Edge user directories live under
 * one self-contained tree and every consumer resolves the same location.
 *
 * Path conventions by platform (env-paths `data` shape, except macOS — see
 * below):
 *
 *   - macOS:   ~/.hq-edge/                                  (this override)
 *   - Linux:   ~/.local/share/hq-edge/   (honors $XDG_DATA_HOME)
 *   - Windows: %LOCALAPPDATA%\hq-edge\
 *
 * macOS deviates from `env-paths`: a dotfile under `$HOME` rather than the
 * `~/Library/Application Support/hq-edge/` sandbox location. Rationale: HQ
 * Edge is a single-developer EDA workstation tool, not a sandboxed macOS app.
 * A dotfile in `$HOME` is more discoverable (one `ls -la` shows every HQ Edge
 * user-data tree), survives sandbox / permission oddities, and aligns with the
 * historical `~/.hq` location users already had from `dshHome.ts` before this
 * unification. It also means DSH plugin code that imports `@hqedge/paths` does
 * not need to branch on platform for the macOS case.
 */
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

/**
 * Application identifier used for OS-native directories.
 */
export const APP_ID = 'hq-edge'

/**
 * Resolves the OS-native per-user home/data directory for HQ Edge — the single
 * root from which every other HQ Edge path getter is derived.
 *
 *   - macOS:   ~/.hq-edge/                                  (override)
 *   - Linux:   ~/.local/share/hq-edge/   (honors $XDG_DATA_HOME)
 *   - Windows: %LOCALAPPDATA%\hq-edge\
 *
 * The macOS override is documented above. The path may also be overridden
 * explicitly via `override` or the `HQ_EDGE_HOME` environment variable (useful
 * for tests / bundling / portable installs).
 */
export function getHqEdgeHome(override?: string): string {
  if (override) {
    return override
  }
  if (process.env.HQ_EDGE_HOME) {
    return process.env.HQ_EDGE_HOME
  }

  const home = homedir()
  // macOS override: dotfile under $HOME, not the Library sandbox.
  // See the file header for the rationale.
  if (platform() === 'darwin') {
    return join(home, '.hq-edge')
  }
  if (platform() === 'win32') {
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData) {
      return join(localAppData, APP_ID)
    }
    return join(home, 'AppData', 'Local', APP_ID)
  }
  // Linux / other POSIX — follows the XDG_DATA_HOME convention.
  const xdgDataHome = process.env.XDG_DATA_HOME
  return xdgDataHome ? join(xdgDataHome, APP_ID) : join(home, '.local', 'share', APP_ID)
}

/**
 * Resolves the OS-native base log directory for HQ Edge.
 *
 * Built on top of `getHqEdgeHome()` as `<home>/logs` on every platform, so
 * logs live inside the HQ Edge home tree:
 *
 *   macOS:   ~/.hq-edge/logs/
 *   Linux:   ~/.local/share/hq-edge/logs/
 *   Windows: %LOCALAPPDATA%\hq-edge\logs\
 *
 * The path may be overridden explicitly via `override` or the
 * `HQ_EDGE_LOG_DIR` environment variable.
 */
export function getLogBaseDir(override?: string): string {
  if (override) {
    return override
  }
  if (process.env.HQ_EDGE_LOG_DIR) {
    return process.env.HQ_EDGE_LOG_DIR
  }
  return join(getHqEdgeHome(), 'logs')
}

/**
 * Resolves the per-component log directory, e.g. `<base>/dsh-plugins/`.
 *
 * The directory is created on demand by the rotating file stream.
 *
 * Note: the directory name is the component verbatim — there is no implicit
 * version scoping. Callers that need version isolation (e.g. the DSH home,
 * which keeps one tree per HQ Edge release) must layer it on top of
 * `getHqEdgeHome()` themselves. Cross-version logs (server, plugin diagnostics)
 * intentionally share a tree so a single `tail -F` follows them across upgrades.
 */
export function getLogDir(component: string, baseDirOverride?: string): string {
  return join(getLogBaseDir(baseDirOverride), component)
}
