# Huaqiu PCB EDA for DSH

Brings Huaqiu electronic-design capabilities into
[DeepSeek Harness (DSH)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) as
standalone, published DSH plugins: Huaqiu part search, symbol/footprint generation, and
schematic generation. Being migrated out of the HQ Edge monorepo — **zero `@hqedge/*`
dependency is a hard requirement**.

## Packages

| Package | Node | Client | Status |
|---|---|---|---|
| `@huaqiu/dsh-auth` | ✓ (webServer route) | ✓ (auth iframe) | Phase 0A POC |
| `@huaqiu/dsh-artifacts` | ✓ (service + routes) | — | Phase 0B |
| `@huaqiu/dsh-tool-part-search` | ✓ | — | skeleton |
| `@huaqiu/dsh-tool-symbol-footprint` | ✓ | stub | skeleton |
| `@huaqiu/dsh-tool-schematic-gen` | ✓ | stub | skeleton |

## Development

```bash
pnpm install
pnpm -r typecheck     # tsc --noEmit
pnpm -r test          # vitest
pnpm -r build         # tsdown → lib/
pnpm -r pack --dry-run
pnpm check:hqedge     # fails if any @hqedge reference exists
```

Requires Node ≥ 22 (pnpm 11).

## Phase status

Phase 0 (foundation + auth POC + artifacts service) in progress. See
`docs/tasks/phase0-implementation-spec.md` for the exact contract. Publishing and tool
implementation are Phases 1–5.

## Installing a local package into DSH (manual / integration)

The `dsh` CLI is **available on public npm** as `@deepseek-ai/dsh@0.1.1-rc.2` (verified
Phase 0; run it with `npx` to avoid a global install). Phase 0's stock-DSH smoke test
passes for both plugin shapes — a node-only package (`dsh-tool-part-search`) and a
dual-face package (`dsh-tool-schematic-gen`) — each composes its `cordis.patch.yml`
(`inject`) into a fresh `web` profile.

```bash
# scratch home so nothing touches the real DSH home
export DSH_HOME="$(pwd)/.smoke/dsh-home"
npx --yes @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web add <path-to-package>
npx --yes @deepseek-ai/dsh@0.1.1-rc.2 --profile web --dump-config | grep huaqiu
```

Then start the web profile and confirm the plugin loads and its tools register.
