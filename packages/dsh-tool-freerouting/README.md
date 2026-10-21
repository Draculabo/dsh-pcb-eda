# DSH FreeRouting

[English](README.md) | [简体中文](README.zh-CN.md)

A DSH plugin that autoroutes the open KiCad PCB with FreeRouting. Tracks and vias appear in the KiCad editor during routing; DSH reports progress, checks and the final result.

**Preview release: Windows x64 and KiCad 10 only.** Differential-pair routing and electrical validation of crystal circuits are not supported. Inspect the result before saving or manufacturing a board.

## Features

- Route the current editor contents, including unsaved edits, while preserving existing tracks and vias.
- Show intermediate tracks and vias directly in KiCad, then import the final additions in one undo transaction.
- Check a candidate board with KiCad DRC before final import and report unresolved issues.
- Refill existing copper zones when requested. No zones are created and no PCB files are saved automatically.
- Run locally using the FreeRouting engine shipped with KiCad (`bin\freerouting.exe`, which carries its own Java runtime) or a JAR plus Java runtime, together with bundled Python libraries. No resident Python service or system Java installation is needed.

## Requirements

| Component | Requirement                                                                         |
| --------- | ----------------------------------------------------------------------------------- |
| OS        | Windows x64                                                                         |
| KiCad     | 10.0.6+ within the compatible 10.0 series, with its bundled Windows x64 Python 3.11 |
| KiCad API | Enabled in the PCB editor preferences                                               |
| DSH       | Pinned SDK baseline: 0.2.1-rc.2; other releases need compatibility verification     |
| Board     | Open in the PCB editor and saved at least once                                      |

Linux, macOS and other Python ABIs are not supported. The plugin checks compatibility before routing.

## Installation

Install a published version through the DSH CLI:

```powershell
dsh plugin --profile web add -w --ignore-scripts @huaqiu/dsh-tool-freerouting
```

For a local build, replace the package name with the path to `huaqiu-dsh-tool-freerouting-<version>.tgz`. Restart DSH after installation. Load only one copy of the plugin.

The package declares its host entry, browser entry and bundle patch in `package.json`. DSH loads `cordis.patch.yml`, which registers plugin ID `huaqiu-dsh-tool-freerouting` with the required `tools`, `systemPrompt`, `webServer` and `jobs` services. No separate skill installation is required.

## Configuration

DSH bundled with KiCad can locate Python in that installation. For standalone DSH, add a machine-specific override to the active profile's `cordis.patch.yml`:

```yaml
- id: huaqiu-dsh-tool-freerouting
  config:
    kicadPythonPath: C:/Program Files/KiCad/10.0/bin/python.exe
```

With exactly one connectable PCB editor, the plugin binds it automatically. With multiple editors, set `kicadApiSocket` to the target editor's exact `ipc://...` address from the KiCad API preferences.

| Setting                 | Default                  | Meaning                                                                             |
| ----------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| `realtime`              | `true`                   | Show intermediate routing in KiCad                                                  |
| `drawtimeSec`           | `5`                      | Interval between preview update attempts; actual changes depend on engine snapshots |
| `pollTimeoutMs`         | `1800000`                | Routing deadline: 30 minutes                                                        |
| `autoLaunchFreerouting` | `true`                   | Start the bundled Java engine                                                       |
| `freeroutingBaseUrl`    | `http://127.0.0.1:37864` | Local engine address                                                                |
| `resultTtlMs`           | `3600000`                | Retain available downloads for one hour                                             |

The bundle patch uses the defaults defined by the plugin instead of duplicating configuration values. It contains no machine-specific Python path.

## Usage

1. Open the target PCB and enable the KiCad API.
2. Ask DSH:

   ```text
   Use pcb_route to autoroute the current KiCad PCB. Preserve existing tracks
   and vias, skip no nets, and set fill_zones=false. Do not save the file.
   ```

3. Watch the editor and the DSH progress card. Do not edit, save or undo the board while routing is running.
4. Review the final report, inspect remaining connections and run KiCad DRC. Resolve remaining problems and save manually.

Use `pcb_cancel_route` to cancel. One task is allowed across the plugin, with no queue. Closing the bound PCB editor cancels routing and releases plugin-owned compute processes; closing the DSH browser tab does not cancel a task. A board write already in progress finishes its commit or rollback.

Preview copper is temporary and is cleared before final import. One undo removes the final additions; older undo steps can restore old previews because KiCad records preview operations separately. Zone refill is a separate step and is not covered by that undo guarantee.

When verified routing-rule violations are found, the workflow can try one repair and reroute. Remaining violations may be imported with an explicit warning. **Imported does not mean DRC-clean or fully connected.** Failed checks, board changes and uncertain writes stop automatic import. If a previous write cannot be confirmed, inspect the board before asking DSH to clear the pause through `pcb_confirm_board_checked`.

## Limitations

- No accepted differential-pair backend; recognized differential pairs are rejected before routing. Net names alone do not define electrical constraints.
- No electrical acceptance guarantee for crystal circuits.
- The bundled engine has no verified selected-net filtering path. `pcb_route_nets` and nonempty `skip_nets` requests are rejected.
- Straight tracks and ordinary through-vias only. Unsupported copper geometry, custom `.kicad_dru` rules or inputs that cannot be preserved are rejected.
- Import success and complete connectivity are reported separately. Unverified connectivity is marked unknown.
- Results and tasks do not recover across DSH restarts. Only the minimal board-inspection marker persists.
- Runtime progress and hardware-facing messages are currently Chinese.

## Development

From the monorepo root, use Node.js 22.19+ in the 22.x line or 24+, the repository-pinned pnpm, KiCad Python 3.11 and a full JDK 25:

```powershell
pnpm install --frozen-lockfile
python -m pip install -r packages/dsh-tool-freerouting/requirements-dev.txt
$env:DSH_IPC_TEST_PYTHON = 'C:/Program Files/KiCad/10.0/bin/python.exe'
$env:DSH_ENGINE_TEST_JDK = 'C:/path/to/jdk-25'
pnpm --filter @huaqiu/dsh-tool-freerouting exec playwright install chromium
pnpm --filter @huaqiu/dsh-tool-freerouting package:plugin
```

This prepares locked dependencies, builds and tests the engine, checks and builds the plugin, packs it, and verifies a fresh installation. The tarball is written to this package's `dist/`. The initial build requires access to Python wheel, Temurin, Gradle and Maven downloads.

`prepack` copies the engine license and builds the TypeScript entries. The engine itself is not packaged: `DSH_PREPARE_ENGINE=1` (with `DSH_ENGINE_TEST_JDK`) rebuilds the JAR and JRE for `scripts/package-windows-exe.ps1`, which produces the `bin\freerouting.exe` that ships with KiCad. On macOS/Linux, packing still requires the Python vendor tree prepared on Windows at the same source revision.

The installed package contains compiled plugin entries, Python helpers and their libraries, configuration and license notices. The FreeRouting engine and its JRE arrive with KiCad (`bin\freerouting.exe`) or through `DSH_FREEROUTING_EXE`, so the plugin archive stays small. Expanded Java source projects, development scripts, tests, internal documents and build caches are excluded. Generated runtime files are not committed to Git.

Run `pnpm --filter @huaqiu/dsh-tool-freerouting check` before submitting changes. Live editor tests must use disposable fixtures, never a production board. Report issues with the plugin, DSH and KiCad versions, the failed stage and a redacted diagnostic report. Do not attach tokens or confidential PCB data.

## License

This package declares `UNLICENSED` and grants no license to its first-party code. The repository-root MIT license is excluded from this package. The modified FreeRouting engine retains GPL-3.0. The npm package includes the precompiled JAR, `bundled/freerouting.LICENSE` and build provenance; corresponding source and build instructions are available in the [engine source directory](https://github.com/Huaqiu-Electronics/dsh-pcb-eda/tree/main/packages/dsh-tool-freerouting/engine). Java sources and source archives are excluded from the npm package. See [third-party notices](THIRD_PARTY_NOTICES.md) for matching the source to the distributed JAR.

Third-party components retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Thanks to [FreeRouting](https://github.com/freerouting/freerouting), [KiCad](https://www.kicad.org/) and [Eclipse Temurin](https://adoptium.net/).
