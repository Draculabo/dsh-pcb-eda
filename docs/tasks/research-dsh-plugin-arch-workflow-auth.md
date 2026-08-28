# Task: Research DSH Plugin Architecture, Development Workflow, and Huaqiu Authentication

## Objective

Research the existing local DSH ecosystem and Huaqiu EDA authentication implementation, then produce a detailed implementation-oriented research document for the new standalone repository:

```text
/Users/admin/code/dsh-pcb-eda
```

The research document MUST be created at:

```text
/Users/admin/code/dsh-pcb-eda/docs/research/dsh-pcb-eda.md
```

The goal is to establish the correct architecture, repository layout, technology choices, local development workflow, npm publishing workflow, DSH plugin installation workflow, and Huaqiu authentication integration before implementing the plugin.

---

# 1. Critical Architectural Constraints

These constraints are mandatory.

## 1.1 `dsh-pcb-eda` MUST be self-contained

The plugin:

```text
@huaqiu/dsh-pcb-eda
```

must be installable and usable directly from DSH.

It MUST NOT depend on:

```text
hq-edge
```

as a runtime dependency.

Do not design the plugin as:

```text
DSH
  ↓
dsh-pcb-eda
  ↓
HQ Edge
  ↓
Huaqiu services
```

Instead, the plugin itself must contain the DSH-facing implementation required for its functionality.

The plugin may communicate directly with Huaqiu services/APIs where appropriate.

HQ Edge may be referenced as an architectural comparison only. It must not become a required runtime component.

---

# 2. Huaqiu Authentication Is a Shared DSH Capability

Huaqiu authentication is a separate reusable concern.

The authentication mechanism is based on:

```text
https://auth.eda.cn
```

embedded as an iframe.

Research the existing implementation in:

```text
/Users/admin/code/hq-eda-ai
```

to determine:

1. How `auth.eda.cn` is embedded.
2. Which iframe URL/parameters are used.
3. How login state is detected.
4. How authentication messages/events are communicated between iframe and host.
5. How the Huaqiu token is obtained.
6. How token expiration is handled.
7. How logout is handled.
8. How the token is persisted.
9. Whether cookies, `postMessage`, localStorage, sessionStorage, URL parameters, or another mechanism are involved.
10. Whether the authentication implementation can be extracted into a reusable DSH plugin/capability.
11. What browser security restrictions apply.
12. What origin checks are required.
13. Whether the auth iframe requires a specific parent origin.
14. Whether the authentication flow differs between development and production.

Do NOT blindly copy the HQ EDA AI implementation.

Determine the actual protocol and isolate the reusable parts.

---

# 3. Authentication Architecture Goal

The desired architecture is:

```text
                         DSH
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
      Huaqiu Auth Plugin       dsh-pcb-eda
              │                       │
              │                       │
              └────── Huaqiu Token ──┘
                                      │
                                      ▼
                              Huaqiu EDA APIs
```

The Huaqiu authentication capability should be reusable by other DSH plugins/tools that require a Huaqiu token.

Therefore investigate whether authentication should be:

### Option A

A shared package:

```text
@huaqiu/dsh-auth
```

consumed by:

```text
@huaqiu/dsh-pcb-eda
```

### Option B

A standalone DSH authentication plugin:

```text
@huaqiu/dsh-auth
```

that exposes authentication state/token through a DSH/Cordis service.

### Option C

A shared implementation package plus a thin DSH auth plugin:

```text
@huaqiu/dsh-auth-core
        │
        ├── @huaqiu/dsh-auth
        │
        └── @huaqiu/dsh-pcb-eda
```

Evaluate all three approaches based on the actual DSH architecture found in:

```text
/Users/admin/code/deepseek-harness
/Users/admin/code/dsh-plugin
```

Recommend one.

Do not make the decision based purely on theoretical architecture.

---

# 4. Research Sources

The agent MUST inspect the following local repositories.

## 4.1 DSH plugin collection

```text
/Users/admin/code/dsh-plugin
```

Research:

- repository layout
- representative plugins
- package.json structure
- `dsh.bundle`
- Cordis plugin structure
- UI registration
- tools
- commands
- services
- configuration
- build scripts
- test scripts
- publishing scripts
- plugin metadata
- npm package conventions
- TypeScript configuration
- bundling
- frontend/backend split if present
- plugin lifecycle
- dependency declarations

Identify several representative plugins, preferably:

1. a minimal tool plugin
2. a UI plugin
3. a plugin with rich HIT/UI
4. a plugin that communicates with an external service
5. a plugin with authentication/state
6. a plugin with a client/browser component

Record the actual repository paths and relevant source files.

---

## 4.2 Official DeepSeek Harness

Inspect:

```text
/Users/admin/code/deepseek-harness
```

Research the actual source implementation, not only README documentation.

Determine:

- DSH plugin loader
- `dsh.bundle`
- Cordis context
- plugin lifecycle
- service registration
- tool registration
- command registration
- Web UI extension mechanism
- frontend/client plugin mechanism
- server/node-side plugin mechanism
- plugin configuration
- plugin storage
- IPC/message mechanisms if applicable
- artifact integration
- HIT / rich UI mechanism
- package resolution
- npm installation
- GitHub installation
- development mode
- build process

Pay special attention to how a plugin can provide:

```text
Node/runtime functionality
+
Browser/Web UI functionality
```

without requiring a fork of DSH.

---

# 5. Research Existing DSH Plugin Patterns

From:

```text
/Users/admin/code/dsh-plugin
```

identify concrete examples of:

### Tool registration

How tools are declared and registered.

### UI registration

How plugins add UI to the DSH Web UI.

### Rich HIT

How plugins render interactive content in the conversation.

This is particularly important for the future:

- part search results
- footprint dimension editor
- symbol editor
- schematic generation
- ERC findings

Determine whether these should be implemented using:

- HIT
- custom webview
- artifact
- iframe
- DOM enhancement
- registered UI panel
- another DSH mechanism.

Do not assume the implementation pattern from previous projects.

Use actual examples from the repositories.

---

# 6. Research Existing Huaqiu Authentication

Inspect:

```text
/Users/admin/code/hq-eda-ai
```

Search for:

```text
auth.eda.cn
iframe
token
login
postMessage
message
access_token
authorization
cookie
localStorage
sessionStorage
```

Trace the complete authentication flow.

Document it as:

```text
User
 │
 ▼
DSH/Huaqiu UI
 │
 ▼
auth.eda.cn iframe
 │
 ▼
Login
 │
 ▼
Authentication result
 │
 ▼
postMessage / callback / other mechanism
 │
 ▼
Token acquisition
 │
 ▼
Token storage
 │
 ▼
Huaqiu API request
```

For every step, identify the actual source file and function.

---

# 7. Security Requirements for Authentication

The research MUST explicitly cover:

## Origin validation

Do not accept arbitrary `postMessage` events.

Document:

```text
event.origin
```

validation requirements.

## Token handling

Determine:

- token lifetime
- refresh mechanism
- storage mechanism
- whether the token can be exposed to browser-side JavaScript
- whether it should be kept in a runtime/service layer
- whether multiple plugins can access it
- logout behavior
- expiration behavior

## iframe security

Document:

- iframe sandbox requirements
- `allow` attributes if any
- CSP requirements
- `frame-src`
- `connect-src`
- cookie/SameSite implications
- third-party cookie implications
- cross-origin communication

Do not propose weakening browser security merely to make the integration work.

---

# 8. Proposed Repository Layout

Based on the research, recommend the repository layout for:

```text
/Users/admin/code/dsh-pcb-eda
```

The expected repository should probably resemble:

```text
dsh-pcb-eda/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── README.md
├── LICENSE
├── docs/
│   └── research/
│       └── dsh-pcb-eda.md
├── src/
│   ├── index.ts
│   ├── plugin.ts
│   ├── auth/
│   ├── huaqiu/
│   ├── parts/
│   ├── datasheet/
│   ├── schematic/
│   ├── symbol/
│   ├── footprint/
│   ├── erc/
│   └── ui/
├── client/
│   ├── ...
└── test/
```

However, this is only a starting hypothesis.

The agent MUST adapt the layout based on actual DSH conventions found in:

```text
dsh-plugin
deepseek-harness
```

Do not blindly implement the above structure.

---

# 9. Determine Package Architecture

Evaluate whether the repository should be:

## Single package

```text
@huaqiu/dsh-pcb-eda
```

or a workspace:

```text
packages/
├── dsh-pcb-eda
├── dsh-auth
└── huaqiu-api
```

The research must consider the requirement that Huaqiu authentication may eventually be shared by other DSH plugins.

Recommended target should clearly distinguish:

```text
DSH integration
Huaqiu authentication
Huaqiu API client
EDA domain logic
UI
```

while avoiding premature over-engineering.

---

# 10. Determine npm Publishing Workflow

Research the actual package publishing workflow used by:

```text
/Users/admin/code/dsh-plugin
```

and:

```text
/Users/admin/code/deepseek-harness
```

Determine:

- package manager
- package name convention
- build command
- output directory
- npm `files`
- `exports`
- `main`
- `module`
- `types`
- `bin`
- `dsh.bundle`
- `prepublishOnly`
- `prepare`
- npm provenance if used
- versioning
- release tags
- GitHub Actions
- npm authentication
- publish command
- whether npm publishing requires a packed tarball
- whether DSH installs compiled or source code
- how native dependencies are handled

The final research should include an exact recommended workflow.

Example:

```text
pnpm install
pnpm test
pnpm build
pnpm pack
npm publish
```

but only use this sequence if supported by the repository research.

---

# 11. Determine DSH Installation Workflow

Document all supported installation paths.

At minimum investigate:

```text
npm package
GitHub repository
local path
```

The official ecosystem currently expects a `dsh.bundle` declaration for plugins to be installable through `dsh plugin add`.

Document the expected commands for:

### Local development

```text
dsh plugin --profile web add /Users/admin/code/dsh-pcb-eda
```

### npm

```text
dsh plugin --profile web add @huaqiu/dsh-pcb-eda
```

### GitHub

```text
dsh plugin --profile web add github:Huaqiu-Electronics/dsh-pcb-eda
```

Verify the exact command syntax against the local DSH CLI source before documenting it as authoritative.

---

# 12. Development Workflow

Determine the fastest development loop.

The research should answer:

```text
How do I modify the plugin?
        ↓
How do I build it?
        ↓
How does DSH load the local plugin?
        ↓
How do I reload/restart DSH?
        ↓
How do I debug Node-side code?
        ↓
How do I debug browser-side code?
        ↓
How do I test HIT/UI?
```

Document:

- watch mode
- hot reload
- DSH restart requirements
- browser devtools
- Node debugging
- source maps
- logging
- testing
- package linking if relevant

---

# 13. Compatibility

Determine the supported versions of:

- Node.js
- pnpm
- TypeScript
- DSH
- Cordis

Do not invent version requirements.

Derive them from the local repositories.

Document both:

```text
Development environment
```

and:

```text
Published plugin runtime requirements
```

---

# 14. Huaqiu API Integration

Research how `hq-eda-ai` communicates with Huaqiu services.

Determine:

- base URLs
- authentication headers
- token format
- request format
- response format
- error handling
- retry behavior
- timeout behavior
- browser vs server requests
- CORS requirements
- whether requests must be proxied
- whether credentials are browser-safe

The goal is to determine whether:

```text
DSH browser
    ↓
Huaqiu API
```

is possible directly, or whether:

```text
DSH plugin runtime
    ↓
Huaqiu API
```

is required.

Do not introduce HQ Edge as a proxy merely because it already exists.

---

# 15. No HQ Edge Dependency

The research MUST explicitly include a section:

# Why HQ Edge Is Not a Dependency

State that:

```text
@huaqiu/dsh-pcb-eda
```

must be independently installable.

The plugin must not require:

```text
@hqedge/*
HQ Edge executable
HQ Edge service
HQ Edge localhost port
HQ Edge configuration
HQ Edge artifact service
```

unless a future, separately optional integration is explicitly introduced.

The plugin should be usable on a clean DSH installation after:

```text
dsh plugin add @huaqiu/dsh-pcb-eda
```

plus whatever Huaqiu authentication/configuration is required.

---

# 16. Shared Huaqiu Authentication Design

Provide a recommendation for a reusable authentication layer.

The desired API should conceptually resemble:

```ts
interface HuaqiuAuthService {
  getToken(): Promise<string | null>;
  isAuthenticated(): boolean;
  login(): Promise<void>;
  logout(): Promise<void>;
  onAuthStateChanged(
    listener: (state: HuaqiuAuthState) => void,
  ): () => void;
}
```

Do not assume these exact APIs are correct.

Derive the actual interface from DSH/Cordis architecture.

The key requirement is:

```text
Other Huaqiu DSH plugins
            │
            ▼
    shared Huaqiu auth
            │
            ▼
       auth.eda.cn
```

so that every plugin does NOT implement its own iframe login flow.

---

# 17. Authentication Plugin vs PCB EDA Plugin

Provide a clear recommendation on whether the final ecosystem should contain:

```text
@huaqiu/dsh-auth
@huaqiu/dsh-pcb-eda
```

or only:

```text
@huaqiu/dsh-pcb-eda
```

Consider the actual DSH plugin model.

The preferred long-term architecture is potentially:

```text
                    DSH
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
 @huaqiu/dsh-auth       @huaqiu/dsh-pcb-eda
          │                     │
          └──────────┬──────────┘
                     ▼
                Huaqiu APIs
```

But do not split packages unless the research shows that the shared authentication capability is sufficiently independent and reusable.

---

# 18. Future EDA Capabilities

The research should make sure the architecture can support:

```text
Huaqiu Part Search
        │
        ├── Datasheet
        ├── Symbol Generation
        ├── Footprint Generation
        └── Schematic Generation

Schematic
    │
    ▼
Datasheet-based ERC
```

Potential tools:

```text
huaqiu_search_parts
huaqiu_get_part
huaqiu_get_datasheet
huaqiu_generate_symbol
huaqiu_generate_footprint
huaqiu_generate_schematic
huaqiu_run_erc
```

Do not implement these tools in this research task unless required to validate architecture.

The objective is to establish how they should be implemented.

---

# 19. HIT / Rich UI Research

Because the eventual plugin needs rich EDA interactions, investigate DSH support for interactive UI.

Specifically determine how to implement:

### Part search

```text
Search
↓
Part cards
↓
Select part
```

### Footprint generation

```text
Package dimensions
        ↓
Interactive dimension editor
        ↓
Preview
        ↓
Generate footprint
```

### Symbol generation

```text
Pin table
        ↓
Symbol preview
        ↓
Generate
```

### ERC

```text
ERC findings
        ↓
Finding details
        ↓
Evidence
        ↓
Schematic location
        ↓
Suggested fix
```

Identify actual existing plugins in `/Users/admin/code/dsh-plugin` that demonstrate the closest UI patterns.

Include source-file references.

---

# 20. Required Research Document Structure

Create:

```text
/Users/admin/code/dsh-pcb-eda/docs/research/dsh-pcb-eda.md
```

with this structure:

```markdown
# DSH PCB EDA Plugin Research

## 1. Executive Summary

## 2. Repository Research

### 2.1 dsh-plugin
### 2.2 deepseek-harness
### 2.3 hq-eda-ai

## 3. DSH Plugin Architecture

## 4. dsh.bundle

## 5. Plugin Lifecycle

## 6. Node/Runtime Integration

## 7. Browser/UI Integration

## 8. HIT / Rich UI

## 9. Huaqiu Authentication

### 9.1 auth.eda.cn iframe
### 9.2 Login Flow
### 9.3 Token Acquisition
### 9.4 Token Storage
### 9.5 Token Refresh
### 9.6 Logout
### 9.7 Security / Origin Validation

## 10. Shared Huaqiu Authentication Architecture

## 11. Huaqiu API Integration

## 12. Proposed dsh-pcb-eda Architecture

## 13. Proposed Repository Layout

## 14. Dependency Boundaries

## 15. Why HQ Edge Is Not Required

## 16. Development Workflow

## 17. Testing Workflow

## 18. npm Publishing Workflow

## 19. DSH Installation Workflow

## 20. GitHub Distribution Workflow

## 21. UI / HIT Strategy

## 22. Future EDA Capabilities

## 23. Risks and Open Questions

## 24. Recommended Implementation Plan

## 25. Source References
```

---

# 21. Evidence Requirements

Every important architectural conclusion must cite the actual local source.

For example:

```text
deepseek-harness/packages/...
dsh-plugin/plugins/...
hq-eda-ai/apps/...
```

Include:

- file path
- relevant symbol/function
- short explanation

Do not write conclusions such as:

> "DSH supports X."

unless the source has been inspected.

Prefer:

> `deepseek-harness/<path>/foo.ts` registers X through Y, which indicates that plugins should use Z.

---

# 22. Research Quality Requirements

Do NOT:

- guess the DSH API
- copy architecture from generic Cordis examples without checking DSH
- introduce HQ Edge
- assume browser token access is safe
- assume `auth.eda.cn` supports arbitrary iframe embedding
- assume CORS behavior
- assume npm publishing configuration
- assume the DSH CLI syntax
- implement a large framework before understanding the existing repositories

Do:

- inspect source
- identify concrete examples
- compare multiple existing plugins
- trace actual authentication code
- distinguish verified facts from recommendations
- explicitly list unresolved questions

Use this notation when useful:

```text
Verified
```

```text
Recommended
```

```text
Needs confirmation
```

---

# 23. Final Deliverable

The primary deliverable is:

```text
/Users/admin/code/dsh-pcb-eda/docs/research/dsh-pcb-eda.md
```

The document should be implementation-ready enough that a second agent can read it and begin implementing:

```text
@huaqiu/dsh-pcb-eda
```

without having to repeat the repository archaeology.

The document must clearly answer:

1. What is the correct DSH plugin architecture?
2. What should the repository layout be?
3. What technologies should be used?
4. How does the plugin register tools?
5. How does it register UI/HIT?
6. How should Huaqiu authentication be integrated?
7. How is the `auth.eda.cn` iframe used?
8. How is the Huaqiu token obtained?
9. How should authentication be shared with other Huaqiu plugins?
10. How does the plugin communicate with Huaqiu APIs?
11. How can the plugin remain completely independent from HQ Edge?
12. How do developers run it locally?
13. How do developers test it?
14. How is it packaged?
15. How is it published to npm?
16. How is it installed from npm?
17. How is it installed from GitHub?
18. How can it eventually provide rich EDA HITs?
19. What are the unresolved technical risks?

---

# 24. Stop Condition

Do not begin implementing the full EDA plugin after completing the research.

Only create/update:

```text
docs/research/dsh-pcb-eda.md
```

unless a minimal temporary reproduction is required to verify an architectural claim.

If a temporary reproduction is created, keep it isolated and clearly identify it in the research document.

The next implementation task will use this research document as its source of truth.