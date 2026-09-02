# Task: Research Existing DSH Plugins for Generator Workspace Integration

## Objective

Research the existing DSH plugin implementations and determine the **canonical integration pattern** for adding three independent generator capabilities to DSH Web:

1. Symbol Generator
2. Footprint Generator
3. Schematic Generator

The goal of this task is **research only**.

Do **not** modify production code, plugin code, server code, protobufs, APIs, or build configuration.

The output should provide enough source-grounded information to write a subsequent implementation task.

---

## Context

The three generators already have or are expected to have independently usable server APIs.

They must remain independently usable outside DSH, including the existing API-key based flow.

When integrated into DSH Web, each generator should become a first-class DSH capability with:

- its own toolbar/sidebar entrypoint;
- its own dedicated workspace;
- no separate API key required when running inside the DSH/HQ runtime;
- the same underlying server API used by standalone clients;
- an optional DSH tool interface so an agent can invoke the generator;
- a way for agent-generated results to be opened in the corresponding workspace.

Target UX:

```text
DSH Web
├── Chat
├── Symbol Generator
├── Footprint Generator
└── Schematic Generator
```

Conceptually:

```text
                    DSH Web
                       │
          ┌────────────┼────────────┐
          │            │            │
       Symbol       Footprint    Schematic
      Workspace     Workspace     Workspace
          │            │            │
          └────────────┼────────────┘
                       │
                 Existing API
                       │
              ┌────────┴────────┐
              │                 │
          DSH runtime       Standalone
          authentication     API key
```

This architecture is a hypothesis. The purpose of this research is to verify it against the actual DSH implementation.

---

# 1. Repository Discovery

Inspect the existing repositories available in the development environment, especially:

- `deepseek-harness` / DSH
- existing DSH plugins
- `dsh-plugin`
- `dsh-pcb-eda`
- any existing Huaqiu DSH plugins
- the three generator repositories/packages
- `hq-edge` where relevant

First determine:

- repository layout;
- plugin package layout;
- plugin registration mechanism;
- UI entrypoint mechanism;
- toolbar/sidebar contribution mechanism;
- workspace/routing mechanism;
- tool registration mechanism;
- authentication/runtime integration mechanism;
- API/service discovery mechanism.

Do not assume documentation is accurate if source code provides stronger evidence.

---

# 2. Identify the Most Relevant Existing Plugins

Find existing plugins that demonstrate one or more of the following:

### A. Dedicated UI

Plugins that add:

- toolbar buttons;
- sidebar entries;
- standalone pages;
- workspace views;
- panels;
- webviews;
- routes.

### B. Tool + UI

Plugins that expose both:

```text
Human UI
    +
Agent/LLM tools
```

Identify how the two surfaces share implementation.

### C. Existing Backend/API Integration

Find plugins that communicate with:

- local services;
- HQ Edge;
- remote APIs;
- authenticated backend services.

Prefer examples that already solve authentication rather than generic toy plugins.

### D. Plugin Runtime Configuration

Find examples that consume:

- environment variables;
- injected runtime configuration;
- host-provided ports;
- service endpoints;
- access tokens;
- DSH context;
- plugin configuration.

---

# 3. Analyze Existing Plugin Structure

For each relevant plugin, document:

```text
Plugin
├── package.json
├── manifest/config
├── entrypoint
├── UI
├── tools
├── API/client
├── auth
└── runtime integration
```

Record the actual file paths and important symbols.

For each mechanism answer:

- Where is the plugin declared?
- How is it discovered by DSH?
- How is it loaded?
- How does it contribute a sidebar/toolbar item?
- How does clicking the item open UI?
- Is the UI a route, webview, iframe, panel, or another mechanism?
- How does the plugin communicate with its backend?
- How does it receive configuration?
- How does it obtain authentication?
- How are tools registered?
- How are tool results returned to the UI?
- How does a plugin navigate/open another workspace?
- How is plugin lifecycle handled?

Use exact source references wherever possible.

---

# 4. Research Workspace / Entrypoint Patterns

Determine the preferred DSH mechanism for a plugin-owned workspace.

Compare any existing patterns such as:

```text
sidebar → route
sidebar → webview
toolbar → panel
toolbar → workspace
plugin → iframe
plugin → embedded application
```

Determine which pattern best matches the three generators.

Explicitly answer:

> Should Symbol Generator, Footprint Generator, and Schematic Generator be implemented as DSH routes/workspaces, webviews, panels, or another existing DSH primitive?

Do not invent a new primitive if an existing DSH mechanism is sufficient.

---

# 5. Research Tool Registration

Determine the canonical way for a plugin to expose tools to DSH agents.

For existing examples, record:

```text
tool name
input schema
output schema
registration API
execution context
authentication context
error handling
```

Determine whether the recommended structure is:

```text
generator server API
        ↑
        │
DSH tool adapter
```

or whether existing plugins put business logic directly inside the tool.

Prefer the pattern that keeps the existing generator server API reusable.

---

# 6. Research Authentication

This is a critical part of the research.

Determine how an embedded DSH plugin can call an authenticated backend **without requiring the user to manually provide an API key**.

Inspect existing plugins for:

- host-provided authentication;
- DSH session authentication;
- HQ Edge authentication;
- injected access tokens;
- environment variables;
- local service credentials;
- authenticated HTTP clients;
- proxying through DSH/HQ Edge.

Answer explicitly:

> What is the canonical existing mechanism for a DSH plugin to access an authenticated HQ/backend service?

Also determine what happens when the same generator is used outside DSH.

The desired model is:

```text
Inside DSH
    ↓
DSH/HQ runtime authentication
    ↓
existing generator API

Standalone
    ↓
existing API-key authentication
    ↓
existing generator API
```

Verify whether this model is compatible with the actual codebase.

---

# 7. Research Runtime / Service Endpoint Injection

Previous architecture discussions considered injecting the HQ Edge port or endpoint into DSH/plugin runtime configuration.

Research existing plugins to determine whether they already use:

```text
HQ_EDGE_URL
HQ_EDGE_PORT
service endpoint
runtime config
environment variable
plugin context
```

Determine the canonical mechanism.

Answer:

> How should a plugin discover the existing generator server API when bundled/launched by HQ Edge/DSH?

Do not introduce a new configuration mechanism if an existing one can be reused.

---

# 8. Research Standalone vs DSH Mode

Determine how existing plugins distinguish:

```text
DSH-hosted mode
```

from:

```text
standalone mode
```

If no existing plugin does this, document that fact.

Evaluate whether the generator API client should conceptually support:

```ts
createClient({
  baseUrl,
  authProvider,
})
```

with different runtime adapters:

```text
DSH auth provider
API-key auth provider
```

Do not implement this; only determine whether it aligns with existing conventions.

---

# 9. Research Agent → Workspace Handoff

Look for existing patterns where:

```text
Agent/tool
    ↓
creates artifact/result
    ↓
UI opens or displays result
```

Determine whether DSH already has:

- workspace navigation;
- deep links;
- route parameters;
- artifact IDs;
- plugin events;
- host messages;
- cross-plugin communication.

The desired future UX is:

```text
Agent
  ↓
schematic_generate()
  ↓
artifactId
  ↓
"Open in Schematic Generator"
  ↓
Schematic Generator workspace
```

Determine the closest existing implementation pattern.

---

# 10. Compare the Three Generator Integrations

Based on the research, determine whether all three can follow one common plugin architecture.

Expected conceptual structure:

```text
Symbol Generator
Footprint Generator
Schematic Generator
        │
        ├── DSH entrypoint
        ├── workspace UI
        ├── API client
        └── DSH tools
```

Identify what can be shared:

```text
shared DSH runtime adapter
shared authentication adapter
shared API client conventions
shared workspace registration
shared artifact navigation
shared tool conventions
```

And what must remain generator-specific:

```text
UI
tool schemas
API endpoints
artifact types
generation workflow
validation
preview
```

---

# 11. Explicitly Review Existing DSH Plugin for Reference

Perform a detailed source-level review of the **most relevant existing DSH plugin**.

Use it as the primary reference implementation.

Document:

1. Why it is the closest match.
2. Plugin package structure.
3. Manifest/configuration.
4. UI entrypoint.
5. Workspace implementation.
6. API communication.
7. Authentication.
8. Tool registration.
9. Runtime configuration.
10. Build/bundling.
11. Packaging/deployment.
12. Important conventions that should be copied.
13. Important parts that should NOT be copied because they are specific to that plugin.

---

# 12. Produce an Architecture Recommendation

After researching the code, propose the smallest architecture consistent with existing DSH conventions.

The recommendation should answer:

### Plugin structure

```text
What packages should exist?
```

### UI

```text
How should the three sidebar/toolbar entries be registered?
```

### Workspace

```text
How should each generator own its workspace?
```

### API

```text
How should the workspace call the existing server API?
```

### Authentication

```text
How does DSH mode avoid API-key entry?
How does standalone mode preserve API-key support?
```

### Tools

```text
How should symbol_generate,
footprint_generate,
schematic_generate
be registered?
```

### Artifact handoff

```text
How can tool results open in their corresponding workspace?
```

### Shared infrastructure

```text
What should be shared among the three plugins?
```

---

# 13. Research Constraints

## No production changes

Do not:

- modify DSH;
- modify existing plugins;
- modify generator servers;
- modify protobufs;
- modify APIs;
- add dependencies;
- change package manifests;
- create new production files.

Temporary scripts are acceptable only if required for investigation and should not be committed.

## Source-grounded

Do not infer DSH APIs from memory.

For every important architectural conclusion, provide:

```text
Repository
File
Relevant symbol/code
Conclusion
```

Prefer source code over README/documentation when they disagree.

## No speculative redesign

Do not propose:

- a new plugin framework;
- a new authentication system;
- a new API gateway;
- a new event bus;
- a new workspace abstraction;

unless the existing DSH architecture demonstrably requires it.

Prefer the smallest integration that follows existing patterns.

---

# 14. Deliverable

Create a research document:

```text
docs/research-dsh-generator-plugin-integration.md
```

The document should contain:

## Executive Summary

The recommended integration architecture in 5–10 bullets.

## Existing DSH Plugin Inventory

Table:

| Plugin | UI | Workspace | Tools | Backend API | Auth | Relevance |
|---|---|---|---|---|---|---|

## Reference Plugin Deep Dive

Detailed source-grounded analysis of the closest existing plugin.

## DSH UI Integration Pattern

Explain the actual sidebar/toolbar/workspace mechanism.

## Tool Integration Pattern

Explain actual tool registration and execution.

## Authentication Pattern

Explain how embedded plugins authenticate without user API keys.

## Runtime Endpoint Pattern

Explain how plugins discover their backend service.

## Standalone Compatibility

Explain how the existing API-key flow remains independent.

## Artifact / Workspace Handoff

Document any existing mechanism and its applicability.

## Proposed Three-Generator Architecture

Show:

```text
DSH
├── Symbol Generator
├── Footprint Generator
└── Schematic Generator
```

and:

```text
              Existing Generator APIs
                       ▲
              ┌────────┼────────┐
              │        │        │
           Symbol   Footprint  Schematic
           Plugin    Plugin     Plugin
              │        │        │
              └────────┼────────┘
                       │
                    DSH Web
```

## Reusable Infrastructure

Clearly separate:

```text
SHARED
```

from:

```text
GENERATOR-SPECIFIC
```

## Open Questions / Risks

Only list issues that are actually unresolved after source inspection.

## Implementation Plan

Provide a minimal phased plan for a **future implementation task**.

Suggested phases:

1. Shared runtime/auth integration
2. Symbol Generator workspace
3. Footprint Generator workspace
4. Schematic Generator workspace
5. Tool registration
6. Agent → workspace handoff
7. Standalone regression verification

---

# 15. Acceptance Criteria

The research is complete when:

- [ ] Existing DSH plugin architecture has been inspected from source.
- [ ] At least one relevant existing plugin is analyzed in detail.
- [ ] Sidebar/toolbar integration mechanism is identified.
- [ ] Workspace/route mechanism is identified.
- [ ] Tool registration mechanism is identified.
- [ ] Authentication mechanism is identified.
- [ ] Backend endpoint/service discovery mechanism is identified.
- [ ] Standalone/API-key compatibility has been addressed.
- [ ] Agent → workspace handoff has been investigated.
- [ ] Common architecture for all three generators has been evaluated.
- [ ] No production code has been modified.
- [ ] Every major recommendation is backed by concrete repository/file references.
- [ ] A minimal implementation plan is provided for the next task.

## Final conclusion must explicitly answer

> What is the smallest, most idiomatic way to integrate Symbol Generator, Footprint Generator, and Schematic Generator into DSH Web as independent workspaces while reusing their existing server APIs, using DSH/HQ authentication when embedded, retaining API-key based standalone usage, and exposing the same capabilities as DSH agent tools?