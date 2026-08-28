Yes. **I would approve this plan as the execution baseline**, with a few important changes before implementation starts.

The overall architecture is sound: move the three capabilities out of `hq-edge`, make them genuine DSH plugins, keep `@huaqiu/part-search` as a normal library dependency, introduce local artifacts as a DSH service, and make React/TS the normal client implementation.

The DSH side of the plan also aligns with the current upstream conventions: first-party tools are registered through `ctx.tools.register(defineTool(...))`, dependencies are declared through `inject`, and service providers are normal Cordis plugins. ([GitHub][1]) The `webServer` design is also a good fit: it is explicitly a named-route registry with disposers and duplicate-route protection. ([GitHub][2])

## Verdict

**Architecture: ✅ Approved**

**Migration direction: ✅ Approved**

**Package decomposition: ⚠️ Mostly approved, with one simplification**

**Execution phases: ✅ Good, but Phase 0 should be reordered slightly**

**Security model: ⚠️ Needs one important clarification around auth propagation**

**Artifact design: ✅ Strong**

**React migration strategy: ✅ Strong**

**Publishing strategy: ⚠️ Add a compatibility/installation matrix before publishing**

---

# 1. The biggest architectural decision is correct

The most important thing I agree with is:

> **DSH becomes the runtime boundary; HQ Edge disappears from the plugin dependency graph.**

The resulting dependency graph should look approximately like:

```text
                         DSH
                          │
             ┌────────────┼─────────────┐
             │            │             │
          dsh-auth     dsh-artifacts   dsh-tools
             │            │             │
             ├────────────┴──────┐      │
             │                   │      │
      symbol-footprint      schematic-gen
             │                   │
             └──────────┬────────┘
                        │
                 part-search
                        │
                @huaqiu/part-search
```

And critically:

```text
dsh-pcb-eda
      │
      ├── @huaqiu/dsh-auth
      ├── @huaqiu/dsh-artifacts
      ├── @huaqiu/dsh-tool-part-search
      ├── @huaqiu/dsh-tool-symbol-footprint
      └── @huaqiu/dsh-tool-schematic-gen

NO:
      └── @hqedge/*
```

That should be an explicit **acceptance criterion**, not merely an architectural aspiration.

I would add a CI check such as:

```bash
pnpm -r why @hqedge
```

and fail if any published package resolves an `@hqedge/*` dependency.

Also inspect generated bundles:

```bash
grep -R "@hqedge/" packages/*/lib
```

because a dependency can disappear from `package.json` while accidentally remaining bundled.

---

# 2. I would make `dsh-artifacts` a first-class service

This is one of the strongest parts of the proposal.

The current artifact service is already:

```text
filesystem
   +
meta.json
   +
content
```

so there is no reason to introduce a database merely because this is being migrated to DSH.

The DSH `webServer` is explicitly designed for plugins to register HTTP routes, including `/api` routes, and registrations return disposers. ([GitHub][3])

So this:

```text
tool
 │
 └── huaqiuArtifacts.create()
             │
             ▼
      ~/.dsh/artifacts/
             │
             ▼
        webServer
             │
             ▼
 browser fetch()
```

is much cleaner than:

```text
browser
  │
  ▼
tool
  │
  ▼
HTTP loopback
  │
  ▼
artifact server
```

### One change I'd make

Don't make the tool depend on the **HTTP API** of artifacts.

Your current proposal correctly says:

> Node tools use the service in-process.

Keep that as a hard rule.

The architecture should be:

```ts
interface HuaqiuArtifacts {
    create(...): Promise<ArtifactMetadata>
    get(id): Promise<ArtifactMetadata | null>
    readContent(id): Promise<Uint8Array>
    openStream(id): ...
    delete(id): Promise<void>
}
```

HTTP is merely an **adapter** around that service:

```text
HuaqiuArtifacts
       │
       ├── Node consumer
       │
       └── webServer adapter
```

That makes the service independently testable and avoids coupling the tools to route names.

---

# 3. Change the artifact URL namespace

I would **not** reuse:

```text
/api/v1/dsh/artifacts
```

even though compatibility makes it tempting.

Use something clearly owned by the new plugin:

```text
/api/v1/huaqiu/artifacts/:id
/api/v1/huaqiu/artifacts/:id/content
```

or, if you want DSH-facing semantics:

```text
/api/dsh/huaqiu/artifacts/:id
```

My preference:

```text
/api/v1/huaqiu/artifacts
```

because the resource belongs to the Huaqiu plugin rather than DSH itself.

This also avoids silently creating a de-facto global DSH API namespace.

And because `webServer` rejects duplicate routes, route ownership should be explicit. ([GitHub][2])

---

# 4. One important correction: don't make `userQuestions` an implicit mystery

Your current plan says:

> `userQuestions` stays opportunistic (`ctx.get('userQuestions')`, not injected)

I would change this.

If the plugin **requires** HIL for correctness, it should declare the dependency.

DSH's service model explicitly uses `inject` to ensure required services are ready before `apply()` runs. ([GitHub][4])

So if the dimension workflow fundamentally depends on:

```text
userQuestions
```

then prefer:

```ts
export const inject = [
    'huaqiuAuth',
    'huaqiuArtifacts',
    'tools',
    'userQuestions',
]
```

rather than:

```ts
ctx.get('userQuestions')
```

The latter makes a required capability look optional.

### Exception

If you intentionally support:

```text
DSH headless
    ↓
tool still works without HIL
```

then the opportunistic lookup is justified.

But that should be an explicit product decision.

For the interactive symbol/footprint plugin, I think **declaring the service is cleaner**.

---

# 5. Auth should be treated as a capability, not a token transport

This is the one area where I would tighten the design before coding.

Your proposed:

```ts
huaqiuAuth.auth.getAccessToken()
huaqiuAuth.auth.getUserInfo()
```

is good.

But schematic-gen currently has a fundamentally different authentication contract:

```text
x-user-id
x-user-token
```

while componentV2 has:

```text
?token=
```

Don't make the auth plugin promise that these are necessarily "the same token" internally.

Instead define the semantic contract:

```ts
interface HuaqiuAuthService {
    auth: {
        isAuthenticated(): boolean

        getAccessToken(): Promise<string | null>

        getUserInfo(): Promise<{
            id: string
            token: string
            nickname?: string
        } | null>
    }
}
```

Then each backend adapter decides what it needs:

```text
componentV2
    └── getAccessToken()

gen.eda.cn
    └── getUserInfo()
          ├── id
          └── token
```

That keeps the auth plugin from becoming coupled to either backend.

---

# 6. The browser → node auth synchronization deserves its own mini-project

I agree that this is the genuinely novel part.

But I would **not implement the whole auth plugin first**.

Instead:

### Phase 0A

Build a tiny proof:

```text
browser
   │
   │ login iframe
   ▼
auth.eda.cn
   │
   │ postMessage
   ▼
dsh-auth client
   │
   │ host RPC
   ▼
dsh-auth node
   │
   ▼
getAccessToken()
```

Test:

1. Login
2. token received
3. node receives token
4. tool reads token
5. logout
6. node token invalidated
7. token refresh/update
8. reload persistence

Only after that should the actual auth UI/service be expanded.

This reduces the risk of discovering in Phase 2 that the entire architecture cannot propagate credentials as expected.

---

# 7. I would change the phase ordering slightly

Your phases are good, but I'd make them:

```text
Phase 0
  ├── workspace
  ├── DSH package/build conventions
  └── stock-DSH install smoke test

Phase 0A
  └── dsh-auth browser ↔ node token propagation POC

Phase 0B
  └── dsh-artifacts + webServer

Phase 1
  └── part-search

Phase 2
  └── symbol-footprint Node

Phase 3
  └── symbol-footprint React client

Phase 4
  └── schematic-gen Node + React

Phase 5
  └── integration/release
```

The reason is that **Phase 0 should establish the actual DSH packaging contract first**, before you build five packages around assumptions.

The current DSH documentation confirms that `defineTool` + `ctx.tools.register()` is the canonical tool path. ([GitHub][1])

---

# 8. I would actually make Phase 1 the first published package

This is a very good choice:

> part-search first.

It has:

```text
no auth
no browser
no artifacts
no HIL
no WebSocket
no React
no renderer
```

So it validates:

```text
package.json
       ↓
cordis.patch.yml
       ↓
DSH plugin loading
       ↓
ctx.tools
       ↓
defineTool
       ↓
npm publish
       ↓
stock DSH install
       ↓
tool invocation
```

That's exactly the smallest vertical slice.

The official DSH examples follow essentially this model: plugin → `inject = ['tools']` → `ctx.tools.register(defineTool(...))`. ([GitHub][1])

---

# 9. Don't over-split `part-search`

Your proposed:

```text
tools/search.ts
tools/detail.ts
tools/models.ts
tools/supply-chain.ts
huaqiu.ts
```

is reasonable, but don't let the migration turn into artificial architecture.

The current DSH guidance explicitly cautions against splitting packages/capabilities prematurely. ([GitHub][5])

For the source files, I'd probably start:

```text
src/
  index.ts
  service.ts
  tools.ts
```

and split only if the files become large.

The important separation is:

```text
Huaqiu service
        ↓
DSH tool adapter
```

not necessarily four files.

---

# 10. React migration: don't port the 1,885-line client literally

This is another important recommendation.

The current client contains a lot of historical infrastructure:

```text
classic script
ModuleLoader
DOM manipulation
state machine
renderer bootstrapping
HIT logic
dimension editor
session handling
```

Don't translate:

```js
function foo() {
   ...
}
```

into:

```tsx
function foo() {
   ...
}
```

Instead extract the existing behavior into layers:

```text
                    project.ts
                       │
             ┌─────────┴─────────┐
             │                   │
       domain/state           transport
             │                   │
      DimensionModel       sessions/artifacts
             │                   │
             └─────────┬─────────┘
                       │
                    React UI
                       │
          ┌────────────┼────────────┐
          │            │            │
       GenHitCard  DimensionEditor Preview
```

Especially:

```text
dimensions.ts
```

should become almost completely UI-independent.

That gives you excellent tests for:

* geometry extraction
* dimension classification
* override validation
* BGA grid generation
* package silhouette
* handle movement
* normalization

before React is involved.

---

# 11. The dimension editor should remain a first-class component

This is particularly important given your earlier UX concern.

Don't treat:

```text
DimensionEditor
```

as just another part of `GenHitCard`.

I would make it an actual reusable component:

```tsx
<DimensionEditor
    geometry={geometry}
    dimensions={dimensions}
    onChange={...}
    onConfirm={...}
    onCancel={...}
/>
```

Then the HIT becomes:

```text
Generation result
      │
      ├── Preview
      │
      ├── Dimensions
      │      └── DimensionEditor
      │
      └── Actions
             ├── Regenerate
             ├── Accept
             └── Download
```

This is where the migration can materially improve the old UX instead of simply reproducing it.

---

# 12. The single-HIL rule is absolutely correct

I strongly agree with this part:

> **node `ask()` is authoritative; client dimension editor submits through sessions; don't re-add a second popup**

That should become a formal invariant:

```text
ONE generation interaction
        │
        ▼
one userQuestions request
        │
        ▼
React HIT renders the same interaction
        │
        ▼
session answer
        │
        ▼
tool resumes
```

Not:

```text
tool
 ├── userQuestions popup
 │
 └── React editor popup
```

That was exactly the sort of architectural duplication that produced the earlier UX problem.

---

# 13. Schematic-gen authentication should fail early

I would slightly strengthen:

> "log in to Huaqiu first"

The tool should resolve credentials **before making the CopilotKit request**.

Something like:

```text
resolveCredentials()
       │
       ├── env override
       │
       ├── authenticated Huaqiu user
       │
       └── otherwise:
              structured auth-required error
```

Don't let the request fail later with:

```text
401
403
invalid state
empty generation
SSE timeout
```

The tool should produce an explicit result:

```text
AUTH_REQUIRED
```

or equivalent structured error.

This also makes the HIT much easier to render.

---

# 14. Remove the env credential override from the normal architecture

I agree with keeping:

```text
HQ_EDA_USER_ID
HQ_EDA_USER_TOKEN
```

temporarily for development/testing.

But I would explicitly mark it:

```text
development / CI compatibility only
```

rather than making it a first-class production authentication mechanism.

The production priority should be:

```text
Huaqiu DSH auth
       ↓
getUserInfo()
```

Environment credentials should be:

```text
test/diagnostic escape hatch
```

and never documented as the recommended setup.

---

# 15. Artifact security needs one additional consideration

This statement:

> "opaque-id lookup exactly as hq-edge's design"

is fine for localhost, but I would not encode "random UUID therefore unauthenticated" as the permanent security model.

Use:

```text
unguessable ID
+
local-only DSH web server
+
size limits
+
TTL
+
path traversal protection
```

and consider:

```text
optional auth gate
```

later.

The current DSH webserver itself can bind to `127.0.0.1` or `0.0.0.0`; that makes the deployment boundary significant. ([GitHub][6])

So:

```text
127.0.0.1
```

→ opaque IDs are a reasonable MVP.

But:

```text
0.0.0.0
```

→ I would eventually want an authentication/authorization story.

---

# 16. Add artifact path hardening explicitly

The port should not literally preserve filesystem assumptions without reviewing:

```text
id
filename
baseDir
```

Requirements:

```text
id must match ^art_[0-9a-f]+$
```

and:

```text
filename
```

must never participate in the storage path.

Use:

```text
<artifact-id>/content
```

and keep filename only in metadata / Content-Disposition.

Also enforce:

```text
max artifact size
max metadata size
TTL
atomic write
symlink-safe access
```

This should be part of the `dsh-artifacts` tests.

---

# 17. `@huaqiu/ecad-renderer` bundling is correct for now

I agree with your corrected decision:

```text
@huaqiu/ecad-renderer
        │
        ▼
bundled into client.js
```

rather than:

```text
peer dependency
```

or:

```text
CDN
```

for the first release.

That gives:

```text
plugin
  └── client.js
       └── ecad-renderer
```

and makes the plugin genuinely self-contained.

I would simply add a release check:

```text
bundle size
gzip size
```

so duplication doesn't quietly become a problem.

Don't introduce `dsh-ecad-viewer` yet.

That would be premature abstraction.

---

# 18. One publishing change: don't publish all five blindly

I'd introduce a release dependency order:

```text
@huaqiu/dsh-auth
        ↓
@huaqiu/dsh-artifacts
        ↓
@huaqiu/dsh-tool-part-search
        ↓
@huaqiu/dsh-tool-symbol-footprint
        ↓
@huaqiu/dsh-tool-schematic-gen
```

But more importantly, add an **installation matrix**:

| Test              | Auth | Artifacts | Part | Symbol | Schematic |
| ----------------- | ---: | --------: | ---: | -----: | --------: |
| Node load         |    ✓ |         ✓ |    ✓ |      ✓ |         ✓ |
| Stock DSH         |    ✓ |         ✓ |    ✓ |      ✓ |         ✓ |
| Web profile       |    ✓ |         ✓ |    — |      ✓ |         ✓ |
| Tool call         |    ✓ |         ✓ |    ✓ |      ✓ |         ✓ |
| Client bundle     |    ✓ |         — |    — |      ✓ |         ✓ |
| Clean npm install |    ✓ |         ✓ |    ✓ |      ✓ |         ✓ |

And specifically test:

```bash
dsh plugin --profile web add ...
dsh --profile web --dump-config
```

plus actual tool invocation.

---

# 19. Add one hard architectural acceptance test

At the end of the migration, I would require this:

### Start with a completely clean DSH

No:

```text
hq-edge
hq-edge bridge
HQ Edge server
HQ Edge environment
HQ Edge API
```

Then install:

```text
@huaqiu/dsh-auth
@huaqiu/dsh-artifacts
@huaqiu/dsh-tool-part-search
@huaqiu/dsh-tool-symbol-footprint
@huaqiu/dsh-tool-schematic-gen
```

Then verify:

```text
✓ DSH boots
✓ all plugins load
✓ all 9 tools register
✓ part search works
✓ auth login works
✓ symbol generation works
✓ dimension HIL works
✓ footprint generation works
✓ artifact preview works
✓ artifact download works
✓ schematic generation works
✓ project preview works
✓ schematic download works
✓ no HQ Edge process is running
✓ no @hqedge dependency exists
```

That is the real definition of **standalone**.

---

# 20. Final recommended execution plan

I'd freeze the plan as:

```text
PHASE 0 — DSH foundation
├── workspace
├── TS/React/tsdown/Vitest
├── package manifests
├── cordis patches
├── CI
└── clean stock-DSH smoke test

PHASE 0A — Auth POC
├── auth.eda.cn iframe
├── postMessage validation
├── browser token state
├── browser → node RPC
├── getAccessToken()
├── getUserInfo()
└── logout/invalidation

PHASE 0B — Artifact service
├── filesystem + meta.json
├── ~/.dsh/artifacts
├── TTL
├── size/path security
├── huaqiuArtifacts service
├── webServer routes
└── browser fetch/download tests

PHASE 1 — part-search
├── @huaqiu/part-search
├── 4 DSH tools
├── contract-preserving schemas
├── unit tests
├── publish
└── clean-install verification

PHASE 2 — symbol-footprint Node
├── componentV2 WS protocol
├── auth
├── artifacts
├── HIL
├── dimension domain
└── unit/integration tests

PHASE 3 — symbol-footprint React
├── toolview registration
├── GenHitCard
├── DimensionEditor
├── ECAD preview
├── download
├── regenerate
└── single-HIL verification

PHASE 4 — schematic-gen
├── CopilotKit/SSE
├── real Huaqiu auth
├── remove demo credentials
├── module graph → ZIP
├── artifact storage
├── project preview
├── sheet tabs
└── download

PHASE 5 — release
├── dependency graph audit
├── bundle audit
├── security audit
├── stock DSH clean install
├── all-tool smoke test
├── README
├── docs
├── GitHub tags
└── publish
```

## Bottom line

**Yes — I would proceed with this migration plan.**

The core decisions I'd lock in are:

1. **No `@hqedge/*` whatsoever.**
2. **`@huaqiu/part-search` remains a normal dependency.**
3. **`@huaqiu/dsh-artifacts` is a local DSH service, not an HTTP client library.**
4. **`webServer` is only the browser adapter to that service.**
5. **React + TS replaces the classic-script client completely.**
6. **`@huaqiu/ecad-renderer` is bundled initially.**
7. **One HIL channel only.**
8. **Auth is an abstract Huaqiu capability, not backend-specific token plumbing.**
9. **Demo credentials are completely removed from schematic-gen.**
10. **Clean-stock-DSH installation is the final acceptance criterion.**

The current upstream DSH conventions strongly support the proposed direction: `ctx.tools.register(defineTool(...))` is the standard tool extension point, services are consumed through `inject`, and `webServer` is explicitly intended for plugin-owned HTTP routes. ([GitHub][1])

**One thing I would do before writing the first implementation:** turn the above into a concrete **Phase 0 implementation task spec** with exact package manifests, `cordis.patch.yml` rows, service IDs, route IDs, auth service contract, and the stock-DSH verification commands. That will prevent the implementation agent from making architectural decisions implicitly while scaffolding the five packages.

[1]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md?utm_source=chatgpt.com "deepseek-harness/docs/user/develop/basic/tool.md at master · deepseek-ai/deepseek-harness · GitHub"
[2]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/webserver/README.md?utm_source=chatgpt.com "deepseek-harness/packages/host/webserver/README.md at master · deepseek-ai/deepseek-harness · GitHub"
[3]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-server.md?utm_source=chatgpt.com "deepseek-harness/docs/subsystems/web-server.md at master · deepseek-ai/deepseek-harness · GitHub"
[4]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/service.md?utm_source=chatgpt.com "deepseek-harness/docs/user/develop/framework/service.md at master · deepseek-ai/deepseek-harness · GitHub"
[5]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/practice/index.md?utm_source=chatgpt.com "deepseek-harness/docs/user/develop/practice/index.md at master · deepseek-ai/deepseek-harness · GitHub"
[6]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/config-catalog.md?utm_source=chatgpt.com "deepseek-harness/docs/config-catalog.md at master · deepseek-ai/deepseek-harness · GitHub"
