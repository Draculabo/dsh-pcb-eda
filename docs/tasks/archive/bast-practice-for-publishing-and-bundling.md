# Research Task: Best Practice for Publishing DSH Plugins from dsh-pcb-eda and Bundling Them into HQ Edge

## Status

**RESEARCH ONLY — DO NOT IMPLEMENT**

## Expected output

Create the research report at:

```text
/Users/admin/code/dsh-pcb-eda/docs/research/dsh-plugin-deployment-and-hq-edge-bundling.md
```

Do not modify production code, package configuration, CI workflows, or deployment scripts as part of this task.

The purpose of this task is to understand the actual DSH plugin architecture and determine the simplest, robust deployment model for:

1. Developing and publishing reusable Huaqiu DSH plugins from `dsh-pcb-eda`.
2. Consuming and bundling those plugins into `hq-edge`.
3. Supporting both standalone DSH usage and the HQ Edge bundled runtime.
4. Avoiding duplicate plugin source trees and avoiding unnecessary packaging abstractions.

---

# 1. Background

There are currently duplicated DSH plugins between `hq-edge` and `dsh-pcb-eda`.

Current HQ Edge plugin directory:

```text
/Users/admin/code/hq-edge/apps/server/dsh-plugins

edge-bridge
erc
part-search
schematic-gen
symbol-footprint
```

Current `dsh-pcb-eda` packages:

```text
/Users/admin/code/dsh-pcb-eda/packages

dsh-artifacts
dsh-auth
dsh-tool-part-search
dsh-tool-schematic-gen
dsh-tool-symbol-footprint
```

The intended direction is to eliminate duplication.

The tentative ownership model is:

```text
dsh-pcb-eda
├── dsh-auth
├── dsh-artifacts
├── dsh-tool-part-search
├── dsh-tool-schematic-gen
└── dsh-tool-symbol-footprint

hq-edge
├── edge-bridge
└── erc
```

However, `hq-edge` must still bundle and ship the reusable packages from `dsh-pcb-eda`.

That includes:

```text
@huaqiu/dsh-auth
@huaqiu/dsh-artifacts

@huaqiu/dsh-tool-part-search
@huaqiu/dsh-tool-schematic-gen
@huaqiu/dsh-tool-symbol-footprint
```

Therefore this is not simply a repository ownership question.

The core research question is:

> What is the best practice for publishing/deploying DSH plugins from `dsh-pcb-eda`, then consuming and bundling the resulting plugin artifacts into the HQ Edge distribution?

---

# 2. Repository sources to inspect

The research MUST be based primarily on the actual local source code.

## 2.1 dsh-pcb-eda

Primary repository under design:

```text
/Users/admin/code/dsh-pcb-eda
```

Inspect at minimum:

```text
package.json
pnpm-workspace.yaml
packages/*/package.json
packages/*/src
scripts/
.github/workflows/
docs/
```

Understand:

- Current monorepo layout.
- Package boundaries.
- Current build tooling.
- Current `tsdown` configuration.
- Package output structure.
- Package dependencies.
- How plugins are currently developed and tested.
- Existing publish/versioning workflow, if any.
- Whether packages are currently independently publishable.
- Whether output is directly consumable by DSH.

Pay particular attention to:

```text
dsh-auth
dsh-artifacts
dsh-tool-part-search
dsh-tool-schematic-gen
dsh-tool-symbol-footprint
```

Map their dependency graph.

---

## 2.2 HQ Edge

Inspect:

```text
/Users/admin/code/hq-edge
```

Especially:

```text
apps/server/dsh-plugins/
apps/server/
package.json
pnpm-workspace.yaml
scripts/
.github/workflows/
packaging/build/distribution logic
```

Determine exactly:

1. How DSH is currently launched by HQ Edge.
2. How plugins are currently discovered.
3. How local plugins under:

```text
apps/server/dsh-plugins
```

are installed or made available.
4. Whether plugins are copied, bundled, symlinked, npm-installed, or dynamically loaded.
5. What the final shipped filesystem layout looks like.
6. Whether the existing three duplicated plugins are bundled as source or built artifacts.
7. How the current HQ Edge installer/runtime packaging pipeline works.
8. At which stage external plugin packages could be consumed.

Document the current flow end-to-end:

```text
source repository
    ↓
build
    ↓
plugin output
    ↓
HQ Edge packaging
    ↓
installer/runtime
    ↓
DSH process
    ↓
plugin discovery/loading
```

Do not assume the current mechanism is correct. First document what actually happens.

---

## 2.3 DeepSeek Harness / DSH source code

This is the most important reference for understanding the actual plugin contract.

Inspect:

```text
/Users/admin/code/deepseek-harness
```

The research MUST trace the plugin system through source code rather than relying only on README documentation.

At minimum investigate:

### Plugin discovery

Find:

- Where DSH searches for plugins.
- Default plugin directories.
- Environment variables affecting plugin discovery.
- CLI arguments affecting plugin discovery.
- Whether npm packages can be discovered automatically.
- Whether plugins must be explicitly installed.
- Whether plugin paths can be configured.

Trace from the DSH application entry point into the plugin loading implementation.

### Plugin manifest / package contract

Determine:

- What makes an npm package a DSH plugin.
- Required `package.json` fields.
- Required entry points.
- Plugin naming conventions.
- Manifest format, if any.
- Whether DSH loads from package metadata or filesystem conventions.
- Whether there is a distinction between local and installed plugins.

### Plugin runtime loading

Trace:

```text
DSH startup
    ↓
plugin discovery
    ↓
plugin resolution
    ↓
module loading
    ↓
plugin activation
    ↓
tool registration
```

Identify the exact source files and functions involved.

### Plugin installation model

Research:

- How plugins are normally installed by users.
- Whether DSH uses npm/pnpm package installation.
- Whether plugins are installed globally or into a DSH-specific directory.
- Whether DSH has its own plugin manager.
- How package dependencies are resolved at runtime.
- Whether a plugin can depend on another DSH plugin.

### Bundled / embedded DSH use case

Specifically determine whether the DSH architecture supports:

```text
host application
    └── bundled DSH runtime
            └── bundled plugins
```

without modifying DSH itself.

Find existing code or examples demonstrating:

- Embedded DSH distributions.
- Custom plugin roots.
- Programmatically configured plugin locations.
- Multiple plugin directories.
- Pre-installed plugins.

---

## 2.4 DSH plugin ecosystem repository

Inspect:

```text
/Users/admin/code/dsh-plugin
```

This repository should be used as a practical ecosystem reference.

Relevant projects include:

```text
DSH-better-sidebar
deepseek-harness-remote
dsh-genui
dsh-notifier
dsh-toolkit
Oh-My-DSH
dsh-auth-gate
dsh-bridge
dsh-market
dsh-pcb-parts-search
dsh-visualize
dsh-computer-use
dsh-context
dsh-git-worktree
dsh-mcp-panel
dsh-mnemon
dsh-openpencil
dsh-plugin-mermaid
dsh-plugin-open-app
dsh-web
```

Do not inspect every repository equally.

Prioritize plugins that demonstrate:

1. Publishing/installing as npm packages.
2. Plugin dependencies.
3. Runtime bridges.
4. Authentication.
5. Bundled web assets.
6. Complex build output.
7. Plugin marketplace/distribution.
8. Communication with external host applications.

Particularly investigate:

```text
dsh-auth-gate
dsh-bridge
dsh-market
dsh-toolkit
dsh-pcb-parts-search
deepseek-harness-remote
dsh-web
```

Compare their patterns against the actual DSH source code.

Identify which approaches are:

- Official or framework-supported.
- Community conventions.
- Project-specific hacks.
- Potentially unsuitable for a production bundled application.

---

# 3. Required research questions

The final report MUST explicitly answer the following.

---

## Question A: What exactly is a DSH plugin?

Based on the actual DeepSeek Harness source code:

- What files constitute a plugin?
- What package metadata is required?
- How does DSH identify a plugin?
- How does DSH load plugin code?
- How are tools registered?
- What is the lifecycle of a plugin?

Provide source-code-level evidence.

Do not provide a generic npm plugin explanation.

---

## Question B: What are the supported plugin deployment mechanisms?

Determine all realistic mechanisms supported by DSH.

For example, investigate whether these are possible:

### Option 1 — Local source directories

```text
dsh-plugins/
├── plugin-a/
└── plugin-b/
```

### Option 2 — Installed npm packages

```text
node_modules/
└── @huaqiu/
    ├── dsh-auth/
    └── dsh-tool-part-search/
```

### Option 3 — Dedicated plugin installation directory

```text
dsh-runtime/
└── plugins/
    ├── plugin-a/
    └── plugin-b/
```

### Option 4 — Prebuilt application distribution

```text
HuaqiuEDA/
├── dsh/
│   ├── runtime/
│   └── plugins/
```

Do not assume these all work.

For each option, state:

- Is it officially supported?
- Does the source code support it?
- Is it already used in the ecosystem?
- How dependencies resolve.
- Whether it works for production packaging.

---

## Question C: How should dsh-pcb-eda packages be published?

Evaluate the best package distribution model.

Potential approaches include:

### Independently published npm packages

```text
@huaqiu/dsh-auth
@huaqiu/dsh-artifacts
@huaqiu/dsh-tool-part-search
@huaqiu/dsh-tool-schematic-gen
@huaqiu/dsh-tool-symbol-footprint
```

### Private npm registry

### GitHub Packages

### Internal package registry

### Git dependency / tarball artifacts

### CI-generated plugin bundles

Evaluate based on:

- Developer workflow.
- Reproducibility.
- Version pinning.
- HQ Edge CI integration.
- Local development.
- Release management.
- Rollback.
- Cross-platform packaging.
- Dependency resolution.

The recommendation should favor the simplest production-ready solution.

Do not introduce a custom registry or distribution format unless there is a concrete requirement.

---

## Question D: How should HQ Edge consume plugins?

Determine the best consumption mechanism.

Compare at minimum:

### Model 1 — Normal package dependency

```json
{
  "dependencies": {
    "@huaqiu/dsh-auth": "x.y.z",
    "@huaqiu/dsh-artifacts": "x.y.z",
    "@huaqiu/dsh-tool-part-search": "x.y.z"
  }
}
```

Then copy/install the required packages into the DSH distribution.

### Model 2 — Dedicated plugin bundle package

For example:

```text
@huaqiu/dsh-pcb-eda-bundle
```

that aggregates all plugins.

### Model 3 — Download published release artifacts during HQ Edge build

### Model 4 — Git submodule / workspace dependency

### Model 5 — Copy source repositories during build

Evaluate each.

Explicitly consider the principle:

> The artifact tested as a standalone DSH plugin should ideally be the same artifact shipped inside HQ Edge.

---

## Question E: How should plugin dependencies work?

This is especially important because the Huaqiu plugin ecosystem has shared foundation plugins.

Current conceptual dependency graph:

```text
dsh-tool-part-search
        │
        └── dsh-auth

dsh-tool-schematic-gen
        │
        ├── dsh-auth
        └── dsh-artifacts

dsh-tool-symbol-footprint
        │
        ├── dsh-auth
        └── dsh-artifacts
```

Determine:

1. Whether one DSH plugin can depend on another npm package/plugin.
2. Whether DSH independently discovers dependency plugins.
3. Whether normal npm dependency resolution is sufficient.
4. Whether plugin activation ordering matters.
5. How shared singleton/state should work.

Specifically research whether:

```text
dsh-auth
```

and:

```text
dsh-artifacts
```

should be:

- Regular npm libraries.
- DSH plugins.
- Both.
- DSH capability providers.

Do not redesign them without evidence from the DSH architecture.

---

# 4. Authentication architecture to validate

The intended design direction is:

```text
Other DSH plugins
        │
        │ auth API
        ▼
    dsh-auth
        │
        ├──────────── standalone mode
        │                    │
        │                    ▼
        │                auth.eda.cn
        │
        └──────────── HQ Edge bundled mode
                             │
                             ▼
                        HQ Edge runtime
```

Individual plugins should not directly handle:

```text
auth.eda.cn iframe
login UI
token persistence
HQ Edge ports
HQ Edge authentication APIs
```

They should talk to `dsh-auth`.

Research and validate the best implementation mechanism inside DSH.

Questions to answer:

1. Can `dsh-auth` expose a shared service/API to other plugins?
2. Is normal npm import the correct mechanism?
3. Is DSH plugin service discovery required?
4. Can a plugin dependency be shared safely?
5. How should runtime-specific auth backends be selected?

Investigate whether the current proposed environment-based approach is appropriate:

```text
HQ Edge launches DSH
    ↓
injects HQ Edge runtime information
    ↓
dsh-auth detects HQ Edge environment
    ↓
uses HQ Edge auth integration
```

Compare this against any DSH-native configuration or capability mechanisms.

---

# 5. Artifact architecture to validate

`dsh-artifacts` handles artifacts/results generated in the DSH plugin world, especially GenAI outputs.

Examples may include:

```text
generated schematic
generated symbol
generated footprint
generation result metadata
files generated by AI tools
```

Other plugins should ideally use:

```text
dsh-tool-*
    ↓
dsh-artifacts
```

rather than each plugin independently implementing artifact lifecycle logic.

Research:

1. Whether DSH already has an artifact/result abstraction.
2. Whether there is an existing plugin ecosystem convention.
3. How plugins expose generated files/results.
4. Whether `dsh-artifacts` should be a plugin, library, or both.
5. How artifacts should work in standalone DSH versus HQ Edge bundled mode.

The goal is not to design a generic artifact platform.

Keep the scope limited to the actual needs of current Huaqiu GenAI tools.

---

# 6. HQ Edge bundling requirements

The final architecture must support shipping DSH inside the Huaqiu EDA application.

Target conceptual deployment:

```text
Huaqiu EDA installation
│
├── HQ Edge
│
├── DSH runtime
│
└── prebundled plugins
    ├── dsh-auth
    ├── dsh-artifacts
    ├── dsh-tool-part-search
    ├── dsh-tool-schematic-gen
    ├── dsh-tool-symbol-footprint
    ├── edge-bridge
    └── erc
```

Research the exact filesystem and runtime arrangement that best matches how DSH itself works.

Important constraints:

### No runtime npm installation

End users should not need:

```text
npm install
pnpm install
```

The application installer/runtime must already contain everything necessary.

### Cross-platform

Must work for:

```text
Windows x86_64
macOS arm64
macOS x86_64
```

If platform-specific native dependencies exist, identify them.

### Reproducible builds

HQ Edge must pin exact plugin versions.

### No source duplication

The following must not continue to have independent copies:

```text
part-search
schematic-gen
symbol-footprint
```

Their source of truth should be `dsh-pcb-eda`.

---

# 7. Development workflow research

Determine the best developer workflow for working across:

```text
dsh-pcb-eda
hq-edge
deepseek-harness
```

Evaluate at least:

## Independent development

```text
dsh-pcb-eda
    ↓
pnpm dev/test/build
    ↓
publish
    ↓
hq-edge consumes released version
```

## Local integration development

Developers need a practical way to test a local plugin change inside HQ Edge without publishing every iteration.

Research possible mechanisms:

```text
pnpm link
npm link
file:
workspace:
packed tarball
pnpm pack
dev override
copy build output
```

Recommend the simplest workflow that:

- Does not contaminate production dependency configuration.
- Does not require permanent symlinks in released builds.
- Produces behavior close to production.

Explicitly distinguish:

```text
development integration workflow
```

from:

```text
production/release workflow
```

---

# 8. CI/CD and versioning research

Research the minimum viable release pipeline.

Potential desired flow:

```text
dsh-pcb-eda change
        ↓
CI
        ↓
test
        ↓
build plugins
        ↓
publish version
        ↓
HQ Edge updates pinned version
        ↓
HQ Edge CI
        ↓
bundle DSH + plugins
        ↓
desktop distribution
```

Determine:

1. Whether all packages should share a version.
2. Whether independent versions are necessary.
3. Whether changesets or another release tool are justified.
4. Whether git tags are sufficient initially.
5. How HQ Edge should pin plugin versions.
6. How upgrades should be tested.

Avoid introducing complex release automation unless the current repository scale requires it.

---

# 9. Required comparison with existing DSH ecosystem patterns

The report should contain a concise comparison table:

| Project | Distribution mechanism | Build mechanism | Dependencies | Plugin discovery mechanism | Relevant lesson |
|---|---|---|---|---|---|

Include only genuinely relevant projects.

At minimum investigate candidates from:

```text
dsh-auth-gate
dsh-bridge
dsh-market
dsh-toolkit
dsh-pcb-parts-search
deepseek-harness-remote
dsh-web
```

The goal is to learn from real DSH plugin implementations, not to produce a catalog.

---

# 10. Required architecture options

The final report MUST present at least three realistic deployment architectures.

For each:

- Diagram.
- Build flow.
- Development flow.
- Release flow.
- Runtime filesystem layout.
- Advantages.
- Disadvantages.
- Complexity.
- Compatibility with DSH source architecture.

At minimum evaluate:

## Architecture A: Published npm packages + HQ Edge package dependencies

```text
dsh-pcb-eda
    ↓ publish
npm/private registry
    ↓ install
hq-edge
    ↓ package
final application
```

## Architecture B: Published plugin artifacts copied into HQ Edge distribution

```text
dsh-pcb-eda
    ↓ build artifact
release storage
    ↓ download
hq-edge packaging
```

## Architecture C: Source/workspace integration

```text
hq-edge
    ↓
local checkout/submodule/workspace
    ↓
build during HQ Edge packaging
```

You may add other options if strongly justified.

---

# 11. Decision criteria

Evaluate options primarily against:

| Criterion | Importance |
|---|---|
| Matches actual DSH plugin architecture | Critical |
| No duplicate plugin source | Critical |
| Production reproducibility | Critical |
| Simple developer workflow | High |
| Standalone DSH compatibility | High |
| HQ Edge bundling compatibility | High |
| Version pinning | High |
| Cross-platform support | High |
| Minimal new infrastructure | High |
| Minimal custom packaging logic | High |
| Future plugin scalability | Medium |

Do not optimize for theoretical plugin marketplace capabilities unless required.

---

# 12. Expected recommendation

The research report should conclude with one recommended architecture.

The recommendation must explicitly define:

## Repository ownership

Expected direction to validate:

```text
dsh-pcb-eda owns reusable Huaqiu DSH packages

hq-edge owns HQ Edge-specific plugins
```

## Package publishing model

For example:

```text
npm registry
private registry
GitHub Packages
release artifacts
```

based on actual findings.

## HQ Edge consumption model

Specify exactly:

- Where dependencies are declared.
- When packages are installed.
- What is copied into the final runtime.
- How DSH discovers them.

## Runtime layout

Provide a concrete example:

```text
HuaqiuEDA/
└── resources/
    └── dsh/
        ├── ...
        └── plugins/
            ├── ...
```

This layout must be based on DSH's actual discovery/loading mechanism.

## Local development workflow

Specify how a developer can test:

```text
local dsh-pcb-eda plugin change
```

inside:

```text
local HQ Edge
```

without publishing a production release.

## Production workflow

Specify the exact:

```text
build
→ publish
→ consume
→ bundle
→ release
```

sequence.

---

# 13. Explicit non-goals

Do NOT:

- Implement the architecture.
- Refactor all plugins.
- Delete duplicated plugins.
- Modify HQ Edge packaging.
- Introduce a plugin marketplace.
- Build a custom plugin registry.
- Create a universal artifact platform.
- Redesign DSH.
- Introduce a microservice architecture.
- Introduce Docker solely for plugin packaging.
- Add a meta-package/bundle package unless research demonstrates a real need.

The task is to understand the existing architecture first and recommend the smallest viable production solution.

---

# 14. Research methodology requirements

The LLM must distinguish clearly between:

### Verified from source

Example:

```text
Verified from:
deepseek-harness/packages/...
function/plugin loader implementation
```

### Verified from existing project

Example:

```text
Observed in:
dsh-plugin/dsh-auth-gate
```

### Assumption / inference

Example:

```text
Inference:
This packaging approach should work because...
```

Do not present assumptions as framework facts.

Where relevant, include:

```text
repository path
file path
symbol/function/class
```

so the implementation phase can quickly verify findings.

---

# 15. Required report structure

Create:

```text
/Users/admin/code/dsh-pcb-eda/docs/research/dsh-plugin-deployment-and-hq-edge-bundling.md
```

with this structure:

```markdown
# DSH Plugin Deployment and HQ Edge Bundling Research

## Executive Summary

## Scope and Repositories Investigated

## Current State

### dsh-pcb-eda

### hq-edge

### DeepSeek Harness Plugin Architecture

### Existing DSH Plugin Ecosystem Patterns

## How DSH Plugins Actually Work

### Plugin Discovery

### Plugin Package Contract

### Plugin Loading Lifecycle

### Plugin Dependencies

### Plugin Installation and Distribution

## Current Huaqiu Plugin Dependency Graph

## Authentication Architecture Findings

## Artifact Architecture Findings

## Deployment Options

### Option A

### Option B

### Option C

## Comparison

## Recommended Architecture

### Repository Ownership

### Package Publishing

### HQ Edge Consumption

### DSH Runtime Layout

### Plugin Discovery

### Development Workflow

### Production Build Workflow

### Versioning

## Migration Implications

## Risks and Open Questions

## Recommended Next Steps

## Source References
```

---

# 16. Quality bar

The report must be useful enough that the next implementation task can be written directly from it.

It should answer concrete questions such as:

> Which exact directory should the packaged plugins live in?

> How will DSH discover them?

> What exact artifact from `dsh-pcb-eda` is consumed by HQ Edge?

> Is that artifact an npm package, packed tarball, or copied distribution?

> How does `dsh-auth` communicate its service to other plugins?

> How does a local developer test an unpublished plugin change in HQ Edge?

> What exact dependency/version does HQ Edge pin?

> Which packages remain inside `hq-edge/apps/server/dsh-plugins`?

Do not produce a generic discussion of monorepo best practices.

The primary goal is a source-code-grounded answer to the actual deployment and runtime integration problem.