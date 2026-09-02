# Task Spec — Migrate HQ Edge to Published DSH Plugins

**Status:** IMPLEMENTATION TASK  
**Goal:** Remove duplicated DSH plugin implementations from `hq-edge` and make HQ Edge consume the published `@huaqiu/dsh-*` packages from `dsh-pcb-eda`.

## 1. Objective

Migrate HQ Edge from its duplicated local copies of:

- `part-search`
- `schematic-gen`
- `symbol-footprint`

to the published DSH plugin packages from:

`/Users/admin/code/dsh-pcb-eda`

HQ Edge must consume these packages as **published npm artifacts**, materialize them into its existing DSH runtime/plugin layout, and continue launching DSH exactly as it does today.

Also migrate:

- `@huaqiu/dsh-auth`
- `@huaqiu/dsh-artifacts`

into the same bundled plugin set.

The final architecture must have:

```text
dsh-pcb-eda
  ├── @huaqiu/dsh-auth
  ├── @huaqiu/dsh-artifacts
  ├── @huaqiu/dsh-tool-part-search
  ├── @huaqiu/dsh-tool-schematic-gen
  └── @huaqiu/dsh-tool-symbol-footprint

          publish to npm
                │
                ▼

hq-edge
  ├── edge-bridge                  # HQ Edge-owned
  ├── erc                          # HQ Edge-owned
  └── packages/part-search         # HQ Edge-owned library
       │
       └── published @huaqiu/part-search
                │
                ▼
       dsh-tool-part-search
```

## 2. Non-goals

Do **not**:

- redesign DSH plugin loading;
- modify DeepSeek Harness;
- introduce a new plugin runtime;
- introduce npm/pnpm operations at end-user runtime;
- move `@huaqiu/part-search` out of HQ Edge;
- move `erc` to `dsh-pcb-eda`;
- move `edge-bridge` to `dsh-pcb-eda`;
- create a new plugin registry;
- introduce Changesets;
- introduce a custom plugin package format;
- introduce a DSH aggregator/meta-package;
- duplicate plugin source into HQ Edge;
- rewrite `dsh-auth` into an HQ Edge-specific implementation;
- rewrite `dsh-artifacts` into an HQ Edge-specific implementation.

Prefer the existing HQ Edge implementation wherever possible.

## 3. Source of Truth

### dsh-pcb-eda owns

```text
packages/dsh-auth
packages/dsh-artifacts
packages/dsh-tool-part-search
packages/dsh-tool-schematic-gen
packages/dsh-tool-symbol-footprint
```

These are the source of truth for the corresponding DSH plugins.

### hq-edge owns

```text
apps/server/dsh-plugins/edge-bridge
apps/server/dsh-plugins/erc
packages/part-search
```

`@huaqiu/part-search` remains an HQ Edge library.

The DSH part-search plugin is only a thin adapter around the published library.

## 4. Required HQ Edge Changes

Inspect the existing implementation first:

```text
apps/server/src/dsh/supervisor.ts
apps/server/src/dsh/resolver.ts
apps/server/src/dsh/dshHome.ts
apps/server/src/dsh/config.ts
scripts/packaging/package-runtime.ts
scripts/packaging/bundle-dsh.ts
scripts/packaging/dsh-npm-pack.ts
apps/server/dsh-plugins/*
```

Preserve the current flow:

```text
plugin artifact
    ↓
materialize into DSH home
    ↓
symlink into profiles/web/node_modules
    ↓
generate --patch overlay
    ↓
dsh web --patch ...
```

Do not replace this with runtime `pnpm install`.

## 5. Plugin Manifest

Introduce the smallest possible mechanism for declaring the exact Huaqiu plugin versions consumed by HQ Edge.

For example:

```text
config/dsh-plugins.lock.json
```

or an equivalent existing HQ Edge manifest.

It should explicitly contain:

```json
{
  "@huaqiu/dsh-auth": "0.1.0",
  "@huaqiu/dsh-artifacts": "0.1.0",
  "@huaqiu/dsh-tool-part-search": "0.1.0",
  "@huaqiu/dsh-tool-schematic-gen": "0.1.0",
  "@huaqiu/dsh-tool-symbol-footprint": "0.1.0"
}
```

Use the actual released versions.

Requirements:

- exact versions only;
- no `^`;
- no `~`;
- no floating `latest`;
- one obvious source of truth;
- easy to review in Git;
- upgrades require an explicit HQ Edge change.

Do not build a general dependency-management framework.

## 6. Build-Time Artifact Acquisition

At HQ Edge build time, acquire the exact npm package artifacts.

Preferred artifact:

```text
npm pack
```

or the equivalent `pnpm pack` result.

The package shipped by HQ Edge must be the same package artifact that an ordinary DSH user could install from npm.

The build should produce something conceptually equivalent to:

```text
dist/edge-headless/dsh-plugins/
  @huaqiu/
    dsh-auth/
    dsh-artifacts/
    dsh-tool-part-search/
    dsh-tool-schematic-gen/
    dsh-tool-symbol-footprint/
```

The implementation may choose tarballs or unpacked package directories, but keep the existing `DshSupervisor` contract as simple as possible.

### Important

Do not make HQ Edge depend on the `dsh-pcb-eda` source checkout at runtime.

Do not make the final application require:

```text
pnpm install
npm install
dsh plugin add
```

at first launch.

## 7. Remove Duplicated Plugins

Delete the duplicated implementations:

```text
hq-edge/apps/server/dsh-plugins/part-search
hq-edge/apps/server/dsh-plugins/schematic-gen
hq-edge/apps/server/dsh-plugins/symbol-footprint
```

Keep:

```text
hq-edge/apps/server/dsh-plugins/edge-bridge
hq-edge/apps/server/dsh-plugins/erc
```

Check all imports and packaging references before deleting them.

There must be no second implementation of the migrated plugin source remaining in HQ Edge.

## 8. Existing HQ Edge Plugin Materialization

Update `DshSupervisor.ensureHQBuiltinPlugins()` or the smallest appropriate abstraction so that its input becomes:

```text
HQ Edge-owned plugins
    +
published @huaqiu plugin artifacts
```

rather than:

```text
HQ Edge apps/server/dsh-plugins/*
```

The existing behavior should remain:

1. discover/materialize the selected plugin set;
2. copy package contents;
3. atomically update the active version;
4. symlink packages into:

```text
$DSH_HOME/profiles/web/node_modules/
```

5. generate the overlay;
6. start:

```text
dsh web --patch <overlay>
```

Preserve the current fingerprint/version optimization if already implemented.

## 9. Overlay

Keep the existing overlay approach.

The overlay should contain rows equivalent to:

```yaml
- insert:
    - id: huaqiu-auth
      name: "@huaqiu/dsh-auth"
      config:
        hqEdgeBaseUrl: ...
    - id: huaqiu-artifacts
      name: "@huaqiu/dsh-artifacts"
    - id: huaqiu-tool-part-search
      name: "@huaqiu/dsh-tool-part-search"
    - id: huaqiu-tool-symbol-footprint
      name: "@huaqiu/dsh-tool-symbol-footprint"
    - id: huaqiu-tool-schematic-gen
      name: "@huaqiu/dsh-tool-schematic-gen"
```

Use the actual IDs from the published packages where appropriate.

Do not duplicate the package's `cordis.patch.yml` into HQ Edge.

The package itself remains responsible for its DSH bundle declaration.

The HQ Edge overlay is only the host-specific activation layer.

## 10. Authentication

Do not add authentication logic to the migrated tool plugins.

The intended dependency direction is:

```text
dsh-auth
   │
   ├── provides huaqiuAuth
   │
   ├── standalone → auth.eda.cn
   │
   └── HQ Edge → HQ Edge auth endpoint

schematic-gen ─────┐
symbol-footprint ──┴── inject huaqiuAuth
```

HQ Edge should continue supplying:

```text
config.hqEdgeBaseUrl
```

through the overlay.

The implementation must not make:

```text
schematic-gen → hq-edge internal auth
symbol-footprint → hq-edge internal auth
```

or similar dependencies.

The other DSH plugins should only know about the `dsh-auth` service contract.

## 11. Artifacts

`@huaqiu/dsh-artifacts` remains a DSH service-provider plugin.

Tools should consume its service rather than directly accessing HQ Edge artifact internals.

Preserve:

```text
huaqiuArtifacts
```

as the plugin service boundary.

Do not introduce an HQ Edge-specific artifact API unless an existing integration is actually broken by the migration.

## 12. Part Search Boundary

This boundary is important and must not be accidentally changed.

HQ Edge remains the source of truth for:

```text
hq-edge/packages/part-search
```

It continues to publish:

```text
@huaqiu/part-search
```

The DSH plugin:

```text
@huaqiu/dsh-tool-part-search
```

consumes the published npm library.

Therefore:

```text
hq-edge
  └── @huaqiu/part-search
             ↑
             │ npm
             │
dsh-pcb-eda
  └── @huaqiu/dsh-tool-part-search
```

There must be no dependency from `dsh-pcb-eda` back to an HQ Edge source path.

Do not move the library merely because the DSH wrapper moved.

## 13. Version Compatibility

Verify the actual dependency ranges of:

```text
@huaqiu/dsh-auth
@huaqiu/dsh-artifacts
@huaqiu/dsh-tool-part-search
@huaqiu/dsh-tool-schematic-gen
@huaqiu/dsh-tool-symbol-footprint
```

Verify their requirements for:

```text
cordis
dsh-tools
dsh-host-webserver
react
```

The HQ Edge bundled DSH runtime must satisfy these requirements.

If a mismatch exists, fix the package/runtime compatibility rather than adding hacks to HQ Edge.

## 14. Client Plugin Verification

For:

```text
dsh-auth
dsh-tool-schematic-gen
dsh-tool-symbol-footprint
```

verify that their published package artifacts contain the required client export:

```text
exports["./client"]
```

and the generated client bundle.

Verify that the existing `ClientModuleRegistry` can resolve the package through:

```text
profiles/web/node_modules/@huaqiu/...
```

and serve:

```text
/plugins/<id>/client.js
```

Do not add a special HQ Edge client loader.

## 15. Local Development

Keep production consumption artifact-based, but provide a minimal developer path.

It must be possible to test local plugin changes without publishing a release first.

Acceptable mechanisms include:

```text
pnpm pack
```

from the relevant `dsh-pcb-eda` package followed by using that local artifact in HQ Edge.

A direct local source override may also be retained if it already exists.

Do not make local workspace coupling the production architecture.

## 16. Build Verification

First verify each published package independently:

```text
npm/pnpm pack
```

Inspect the generated artifact.

Confirm it contains at minimum:

```text
package.json
lib/
cordis.patch.yml
```

and, for dual-face plugins:

```text
lib/client.js
```

Then build HQ Edge using those exact artifacts.

Verify:

```text
dist/edge-headless/
```

contains the expected plugin set.

## 17. Runtime Verification

Start the packaged HQ Edge distribution.

Verify:

### Plugin resolution

All five packages resolve successfully:

```text
@huaqiu/dsh-auth
@huaqiu/dsh-artifacts
@huaqiu/dsh-tool-part-search
@huaqiu/dsh-tool-schematic-gen
@huaqiu/dsh-tool-symbol-footprint
```

### Services

Verify:

```text
huaqiuAuth
huaqiuArtifacts
```

are available to their consumers.

### Tools

Verify at least:

- one part-search call;
- one schematic generation invocation;
- one symbol/footprint operation.

### Client

Verify the browser can load the client bundles for:

- auth;
- schematic-gen;
- symbol-footprint.

### Host mode

Verify `dsh-auth` uses HQ Edge host mode when:

```text
hqEdgeBaseUrl
```

is supplied.

### Standalone mode

Do not regress standalone `dsh-pcb-eda` operation.

The packages must remain usable outside HQ Edge.

## 18. Cross-Platform Verification

The plugin packages are expected to remain platform-independent.

Verify the final HQ Edge packaging on the existing target matrix:

```text
Windows x64
macOS arm64
macOS x64
```

Do not introduce native dependencies into the plugin deployment mechanism.

## 19. Part-Search Version Guard

Investigate the existing:

```text
@huaqiu/dsh-tool-part-search
    → @huaqiu/part-search
```

version relationship.

Before release, ensure the wrapper is tested against the **published** library artifact rather than only the HQ Edge workspace dependency.

A small CI/release validation is acceptable.

Do not build a generic dependency synchronization system.

## 20. Documentation

Update the relevant HQ Edge documentation to explain:

```text
dsh-pcb-eda
    ↓ npm publish
@huaqiu/dsh-* artifacts
    ↓ exact version pin
hq-edge packaging
    ↓
DshSupervisor materialization
    ↓
DSH
```

Document the ownership boundary:

```text
dsh-pcb-eda:
  reusable DSH plugins

hq-edge:
  host integration
  ERC
  part-search library
```

Also document how to upgrade the plugin set.

## 21. Acceptance Criteria

The migration is complete only when all of the following are true:

- [ ] duplicated `part-search` plugin source is removed from HQ Edge;
- [ ] duplicated `schematic-gen` plugin source is removed from HQ Edge;
- [ ] duplicated `symbol-footprint` plugin source is removed from HQ Edge;
- [ ] `edge-bridge` remains HQ Edge-owned;
- [ ] `erc` remains HQ Edge-owned;
- [ ] `@huaqiu/part-search` remains HQ Edge-owned;
- [ ] all five reusable DSH plugins come from published package artifacts;
- [ ] HQ Edge pins exact plugin versions;
- [ ] no npm/pnpm operation is required at end-user runtime;
- [ ] existing DshSupervisor materialization is reused;
- [ ] existing DSH `--patch` startup mechanism is reused;
- [ ] `dsh-auth` remains the authentication service boundary;
- [ ] `dsh-artifacts` remains the artifact service boundary;
- [ ] tool plugins do not directly depend on HQ Edge internals;
- [ ] part-search wrapper consumes the published `@huaqiu/part-search`;
- [ ] client bundles load from the published package artifacts;
- [ ] standalone DSH plugin operation remains functional;
- [ ] packaged HQ Edge boots successfully;
- [ ] Windows x64 packaging works;
- [ ] macOS arm64 packaging works;
- [ ] macOS x64 packaging works;
- [ ] no unrelated architecture refactoring is introduced.

## 22. Implementation Principle

**Delivery first.**

Prefer:

```text
existing DshSupervisor
+
existing overlay
+
existing symlink/materialization
+
published npm artifacts
```

over introducing a new abstraction.

The desired diff should primarily change:

```text
"where HQ Edge gets plugins from"
```

rather than:

```text
"how DSH plugins work".
```

If the implementation discovers that the existing materialization code cannot consume the published artifacts directly, make the **smallest possible adapter** and document why it is necessary.

Do not solve hypothetical future plugin-distribution requirements.