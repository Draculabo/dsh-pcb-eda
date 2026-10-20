# KiCad integration of `@huaqiu/dsh-tool-kicad-schematic-gen` — and what "self-contained" would actually require

**Date:** 2026-10-20
**Status:** research only — no production code changed
**Question:** how does the plugin integrate with KiCad, and for a self-contained/standalone build, should we bundle KiCad — or is the real dependency a small set of EDA-host abilities?

**Scope of evidence:** `/Users/admin/code/dsh-pcb-eda` (plugin), `/Users/admin/code/hq-edge` (host bridge), `/Users/admin/code/kicad/hq` (KiCad HQ fork), plus the existing research notes
`docs/research/dsh-plugin-deployment-and-hq-edge-bundling.md`,
`docs/research/eda-host-hqedge-inject.md`,
`/Users/admin/code/hq-edge/docs/report/hq-edge-kicad-integration-and-editor-routing.md`,
`/Users/admin/code/hq-edge/docs/report/kicad-minimal-grpc-surface.md`.

---

## 1. Executive answer

**Do not bundle KiCad.** Three independent reasons:

1. **KiCad is the process that owns this stack, not a dependency of it.** In the current topology KiCad launches hq-edge, and hq-edge launches DSH with your plugin inside it. Bundling "KiCad" means bundling your own launcher and inverting the process tree.
2. **Generation itself has zero KiCad dependency.** The plugin authors KiCad files as s-expressions in TypeScript and writes them through the DSH `fs` service. Nothing is imported from, executed by, or read back from KiCad.
3. **The only KiCad *binary* actually used is `kicad-cli`, for four read-only subcommands** — SVG export, netlist export, BOM export, ERC — and every one of them already degrades to a typed error today.

**The real coupling is not KiCad — it is five seams**, of which only two are host-specific (§4). If "self-contained" means *runs in a plain `dsh web` with no KiCad host*, the gap list is short and enumerable (§7), and the largest gap is **not** KiCad: it is the three `eda.cn` HTTP services that supply parts, datasheets and the module catalogue.

**Recommended direction:** keep `kicad-cli` as an *optional, externally provided* tool with a documented discovery contract (Option A), and formalise the host-provided path (`get_eda_host_info → installation.executables['kicad-cli']`) as the primary source (Option D). Treat "bundle KiCad" as a product/installer decision, never as a plugin dependency.

---

## 2. Runtime topology

```text
KiCad (HQ fork — /Users/admin/code/kicad/hq)
  C++ HQ_RUNTIME: HQ_GRPC_SERVER (14 services), HQ_HANDLER_SCH / HQ_HANDLER_PCB,
                  HQ_EVENT_STORE, HQ_UI_MARSHAL, HQ_EDGE_LAUNCHER
   │  HQ_EDGE_LAUNCHER spawns            (kicad/hq/runtime/src/hq_edge_launcher.cpp)
   ▼
hq-edge  apps/server   (express routes + gRPC clients; stateless bridge)
   │  DshSupervisor spawns `dsh web --patch overlay.yml --host 127.0.0.1 --port <p>`
   ▼
DSH (dsh web, DSH_HOME = <user-data-root>/hq-edge/<version>/dsh-home)
   │  plugins symlinked into profiles/web/node_modules — no npm/pnpm at runtime
   ▼
@huaqiu/dsh-tool-kicad-schematic-gen
   ├─ node half : ctx.tools / ctx.fs / ctx.sandboxPolicy / ctx.skills / ctx.webServer
   ├─ host half : ctx.get('hqEdge')   ← provided by hq-edge's `edge-bridge` plugin
   └─ browser   : __ModuleLoader__ → slots / inputTriggers / conversation / sessions
```

KiCad → hq-edge → DSH is the direction of process creation. That single fact decides the bundling question: **the plugin can never be "more self-contained" than the application that starts it.**

---

## 3. What the plugin is

One installable DSH plugin, dual-face (node half + browser half), which registers **14 agent tools** and **one bundled skill** (`kicad-schematic-design`, `src/skills.ts`, `resourcesBase` = `skills/kicad-schematic-design/`, `rank: 600`).

| Group | Tools |
|---|---|
| Schematic authoring | `create_kicad_hierarchy`, `edit_kicad_flat_schematic`, `get_kicad_module_ports` |
| Preview / verification | `render_kicad_module_preview`, `analyze_kicad_module` |
| Components | `get_kicad_component_models`, `import_kicad_symbol`, `import_kicad_component`, `get_kicad_datasheet`, `localize_kicad_module_footprints` |
| Module catalogue | `eda_module_rag_search`, `eda_module_category_search`, `eda_module_precise_search`, `download_eda_module_schematic` |

(README.md says "twelve tools"; the code registers fourteen — the adapted download tool and the footprint-localization tool added later.)

Declared injects — `src/index.ts:12`:
`['tools', 'fs', 'sandboxPolicy', 'skills', 'webServer']`.
Note what is **not** there: no `hqEdge`, no `huaqiuAuth`, no `huaqiuArtifacts`. The plugin is already designed to load without a host.

Release manifest (`plugins-release-manifest.json`):
`{ "version": "0.6.3", "hosts": ["kicad"], "requiresHqEdge": false }` — the only gating is "install me into KiCad builds"; hq-edge is explicitly not required.

---

## 4. The five integration seams

### Seam 1 — File format (no KiCad at all)

The plugin is a KiCad **file-format** tool, not a KiCad **process** tool.

- Own s-expression tokenizer/parser: `src/schematic/sexpr.ts`; dependency `kicad-sexpr-parser@1.5.3`.
- Authors `.kicad_sch` / `.kicad_pro` / `.kicad_sym` directly: `builder.ts`, `flat.ts`, `edit.ts`, `assembly.ts`, `ports.ts`, `connections.ts`, `power-layout.ts`, `label-leads.ts`, `symbol-units.ts`.
- Templates are **bundled** and resolved at build time: `schematic.flatTemplateDir` = `skills/kicad-schematic-design/templates/` (`src/config.ts:29`), plus a committed KiCad 10 hierarchy template (`.../references/kicad10-hierarchy-template/`, with `.kicad_pro`, `.kicad_sch`, `.kicad_sym`, `sym-lib-table`).
- All writes go through the DSH `fs` service and are **workspace-scoped**: `fs.resolve(workspace)` → `fs.contains(root, target)` → `fs.writeText(..., {kind:'createIfAbsent'}, signal, policy)`. No KiCad is consulted, and no file is written outside the workspace.

**Self-contained verdict: already fully self-contained.**

### Seam 2 — `kicad-cli` (external process, optional)

Four subcommands, **all read-only** (`src/schematic/preview.ts:251`, `src/schematic/module-analysis.ts:185,280,288`, `src/schematic/verify.ts:192,212,215`):

| Command | Used by | Purpose |
|---|---|---|
| `sch export svg --output <dir> --exclude-drawing-sheet <sch>` | `render_kicad_module_preview` | page SVGs; **PNG conversion is done in-process by `sharp`**, not by KiCad |
| `sch export netlist --format kicadsexpr` | `analyze_kicad_module`, `verify.ts` | netlist / connectivity views |
| `sch export bom --fields/--labels/--group-by/--filter` | `analyze_kicad_module` | grouped BOM views |
| `sch erc --format json --severity-all` | `verify.ts` (netlist + ERC pair; not currently wired to a public tool) | ERC violations |

**Discovery** (`src/runtime-paths.ts`) — first hit wins:
1. `KICAD_CLI_PATH` env override (must be an absolute `kicad-cli[.exe]`);
2. walk **up** from `process.execPath`, testing `<dir>/kicad-cli` and `<dir>/bin/kicad-cli` (this is how it finds the CLI inside an HQ Edge / DSH install tree);
3. every `PATH` entry;
4. otherwise fall back to the bare command name `kicad-cli` (i.e. "hope it is on PATH").

Symbol libraries are discovered the same way (`KICAD_SYMBOL_DIR`, any `KICAD<n>_SYMBOL_DIR` highest-version-first, `<cli>/../../share/kicad/symbols`), validated by the presence of `power.kicad_sym`. Results are cached per environment key.

**Per-call override:** `render_kicad_module_preview` and `analyze_kicad_module` accept an absolute `kicadCliPath`, documented as *"already returned by `get_eda_host_info`"* — i.e. the host is the authoritative source (`src/schematic/tools.ts:300`, `src/schematic/analysis-tool.ts:77`).

**Failure behaviour is already graceful:**
- Capability probe runs `<cli> sch export netlist --help` / `sch export bom --help` and parses the help text; 60 s cache.
- Typed failure codes: `CLI_START_FAILED` (ENOENT/EACCES/ENOEXEC…), `CLI_PROBE_TIMEOUT`, `CLI_PROBE_FAILED`, `CLI_CAPABILITY_UNSUPPORTED`.
- `analyze_kicad_module` returns `status:'unavailable'` with a `nextAction` hint — **a failed analysis never fails the download** (`src/modules/kicad-download.ts:101-107`).
- Preview failures return structured `PreviewError` codes; `render_kicad_module_preview` has a Windows `MAX_PATH` guard before invoking KiCad.
- Budgets: `previewTimeoutMs` default 30 s (schema max 120 s), plus `verificationTimeoutMs`.

**Self-contained verdict: the only real KiCad binary dependency, and it is optional.** Everything it powers is a *view* or a *check*, never a *write*.

### Seam 3 — EDA host (`hqEdge` service, from hq-edge's `edge-bridge`)

Exactly two consumers, both late-bound via `ctx.get('hqEdge')` so a missing host cannot break load:

**Node — module download** (`src/modules/kicad-download.ts`)
```ts
hqEdge.context.getTargetHost() === 'kicad'          // else: "available only in KiCad"
hqEdge.project.getCurrent().projectId               // realpath === session cwd, else error
hqEdge.project.onChanged(...)                        // aborts the download if project switches
```
Deliberately resolved at execution time (`src/modules/register.ts:8-14`): *"Search works without a live host; downloads resolve the current host at execution time."*

**Browser — place into the open editor** (`src/client/place.ts`)
```ts
host.context.getEditorType() / getCurrent().editorType ∈ { 'sch', 'generic' }
host.placeArtifact({ type:'schematic', artifactUri:'file:…', filename, root })
```
The placement payload is fetched from the plugin's **own** route `/api/v1/kicad-schematic-overview/<uuid>/placement.json`. If the host cannot place, the card simply omits the "放置到编辑器" button (`src/client/index.ts:76`).

**Self-contained verdict: host-only, and already optional at load time.** Two tools lose function; nothing else does.

### Seam 4 — DSH platform services

| Service | Used for |
|---|---|
| `tools` | register the 14 tools |
| `fs` + `sandboxPolicy` | workspace-scoped reads/writes |
| `skills` | bundled `kicad-schematic-design` provider (also injects resolved `DSH_SCHEMATIC_PLUGIN_DIR`, `CLI=…`, `KICAD_SYMBOL_DIR=…` into the skill body at read time — `src/skills.ts:56`) |
| `webServer` | overview cache routes; `registerOverview()` returns a boolean and the tool still returns local PNG paths when absent (`src/schematic/overview.ts:93`, `tools.ts:236`) |
| client `slots` | `tool.call.toolview` card + sidebar entry |
| client `inputTriggers` | `@schematic-gen` trigger source (`src/client/schematic-ref.ts`) |
| client `conversation` / `sessions` | composer chip insertion — **lazy**, never declared in `inject` |

**Self-contained verdict: satisfied by any DSH build, including a plain `dsh web` fork.**

### Seam 5 — Network services (the under-estimated coupling)

| Endpoint | Purpose | Config |
|---|---|---|
| `https://task.eda.cn/prod-api/outside/datasheet/v1/components/` | component metadata + models | `components.structuredApiBaseUrl` |
| `https://gen.eda.cn` | module RAG / category / precise search | `modules.search.apiBaseUrl` |
| `https://www.eda.cn` | module download + source project zip | `modules.download.apiBaseUrl` |
| `@huaqiu/part-search@0.2.6` (library) | exact-part lookups (`src/components/service.ts`) | — |
| `file.elecfans.com`, `file1.elecfans.com` | datasheet PDF hosts (allow-list) | `components.allowedPdfHosts` |

No `Authorization` header / token is used anywhere in `src` (the older `huaqiuAuth` dependency is gone from this package). So these are public endpoints — but they are still **runtime network dependencies**, and for a truly offline build they are a bigger hole than KiCad: parts, datasheets and the module catalogue all live there.

---

## 5. Should we bundle KiCad? Options

### Option A — Status quo + contract hardening *(recommended, ~zero cost)*
Keep `kicad-cli` external; make the contract explicit.
- Document `KICAD_CLI_PATH` / `KICAD_SYMBOL_DIR` in the plugin README (already implemented, undocumented).
- Surface a one-line "preview requires kicad-cli" note when the capability probe fails (today the message is actionable but generic).
- Keep the workspace-write path 100 % CLI-free.
**Cost:** documentation only. **Risk:** none.

### Option B — Ship / pin a portable `kicad-cli`
**Not a bare binary.** `sch export svg` still needs to resolve `lib_symbols` through `sym-lib-table`, and netlist/ERC need the standard symbol libraries. A useful portable CLI means CLI + `share/kicad/symbols` + library tables — effectively a mini KiCad install (hundreds of MB, per-OS, GPL-3 redistribution obligations), on top of an npm package that already carries `sharp` and `pdfjs-dist`.
**Cost:** high (packaging, licensing, three platforms, CI). **Risk:** version drift against the user's real KiCad (ERC semantics differ between 7/8/9/10).
**Verdict:** only defensible as an *installer* feature ("install KiCad for me"), never as plugin payload.

### Option C — Remove the CLI dependency entirely
`sharp` already does SVG→PNG, so the missing piece is *KiCad s-expression → SVG geometry*: symbol instantiation, pin placement, text, hierarchy sheets. That is a renderer rewrite, and it can never reproduce KiCad ERC/netlist semantics.
**Verdict:** acceptable for a "good enough" preview only; verification would have to be dropped, not reimplemented.

### Option D — Let the host own the CLI path *(cleanest architecturally, pair with A)*
`hq.host.v1` already carries `installation.executables[]`, and the code already prefers a host-supplied path. Promote that to the primary source and keep local discovery as fallback only.
**Caveat:** `dsh-eda-host` documents that an **empty** executable `path` means "resolvable by name only", not "missing" — the plugin must keep the discovery fallback, and hq-edge/KiCad must actually populate the entry.
**Cost:** small, but spans three repos (plugin + hq-edge + KiCad fork).

> For the sibling `@huaqiu/dsh-kicad` package (PCB mutation tools) the answer is different and simpler: it needs a **live** KiCad with the IPC server plus a Python that has `kipy` (`src/ipc.ts`, `pythonPath` default `python3`, `$DSH_KICAD_PYTHON`). Bundling KiCad does not help — the dependency is *a running editor with an open board*.

---

## 6. What it expects from the EDA host — the contract

| Ability | Consumer | Required? | Behaviour when absent |
|---|---|---|---|
| `context.getTargetHost() === 'kicad'` | module download | **required for that tool** | throws "This download tool is available only in KiCad" |
| `project.getCurrent().projectId` | download target directory | **required** | throws "Open a KiCad project and start a DSH conversation in that project" |
| `project.onChanged(fn)` | abort on project switch | **required** | (unavailable → no abort guard) |
| `placeArtifact({type,artifactUri,filename,root})` + editor type ∈ `{sch,generic}` | browser "place into editor" | optional | button hidden; ZIP download still offered |
| `installation.executables['kicad-cli']` (via `get_eda_host_info`) | CLI path recovery | optional | falls back to env / tree-walk / PATH discovery |
| `baseUrl`, netlist + PCB snapshot + capabilities | **sibling plugin** `@huaqiu/dsh-eda-host` only | required there | `FAILED_PRECONDITION` |

Everything above is **EDA-agnostic by design**: `dsh-eda-host` mirrors `hq.host.v1` / `hq.ir.schematic.v1` / `hq.pcb.v1` structurally and contains no KiCad code, so the host contract is "which EDA am I, what can you do, where is my CLI" — not a KiCad-specific API.

---

## 7. Self-contained readiness: what works with no KiCad host at all

Running this plugin in a plain `dsh web` (e.g. the DSH fork) with a local `kicad-cli` on PATH:

| Capability | Status without a KiCad host |
|---|---|
| Plugin + skill load | ✅ (no `hqEdge` in `inject`; manifest `requiresHqEdge: false`) |
| Schematic generation, hierarchy assembly, flat editing, ports | ✅ pure s-expression authoring |
| Symbol / component import, footprint localization | ✅ (needs `eda.cn` network) |
| Datasheet extraction | ✅ (needs `eda.cn` network + `pdfjs-dist`) |
| Module catalogue search (3 tools) | ✅ (needs `gen.eda.cn`) |
| Workspace file writes | ✅ (DSH `fs` + `sandboxPolicy`) |
| `render_kicad_module_preview` | ⚠️ needs `kicad-cli`; structured error + local paths otherwise |
| `analyze_kicad_module` | ⚠️ needs `kicad-cli`; returns `unavailable`, download still succeeds |
| `download_eda_module_schematic` | ❌ hard host requirement (`getTargetHost()==='kicad'`) |
| "放置到编辑器" placement | ❌ button hidden |
| `@huaqiu/dsh-kicad` PCB mutation | ❌ live KiCad IPC + `kipy` |
| `dsh-eda-host` netlist / PCB read-back | ❌ requires hq-edge |

**So the self-contained to-do list, in priority order:**
1. **Network services** — decide whether parts/datasheets/module catalogue must work offline; this is the largest gap and it is not a KiCad problem.
2. **`kicad-cli`** — document the env override and the probe failure message (Option A); adopt host-provided path as primary (Option D).
3. **Download tool** — if you want it headless, relax `requireCurrentProject` to "workspace root" instead of "active KiCad project ID" (a small, well-isolated change in `src/modules/kicad-download.ts`).
4. **Placement** — no action; already optional and hidden.

---

## 8. Open questions

- Is `hosts: ["kicad"]` in the release manifest still what you want? It gates the plugin out of non-KiCad installs (the migration commit changed it from `["all"]`). For a self-contained build you may want `["all"]`.
- Should `verify.ts` (netlist + ERC pair) be exposed as a public tool? It is implemented and tested but not registered — which is why ERC is currently unreachable from the agent.
- Does `hq-edge`'s `edge-bridge` reliably populate `installation.executables['kicad-cli']` on all three platforms? Option D depends on it.
- Is offline operation a requirement? If yes, `eda.cn` is the binding constraint, not KiCad.
