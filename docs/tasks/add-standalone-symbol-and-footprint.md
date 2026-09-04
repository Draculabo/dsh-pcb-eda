# Task: Add Standalone Symbol & Footprint Generator Workspaces

## Goal

Extend the existing `dsh-tool-symbol-footprint` plugin with two first-class generator applications:

* Symbol Gen
* Footprint Gen

They must work:

1. Inside DSH Web.
2. Inside DSH embedded in EDA.
3. As a standalone web application served by a local server.
4. In normal/full-size layouts and constrained Dock layouts, such as an EDA right dock.

The implementation must reuse:

* the existing generation pipeline;
* the existing geometry editor;
* the existing preview renderer;
* the existing `@huaqiu/dsh-auth` authentication abstraction.

Do not redesign authentication or create a parallel auth system.

---

# Scope

Create:

```text
@huaqiu/component-gen-app
@huaqiu/component-gen-server
```

Use the API namespace:

```text
/api/v1/huaqiu/component-gen
```

Keep:

```text
@huaqiu/dsh-tool-symbol-footprint
```

as the existing DSH plugin and generation implementation.

---

# Core constraints

## 1. Do not reimplement generation

The existing generation functions remain authoritative:

```text
runGenerateSymbol()
runGenerateFootprintFromImage()
runGenerateFootprintFromDimensions()
```

The new applications must invoke these functions through the new server API.

Do not duplicate or fork generation logic.

The existing agent tools must continue to work unchanged.

---

## 2. Do not implement authentication logic in Component Gen

All applications and plugins must only know the public authentication API provided by:

```text
@huaqiu/dsh-auth
```

Component Gen must not directly know or implement:

```text
HQ Edge auth
native EDA token handling
auth.eda.cn iframe protocol
native login dialog protocol
host mode detection
token persistence
```

Those concerns already belong to `@huaqiu/dsh-auth`.

The dependency direction must be:

```text
Component Gen
      │
      ▼
@huaqiu/dsh-auth public API
      │
      ▼
existing DSH auth implementation
      │
      ├── standalone mode
      └── host mode / EDA
```

Do not bypass this abstraction.

---

# Authentication behavior

The Component Gen server/application only needs the following behavior.

## On startup

Check authentication through the existing `@huaqiu/dsh-auth` API.

Conceptually:

```text
App starts
    │
    ▼
Check auth state
    │
    ├── authenticated
    │       │
    │       ▼
    │     Ready
    │
    └── unauthenticated
            │
            ▼
        Trigger existing login flow
            │
            ▼
        Wait for auth state update
            │
            ▼
           Ready
```

The exact host-specific behavior is owned by `@huaqiu/dsh-auth`.

Therefore:

### DSH standalone

`@huaqiu/dsh-auth` handles the existing standalone login flow, including `auth.eda.cn`.

### DSH embedded in EDA

`@huaqiu/dsh-auth` handles host mode and triggers the existing EDA/native login flow.

### Component Gen

Only consumes:

```text
auth state
access token when required by server-side generation
login trigger
auth state change notification
```

Use the actual existing public API of `@huaqiu/dsh-auth`. Do not invent a new abstraction if its existing API is sufficient.

---

# Explicit non-goals

Do not implement:

* logout;
* a new authentication provider hierarchy;
* a new token storage mechanism;
* a new iframe login implementation;
* a native EDA bridge;
* auth provider factories;
* support for arbitrary third-party hosts;
* Electron-specific integration;
* plugin-defined authentication protocols.

The currently supported environments are only:

```text
DSH
EDA through DSH host mode
```

---

# Package 1: `@huaqiu/component-gen-app`

## Responsibility

A reusable React application containing the UI for:

* Symbol Gen;
* Footprint Gen;
* geometry editing;
* preview;
* download;
* history.

It must have no DSH UI slot dependencies.

It communicates with the backend through HTTP/SSE.

---

## Suggested structure

Keep this simple:

```text
packages/component-gen-app/
  src/
    index.ts

    App.tsx

    pages/
      SymbolGenPage.tsx
      FootprintGenPage.tsx

    components/
      UploadInput.tsx
      GeometryEditor.tsx
      PreviewStage.tsx
      HistoryPanel.tsx

    api/
      component-gen-client.ts

    copy/
      zh.ts
      en.ts

    styles/
```

Do not introduce unnecessary architecture layers such as:

```text
domain/
application/
infrastructure/
entities/
repositories/
use-cases/
adapters/
providers/
```

unless existing code genuinely requires them.

---

# Application modes

The application supports two pages:

```text
symbol
footprint
```

For example:

```ts
type ComponentGenPage = 'symbol' | 'footprint'
```

The host opens the desired page directly.

Do not add a landing page requiring the user to select a generator.

---

# Symbol Gen page

Flow:

```text
Upload / paste image
        │
        ▼
Optional instruction
        │
        ▼
Generate
        │
        ▼
Progress
        │
        ▼
Preview
        │
        ├── Download
        ├── Regenerate
        └── Save / visible in history
```

Reuse the existing:

```text
runGenerateSymbol
preview renderer
artifact generation
```

---

# Footprint Gen page

Flow:

```text
Upload / paste image
        │
        ▼
Optional package hint
        │
        ▼
Extract dimensions
        │
        ├── dimensions require confirmation
        │          │
        │          ▼
        │     Geometry Editor
        │          │
        │          ▼
        │       Generate
        │
        └── existing direct-generation result
                   │
                   ▼
                Preview
```

Do not change the existing generation semantics merely to make the UI flow look cleaner.

The UI must support both existing outcomes:

```text
needs dimensions confirmation
```

and:

```text
directly generated footprint
```

---

# Reuse existing UI

Extract and reuse existing code where practical.

Already available:

```text
src/client/dims.ts
```

This should remain the shared dimension model.

Also reuse/extract:

```text
geometry editor from hit-card.tsx
package silhouette rendering
ecad preview
artifact download
```

Do not rewrite these features from scratch.

The extracted components should be usable by both:

```text
Component Gen App
existing GenHit chat card
```

where reasonably practical.

However, do not make chat-card refactoring a prerequisite for the first working application.

---

# Layout requirements

The application must support both normal and Dock layouts.

Do not create separate applications.

Use responsive layout.

---

## Normal layout

Typical full workspace:

```text
┌─────────────────────────────────────────────────────────────┐
│ Symbol Gen                                                  │
├────────────────────┬────────────────────────────────────────┤
│                    │                                        │
│ Input              │              Preview                   │
│                    │                                        │
│ Upload             │              Canvas                    │
│ Instructions       │                                        │
│ Generate           │                                        │
│                    │                                        │
└────────────────────┴────────────────────────────────────────┘
```

---

## Dock / constrained layout

For example, EDA right dock:

```text
┌────────────────────────────┐
│ Symbol Gen                 │
├────────────────────────────┤
│ Upload                     │
│                            │
│ [ drop image ]             │
│                            │
│ Instruction                │
│                            │
│ [ Generate ]               │
├────────────────────────────┤
│ Preview                    │
│                            │
│ Canvas                     │
├────────────────────────────┤
│ History                    │
└────────────────────────────┘
```

The application must remain usable at constrained widths.

In particular:

* controls must not overflow;
* side-by-side panels may stack vertically;
* geometry editor must work in narrow containers;
* preview canvas must resize correctly;
* history may become a drawer/section instead of a permanent rail.

Prefer CSS responsive/container-based layout over host-specific rendering code.

Do not require the application to know whether it is running in DSH or EDA to adapt its layout.

---

# Package 2: `@huaqiu/component-gen-server`

## Responsibility

Provide the HTTP API and serve the standalone application when required.

Reuse the existing generation implementation.

Suggested structure:

```text
packages/component-gen-server/
  src/
    index.ts

    routes.ts
    jobs.ts
    history.ts
```

Keep it small.

Do not build a framework inside this package.

---

# Server responsibilities

The server owns:

```text
generation job lifecycle
SSE progress
cancellation
history persistence
artifact access
HTTP API
```

Authentication is consumed through `@huaqiu/dsh-auth`.

The server should not contain separate implementations for:

```text
HQ Edge auth
EDA auth
iframe auth
native auth
```

---

# API

Base:

```text
/api/v1/huaqiu/component-gen
```

Required endpoints:

```text
POST   /jobs
GET    /jobs/:id
GET    /jobs/:id/events
DELETE /jobs/:id

GET    /history
GET    /history/:id
PATCH  /history/:id
DELETE /history/:id

GET    /config
```

Only add authentication endpoints if the existing `@huaqiu/dsh-auth` integration actually requires a server-side bridge.

Do not create:

```text
/logout
/token
/auth/provider
/auth/session
```

by default.

---

# Jobs

Generation can take a long time.

Use asynchronous jobs plus SSE.

Example:

```text
POST /jobs
    │
    ▼
202
{
  jobId
}
    │
    ▼
GET /jobs/:id/events
    │
    ├── progress
    ├── needs_confirmation
    ├── completed
    └── failed
```

Keep jobs in memory.

Do not add persistent job storage.

If the server restarts, active jobs may be lost.

History is the durable record.

---

# Job kinds

Use only the existing generation flows:

```ts
type JobKind =
  | 'symbol'
  | 'extract-footprint'
  | 'generate-footprint'
```

Mapping:

```text
symbol
    → runGenerateSymbol

extract-footprint
    → runGenerateFootprintFromImage

generate-footprint
    → runGenerateFootprintFromDimensions
```

Do not introduce another generation abstraction layer.

---

# History

The artifact store does not support enumeration, so Component Gen needs its own history index.

Keep it simple.

Suggested storage:

```text
<dshHome>/component-gen/
  history.json
  inputs/
```

History entries reference generated artifact IDs.

Example:

```ts
interface HistoryEntry {
  id: string

  kind: 'symbol' | 'footprint'

  createdAt: string

  status:
    | 'generated'
    | 'failed'
    | 'cancelled'

  input: {
    imageId?: string
    instruction?: string
    packageType?: string
  }

  result?: {
    artifactId: string
    filename: string
  }

  error?: string
}
```

Do not introduce SQLite.

Do not create a database schema.

A JSON index is sufficient for this feature.

---

# Existing DSH plugin integration

The existing plugin:

```text
@huaqiu/dsh-tool-symbol-footprint
```

gets two responsibilities.

## 1. Continue providing existing agent tools

Do not change:

```text
generate_symbol_from_image
generate_footprint_from_image
generate_footprint_from_dimensions
```

Their descriptions and agent contracts must remain unchanged.

---

## 2. Add Component Gen UI entry points

Use official DSH slots.

Do not copy `dsh-task-board` DOM injection.

Register two sidebar actions:

```text
Symbol Gen
Footprint Gen
```

Use:

```text
sidebar.footer.action
```

for the buttons.

Use:

```text
shell.overlay
```

for the application workspace.

---

# Navigation behavior

There are two buttons but one shared application surface.

Example state:

```ts
type ComponentGenPage = 'symbol' | 'footprint'

interface WorkspaceState {
  open: boolean
  page: ComponentGenPage
}
```

Behavior:

```text
Click Symbol Gen
    ↓
open = true
page = symbol

Click Footprint Gen
    ↓
open = true
page = footprint
```

The application should switch directly to the requested page.

Do not register two separate copies of the full application.

Do not mount two independent React roots.

One workspace shell is enough.

---

# DSH integration sketch

Conceptually:

```tsx
slots.inject('shell.overlay', () =>
  slots.register(
    {
      name: 'shell.overlay',
      id: 'huaqiu-component-gen',
    },
    function ComponentGenOverlay() {
      return (
        <ComponentGenApp
          page={workspace.page}
          open={workspace.open}
        />
      )
    },
  ),
)
```

And two actions:

```text
huaqiu-symbol-gen
huaqiu-footprint-gen
```

Both update the same workspace state.

Use explicit `order` values so their placement is deterministic.

---

# Authentication integration

## Critical dependency rule

Component Gen must only consume the existing API from:

```text
@huaqiu/dsh-auth
```

Do not inspect:

```text
window.eda_host
window.handle_auth
HQ Edge URLs
auth.eda.cn
host mode flags
```

inside:

```text
@huaqiu/component-gen-app
@huaqiu/component-gen-server
@huaqiu/dsh-tool-symbol-footprint
```

unless this is already part of the public `@huaqiu/dsh-auth` API.

---

## Expected behavior

When a user starts generation:

```text
Component Gen
      │
      ▼
Ask @huaqiu/dsh-auth for auth state/token
      │
      ├── authenticated
      │       │
      │       ▼
      │   run generation
      │
      └── unauthenticated
              │
              ▼
      invoke existing dsh-auth login flow
              │
              ▼
      wait for auth state change
```

The exact mechanism differs internally between standalone and host mode, but Component Gen must not care.

This is already the abstraction responsibility of `@huaqiu/dsh-auth`.

---

# Standalone server

The standalone server should serve:

```text
@huaqiu/component-gen-app
```

and expose:

```text
/api/v1/huaqiu/component-gen/*
```

on the same local origin.

Conceptually:

```text
http://localhost:<port>/
    │
    ├── component-gen React app
    │
    └── /api/v1/huaqiu/component-gen/*
```

This is required because generation remains server-side.

Do not create a static-only application that connects directly to the generation WebSocket.

---

# Dependency direction

The intended dependency graph is:

```text
@huaqiu/component-gen-app
        │
        │ HTTP
        ▼
@huaqiu/component-gen-server
        │
        ├── existing generation functions
        │
        └── @huaqiu/dsh-auth public API
                 │
                 ▼
          DSH / EDA auth implementation
```

The DSH plugin integrates:

```text
@huaqiu/dsh-tool-symbol-footprint
        │
        ├── existing generation implementation
        ├── component-gen server
        └── component-gen app
```

Avoid circular dependencies.

---

# Suggested implementation phases

## Phase 1 — App extraction

Create:

```text
@huaqiu/component-gen-app
```

Move/reuse:

* dimension model;
* geometry editor;
* preview renderer;
* download functionality.

Implement:

```text
SymbolGenPage
FootprintGenPage
```

Use mock/API client data if necessary.

Exit condition:

```text
component-gen-app builds with no DSH UI dependencies.
```

---

## Phase 2 — Server API

Create:

```text
@huaqiu/component-gen-server
```

Implement:

```text
jobs
SSE
history
config
```

Reuse existing generation functions.

Keep jobs in memory.

Exit condition:

```text
symbol and footprint generation work through HTTP API.
```

---

## Phase 3 — Authentication wiring

Integrate only through:

```text
@huaqiu/dsh-auth
```

Verify both:

```text
unauthenticated → existing login flow
authenticated → generation succeeds
```

Do not implement auth flows.

Exit condition:

```text
same Component Gen code works with dsh-auth standalone and host mode.
```

---

## Phase 4 — DSH UI

Add:

```text
Symbol Gen sidebar button
Footprint Gen sidebar button
```

using:

```text
sidebar.footer.action
```

Add one:

```text
shell.overlay
```

hosting the shared Component Gen application.

Exit condition:

```text
both buttons open the correct page without agent involvement.
```

---

## Phase 5 — Responsive/Dock verification

Test at:

```text
normal workspace width
wide dock
narrow right dock
```

Verify:

* Symbol Gen;
* Footprint Gen;
* geometry editor;
* preview canvas;
* history;
* long-running generation progress.

Do not build a separate Dock implementation.

Fix responsiveness in the shared components.

---

## Phase 6 — Standalone serving

Serve the app from:

```text
@huaqiu/component-gen-server
```

with the same Component Gen API.

Reuse `@huaqiu/dsh-auth` standalone behavior.

Exit condition:

```text
standalone Component Gen works with existing DSH authentication.
```

---

# Non-goals / avoid over-engineering

Do not add any of the following unless implementation proves they are required:

```text
new authentication framework
new auth provider interfaces
logout
refresh token manager
token persistence layer
OAuth abstraction
third-party host support
Electron integration
IPC abstraction
persistent job queue
database
SQLite
repository pattern
DDD layers
CQRS
event sourcing
plugin registry
generic workflow engine
generic page framework
generic host adapter framework
```

Use existing infrastructure wherever possible.

---

# Acceptance criteria

## Symbol Gen

* Sidebar button exists.
* Opens Symbol Gen directly.
* Image upload/paste works.
* Generation uses existing pipeline.
* Progress is visible.
* Result previews correctly.
* Download works.
* History persists.

## Footprint Gen

* Sidebar button exists.
* Opens Footprint Gen directly.
* Image upload works.
* Existing dimension extraction is reused.
* Existing geometry editor is reused.
* Human confirmation flow works.
* Existing direct-generation path also works.
* Preview and download work.
* History persists.

## Authentication

* Component Gen only depends on public `@huaqiu/dsh-auth` APIs.
* No direct `auth.eda.cn` implementation.
* No direct native EDA auth implementation.
* Unauthenticated users enter the existing auth flow.
* Authenticated users can generate.
* Both DSH standalone and EDA host mode work through the same Component Gen integration.

## Layout

* Works as a normal workspace.
* Works inside constrained Dock layouts.
* No separate Dock application.
* Geometry editor and preview remain usable in narrow containers.

## Architecture

* Existing generation pipeline is not duplicated.
* Existing agent tools remain working.
* No DOM injection or MutationObserver.
* DSH integration uses official slots.
* Jobs are in-memory.
* History is simple durable JSON storage.
* No unnecessary new infrastructure.
