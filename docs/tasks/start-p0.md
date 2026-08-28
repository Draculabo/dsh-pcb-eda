Yes — **with a delivery-first / no-over-engineering lens, this is close, but I would simplify it before approval.** The previous review pushed a few things too far; this version already corrected most of that.

My recommendation: **approve Phase 0 with ~6 small changes, and explicitly defer everything else.**

## 1. Overall verdict

| Area                      | Verdict                  |
| ------------------------- | ------------------------ |
| Workspace foundation      | ✅ Keep                   |
| 5-package structure       | ✅ Keep                   |
| `dsh-auth` POC            | ✅ Keep                   |
| `dsh-artifacts`           | ✅ Keep                   |
| `webServer` route adapter | ✅ Keep                   |
| React tooling in Phase 0  | ⚠️ Don't overbuild       |
| Artifact hardening        | ⚠️ Reduce scope slightly |
| CI                        | ⚠️ Simplify              |
| Auth abstraction          | ✅ Good                   |
| Exact RPC discovery       | ✅ Must resolve           |
| Stock DSH smoke test      | ✅ Essential              |
| Publishing                | ✅ Correctly deferred     |

The guiding principle should be:

> **Phase 0 proves that the architecture works. It should not build production infrastructure that Phase 1–4 might later invalidate.**

---

# 2. The biggest thing I'd change: don't build a "five-package skeleton" too completely

D1 currently says:

> 5 skeleton packages, all green `pnpm -r test && pnpm -r build`

That's okay, but don't create elaborate client/test/build infrastructure for packages that won't have implementation yet.

For Phase 0, the three tool packages can be extremely thin:

```text
packages/dsh-tool-part-search/
  package.json
  cordis.patch.yml
  src/index.ts
  test/index.test.ts

packages/dsh-tool-symbol-footprint/
  package.json
  cordis.patch.yml
  src/index.ts
  src/client/index.tsx
  test/index.test.ts

packages/dsh-tool-schematic-gen/
  package.json
  cordis.patch.yml
  src/index.ts
  src/client/index.tsx
  test/index.test.ts
```

The client files can simply prove:

```ts
export const inject = [...]
export function apply(ctx) {}
```

No need for React components yet.

That keeps Phase 0 genuinely small.

---

# 3. I would remove `@deepseek-ai/dsh-host-webserver` from `dsh-auth`

This part looks unnecessarily speculative:

```json
"@deepseek-ai/dsh-host-webserver": "*"
```

and:

> `inject = ['webServer']` only if a route is needed

If the chosen auth mechanism is host RPC, **auth doesn't need webServer**.

So don't put it in the manifest until the implementation proves it is required.

Likewise:

```json
"@deepseek-ai/dsh-host-apiproxy": "*"
```

should only exist if the actual implementation uses it.

### Principle

Don't put speculative dependencies into a published package manifest.

Instead:

```text
Phase 0A discovers mechanism
        ↓
choose API
        ↓
add only required dependency
```

This is especially important because your whole objective is a clean standalone plugin.

---

# 4. Don't over-specify the auth implementation before inspecting DSH

This is the one section I would deliberately leave slightly open.

You currently have:

```text
1. apiProxy custom handler
2. webServer fallback
3. ClientConnectionRpc
```

That's good as a **research order**.

But don't write the implementation as though `apiProxy` is already the expected answer.

The task should be:

> Inspect the actual public extension point and implement the smallest supported browser→host message path.

And then freeze it.

The important acceptance criterion is:

```text
browser
   ↓
public DSH mechanism
   ↓
node
   ↓
huaqiuAuth
```

not *which* mechanism wins.

This is exactly the sort of thing where over-specifying before inspecting the runtime can create unnecessary compatibility code.

---

# 5. I would simplify the 8 auth tests

Eight tests aren't unreasonable, but T1–T8 currently mix **auth POC** and **production authentication behavior**.

For delivery-first, I would group them into four essential behaviors:

### A. Login propagation

```text
login/message
 → client state
 → node state
 → getAccessToken/getUserInfo
```

### B. Update

```text
new token
 → replaces old node state
```

### C. Logout

```text
logout
 → client cleared
 → node cleared
```

### D. Reload

```text
reload
 → existing local state restored
```

Plus the mandatory security test:

```text
wrong origin → ignored
```

You can still retain the eight cases in the implementation checklist, but **don't build eight layers of test infrastructure** around them.

---

# 6. The artifact service is good — but some hardening is overkill for Phase 0

These are worth keeping:

```text
✓ ID validation
✓ filename not used as path
✓ max size
✓ TTL
✓ atomic writes
```

I'd defer:

```text
⚠ symlink-safe realpath containment
⚠ elaborate metadata limits
```

unless the existing service already makes those concerns easy to address.

Why?

The MVP deployment assumption is:

```text
127.0.0.1
+
random artifact ID
+
local DSH
```

You're not building a multi-user artifact server.

For Phase 0 I'd do:

```text
artifact ID validation
path traversal prevention
size limit
atomic write
TTL
```

and add a simple regression test.

Then revisit symlink behavior if the implementation naturally exposes a risk.

**Don't spend half a day building a filesystem security subsystem for a localhost preview cache.**

---

# 7. `openStream(): ReadableStream` is unnecessarily specific

This interface:

```ts
openStream(id: string): ReadableStream;
```

is potentially awkward on the Node side.

You're using Node's filesystem and HTTP server, so I'd avoid freezing a stream abstraction before you need it.

For Phase 0:

```ts
readContent(id): Promise<Uint8Array>
```

is enough.

If the actual artifact files become large enough that buffering matters, add:

```ts
openStream()
```

later.

The current artifacts are preview artifacts, not a general blob store.

---

# 8. Keep the artifact API minimal

I'd actually define Phase 0 as:

```ts
interface HuaqiuArtifacts {
  create(...): Promise<ArtifactMeta>
  get(id: string): Promise<ArtifactMeta | null>
  readContent(id: string): Promise<Uint8Array>
  delete(id: string): Promise<void>
  deleteAll(opts?: { onlyExpired?: boolean }): Promise<number>
}
```

Then the route handler can use `readContent()`.

If streaming proves necessary, add it in the symbol/schematic phase.

Again:

> **Don't design the general artifact platform now.**

You're replacing one very small existing service.

---

# 9. One important correction: `Buffer` in a public TS service contract

This:

```ts
content: string | Uint8Array | Buffer
```

makes the interface explicitly Node-specific.

That's fine because this is a **node-only service**, but I'd still prefer:

```ts
content: string | Uint8Array
```

and let callers convert `Buffer` naturally because:

```ts
Buffer extends Uint8Array
```

That keeps the public contract cleaner without losing functionality.

---

# 10. `tsdown` configuration has a typo

This:

```ts
/^@deepseek-ai**\//
```

and:

```ts
/^@huaqiu**\/dsh-/
```

are wrong regexes.

You presumably mean:

```ts
/^@deepseek-ai\//
/^@huaqiu\/dsh-/
```

For example:

```ts
external: [
  /^react$/,
  /^react\//,
  /^@deepseek-ai\//,
  /^@huaqiu\/dsh-/,
]
```

But I'd be even more careful here.

**Don't externalize every `@huaqiu/dsh-*` dependency blindly.**

Phase 0 should verify the actual desired packaging semantics.

For example:

```text
dsh-auth
dsh-artifacts
dsh-tool-symbol-footprint
```

are separate plugins and should generally resolve through DSH's plugin installation, whereas ordinary libraries such as:

```text
@huaqiu/part-search
```

should be bundled or declared as normal dependencies according to the runtime behavior.

So I'd put the exact externalization policy in Phase 3/4 when client bundles actually exist.

---

# 11. Don't make `vitest` root configuration complicated yet

This:

> root Vitest two projects: node + client

is reasonable, but Phase 0 doesn't need a sophisticated project-selection system.

I'd start with:

```text
vitest.config.ts
```

and use explicit environment annotations/config where needed.

For example:

```ts
// @vitest-environment node
```

and later:

```ts
// @vitest-environment jsdom
```

when React tests arrive.

You don't yet have meaningful client tests.

This is another place where **less infrastructure now = faster delivery**.

---

# 12. CI is slightly over-engineered for Phase 0

I would keep:

```text
install
typecheck
test
build
hqedge dependency guard
pack --dry-run
```

But don't add a formal `lint` job if linting is merely:

```bash
tsc --noEmit
```

Just call it:

```bash
pnpm -r typecheck
```

For example:

```yaml
- run: pnpm -r typecheck
- run: pnpm -r test
- run: pnpm -r build
- run: pnpm -r pack --dry-run
```

Then:

```bash
grep -R "@hqedge/" packages/*/lib
```

is sufficient.

The important thing is **CI proves no HQ Edge dependency**, not whether you've established a perfect lint architecture.

---

# 13. I would change the `@hqedge` dependency guard

This:

```bash
pnpm -r why @hqedge
```

isn't the strongest test because `pnpm why` can behave differently depending on workspace state and package relationships.

I'd use two explicit checks.

### Manifest/source

```bash
if grep -R '"@hqedge/' packages/*/package.json packages/*/src 2>/dev/null; then
  echo "FAIL: @hqedge dependency/reference found"
  exit 1
fi
```

### Generated output

```bash
if grep -R '@hqedge/' packages/*/lib 2>/dev/null; then
  echo "FAIL: @hqedge reference found in generated output"
  exit 1
fi
```

That's much closer to the actual requirement:

> **The published artifact must not know HQ Edge exists.**

---

# 14. Don't make `dsh plugin add` part of ordinary CI

This:

```text
stock DSH install
```

is important.

But don't make GitHub CI depend on having a specific DSH CLI/runtime installation unless you're intentionally building an integration-test job.

For Phase 0:

```text
CI
  └── build/test/package correctness

manual/integration
  └── stock DSH installation
```

Then later add a dedicated integration workflow once the package is published.

This keeps the first CI reliable and fast.

---

# 15. The stock-DSH test is the most valuable test in this entire spec

I would actually strengthen D2 slightly.

Don't just check:

```bash
dsh --profile web --dump-config
```

Check that the plugin actually **loads and registers**.

For part-search:

```text
install
 ↓
DSH startup
 ↓
tool row exists
 ↓
tool registry contains expected tool
```

You don't need to invoke the real API yet.

A skeleton probe is enough.

This catches:

```text
cordis.patch.yml wrong
package exports wrong
main wrong
DSH manifest wrong
inject wrong
plugin doesn't load
```

which is exactly what Phase 0 is supposed to discover.

---

# 16. Don't build a fake React UI in Phase 0

For:

```text
dsh-auth/client/index.tsx
dsh-tool-symbol-footprint/client/index.tsx
dsh-tool-schematic-gen/client/index.tsx
```

I'd only prove:

```text
client bundle builds
client plugin exports correct shape
```

No UI.

The auth iframe is the one exception because it's part of the actual Phase 0A POC.

So:

```text
dsh-auth
 └── real minimal auth UI/iframe

symbol-footprint
 └── empty client plugin stub

schematic-gen
 └── empty client plugin stub
```

That is enough.

---

# 17. README deliverable should be tiny

D5 shouldn't become documentation work.

Workspace README needs only:

```text
What this repo is
Package list
Development commands
How to build/test
Phase status
How to install a local package into DSH
```

Per-package:

```text
Purpose
Node/client
Dependencies
Current status
```

No polished user-facing documentation yet.

That belongs in Phase 5.

---

# 18. I would explicitly add "no publish" as a hard guard

You already say:

> no publish executed

Good.

I'd make it operational:

```text
Phase 0 package versions = 0.0.0
publishConfig present
CI never executes pnpm publish
```

Don't add release automation yet.

---

# 19. Revised Phase 0 Definition of Done

I'd reduce it to this:

### Foundation

* [ ] pnpm workspace installs
* [ ] five packages resolve
* [ ] all packages typecheck
* [ ] all packages build
* [ ] skeleton package can be installed into stock DSH
* [ ] `--dump-config` shows plugin

### Auth

* [ ] auth iframe/message works
* [ ] strict origin check
* [ ] client state → node state
* [ ] `getAccessToken()` works
* [ ] `getUserInfo()` works
* [ ] update replaces old credentials
* [ ] logout invalidates node state
* [ ] reload restores client state

### Artifacts

* [ ] create/read/delete works
* [ ] UTF-8 works
* [ ] binary works
* [ ] base64 works
* [ ] size limit works
* [ ] ID/path validation works
* [ ] TTL cleanup works
* [ ] HTTP meta route works
* [ ] HTTP content route works
* [ ] route disposal works

### Architecture

* [ ] no `@hqedge/*` in package manifests
* [ ] no `@hqedge/*` in generated bundles
* [ ] no HTTP loopback from node tools
* [ ] artifact namespace is `/api/v1/huaqiu/artifacts`
* [ ] no demo credentials
* [ ] no Phase 1–4 tool implementation

That's enough.

---

# 20. Final approval recommendation

I'd mark the spec:

> **APPROVED WITH MINOR CHANGES**

Specifically, make these changes before handing it to the implementation agent:

### Must change

1. **Remove speculative auth dependencies** (`host-webserver`, `host-apiproxy`) until the POC proves they are needed.
2. **Fix the `tsdown` regexes.**
3. **Don't require a complicated Vitest multi-project setup in Phase 0.**
4. **Don't require CI to invoke a stock DSH installation.**
5. **Simplify `HuaqiuArtifacts` by deferring `openStream()`.**
6. **Use `Uint8Array` rather than exposing `Buffer` in the public artifact interface.**

### Keep exactly as-is conceptually

```text
                    Phase 0
                       │
       ┌───────────────┼────────────────┐
       │               │                │
   workspace         auth           artifacts
       │               │                │
       ▼               ▼                ▼
   stock DSH      browser→node       webServer
       │               │                │
       └───────────────┴────────────────┘
                       │
                       ▼
                 Phase 1 ready
```

And **do not add**:

* shared ECAD package
* artifact database
* generalized RPC framework
* generic Huaqiu API client
* elaborate auth state machine
* release automation
* sophisticated lint system
* client component architecture
* artifact streaming abstraction
* multi-user artifact authorization
* cross-plugin UI framework

Those are all plausible future ideas, but **none is needed to unblock Phase 1**.

### My final call

**This is now a good delivery-first Phase 0.** The architecture is sufficiently frozen to give an implementation agent clear boundaries, while the genuinely unknown pieces—especially the browser→node auth mechanism—remain correctly identified as things to *discover and prove*, rather than things to prematurely abstract.

The most important success criterion is not "five packages have beautiful scaffolding."

It's:

> **At the end of Phase 0, a clean stock DSH can load a Huaqiu plugin, the browser can establish Huaqiu auth state that the node half can consume, and a node tool can create an artifact that the browser retrieves through DSH's own web server — with zero HQ Edge involvement.**

If those three things work, **Phase 1 becomes straightforward implementation rather than another architecture investigation.**
