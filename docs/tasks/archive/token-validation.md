# P1 Implementation Task Spec — Bring Token Validation into `@huaqiu/dsh-auth`

**Status:** READY FOR IMPLEMENTATION  
**Priority:** P1  
**Scope:** `dsh-pcb-eda/packages/dsh-auth` and its direct consumers  
**Out of scope:** hq-edge token synchronization, EDA `TriggerLoginDialog`, ERC auth changes

---

## 1. Objective

Make `@huaqiu/dsh-auth` responsible for determining whether the current Huaqiu access token is still valid.

Today `dsh-auth` can resolve a token but does not have a common authoritative validation path. In particular, host mode can continue returning a stale hq-edge token after the credential has expired.

P1 should establish a single authentication lifecycle in `@huaqiu/dsh-auth` that works for both:

1. **Official DSH / standalone mode**
   - token obtained from `auth.eda.cn`
2. **HQ Edge host mode**
   - token obtained from hq-edge

The authentication source may differ, but **validation must be owned by `dsh-auth`**.

---

## 2. Desired behavior

The core lifecycle should become:

```text
obtain credential
      ↓
dsh-auth
      ↓
local expiry check
      ↓
remote token validation
      ↓
valid ───────────────→ authenticated
      │
      └─ invalid ────→ unauthenticated
```

An API `401 Unauthorized` should also be treated as an authoritative invalidation signal.

Do **not** validate the token against the authentication service on every `getAccessToken()` call.

---

## 3. P1 scope

### In scope

- Add token validation to `@huaqiu/dsh-auth`
- Establish one validation API/service method
- Add local expiry awareness
- Add short-lived validation caching
- Add explicit token invalidation
- Ensure host-mode tokens are also validated
- Make `isAuthenticated()` reflect validation state
- Ensure existing standalone authentication continues to work
- Ensure existing host-mode authentication continues to work
- Add tests for valid, expired, and rejected credentials
- Update direct consumers if necessary to use the common auth service

### Out of scope

Do **not** implement these in P1:

- `AuthService.TriggerLoginDialog`
- EDA ↔ hq-edge runtime token synchronization
- New EDA auth protobuf RPCs
- hq-edge credential update endpoint
- ERC authentication redesign
- token push/event bus
- cross-process token invalidation protocol
- postMessage security redesign
- removal of all existing token persistence
- redesign of the entire auth UI

These are follow-up work.

---

# 4. First inspect the existing implementation

Before changing code, inspect:

```text
packages/dsh-auth/src/
├── index.ts
├── host.ts
├── service.ts
├── routes.ts
├── client/
│   ├── index.tsx
│   ├── client.ts
│   ├── lib.ts
│   ├── storage.ts
│   ├── transport.ts
│   └── auth-state.ts
└── client/ui/
```

Also inspect the direct consumers:

```text
packages/dsh-tool-schematic-gen/
packages/dsh-tool-symbol-footprint/
packages/dsh-tool-part-search/
```

Identify:

- where tokens are obtained;
- where API calls are made;
- how `401` / `needs_auth` is currently represented;
- how standalone login updates the token;
- how host mode resolves its token;
- how `isAuthenticated()` currently behaves;
- whether there is already an existing lightweight Huaqiu API that can be used to validate the token.

**Do not invent a new Huaqiu validation API before checking the existing code/API usage.**

---

# 5. Validation endpoint

Find the existing Huaqiu endpoint that can authoritatively answer:

> Is this access token accepted?

Prefer an existing lightweight authenticated endpoint already used by DSH/Huaqiu APIs.

The validator should perform an authenticated request such as:

```text
Authorization: Bearer <access-token>
```

and classify the result:

```ts
type AuthValidationResult =
  | {
      valid: true
      userId?: string
      expiresAt?: number
    }
  | {
      valid: false
      reason: 'expired' | 'unauthorized' | 'invalid' | 'unknown'
    }
```

Do not make validation depend on hq-edge.

The same validator must work when the token was obtained from standalone DSH.

---

# 6. Add local expiry awareness

The credential model should retain expiry information when available.

Conceptually:

```ts
interface AuthSession {
  accessToken: string
  userId?: string
  expiresAt?: number
}
```

Add a cheap local check:

```ts
isExpired(session): boolean
```

Rules:

- If `expiresAt` is known and has passed, treat the credential as expired.
- If `expiresAt` is unavailable, do not assume the token is invalid.
- Local expiry is an optimization, not authoritative validation.
- Remote validation remains authoritative.

Avoid hard-coding the existing approximately five-day storage window as the actual token validity period.

---

# 7. Add `validate()`

Expose a single service-level operation:

```ts
validate(): Promise<AuthValidationResult>
```

Responsibilities:

1. Resolve the current credential.
2. If there is no credential:
   - return invalid / unauthenticated.
3. If local `expiresAt` proves it is expired:
   - invalidate it;
   - return invalid.
4. Otherwise call the Huaqiu validation endpoint.
5. Update the authentication state from the result.
6. Return the result.

The method must work regardless of credential source:

```text
standalone → validate()
host       → validate()
```

Do not duplicate validation logic in `host.ts` and standalone client code.

---

# 8. Add validation caching

Do not make remote validation happen on every call.

Use a small in-memory validation cache.

Suggested initial policy:

```text
validation TTL: 30–60 seconds
```

The exact value should be configurable only if the existing architecture already has configuration support. Do not introduce a configuration framework solely for this.

Conceptually:

```ts
if (
  cachedValidation &&
  Date.now() - cachedValidation.timestamp < VALIDATION_TTL
) {
  return cachedValidation.result
}

result = await validateRemotely()
cache(result)

return result
```

The cache must be invalidated when:

- the access token changes;
- `invalidate()` is called;
- an API request receives `401`;
- the credential expires locally.

Do not persist validation state to disk.

---

# 9. Add explicit `invalidate()`

Add an internal/public service operation:

```ts
invalidate(): void
```

It should:

- clear the current validation result;
- clear the validation timestamp;
- mark the current credential as unauthenticated/stale.

Do not necessarily delete the credential immediately if the existing login flow needs the credential to perform recovery.

The important property is:

```text
after invalidate()
→ next validation cannot use the previous "valid" result
```

Avoid introducing a second persistent credential store.

---

# 10. Update `isAuthenticated()`

Current behavior must be reviewed carefully.

It must no longer mean merely:

```ts
Boolean(accessToken)
```

For the common auth service, distinguish:

```text
has credential
vs
credential known to be valid
```

Prefer:

```ts
isAuthenticated(): Promise<boolean>
```

implemented using `validate()`.

If changing the existing method to async would cause unnecessary API churn, preserve the existing public API and add a new async method, but **do not silently claim that a merely-present host token is valid**.

Choose the smallest change that fits the existing API.

---

# 11. Handle API `401`

`dsh-auth` should provide a way for API consumers to tell it that the credential was rejected.

For example:

```ts
huaqiuAuth.invalidate()
```

or an appropriately named existing mechanism.

When a DSH tool receives:

```text
401 Unauthorized
```

it should invalidate the auth state before returning `needs_auth`.

Desired behavior:

```text
API request
    ↓
401
    ↓
huaqiuAuth.invalidate()
    ↓
needs_auth
```

Do not make every tool implement a different token-validation algorithm.

If there is a shared API/client layer, prefer putting this handling there.

---

# 12. Do not implement automatic re-login yet

P1 should **detect and invalidate** invalid credentials.

It should not yet automatically call:

```text
TriggerLoginDialog()
```

because that belongs to the next host-mode authentication task.

The intended P1 boundary is:

```text
invalid token
    ↓
dsh-auth knows it is invalid
    ↓
needs_auth
```

The next phase will implement:

```text
needs_auth
    ↓
hostMode
    ↓
TriggerLoginDialog()
```

and standalone mode will continue using the existing iframe login.

---

# 13. Host mode behavior

Host mode must use exactly the same validation mechanism.

Current flow:

```text
HostSessionResolver
    ↓
GET /api/v1/auth/token
    ↓
token
```

should become conceptually:

```text
HostSessionResolver
    ↓
obtain host credential
    ↓
dsh-auth.validate()
    ↓
Huaqiu validation API
```

Do not treat:

```text
GET /api/v1/auth/token → HTTP 200
```

as proof that the token itself is valid.

That endpoint only proves that hq-edge supplied a credential.

---

# 14. Standalone behavior

Existing standalone login must remain functional:

```text
auth.eda.cn
    ↓
postMessage
    ↓
dsh-auth credential
    ↓
validate()
```

After receiving a new token:

```text
new token
    ↓
replace current credential
    ↓
invalidate validation cache
    ↓
validate when needed
```

Do not require hq-edge for this path.

---

# 15. Important token-change rule

Whenever the access token changes:

```text
T1 → T2
```

the validation cache must be reset.

Never reuse:

```text
"T1 was valid"
```

for:

```text
T2
```

A simple token identity/fingerprint may be used internally if necessary, but **do not persist the token or its fingerprint solely for this purpose**.

---

# 16. Concurrency

Avoid multiple simultaneous validation requests.

If five tools call:

```ts
validate()
```

at the same time, prefer:

```text
       validate()
       validate()
       validate()
          │
          ▼
    one in-flight request
          │
          ▼
       result
```

A small in-flight promise guard is sufficient.

Do not introduce a general-purpose request coordination framework.

---

# 17. Error semantics

Distinguish authentication failure from network failure.

For example:

```text
Huaqiu API → 401
    = token invalid

Huaqiu API → 403
    = authentication/authorization failure
       classify according to existing API semantics

Huaqiu API → 5xx
    = validation unavailable

network timeout
    = validation unavailable
```

Do **not** automatically convert a network failure into:

```text
token invalid
```

Otherwise users could be forced to log in merely because the network is temporarily unavailable.

Use a result/error model that allows callers to distinguish:

```ts
valid
invalid
unavailable
```

if the existing architecture permits it.

---

# 18. Suggested result model

Prefer something along these lines if it fits the existing code:

```ts
type AuthValidationResult =
  | {
      status: 'valid'
      userId?: string
      expiresAt?: number
    }
  | {
      status: 'invalid'
      reason: 'expired' | 'unauthorized' | 'forbidden'
    }
  | {
      status: 'unavailable'
      error: Error
    }
```

The exact naming can follow existing project conventions.

The key requirement is:

> **Do not equate "validation server unavailable" with "token invalid".**

---

# 19. Tests

Add focused tests for `@huaqiu/dsh-auth`.

Minimum cases:

### Standalone

```text
token exists
→ validation succeeds
→ authenticated
```

### Expired

```text
expiresAt < now
→ validation does not call remote API
→ credential marked invalid
```

### Remote 401

```text
token exists
→ validation API returns 401
→ invalid
→ cached valid state cleared
```

### Remote unavailable

```text
token exists
→ validation API/network fails
→ status = unavailable
→ token is not incorrectly declared invalid
```

### Validation cache

```text
validate()
validate()
validate()
→ one remote request within TTL
```

### Cache invalidation

```text
validate(T1) → valid

replace with T2

validate(T2)
→ new remote validation
```

### Host mode

```text
host token
→ HostSessionResolver obtains credential
→ same validation path
→ invalid host token is detected
```

### API 401

```text
tool/API receives 401
→ dsh-auth.invalidate()
→ next authentication check does not use stale valid state
```

---

# 20. Acceptance criteria

P1 is complete when all of the following are true:

- [ ] `@huaqiu/dsh-auth` has one authoritative `validate()` path.
- [ ] Validation works without hq-edge.
- [ ] Standalone DSH tokens can be validated.
- [ ] Host-mode tokens can be validated.
- [ ] Local expiry is checked before remote validation when expiry is known.
- [ ] Remote validation is not performed on every token read.
- [ ] Validation has a short in-memory TTL.
- [ ] Token changes invalidate the validation cache.
- [ ] API `401` can invalidate authentication state.
- [ ] Network/5xx validation failures are not falsely classified as expired/invalid credentials.
- [ ] `isAuthenticated()` no longer blindly treats the presence of a host token as proof of validity.
- [ ] No new hq-edge dependency is introduced.
- [ ] No EDA protobuf/API changes are required.
- [ ] No `TriggerLoginDialog` implementation is included.
- [ ] Existing standalone login still works.
- [ ] Existing host-mode token acquisition still works.
- [ ] Focused unit tests cover the lifecycle above.

---

# 21. Non-goals / anti-overengineering constraints

Do **not**:

- build a new authentication subsystem;
- introduce OAuth refresh-token handling;
- introduce a token rotation service;
- introduce event sourcing;
- introduce a global auth state server;
- add WebSocket/SSE solely for token validation;
- add a background token-validation daemon;
- validate tokens continuously in a timer;
- make every tool independently validate tokens;
- make every `getAccessToken()` call hit SaaS;
- couple `dsh-auth` to hq-edge;
- implement EDA login RPCs in this task;
- redesign the existing standalone login UI.

**Delivery first. Reuse the existing auth service and HTTP infrastructure wherever possible.**

---

# 22. Expected end state

The important architectural result is:

```text
                    @huaqiu/dsh-auth
                           │
             ┌─────────────┴─────────────┐
             │                           │
        credential                    validation
        providers                       │
             │                           ▼
      ┌──────┴──────┐             Huaqiu API
      │             │
 standalone       host
      │             │
 auth.eda.cn     hq-edge
```

All DSH plugins use:

```ts
huaqiuAuth.getAccessToken()
huaqiuAuth.validate()
huaqiuAuth.invalidate()
```

rather than implementing authentication/validation themselves.

The next phase can then add:

```text
invalid
   ↓
host mode
   ↓
EDA AuthService.TriggerLoginDialog()
   ↓
fresh token
   ↓
hq-edge synchronization
```

without changing the fundamental authentication model established by P1.