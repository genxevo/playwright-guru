# 1. GATE PURPOSE

Establish exactly what WS4 (Session Storage / Storage V2) requires, what already exists, what is missing,
what can be proven under the current test architecture, and which decisions the owner must take — **before**
any implementation. **No implementation was performed.**

# 2. CURRENT ROADMAP STATE

WS0 CLOSED / LOCKED · WS1 CLOSED · WS2 COMPLETE · WS3 PARTIALLY COMPLETE · **WS4 NEXT / NOT STARTED** ·
WS5 PARTIAL · WS6 PARTIALLY DELIVERED · WS6.2 PARTIAL / BUNDLE DEBT · WS6.2.1 CLOSED — no safe meaningful
reduction · WS7 CLOSED · WS8 CLOSED / COMPLETE (re-baselined scope) · WS9 DISCOVERY COMPLETE /
IMPLEMENTATION BLOCKED — DEPENDS ON WS4 · WS10 NOT STARTED · WS11 FUTURE. Canonical ordering unchanged.

# 3. BASELINE

| Measure        | Value                                     |
| -------------- | ----------------------------------------- |
| Tests          | 1,037 / 44 files                          |
| Total bundle   | 298,842 B                                 |
| `content.js`   | 31,753 B                                  |
| Locked ceiling | 278,760 B                                 |
| Overage        | 20,082 B — 7.20% (unchanged, not touched) |
| Source files   | 133 `.ts`/`.tsx` under `packages/**`      |

# 4. SOURCE-DRIFT RESULT — PASS

No git repository exists in this environment (`git status` → `fatal: not a git repository`), so the DL-64
modification-time method was used: **zero** changes under `packages/**` (`*.ts`, `*.tsx`, `*.css`, `*.json`,
`*.html`) and **zero** to `package.json`, `pnpm-lock.yaml`, `vitest.workspace.ts`, `tsconfig*` or the eslint
config. Documentation is the only thing this gate touched.

# 5. AUTHORITATIVE DOCUMENTS INSPECTED

`ProgressDocument/MASTER-ROADMAP.md` (§12 WS4, §7 finding F-9, §13 dependency graph, §25 Unknowns, §30
dashboard), `CURRENT-STATE.md`, `PROGRESS.md`, `DECISION-LOG.md` (DL-4, DL-53…DL-64), the WS9 discovery and
re-baseline reports, and the WS0 port contracts. No WS4-specific specification, report or test file exists
anywhere in the repository — WS4's contract is the roadmap section plus the `StorageGateway` port.

# 6. WS4 PURPOSE (verbatim)

**"Versioned, validated, tab-scoped storage with a lossless v1 upgrade."**

# 7. WS4 DELIVERABLES (verbatim)

`StorageGateway` with runtime validation · namespace + `local`/`session` split · tab-scoped keys ·
idempotent, failure-safe migration on `onInstalled` · `tabs.onRemoved` cleanup + orphan sweep · quota caps +
debounced writes · "Clear data".

**Dependencies.** WS0 (independent of WS1/WS2). **Out of scope.** History/favourites UI · settings UI ·
recording _usage_. **Future relationship.** Natural home for the `testIdAttribute` preference (audit §15,
U9).

# 8. EXISTING ARCHITECTURE (as traced, not inferred)

```
SidePanel.tsx ─────┐                          DevTools Panel.tsx
  reads 4 keys     │                            codeBuffer: useState only
  writes buffer/   │                            NO persistence at all
  lang             │
                   ├──▶ browser.storage.local (6 flat global keys) ◀── content.ts (all frames, every tab)
onChanged listener ┘        no namespace                                 writes pg_last_pick,
  (no areaName filter)      no version                                   pg_picker_active,
                            no validation                                pg_recording_active,
                            no tab scope                                 pg_recorded_actions
                            no quota handling
background.ts: tabs.onRemoved listener exists but only `console.info` — no cleanup
StorageGateway (port): declared, ZERO implementations, ZERO consumers
```

The six keys in use: `pg_code_buffer`, `pg_last_pick`, `pg_picker_active`, `pg_pw_lang`,
`pg_recorded_actions`, `pg_recording_active`.

| Component                            | Classification                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `StorageGateway` port                | **EXISTING / PARTIAL** — contract only; see §9 for the sufficiency gap           |
| `TabContext` port (`tabId`)          | EXISTING / CORRECT — WS0 contract, unimplemented                                 |
| `browser.storage.local` direct calls | **EXISTING / WRONG** — the architecture WS4 is meant to replace                  |
| Side-panel hydration + onChanged     | **EXISTING / PARTIAL** — unvalidated casts, no area filter, one latent bug (§10) |
| DevTools panel code buffer           | **MISSING** — in-memory only, never persisted                                    |
| `tabs.onRemoved` cleanup             | **EXISTING / PARTIAL** — hook point exists, body is a log statement              |
| `onInstalled` migration              | **MISSING** — no listener anywhere                                               |
| Versioning / validation / namespace  | **MISSING**                                                                      |
| Quota caps / debounced writes        | **MISSING**                                                                      |
| "Clear data"                         | **MISSING**                                                                      |
| Legacy recorder storage writes       | **UNREACHABLE** — dead code (DL-63/DL-64 D3); **out of scope for WS4**           |

# 9. STORAGEGATEWAY ANALYSIS

```ts
export interface StorageGateway {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  subscribe<T>(key: string, listener: (value: T | null) => void): () => void;
  clearTab(tabId: number): Promise<void>;
}
```

Its doc comment promises "versioned, validated, namespaced storage" and names the exact defect WS4 fixes
(six flat global keys, no version, no validation, no tab scoping). **Zero implementations, zero consumers**
— only a type re-export from `ports/index.ts`.

**Contract-sufficiency gap (documented, not redesigned).** The prose promises more than the signatures
express:

| Deliverable             | Expressed in the interface?                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| Runtime validation      | **No** — `get<T>` returns `T \| null` with no validator parameter         |
| Versioning              | **No** — no version in any signature                                      |
| Namespace               | **No** — plain `key: string`                                              |
| `local`/`session` split | **No** — no area selector                                                 |
| Tab-scoped keys         | **Partially** — `clearTab(tabId)` exists, but `get`/`set` take no `tabId` |
| Quota caps / debounce   | **No** — could be internal, but is unstated                               |
| "Clear data"            | **No** — `remove(key)` only; no clear-all                                 |

Because the port has no consumers, extending it additively would break nothing. That is an owner decision
(**O1**), not a discovery-time change.

# 10. `pg_code_buffer` ANALYSIS

- **Writer:** `SidePanel.tsx` only — `appendToCode`, `removeLine`, `undoLast`, `clearCode`, and the
  recording-driven auto-append inside the `onChanged` handler. All are
  `void browser.storage.local.set({pg_code_buffer: next})` — **fire-and-forget, no `await`, no `.catch`**.
- **Reader:** `SidePanel.tsx` hydration only, cast `as string[] | undefined` and accepted if truthy.
- **Global**, not tab-scoped. **Not versioned. Not validated. Not debounced. No quota handling.**
- **Races:** every write is a full-array overwrite computed from React state inside a `setState` updater.
  Two side-panel contexts (or a future second surface) writing concurrently → last write wins, silently.
- **Corruption:** a non-array value passed the `if (buf)` truthiness check would be set into state and then
  `.map`-ed at render — the crash path `ErrorBoundary` exists to catch. This is precisely the criterion
  "corrupted storage degrades to empty", which **is not met today**.
- **Migration:** none, and there is **no version marker**, so a future migration must recognise the current
  shape structurally as implicit "v1".
- **Divergence found:** the **DevTools panel keeps its own `codeBuffer` in `useState` and never persists or
  reads it**. Closing that panel loses the buffer; the two surfaces do not share state. WS4 must decide
  whether the DevTools buffer joins the gateway (see **O2**; note the WS5 overlap).

**"Zero loss of `pg_code_buffer`" is therefore not satisfied by the existence of a storage call.** It
requires: a version marker, a structural validator, an idempotent `onInstalled` migration that keeps the v1
value intact until v2 is verified, and a failure path that leaves v1 untouched.

# 11. WORKSPACE / STATE ANALYSIS

There is no "workspace" concept in the code today — only the six keys. `pg_pw_lang` is a **preference**
(global by nature); `pg_picker_active`/`pg_last_pick` are **session** state (tab-scoped by nature);
`pg_code_buffer` is **user-authored content** whose scope is a product decision (**O2**);
`pg_recording_active`/`pg_recorded_actions` belong to WS9 and are written only by unreachable code.
Nothing uses `storage.session`; everything is in `storage.local`.

# 12. TAB-SCOPING ANALYSIS

The roadmap names the dimension explicitly: **`tabId`** ("tab-scoped keys", `tabs.onRemoved` cleanup +
orphan sweep), and `TabContext` defines `TabInfo { tabId, url?, title? }`. No evidence anywhere for
window/frame/origin scoping, so no other dimension is invented here.

Current reality: **no tab scoping at all.** `content.ts` runs with `allFrames: true` in **every** tab and
writes `pg_last_pick` and `pg_picker_active` to the same global keys, so a pick or picker toggle in tab B
overwrites what the panel believes about tab A. This is finding **F-9 ("Global (not tab-scoped) picker
state", owner WS4, still 🟡)** and it is the direct cause of the exit criterion "two tabs keep independent
picker state". The DevTools panel has its own lifecycle and its own `inspectedWindow.tabId`, which the
scoping model must accommodate. `background.ts` already has a `tabs.onRemoved` listener — **it only logs**,
so the cleanup hook point exists but does nothing.

# 13. VERSIONING ANALYSIS

Nothing in storage carries a version. WS4 needs, at minimum: a schema-version marker, unknown-version
handling, and a defined default/empty state. No existing project convention names a version format, so the
migration must detect today's unversioned shape structurally as "v1" (see **O3**).

# 14. VALIDATION ANALYSIS

No validation exists — every read is an unchecked `as` cast. The project's established convention is
hand-rolled deterministic validators/normalisers (`normalizeAck`, `classifyVerification`,
`statusForProbeError`), never a schema library. **No dependency is required**, and none is proposed.

**Latent defect found (documented, not fixed):** `SidePanel.tsx` hydration calls
`storage.local.get(['pg_picker_active','pg_last_pick','pg_pw_lang','pg_code_buffer'])` and then reads
`r['pg_recording_active']` and `r['pg_recorded_actions']` — **keys it never requested**, so both are always
`undefined` and that hydration silently never happens. Inert today (recording is disabled and its writers
are unreachable), but it is exactly the class of bug a validated gateway prevents.

# 15. MIGRATION ANALYSIS

**High risk.** Current format: six unversioned global keys. Target: namespaced, versioned, validated,
tab-scoped values. §25 Unknown #3 states plainly that whether real users have a populated `pg_code_buffer`
"changes WS4 migration from _nice_ to _critical_" — that unknown is still open (**O3**). Requirements
implied by the exit criteria: the migration runs on `onInstalled`, is **idempotent**, and **failure leaves
v1 intact**. Open questions the roadmap does not answer: what happens to malformed legacy values (drop vs
quarantine), whether migration is startup-time or lazy, and how a failed migration surfaces to the user
(WS8's error matrix is the natural home for the message).

# 16. FAILURE-FIRST MATRIX

| ID  | Scenario                               | Current behaviour (evidence)                                       | Required WS4 behaviour                         | Testable now?                       |
| --- | -------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------- |
| F1  | storage unavailable                    | Unhandled rejection; UI shows nothing                              | Degrade to empty, surface an error state       | UNIT (fake backend)                 |
| F2  | write fails                            | `void set(...)` — rejection swallowed, user believes it saved      | Detect, retry or surface                       | UNIT                                |
| F3  | read fails                             | `.then` only, no `.catch` → hydration silently skipped             | Degrade to defaults                            | UNIT                                |
| F4  | quota exceeded                         | Same as F2 — invisible                                             | Quota cap + explicit failure                   | UNIT                                |
| F5  | malformed persisted data               | Cast unchecked; `if (buf)` accepts a non-array → render crash path | Treat as absent, log once, degrade to empty    | UNIT                                |
| F6  | unknown schema version                 | No version exists                                                  | Defined unknown-version policy                 | UNIT                                |
| F7  | migration fails                        | No migration exists                                                | v1 left intact, idempotent retry               | UNIT                                |
| F8  | partial persisted object               | Unvalidated fields flow into render                                | Per-field validation, defaults                 | UNIT                                |
| F9  | two tabs write concurrently            | Global keys, full-array overwrite → silent last-write-wins         | Tab-scoped keys; defined concurrency semantics | UNIT (scoping) / manual (real tabs) |
| F10 | tab closes during persistence          | Write may be lost; no cleanup (`onRemoved` only logs)              | Orphan sweep + cleanup                         | UNIT                                |
| F11 | navigation during persistence          | Content script torn down mid-write                                 | Defined, no partial corruption                 | UNIT                                |
| F12 | panel closes before write completes    | Fire-and-forget write lost silently                                | Debounced flush semantics                      | UNIT                                |
| F13 | extension reloads during persistence   | Undefined                                                          | Recover to last valid state                    | UNIT                                |
| F14 | old-format state exists                | Read as-is, no version check                                       | Detected as v1 and migrated losslessly         | UNIT                                |
| F15 | empty state                            | Works (falsy checks)                                               | Defined defaults                               | UNIT                                |
| F16 | stale state after navigation           | `pg_last_pick` survives navigation globally                        | Tab-scoped invalidation                        | UNIT                                |
| F17 | `onChanged` arrives after local change | Handler has **no `areaName` filter**; may act on any area          | Filtered, validated subscription               | UNIT                                |
| F18 | unexpected extra fields                | Ignored silently                                                   | Tolerated but not trusted                      | UNIT                                |

# 17. PRIVACY / SECURITY ANALYSIS

WS4 persists **user-authored generated code** (`pg_code_buffer`) and **page-derived element facts**
(`pg_last_pick`) — potentially arbitrary website text, never credentials by design. The privacy boundary is
already guarded and must be preserved: `privacy.test.ts` forbids `chrome.storage.sync` (would upload to
Google) and all network/telemetry APIs, in source **and** over the built bundle. WS4 must add **no**
network, telemetry, remote storage, logging of sensitive values or unsafe execution. **No encryption is
proposed** — the roadmap does not require it, and local-only storage is the existing contract. WS4 does not
touch the WS9 redaction surface.

# 18. WS9 DEPENDENCY ANALYSIS

WS9 will consume, from WS4: versioned state, tab-scoped persistence, the preserved code buffer, the
migration path, and the persistence lifecycle. WS9's "100 actions → stop → **state preserved**" and its
"structured code workspace + **v1 raw-line migration**" are the same work as WS4's "**zero loss of
`pg_code_buffer`**" criterion — which is exactly why DL-64 D2 put WS4 first. **No WS9-specific API should be
created in WS4**; the boundary is: WS4 owns persistence/versioning/validation/migration/lifecycle, WS9 owns
recording, capture, coalescing, verification, limits, redaction and export.

# 19. EXISTING IMPLEMENTATION INVENTORY

| Item                                             | Status                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `StorageGateway` contract                        | 🟡 AMBER — exists, unimplemented, and under-specified vs the deliverables |
| `TabContext` contract                            | 🟡 AMBER — exists, unimplemented                                          |
| `tabs.onRemoved` hook                            | 🟡 AMBER — listener present, body logs only                               |
| Six flat global keys                             | 🔴 RED — the defect WS4 exists to replace                                 |
| Validation / versioning / namespace / area split | 🔴 RED — absent                                                           |
| Migration (`onInstalled`)                        | 🔴 RED — absent                                                           |
| Quota caps / debounced writes                    | 🔴 RED — absent                                                           |
| "Clear data"                                     | 🔴 RED — absent                                                           |
| DevTools panel persistence                       | 🔴 RED — never persisted (scope decision **O2**)                          |
| Storage tests                                    | 🔴 RED — none exist                                                       |
| Legacy recorder storage writes                   | ⛔ OUT OF SCOPE — unreachable; DL-64 D3 reserves it for WS9               |

# 20. EXISTING TEST INVENTORY

No storage contract, migration, concurrency or validation test exists. The only storage-related assertions
are in `privacy.test.ts` (no `chrome.storage.sync`, source + built bundle) and `release-metadata.test.ts`
(manifest permissions include `storage`). `ws0-seams.test.ts` pins other WS0 seams, not this one.

# 21. TEST-GAP MATRIX

| Requirement                    | Existing test | Missing test                 | Evidence level achievable | WS4 needed |
| ------------------------------ | ------------- | ---------------------------- | ------------------------- | ---------- |
| write / read / remove          | none          | gateway contract suite       | UNIT                      | yes        |
| namespace + area split         | none          | key-shape + area guards      | UNIT + STRUCTURAL         | yes        |
| version marker                 | none          | version round-trip           | UNIT                      | yes        |
| validation / malformed input   | none          | invalid-shape → absent       | UNIT                      | yes        |
| corrupt-state recovery         | none          | degrade-to-empty             | UNIT                      | yes        |
| migration (idempotent)         | none          | run-twice equality           | UNIT                      | yes        |
| migration failure safety       | none          | v1 intact after failure      | UNIT                      | yes        |
| zero-loss `pg_code_buffer`     | none          | v1 → v2 content equality     | UNIT                      | yes        |
| tab scoping                    | none          | two `tabId`s independent     | UNIT (real tabs: manual)  | yes        |
| concurrent writes              | none          | interleaved-write semantics  | UNIT                      | yes        |
| storage / quota failure        | none          | rejecting fake backend       | UNIT                      | yes        |
| `tabs.onRemoved` cleanup/sweep | none          | orphan removal               | UNIT + STRUCTURAL         | yes        |
| debounced writes               | none          | coalescing under rapid edits | UNIT (fake timers)        | yes        |
| "Clear data"                   | none          | clears all namespaced keys   | UNIT                      | yes        |
| privacy (no sync/network)      | ✅ 11/11      | extend to new module         | STATIC + STRUCTURAL       | extend     |

# 22. EVIDENCE LIMITATIONS

Under R3 all three vitest projects run `environment: 'node'`; there is no DOM, no browser, no
`@playwright/test` and no `e2e/` directory. A fake in-memory storage backend can prove the gateway,
versioning, validation, migration, debounce, quota and cleanup **deterministically at UNIT level**, and
structural guards can prove no surface bypasses the gateway. What **cannot** be proven here: real Chrome
multi-tab independence, real `onInstalled` firing, real quota limits, real service-worker teardown. Those
are **DEFERRED / FUTURE INFRASTRUCTURE** plus the manual smoke matrix — the same honest labelling as DL-62
and DL-64. **No structural or unit result may be presented as browser evidence.**

# 23. BUNDLE IMPACT ASSESSMENT

Already 20,082 B (7.20%) over the locked 278,760 B ceiling; **no optimisation was performed and WS6.2.1 is
not reopened.** Expected WS4 growth: `background.js` (migration + `onInstalled` + orphan sweep), the shared
panel chunk (gateway + validators), and — the one to watch — **`content.js`**, because `content.ts` writes
`pg_last_pick`/`pg_picker_active` and routing those through the gateway would pull it into the hot path.
Keeping the content-script side minimal is a design constraint for the implementation gate, and any delta
must be measured and disclosed there.

# 24. DEPENDENCY ASSESSMENT

**None required.** Validation follows the project's hand-rolled deterministic convention; no schema library,
no storage library, no test-infrastructure package. `package.json` and `pnpm-lock.yaml` were not modified.

# 25. EXIT-CRITERIA CLASSIFICATION

| Criterion (verbatim)                                   | Status                                                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| v1 install upgrades with zero loss of `pg_code_buffer` | 🔴 **RED** — no migration, no version marker, no validation exist                                                          |
| migration is idempotent                                | 🔴 **RED** — no migration exists                                                                                           |
| failure leaves v1 intact                               | 🔴 **RED** — no migration exists                                                                                           |
| two tabs keep independent picker state                 | 🔴 **RED** (F-9) — global keys today; **UNVERIFIABLE at browser level**, provable at UNIT level for the scoping model only |
| corrupted storage degrades to empty                    | 🔴 **RED** — unchecked casts; malformed data reaches render                                                                |

All five are RED — consistent with WS4 being NOT STARTED. None is invalid or unmeasurable in principle; one
(two-tab independence) is only partially provable under current infrastructure, which is an owner decision
on evidence level (**O4**), not a reason to weaken it.

# 26. OWNER DECISIONS REQUIRED

| ID  | Decision required                                                                    | Recommendation                                                                                                                                                   | Why                                                                                                                   | Impact                                                          | Owner action     |
| --- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------- |
| O1  | Is the WS0 `StorageGateway` contract extended, or kept as-is with concerns internal? | **Extend it additively** (version/validator/area/tab scope in the signatures). It has zero consumers, so nothing breaks                                          | The prose promises versioned/validated/namespaced; the signatures express none of it, and `get`/`set` take no `tabId` | Determines whether WS4 changes a WS0 contract                   | Approve one      |
| O2  | Which state is tab-scoped, and is `pg_code_buffer` global or per-tab?                | Picker state + last pick **tab-scoped**; `pg_pw_lang` **global preference**; **`pg_code_buffer` needs your call** — recommend global, one workspace              | The roadmap names "tab-scoped keys" but never says which keys; the DevTools panel doesn't persist its buffer at all   | User-visible behaviour, and it sets WS9's workspace shape       | Choose scope     |
| O3  | Migration criticality and malformed-legacy policy                                    | Assume **real users may exist** (treat as critical); keep the v1 value untouched until v2 verifies; **quarantine** malformed legacy data rather than dropping it | §25 Unknown #3 is still open and explicitly gates this                                                                | Sets how defensive the migration must be                        | State assumption |
| O4  | Evidence level for "two tabs keep independent picker state"                          | Accept **UNIT proof of the scoping model + structural guards**, with real two-tab behaviour recorded as manual/deferred                                          | No browser test infrastructure exists and this gate may not invent it (DL-62/DL-64 precedent)                         | Determines whether WS4 can close honestly                       | Approve level    |
| O5  | Does WS4 rewire existing consumers, or land the layer + migration only?              | **Rewire `SidePanel` + `content.ts` only**; leave the DevTools panel's buffer to the WS5 extraction unless O2 says otherwise                                     | Consumer rewiring overlaps WS5 ("THE GATE"), and WS4's Out-of-scope line doesn't settle it                            | Controls WS4's size and its bundle delta (notably `content.js`) | Choose boundary  |

# 27. RECOMMENDED IMPLEMENTATION SEQUENCE (proposal only — nothing implemented)

Derived from WS4's own deliverables, failure-first throughout:

1. **W4-a** — fake in-memory storage backend + gateway contract tests (**tests first**).
2. **W4-b** — `StorageGateway` implementation: namespace, `local`/`session` split, version marker.
3. **W4-c** — deterministic validators; invalid data treated as absent, logged once, degraded to empty.
4. **W4-d** — tab-scoped keys per O2, using `tabId`.
5. **W4-e** — `onInstalled` migration: idempotent, v1 preserved until v2 verifies, failure-safe.
6. **W4-f** — quota caps + debounced writes + surfaced failures (reusing WS8's error matrix).
7. **W4-g** — `tabs.onRemoved` cleanup + orphan sweep (replacing today's log-only listener).
8. **W4-h** — "Clear data".
9. **W4-i** — consumer rewiring per O5, with the `content.js` bundle delta measured and disclosed.
10. **W4-j** — failure-first regression suite (F1–F18) + validation + closure gate.

# 28. EXPLICIT OUT-OF-SCOPE

History/favourites UI · settings UI · recording usage · the WS9 recorder · the legacy recorder in
`content.ts` (unreachable; DL-64 D3 reserves it for WS9) · bundle optimisation and WS6.2.1 · E2E or DOM test
infrastructure · new dependencies · WS5 UI extraction · WS10 assertions · `testIdAttribute` preference
(named as a _future_ relationship, not a WS4 deliverable).

# 29. FINAL GATE RECOMMENDATION

**B — REQUIRES OWNER DECISIONS.**

WS4's scope is well specified and architecturally compatible: no second locator engine, AST, resolver,
`DomProbe` or CommandBus is involved, no dependency is needed, and the failure paths are provable
deterministically at unit level. But five decisions are genuinely open — the contract's sufficiency (O1),
the scope dimension for the code buffer (O2), the migration criticality assumption that §25 leaves
unanswered (O3), the evidence level for two-tab independence (O4), and how far consumer rewiring goes before
it becomes WS5 (O5). Each changes what gets built, so implementation should begin only after they are
answered.

NO WS4 IMPLEMENTATION PERFORMED.
NO WS9 IMPLEMENTATION PERFORMED.
NO PRODUCTION SOURCE CHANGES.
