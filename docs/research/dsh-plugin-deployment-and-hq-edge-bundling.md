# DSH Plugin Deployment and HQ Edge Bundling Research

Status: **RESEARCH ONLY — no production code was modified**
Date: 2026-09-02
Author: automation (source-grounded study of `deepseek-harness`, `hq-edge`, `dsh-pcb-eda`, `dsh-plugin`)

---

## Executive Summary

DSH plugins are **npm packages that declare `dsh.bundle.patch` in `package.json`**. A plugin's
`cordis.patch.yml` contributes loader entries (rows with `id`, `name` = module specifier, `config`,
`inject`, …) into a **profile** — a pnpm-managed directory `$DSH_HOME/profiles/<name>` whose
`package.json` lists the plugin package names in the ordered `dsh.profile.bundles` array. DSH
boots by composing the patches of every listed bundle (plus the user's own `cordis.patch.yml`,
plus `--patch` overlays) over an empty root, then the Cordis Loader imports each row's `name`
module and calls its default-exported plugin function `apply(ctx, config)`. This is a
**Cordis-service architecture**: "capability" plugins (auth, artifacts) expose shared services via
`ctx.provide(name, service)` and tool plugins inject them.

HQ Edge does **not** need npm/pnpm at runtime. Its current (proven) mechanism — used by the
`DshSupervisor` — copies plugin packages **verbatim** into an isolated DSH home, symlinks them into
`profiles/web/node_modules/`, generates a single `--patch` overlay, and spawns `dsh web
--patch <overlay> --host 127.0.0.1 --port <port>`. This already matches DSH's loader contract.

**Recommendation.** Keep the current HQ Edge materialization/overlay/symlink mechanism unchanged,
and change only the *source* of the three migrated plugins: replace the duplicated plain-JS copies
(`apps/server/dsh-plugins/{part-search,schematic-gen,symbol-footprint}`) with the **published
`@huaqiu/dsh-*` npm artifacts from `dsh-pcb-eda`, pinned by exact version** (bundled as tarballs
or `file:`-installed from an embedded store at HQ Edge build time). HQ Edge keeps owning only
`edge-bridge`, `erc`, and the **`@huaqiu/part-search` library** (`hq-edge/packages/part-search`):
the library stays in hq-edge as its source of truth while being published to npm, and its
capability is exposed to skills / DSH plugins only through a **thin wrapper** — the
`@huaqiu/dsh-tool-part-search` plugin in dsh-pcb-eda (which depends on the published npm library,
never on HQ Edge). This satisfies the critical criteria: no duplicate source, the artifact tested
standalone is the artifact shipped, no runtime npm, version-pinned, cross-platform, and minimal
new packaging logic.

The `dsh-auth` / `dsh-artifacts` service-provider design already matches DSH's native pattern
(`ctx.provide`), so **no architectural redesign is needed** — only the per-environment config
selection (standalone `auth.eda.cn` vs HQ Edge host mode) is exercised through the existing
overlay `config` channel.

---

## Scope and Repositories Investigated

| Repository | Role | Key paths read |
|---|---|---|
| `/Users/admin/code/deepseek-harness` | **DSH framework source (authoritative)** | `packages/boot/app-boot/src/profile.ts`, `apps/cli/src/plugin.ts`, `apps/cli/src/profile-boot.ts`, `vendor/loader/src/index.ts`, `vendor/loader/src/config/entry.ts`, `vendor/include/src/index.ts`, `packages/client/modules/src/index.ts`, `packages/host/plugin-inventory`, `packages/bundle/{base,web-app}`, `packages/util/home-paths` |
| `/Users/admin/code/hq-edge` | Host application (consumer/bundler) | `apps/server/src/dsh/supervisor.ts`, `apps/server/src/dsh/resolver.ts`, `apps/server/src/dsh/dshHome.ts`, `apps/server/src/dsh/config.ts`, `apps/server/dsh-plugins/*`, `scripts/packaging/bundle-dsh.ts`, `scripts/packaging/*`, `apps/server/package.json` |
| `/Users/admin/code/dsh-pcb-eda` | Huaqiu plugin source (the deliverable under study) | `package.json`, `pnpm-workspace.yaml`, `packages/*/package.json`, `packages/*/cordis.patch.yml`, `packages/*/tsdown.config.ts`, `packages/dsh-auth/src/index.ts`, `scripts/*.mjs`, `.github/workflows/*` |
| `/Users/admin/code/dsh-plugin` | Community ecosystem reference | `dsh-auth-gate`, `dsh-pcb-parts-search`, `dsh-toolkit`, `dsh-bridge`, `dsh-web`, `dsh-market`, `deepseek-harness-remote` |

Evidence labels used throughout:
- **Verified from source** — directly read in the named repository/file/function.
- **Observed in** — read in a real project.
- **Inference** — derived reasoning; explicitly marked.

---

## Current State

### dsh-pcb-eda

A pnpm monorepo (`packages/*`) with five packages, all `@huaqiu/dsh-*`, currently at **v0.1.0**
after the release-resync from the previous task:

| Package | Face | `dsh.bundle` | `dsh.client` | Key deps / peers |
|---|---|---|---|---|
| `@huaqiu/dsh-auth` | dual | `patch: ./cordis.patch.yml` | `platform: web` | dep `@deepseek-ai/dsh-home-paths`; peer `cordis`, `dsh-host-webserver` |
| `@huaqiu/dsh-artifacts` | node + routes | `patch: ./cordis.patch.yml` | — | dep `@deepseek-ai/dsh-home-paths`; peer `cordis`, `dsh-host-webserver` |
| `@huaqiu/dsh-tool-part-search` | node | `patch: ./cordis.patch.yml` | — | dep `@huaqiu/part-search ^0.2.0`; peer `cordis`, `dsh-tools` |
| `@huaqiu/dsh-tool-symbol-footprint` | dual | `patch: ./cordis.patch.yml` | `platform: web` | peer `cordis`, `dsh-tools`, `@huaqiu/dsh-auth ^0.1.0`, `@huaqiu/dsh-artifacts ^0.1.0`, `react ^18` |
| `@huaqiu/dsh-tool-schematic-gen` | dual | `patch: ./cordis.patch.yml` | `platform: web` | peer `cordis`, `dsh-tools`, `dsh-host-webserver`, `@huaqiu/dsh-auth ^0.1.0`, `@huaqiu/dsh-artifacts ^0.1.0`, `react ^18` |

Every `cordis.patch.yml` inserts one loader row, e.g.
`dsh-auth`: `- insert: [{ id: huaqiu-auth, name: '@huaqiu/dsh-auth', inject: ['webServer'] }]`.

Build: **tsdown**, dual-face packages emit `lib/index.mjs` (node ESM) + `lib/client.js`
(browser classic script with `window.__ModuleLoader__.load({ id, factory })` banner) + `lib/index.d.mts`.

Publishing tooling exists (`scripts/bump.mjs`, `check-publish.mjs`, `check-release-version.mjs`,
`publish.mjs`), plus `.github/workflows/{ci,release}.yml` (tag `v*` → validate → build → gate →
`pnpm publish --provenance` via OIDC). **Verified from source**: `dsh-pcb-eda/scripts/*`, workflows.

### hq-edge

- **DSH runtime**: resolved as either a developer checkout (`DSH_LOCAL_PATH`) or the **bundled
  runtime** — a pinned git commit (`config/dsh.lock.yaml`) built through the official npm-pack
  flow (`release:pack` → clean `npm install` of all tarballs) into a self-contained flat npm tree
  at `dist/edge-headless/dsh/`. **Verified from source**: `apps/server/src/dsh/resolver.ts`,
  `scripts/packaging/bundle-dsh.ts`.
- **DSH home**: isolated, user-owned `resolveDshHome()` =
  `<user-data-root>/hq-edge/<version>/dsh-home` (never inside the install). **Verified from
  source**: `apps/server/src/dsh/dshHome.ts`.
- **Plugin mounting** (`DshSupervisor.ensureHQBuiltinPlugins`): **Verified from source**,
  `apps/server/src/dsh/supervisor.ts`:
  1. discover the bridge package (`edge-bridge/`, the parent of `config.patchFile`) plus every
     sibling dir with a `package.json` (`{edge-bridge,erc,part-search,schematic-gen,symbol-footprint}`);
  2. copy each package **verbatim** (package.json + `lib/`, skipping test files) into
     `<DSH_HOME>/hq/builtin-plugins/<version>/`, atomic swap, `current.json` names the active version;
  3. **symlink** each into `<DSH_HOME>/profiles/web/node_modules/<name>` so the loader and the
     ClientModuleRegistry scanner resolve the bare specifier (no `dsh plugin add`, no pnpm at runtime);
  4. generate a single `overlay.yml` (`- insert:` one entry per plugin, `{id, name, config}`; the
     bridge and `dsh-auth` receive `config: { hqEdgeBaseUrl }`);
  5. spawn `dsh web --patch <overlay.yml> --host 127.0.0.1 --port <port>` with `DSH_HOME` set.
- **Current plugins** are plain JS (`lib/`), and — importantly — **do not declare
  `dsh.bundle.patch`**; they are mounted purely via the generated overlay. `part-search` here is
  already named `@huaqiu/dsh-tool-part-search` v1.0.0 but is a **local plain-JS copy**, i.e. the
  duplication the task targets.
- **The `@huaqiu/part-search` library** (`hq-edge/packages/part-search`, v0.2.6, CJS+ESM) is
  **owned by hq-edge and is its source of truth**: the server (`apps/server`) and
  `packages/huaqiu-client` consume it via `workspace:*`, and it is **published to npm** so other
  consumers (DSH plugins, skills) use the same artifact. **Verified from source**:
  `hq-edge/packages/part-search/package.json`, `apps/server/package.json:22`,
  `packages/huaqiu-client/package.json:42`.
- **Packaging**: `dist/edge-headless` = server bundle (`apps/server/bundle/index.cjs`) + web +
  ecad-runtime + `dsh/` + `dsh-plugins/`. **Verified from source**: `scripts/package-runtime.ts`.

### DeepSeek Harness Plugin Architecture

See next section — this is the authoritative contract.

### Existing DSH Plugin Ecosystem Patterns

See §"How DSH Plugins Actually Work → Installation and Distribution" and §Comparison.

---

## How DSH Plugins Actually Work

### Plugin Discovery

**Verified from source** — `deepseek-harness/packages/boot/app-boot/src/profile.ts`:

- A **profile** is `$DSH_HOME/profiles/<name>` (default `~/.dsh/profiles/web`), holding:
  - `package.json` — `dependencies` (out-of-tree plugin packages) + the manifest section
    `dsh.profile.bundles: string[]` (ordered layer list), `profile.ts:5-22,104-111`;
  - `cordis.patch.yml` — the user's own patch layer;
  - `pnpm-workspace.yaml` (`nodeLinker: hoisted`) so out-of-tree plugins share one cordis;
  - `cordis.yml` — the (empty) root config anchoring `baseUrl`, rewritten at every boot,
    `profile-boot.ts:98-103`.
- Shipped profile templates: `web: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']`,
  `headless: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless']`, `profile.ts:114-117`.
- `loadProfile()` maps every `dsh.profile.bundles` name to its **patch layer** and demands the
  package manifest declares `dsh.bundle.patch` — "naming a bundle-less package as a layer is a
  misconfiguration", `profile.ts:371-403`.
- **Module resolution is two-anchor**: bundle name resolves first from the dsh installation (the
  launcher's own package), then from the profile directory, `resolveBundleDir()`,
  `profile.ts:344-355`. A flat fallback `$DSH_HOME/profiles/node_modules` is symlink-healed from
  the whole app dependency closure so every in-box and out-of-tree plugin shares the single cordis
  instance without pnpm managing in-box packages, `healProfilesModuleFallback()`, `profile.ts:223-255`.
- **Discovery is therefore explicit and directory-based**: a plugin is discovered iff (a) its
  package is resolvable from the profile (install anchor or profile node_modules) **and**
  (b) its name is listed in `dsh.profile.bundles` or inserted by a `--patch` overlay or the user's
  `cordis.patch.yml`. There is no "scan the filesystem for plugins" step.

### Plugin Package Contract

**Verified from source**:

- A plugin is an npm package whose `package.json` declares
  `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, `profile.ts:41-45,391-394`.
- The `cordis.patch.yml` is a YAML list of patch objects interpreted by
  `applyEntryPatches()` (`deepseek-harness/vendor/include/src/index.ts:58-128`):
  - `- insert: [ {id, name, config?, group?, disabled?, inject?}, ... ]` appends loader entries;
  - `{ id, name?, config?, disabled?, inject?, ... }` patches an existing row by id.
  - `!!js` YAML tags become lazy expressions evaluated at activation.
- Each **loader entry** is `{ id, name, config?, group?, disabled?, inject? }`
  (`vendor/loader/src/config/entry.ts:9-22`). `name` is a **module specifier** the loader imports.
- `dsh.client` (optional): `{ platform: 'web', inject?: string[], external?: string[],
  immediately?: boolean }` marks the package as having a browser bundle
  (`packages/client/modules/src/index.ts:49-63`). The bundle path is read from
  `exports["./client"]`.

### Plugin Loading Lifecycle

**Verified from source** — `vendor/loader/src/index.ts`, `vendor/loader/src/config/entry.ts`:

```
DSH startup (dsh web)
  → prepareProfile (heal module fallback, load dsh.profile.bundles layers)
  → compose patches: [bundle layers in order] + [profile cordis.patch.yml]
                     + [~/.dsh/cordis.patch.yml] + [--patch overlays] + [telemetry switch]
  → boot() over empty cordis.yml root            (apps/cli/src/profile-boot.ts:142-259)
  → Loader.import(entry.name)                    (vendor/loader/src/config/entry.ts:277-289)
  → unwrapExports(default)                       (vendor/loader/src/index.ts:192-199)
  → ctx.registry.plugin(plugin, config)          — plugin fn apply(ctx, config)
  → fiber.await()  (inject satisfaction; entry pending until required services exist)
```

- The imported module's **default export is a Cordis plugin function** `apply(ctx, config)`
  (plus optional `name` / `inject` exports). This is exactly what `@huaqiu/dsh-auth` exports
  (**Verified from source**: `dsh-pcb-eda/packages/dsh-auth/src/index.ts`).
- `inject` = required services; Cordis holds the entry pending until the provider is registered
  (`Entry._await()`). That is how the `huaqiu-tool-*` rows wait for `tools` / `huaqiuAuth` /
  `huaqiuArtifacts`.
- Client half: `ClientModuleRegistry` scans loader entries for `dsh.client`, serves
  `/plugins/<id>/client.js?rev=<sha1-12>` (bundles resolved from `ctx.baseUrl` via
  `require.resolve('<pkg>/package.json')`), composes `window.__DSH_BOOT__` graph, and the bundle
  self-registers via `window.__ModuleLoader__.load({ id, factory })`.
  **Verified from source**: `packages/client/modules/src/index.ts:282-566`.

### Plugin Dependencies

**Verified from source** + **Observed in** ecosystem:

- DSH uses **plain npm package resolution**: a plugin can depend on any npm package. A plugin can
  depend on another DSH plugin package (it is just a package in `node_modules`).
- **Capability sharing is Cordis services**, not npm imports of plugin internals: the provider
  plugin calls `ctx.provide(name, service)`; consumers declare `inject: [name]` or
  `ctx.get(name)`. Observed analog: `dsh-auth-gate` calls `ctx.provide("auth", auth)`
  (**Observed in**: `dsh-plugin/dsh-auth-gate/src/index.ts:248`). `@huaqiu/dsh-auth` follows the
  same pattern with `ctx.provide('huaqiuAuth', service)`.
- Activation ordering is handled by Cordis: an entry with `inject` stays `pending` until the
  service exists, so providers can be listed in any bundle order.
- Peer-dependency version ranges are the practical contract between a tool and a service package
  (e.g. `@huaqiu/dsh-tool-schematic-gen` peers `@huaqiu/dsh-auth ^0.1.0`).

### Plugin Installation and Distribution

**Verified from source** — `apps/cli/src/plugin.ts`:

- `dsh plugin --profile <name> add <spec>` is a **thin pnpm forwarder**: it runs
  `pnpm add <spec>` inside the profile directory, then reconciles `dsh.profile.bundles` against
  the installed state — a dependency resolving to a package that declares `dsh.bundle` joins the
  layer stack. Specs may be registry names, git URLs, `file:`, `link:`, bare paths, or tarballs
  (relative paths are anchored to the invoking cwd).
- **Any npm registry / file / link / tarball is a valid plugin source.** This is the crucial
  fact for HQ Edge bundling: `file:` and `link:` dependencies and raw tarballs are first-class.
- Distribution: DSH itself is published as npm packages (`@deepseek-ai/dsh`, `@deepseek-ai/dsh-base`,
  `@deepseek-ai/dsh-web-app`, `@deepseek-ai/dsh-headless`, …; 228 tarballs in `dist/npm`).
  **Verified from source**: `deepseek-harness/dist/npm`, `packages/bundle/*`.

### Bundled / Embedded DSH — supported?

**Verified from source**: Yes. The DSH architecture is *compositional npm packages*, not a
monolithic binary (the single-exe build exists but is an optional packaging of the same npm
closure, `deepseek-harness/python/sdk-runtime`). A host can embed DSH by shipping the dsh npm
closure and pre-materializing a profile with the plugins physically present (copy + symlink) —
which is exactly what HQ Edge already does. DSH is never modified; the host only:
1. ships the dsh runtime closure,
2. pre-creates the profile's `node_modules` (or relies on `healProfilesModuleFallback` for
   install-closure resolution),
3. lists plugins via `dsh.profile.bundles` or a `--patch` overlay.

---

## Current Huaqiu Plugin Dependency Graph

**Verified from source** — `dsh-pcb-eda/packages/*/package.json` + `cordis.patch.yml`:

```
                    DSH (cordis runtime)
                     │  provides: tools, webServer, sessions, slots, …
        ┌────────────┴────────────────────┐
   @huaqiu/dsh-auth                @huaqiu/dsh-artifacts
   (dual-face, provides            (node + webServer routes,
    ctx.provide('huaqiuAuth'),      provides huaqiuArtifacts)
    routes /api/v1/huaqiu/auth)
        │  peer ^0.1.0                      │  peer ^0.1.0
        ├──────────────┬────────────────────┘
        ▼              ▼
@huaqiu/dsh-tool-symbol-footprint   @huaqiu/dsh-tool-schematic-gen
   (dual-face)                        (dual-face)
        │
        ▼
@huaqiu/dsh-tool-part-search        ── dep ──▶ @huaqiu/part-search (npm library, published)
   (node-only)
```

- Runtime peer coupling is **one-directional**: tools depend on auth/artifacts; auth/artifacts
  depend only on DSH. No cycles.
- The three tool plugins also peer `@deepseek-ai/dsh-tools` (tool registration SDK).
- **`@huaqiu/part-search` is a plain library (not a plugin), owned by hq-edge and published to
  npm.** The `@huaqiu/dsh-tool-part-search` plugin is a **thin wrapper**: it depends on the npm
  library (`^0.2.0`) and exposes the library's capability (search / get part / EDA models /
  supply chain) as four agent-visible tools — no HQ Edge, no HTTP proxy, no `@hqedge/*`
  dependency. **Verified from source**:
  `dsh-pcb-eda/packages/dsh-tool-part-search/src/index.ts`,
  `packages/dsh-tool-part-search/package.json`. The same library is likewise reachable from
  skills through the same thin-wrapper boundary (plugin or skill calls the npm library, never HQ
  Edge internals).

---

## Authentication Architecture Findings

**Verified from source** — `dsh-pcb-eda/packages/dsh-auth/src/{index.ts,host.ts}` and
`hq-edge/apps/server/src/dsh/supervisor.ts`:

1. **`dsh-auth` exposes a shared service through the DSH-native mechanism.** `apply(ctx, config)`
   does `ctx.effect(() => ctx.provide('huaqiuAuth', service))` and mounts browser→node credential
   routes via `ctx.webServer.register({ kind: 'prefix', path: AUTH_ROUTE_PREFIX, … })`. Other
   plugins inject `'huaqiuAuth'` (client side too — the schematic tool's `inject` includes
   `huaqiuAuth`). This is exactly the Cordis service-registry pattern used by `dsh-auth-gate`
   (`ctx.provide("auth", auth)`). **No custom service-discovery is needed.**
2. **Runtime-specific auth backends are selected by configuration, not by plugin copies.** The
   plugin reads `config.hqEdgeBaseUrl` (and env `HQ_EDGE_BASE_URL`): when present, the node half
   fetches the operator credential from HQ Edge (host mode); otherwise it waits for a browser
   login against `auth.eda.cn` (standalone mode). HQ Edge's supervisor already injects
   `hqEdgeBaseUrl` as overlay `config` on the auth row.
3. **The environment-based approach is appropriate and consistent with DSH.** HQ Edge launches
   DSH with `DSH_HOME` + a `--patch` overlay carrying the endpoint; `dsh-auth` detects host mode
   from `config`. This matches the framework's own "per-deployment configuration is applied as an
   overlay config override, not baked into the bundle patch" convention
   (**Observed in**: `dsh-plugin/dsh-auth-gate/cordis.patch.yml` comment).
4. The client-side login iframe, token persistence and origin checks live inside `dsh-auth`
   (client bundle); individual tools do not reimplement them.

Conclusion: the planned `dsh-auth` architecture is **already the correct DSH-native shape**; the
only remaining work is completing the standalone-vs-host backend selection and keeping the config
contract (`config.hqEdgeBaseUrl`) stable for the HQ Edge supervisor.

---

## Artifact Architecture Findings

**Verified from source** — `dsh-pcb-eda/packages/dsh-artifacts` + `hq-edge` usage:

1. **DSH has no built-in artifact abstraction.** The closest primitives are the `attachment`
   pipeline and tool results (strings/JSON) — there is no generic "generated file store with
   content-addressed retrieval" in the core. So a plugin-level artifact service is the right scope.
2. **Ecosystem convention is a service-provider plugin.** `dsh-artifacts` provides
   `huaqiuArtifacts` in-process to tool plugins (`node tools use it in-process only — no HTTP
   loopback`, per the approved Phase 0 spec) and exposes HTTP routes on `ctx.webServer` for the
   browser/artifact URLs. This matches the DSH pattern of "plugin = capability provider + optional
   webServer routes".
3. **Standalone vs bundled mode**: storage is plain filesystem under the DSH home
   (`~/.dsh/artifacts/…`), independent of the host; HQ Edge can re-serve the same store or proxy
   it. No host-specific code is needed inside the plugin beyond optional env/config.
4. Scope stays limited: artifact lifecycle (create / read / delete) for GenAI outputs (schematic,
   symbol, footprint, metadata). No generic platform needed.

Conclusion: keep `dsh-artifacts` as a **plugin (service provider + webServer routes)**, not a
library. The current shape is correct.

---

## Deployment Options

### Option A — Published npm packages + HQ Edge package dependencies

```
dsh-pcb-eda  --publish-->  npm registry  --install-->  hq-edge  --package-->  final app
```

- HQ Edge declares `@huaqiu/dsh-*` as regular dependencies of `@hqedge/server` (or a dedicated
  runtime package) and relies on `dsh plugin add`/pnpm at **build** time to materialize a profile;
  the shipped runtime contains the already-installed profile.
- **Is it officially supported?** Yes — registry deps are the primary install path.
- **Dependencies**: resolved by pnpm at install; peers (`cordis`, `dsh-tools`) resolve via the
  profile's hoisted node_modules + `healProfilesModuleFallback`.
- **Works for production packaging?** Partially. It is the cleanest dev flow, but it makes the
  final runtime depend on a pnpm-installed profile tree; HQ Edge currently avoids pnpm at runtime,
  and a re-materialized profile at first launch is undesirable. Also the peer layout
  (profile `nodeLinker: hoisted`) differs from the flat npm-tree runtime HQ Edge ships.
- **Complexity**: low (declarative) but conflicts with HQ Edge's "no runtime package manager, flat
  self-contained npm tree" constraint.

### Option B — Published plugin artifacts copied into the HQ Edge distribution  ⭐

```
dsh-pcb-eda  --publish-->  npm registry
                                │ (HQ Edge build: `pnpm pack` / download exact tarballs, pinned by version)
                                ▼
                     <dist>/dsh-plugins/@huaqiu/<pkg>/   (immutable, versioned)
                                │ (existing DshSupervisor: copy verbatim + symlink into profile node_modules + --patch overlay)
                                ▼
                     DSH runtime
```

- **Is it officially supported?** Yes — `dsh plugin add <tarball|file:|link:>` and the
  overlay/patch mechanism are first-class. HQ Edge already implements the materialization side.
- **Dependencies**: the tarball is `npm pack` output containing `lib/` + `cordis.patch.yml` +
  `package.json`; peers resolve from the profile node_modules + install-closure fallback.
- **Key property**: the artifact shipped inside HQ Edge is **byte-identical** to what a standalone
  DSH user installs from npm (`npm pack` tarball), satisfying the "same artifact tested standalone
  = shipped" principle.
- **Cross-platform**: pure JS packages (plus the `@huaqiu/part-search` lib); no native deps in the
  plugin set.
- **Version pinning**: exact versions in a lockfile/manifest; `pluginSetVersion` already exists in
  HQ Edge's materialization model.
- **Complexity**: low — reuses the existing supervisor machinery; only the plugin *source* changes.

### Option C — Source / workspace integration

```
hq-edge  --local checkout or git submodule/workspace-->  dsh-pcb-eda  --build during HQ Edge packaging-->  runtime
```

- Possible (HQ Edge is a pnpm workspace and could add `dsh-pcb-eda` as a workspace dep), but
  reintroduces a coupling HQ Edge is deliberately removing ("no duplicate source" and DSH as the
  runtime boundary). It forces HQ Edge's CI to build dsh-pcb-eda every release, defeats
  version-pinning as the single source of truth, and makes the shipped plugin untested-as-published.
- Not recommended except as a transient local dev convenience.

---

## Comparison

| Project | Distribution | Build | Dependencies | Plugin discovery | Relevant lesson |
|---|---|---|---|---|---|
| `@deepseek-ai/dsh-base` / `dsh-web-app` (in-box) | npm package | tsdown | none (bundled rows) | `dsh.profile.bundles` template | A bundle is just a package with `dsh.bundle.patch`; in-box = shipped inside the dsh install |
| `dsh-auth-gate` | npm package, dual-face | (own) | `dsh-storage-domain`, schemastery | `dsh.profile.bundles` + patch | Auth = service provider: `ctx.provide('auth', …)`; per-deploy config via overlay/user layer |
| `dsh-pcb-parts-search` | npm package, node-only | (own) | `dsh-tools`, `dsh-invariants` (peers) | `cordis.patch.yml` insert | Tool plugin = one inserted row; tools via `defineTool` from `dsh-tools` |
| `dsh-toolkit` | npm package | (own) | `dsh-tools` (peers) | `cordis.patch.yml` | Toolkits are plain bundles; tools SDK is peer-dep |
| `dsh-bridge` | npm package, dual-face | (own) | `ws` | `cordis.patch.yml` | Dual-face + client injects; external-host communication via services |
| `dsh-web` | npm package (**meta/aggregator**) | — | `@linxin666/dsh-web-all` | re-exports dep's `cordis.patch.yml` as its own bundle patch | **A meta-package that aggregates plugins and re-exports a combined patch is a validated community pattern** |
| `deepseek-harness-remote` | npm + GitHub Release | tsdown | — | — | Release = tag `v*`, OIDC publish, version/tag validation |
| **`@huaqiu/dsh-*` (current)** | npm package, dual/node | tsdown | `dsh-auth`/`dsh-artifacts` peers | `cordis.patch.yml` insert + `dsh.profile.bundles` | Already matches the community shape |

---

## Recommended Architecture

### Repository Ownership

```
dsh-pcb-eda  (source of truth for reusable DSH plugins)
├── dsh-auth
├── dsh-artifacts
├── dsh-tool-part-search        (thin wrapper around @huaqiu/part-search)
├── dsh-tool-schematic-gen
└── dsh-tool-symbol-footprint

hq-edge  (HQ Edge-owned code, kept in hq-edge)
├── edge-bridge                  (the `hqEdge` host service — HQ Edge-specific by design)
├── erc                          (internal ERC tool — HQ Edge-specific)
└── packages/part-search         (@huaqiu/part-search library — source of truth stays in
                                  hq-edge; published to npm; consumed by the server,
                                  huaqiu-client, and the dsh-tool-part-search wrapper)
```

`part-search`, `schematic-gen`, `symbol-footprint` **no longer exist as plugin copies under
`hq-edge/apps/server/dsh-plugins`**. The `@huaqiu/part-search` *library* under
`hq-edge/packages` is **deliberately retained in hq-edge** — it is not a plugin and does not move
to dsh-pcb-eda. Its capability reaches skills / DSH plugins only through the **thin-wrapper**
plugin `@huaqiu/dsh-tool-part-search` (owned by dsh-pcb-eda), which consumes the published npm
library.

### Package Publishing

- **Public npm registry**, five packages published as one release (shared version), because
  auth/artifacts are peer-deps of the tools and must move together.
- Git tag `vX.Y.Z` = every package version; tag-triggered release workflow with OIDC
  (`pnpm publish --provenance`). Already implemented in `dsh-pcb-eda/.github/workflows/release.yml`
  and `scripts/*.mjs` (built + validated in the prior task).
- **`@huaqiu/part-search` is published from hq-edge, not from dsh-pcb-eda.** Its release is
  hq-edge's own responsibility (it has its own build scripts — `build`/`build:cjs`/`build:esm` —
  and `files: ["dist/", …]`); dsh-pcb-eda only *consumes* the published version. The plugin set's
  shared-version release is decoupled from the library's release cadence: the `dsh-tool-part-search`
  wrapper pins a range (`^0.2.0`), so a library bump does not force a plugin re-release unless the
  wrapper needs a new capability.
- No private registry, no changesets, no custom distribution format — the repo scale does not
  justify them.
- `@huaqiu/dsh-web`-style meta-package is **not needed now** (explicitly a non-goal unless a real
  need appears); it is the documented fallback if HQ Edge ever wants a single dependency to pull
  the whole set.

### HQ Edge Consumption

**Model: Option B (published artifacts → copied into the distribution), reusing the existing
`DshSupervisor` materialization machinery.**

- **Where dependencies are declared**: a new hq-edge packaging manifest (or an extension of the
  existing `pluginSetVersion` manifest) listing the five `@huaqiu/dsh-*` **exact versions** to
  bundle (e.g. a `dsh-plugins.lock.json` or entries in `config/dsh.lock.yaml`-style file).
- **When packages are installed**: at **HQ Edge build time** — `pnpm pack` the pinned
  `@huaqiu/dsh-*` versions (or `npm pack`/`pnpm pack <pkg>@<ver>`) into
  `<dist>/dsh-plugins/@huaqiu/…/` tarballs (or unpacked package dirs), alongside the existing
  `edge-bridge` + `erc` local packages. No npm/pnpm at end-user runtime.
- **What is copied into the final runtime**: `dist/edge-headless/` =
  server + web + ecad-runtime + `dsh/` (pinned DSH npm closure) + `dsh-plugins/`
  (`edge-bridge`, `erc` local; `@huaqiu/*` pinned tarballs).
- **How DSH discovers them**: unchanged — `DshSupervisor` copies each package verbatim into
  `DSH_HOME/hq/builtin-plugins/<pluginSetVersion>/`, symlinks into
  `profiles/web/node_modules/`, generates the `--patch` overlay, and spawns
  `dsh web --patch <overlay> --host 127.0.0.1 --port <port>`. The `--patch` overlay inserts the
  `@huaqiu/*` entries with `name` = published package name and injects `config.hqEdgeBaseUrl` on
  the auth row.

> Note on `--patch` overlay vs `dsh.profile.bundles`: both are supported. HQ Edge's overlay
> approach is retained because (a) it is already built, tested and atomic-versioned, (b) it
> injects per-deployment `config` (the `hqEdgeBaseUrl`) without touching the profile, and (c) it
> does not require writing the user-owned profile manifest. The published plugins *also* declare
> `dsh.bundle`, so a future switch to `dsh.profile.bundles` would be a one-line change — but it is
> not required.

### DSH Runtime Layout

```
Huaqiu EDA installation (cross-platform: win32 x64, macOS arm64/x64)
├── bin/                       # node + hq-edge server
├── dsh/                       # pinned DSH npm closure (flat, self-contained, verified)
├── dsh-plugins/
│   ├── manifest.json          # pluginSetVersion (exact @huaqiu/* + local versions)
│   ├── edge-bridge/           # hq-edge-owned (local source)
│   ├── erc/                   # hq-edge-owned (local source)
│   └── @huaqiu/
│       ├── dsh-auth/
│       ├── dsh-artifacts/
│       ├── dsh-tool-part-search/
│       ├── dsh-tool-symbol-footprint/
│       └── dsh-tool-schematic-gen/
│                            # pinned npm-pack artifacts from dsh-pcb-eda (build-time)
└── (user data, never in install)
    <user-data-root>/hq-edge/<version>/dsh-home/
        ├── profiles/web/node_modules/…   # symlinks to materialized plugins
        └── hq/builtin-plugins/<version>/… # verbatim copies + overlay.yml + current.json
```

This layout is grounded in DSH's own resolution: profile node_modules (two-anchor resolution:
install anchor → profile dir) + `healProfilesModuleFallback` for the install closure.

### Plugin Discovery

- Loader resolves `@huaqiu/*` from `profiles/web/node_modules` (symlinked by the supervisor).
- `ClientModuleRegistry` resolves the same names from `ctx.baseUrl` for `dsh.client` bundles.
- The `--patch` overlay lists the rows; each package's `cordis.patch.yml` is **not** consulted in
  this mode (the overlay replaces it). This is fine because the overlay rows carry the same
  `id`/`name`/`inject` the patch would. (Alternative: drop the overlay and use
  `dsh.profile.bundles` + each package's own `cordis.patch.yml` — see note above.)

### Development Workflow

**Standalone DSH dev (dsh-pcb-eda):**
```
cd dsh-pcb-eda
pnpm -r build
npx @deepseek-ai/dsh plugin --profile web add ./packages/dsh-auth        # link:
npx @deepseek-ai/dsh plugin --profile web add ./packages/dsh-artifacts
npx @deepseek-ai/dsh plugin --profile web add ./packages/dsh-tool-part-search
npx @deepseek-ai/dsh plugin --profile web add ./packages/dsh-tool-symbol-footprint
npx @deepseek-ai/dsh plugin --profile web add ./packages/dsh-tool-schematic-gen
npx @deepseek-ai/dsh web          # → http://127.0.0.1:3080
```
(`dsh plugin add <path>` uses `link:` semantics — **Verified from source**: `apps/cli/src/plugin.ts`
`anchorPathSpec`.)

**Local plugin change inside HQ Edge without publishing:**
- Simplest: run HQ Edge in **local DSH mode** (`DSH_LOCAL_PATH`), and use the standalone
  `dsh plugin add ./packages/...` flow against the same `DSH_HOME`, OR
- override the materialized plugin source: point the supervisor's source dir (or the
  `dsh-plugins/@huaqiu/<pkg>` unpacked dir) at the dsh-pcb-eda **build output**
  (`packages/<pkg>/{package.json,lib,cordis.patch.yml}`) and bump the dev `pluginSetVersion`; the
  existing fingerprint/version fast-path re-materializes on change.
- `pnpm pack`-style local tarball: `pnpm --dir packages/<pkg> pack` → point the packaging manifest
  at the local tarball path (mimics production exactly).

**Production/release workflow (distinct from dev):**
```
dsh-pcb-eda:  node scripts/bump.mjs X.Y.Z --apply
              git commit -m "chore: release vX.Y.Z" && git tag vX.Y.Z && git push --tags
              → release.yml: validate versions↔tag → build → check:publish → publish --provenance
hq-edge:      bump the pinned @huaqiu/* versions in the plugin manifest
              → package-runtime: pack/download pinned tarballs into dist/edge-headless/dsh-plugins/@huaqiu/
              → release edge-headless
```

### Production Build Workflow

1. `dsh-pcb-eda` CI/test/build → publish `@huaqiu/*@X.Y.Z` (OIDC).
2. `hq-edge` packaging reads the pinned `@huaqiu/*` versions, `pnpm pack`-sources each exact
   version (from registry or a local npm-store mirror) into `dist/edge-headless/dsh-plugins/@huaqiu/`.
3. `package-runtime.ts` assembles `dist/edge-headless`: server + web + ecad + `dsh/` (pinned DSH
   commit) + `dsh-plugins/` (edge-bridge, erc local + @huaqiu pinned).
4. First launch: `DshSupervisor` materializes the plugin set (version compare → atomic copy →
   symlink into profile node_modules → overlay) and spawns DSH.
5. End-user runtime performs **no** npm/pnpm operations.

### Versioning

- **One shared version** for the five packages (already enforced by `bump.mjs` /
  `check-release-version.mjs`). Independent versions would force per-package peer churn on every
  auth/artifacts bump.
- **Git tag = version**; no changesets (repo scale is small, single-release-unit). HQ Edge pins
  **exact** versions in its plugin manifest; upgrades are explicit and testable.

---

## Migration Implications

1. **Delete the duplicated plugin copies** under `hq-edge/apps/server/dsh-plugins/{part-search,
   schematic-gen,symbol-footprint}`; keep `edge-bridge` + `erc`.
2. **Change the plugin-source provider** in `DshSupervisor`/packaging: for `@huaqiu/*`, source
   from pinned npm-pack artifacts instead of the in-repo dirs; keep the verbatim copy +
   fingerprint + atomic-versioned materialization.
3. **Overlay entries** keep the same shape, but `name` now resolves to the published package; the
   auth row keeps `config: { hqEdgeBaseUrl }` — **unchanged contract**.
4. **The `@huaqiu/part-search` library stays in hq-edge.** `hq-edge/packages/part-search`
   remains the source of truth and keeps being published to npm from hq-edge; the server and
   `huaqiu-client` keep their `workspace:*` consumption. The only hq-edge-side removal is the
   duplicated *plugin* copy under `apps/server/dsh-plugins/part-search` — its role is taken over by
   the `@huaqiu/dsh-tool-part-search` thin wrapper (dsh-pcb-eda), which already depends on the npm
   library. No library migration is required.
5. **CI**: hq-edge's existing `verify` (typecheck/test/build/pack) does not touch publishing;
   publishing moves fully to dsh-pcb-eda's `release.yml`. No hq-edge workflow change is required
   for the plugin publish itself.
6. **Compatibility/installation matrix** (per the migration-plan review): publish the minimum DSH
   version each plugin needs (they peer `cordis ^4.0.1`, `dsh-tools >=0.1.0-rc.0 <0.2.0`) so
   users on older DSH get a clear error rather than a broken boot.

---

## Risks and Open Questions

1. **`@huaqiu/part-search` wrapper ↔ library version drift** — the library (hq-edge) and the
   wrapper plugin (dsh-pcb-eda) release independently. If the wrapper's `^0.2.0` range ever
   resolves to a library version whose API changed incompatibly, the tool breaks silently in DSH
   but fine in HQ Edge's server (which pins `workspace:*`). Mitigate with a `check-publish`-style
   guard that validates the wrapper against the *published* library version before release, and
   keep the library semver-minor-compatible while the wrapper is in use.
2. **Peer resolution in the flat npm-tree runtime** — the HQ Edge bundled DSH is a flat npm tree
   (no pnpm virtual store). The `@huaqiu/*` peers (`cordis`, `dsh-tools`) must resolve from the
   profile's node_modules + the install-closure fallback. Validate once with real tarballs before
   finalizing packaging (the existing symlink approach already proves this path).
3. **`react` peer for dual-face tools** — the client bundles extern `react`; the runtime must
   provide `react` in the browser module table (already required today; keep it in the published
   package's peer list).
4. **Version skew on first real release** — part-search's plugin package is already at `0.1.0`
   while the set was resynced to `0.1.0`; confirm whether `@huaqiu/dsh-tool-part-search@0.1.0`
   was actually published to npm before the first release (the publish script is idempotent, so a
   re-publish is skipped safely).
5. **`dsh.profile.bundles` vs `--patch` overlay** — documented both; retaining the overlay keeps
   HQ Edge's config injection and avoids writing the user-owned profile. Revisit only if upstream
   deprecates overlays (unlikely).
6. **Client bundle serving for copied packages** — `ClientModuleRegistry` reads
   `<pkg>/package.json` from `ctx.baseUrl`; the supervisor must keep symlinking into
   `profiles/web/node_modules` (already does) so `exports["./client"]` resolves.

---

## Recommended Next Steps

1. **Freeze the `@huaqiu/part-search` ownership boundary in code/docs**: keep the library in
   hq-edge (`packages/part-search`, published to npm, `workspace:*` for server + huaqiu-client),
   and confirm the `@huaqiu/dsh-tool-part-search` thin wrapper is the only DSH entry point to it.
   Add the wrapper↔library version-drift guard (see Risks §1) before the first release.
2. **Cut over the plugin source**: change hq-edge packaging to pull pinned `@huaqiu/dsh-*` npm
   artifacts (tarballs) for the three migrated tools (+ auth + artifacts) and keep
   `edge-bridge`/`erc` local. Reuse the existing materialization/overlay/symlink machinery.
3. **Verify once with real artifacts**: build a release tarball set, boot `dist/edge-headless` on
   the three target platforms (win32 x64, macOS arm64/x64), confirm `/plugins/@huaqiu/…/client.js`
   serves and the tools boot (auth login, artifact store, one schematic + one symbol/footprint
   HIT, one part-search call through the wrapper).
4. **Publish the first full `@huaqiu/*` set** to npm via the tag-triggered workflow (idempotent,
   OIDC), then pin it in hq-edge. Publish/`bump` any needed `@huaqiu/part-search` library version
   from hq-edge independently (see Package Publishing).
5. **Add the compatibility/installation matrix** to the README (minimum DSH version per plugin).
6. **Optional future**: if a single-dependency integration becomes attractive, publish an
   aggregator package (`@huaqiu/dsh-pcb-eda-bundle` style, modeled on `dsh-web`) that re-exports a
   combined `cordis.patch.yml` — only if a concrete need appears.

---

## Source References

- DSH profile/bundle contract: `deepseek-harness/packages/boot/app-boot/src/profile.ts`
  (PROFILES_DIR, `resolveProfileDir`, `dsh.bundle.patch`, `dsh.profile.bundles`,
  `resolveBundleDir`, `healProfilesModuleFallback`, `loadProfile`).
- DSH boot composition: `deepseek-harness/apps/cli/src/profile-boot.ts` (`composeProfile`,
  `runProfile`, `INSTALL_ANCHOR`).
- DSH plugin manager: `deepseek-harness/apps/cli/src/plugin.ts` (`runPlugin`, `reconcilePlugins`,
  `anchorPathSpec`).
- Loader: `deepseek-harness/vendor/loader/src/index.ts` (Loader service, `unwrapExports`),
  `vendor/loader/src/config/entry.ts` (EntryOptions, import → registry.plugin).
- Patch dialect: `deepseek-harness/vendor/include/src/index.ts` (`applyEntryPatches`,
  `PatchOptions`, `Include`).
- Client module system: `deepseek-harness/packages/client/modules/src/index.ts`
  (`dsh.client`, `/plugins/<id>/client.js`, `__DSH_BOOT__`, `ClientModuleRegistry`).
- Home paths: `deepseek-harness/packages/util/home-paths/src/index.ts` (`resolveDshHome`,
  `DSH_HOME`, `~/.dsh`).
- DSH distribution: `deepseek-harness/dist/npm`, `packages/bundle/{base,web-app}/package.json`,
  `python/sdk-runtime`.
- HQ Edge runtime resolution + spawn: `hq-edge/apps/server/src/dsh/resolver.ts`,
  `apps/server/src/dsh/supervisor.ts` (materialize → symlink → overlay → spawn), `config.ts`.
- HQ Edge home: `hq-edge/apps/server/src/dsh/dshHome.ts`.
- HQ Edge packaging: `hq-edge/scripts/packaging/bundle-dsh.ts`, `dsh-npm-pack.ts`,
  `scripts/package-runtime.ts`.
- HQ Edge current plugins: `hq-edge/apps/server/dsh-plugins/*/package.json`.
- Huaqiu plugins: `dsh-pcb-eda/packages/*/package.json`, `*/cordis.patch.yml`,
  `packages/dsh-auth/src/index.ts`, `packages/dsh-tool-schematic-gen/src/client/index.ts`,
  `packages/*/tsdown.config.ts`.
- Ecosystem: `dsh-plugin/dsh-auth-gate/{package.json,cordis.patch.yml,src/index.ts}`,
  `dsh-plugin/dsh-pcb-parts-search/{package.json,cordis.patch.yml,src/index.ts}`,
  `dsh-plugin/dsh-toolkit/package.json`, `dsh-plugin/dsh-web/package.json`,
  `dsh-plugin/dsh-bridge/package.json`, `dsh-plugin/deepseek-harness-remote/.github/workflows/release.yml`.
