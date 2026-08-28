# @huaqiu/dsh-tool-part-search

Huaqiu PCB part search DSH tool plugin — **node half only**. Exposes the Huaqiu
public part-search API as four agent-visible tools:

| Tool | Operation |
| --- | --- |
| `search_hqsch_parts` | `PartSearchService.searchParts` |
| `get_hqsch_part` | `PartSearchService.getPart` |
| `get_hqsch_part_models` | `PartSearchService.getEdaModels` |
| `get_hqsch_supply_chain` | `PartSearchService.getSupplyChain` |

## Architecture

- **Phase 1** — the first published DSH plugin. It is the smallest vertical
  slice that validates the whole packaging path: `package.json` →
  `cordis.patch.yml` → plugin loading → `ctx.tools` → `defineTool` → npm
  publish → stock DSH install → tool invocation.
- **`@huaqiu/part-search`** (published, public, unauthenticated) is the **single
  implementation** of the Huaqiu part-search integration. This plugin only
  adapts it into DSH tools — there is no HQ Edge, no HTTP proxy, no
  `@hqedge/*` dependency.
- Node only: part search returns JSON, never renders UI → no client bundle.
- Self-contained: the plugin talks directly to `https://kiapi.eda.cn` (the
  library's hardcoded upstream) with the global `fetch`.

## Files

```
src/
  index.ts      # plugin: name / inject ['tools'] / apply (registers 4 tools)
  service.ts    # thin PartSearchService adapter (the Huaqiu → DSH boundary)
  tools.ts      # the four defineTool definitions (the DSH tool adapter)
test/
  index.test.ts # plugin shape + registration
  tools.test.ts # arg mapping + render, against a stub service
  service.test.ts # library wiring via a stub fetch
```

## Development

```bash
pnpm install
pnpm --filter @huaqiu/dsh-tool-part-search typecheck
pnpm --filter @huaqiu/dsh-tool-part-search test
pnpm --filter @huaqiu/dsh-tool-part-search build
pnpm --filter @huaqiu/dsh-tool-part-search pack --dry-run   # release check
```

## Install / verify on a stock DSH

```bash
dsh plugin --profile web add /path/to/dsh-pcb-eda/packages/dsh-tool-part-search
dsh --profile web --dump-config
dsh web
```

Then ask the agent to `search_hqsch_parts` (e.g. query "STM32F103").

## Status

Phase 1 complete. Version 0.1.0 ready to publish.
