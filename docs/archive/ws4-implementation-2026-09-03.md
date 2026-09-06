# WS4 — Storage V2 implementation report

**2026-09-03 · DL-66 · WS4 CLOSED / COMPLETE at the owner-approved scope**

## 1. Owner decisions

| ID  | Decision                                                              | Status                     |
| --- | --------------------------------------------------------------------- | -------------------------- |
| O1  | Extend `StorageGateway` additively                                    | **APPROVED / IMPLEMENTED** |
| O2  | Scope: lang + code buffer global; picker state + last pick tab-scoped | **APPROVED / IMPLEMENTED** |
| O3  | Migration critical: preserve, verify, quarantine, idempotent          | **APPROVED / IMPLEMENTED** |
| O4  | Evidence: unit + structural; real-browser deferred                    | **APPROVED / IMPLEMENTED** |
| O5  | Rewire SidePanel + content.ts; DevTools stays WS5                     | **APPROVED / IMPLEMENTED** |

## 2. Source drift and baseline

No git repository exists here, so the DL-64/DL-65 modification-time method was used: **no source, test,
config or lockfile drift** since DL-65. Baseline re-measured immediately before implementation:
1,037 tests / 44 files · 298,842 B total · 31,753 B `content.js` · ceiling 278,760 B · 20,082 B (7.20%) over.

## 3. Implemented

**New**

| File                                  | Purpose                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/storage/gateway.ts`              | The one gateway: namespace, version envelope, area routing, tab scoping, validation, failures-as-values, cleanup, sweep, Clear data |
| `src/storage/state.ts`                | The four WS4 descriptors and their deterministic validators                                                                         |
| `src/storage/migration.ts`            | v1 → v2 migration, verification, bounded quarantine                                                                                 |
| `src/browser/storage.ts`              | Production wiring (`browser.storage.local` / `.session` / `onChanged`), lazily resolved                                             |
| `test/helpers/fake-storage.ts`        | Deterministic fake backend with failure injection + fake `onChanged`                                                                |
| `test/storage-gateway.test.ts` (40)   | Contract, area split, tab independence, validation, failures, subscriptions, Clear data                                             |
| `test/storage-migration.test.ts` (21) | Exit 1–3, idempotence, quarantine, quota-on-quarantine                                                                              |
| `test/storage-consumers.test.ts` (24) | No-bypass guard, content-script leanness, background wiring, boundaries                                                             |

**Changed**

| File                                      | Change                                                                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/application/ports/StorageGateway.ts` | Additive extension: `StateDescriptor`, scopes, areas, result types, typed methods. The five WS0 methods are unchanged            |
| `entrypoints/background.ts`               | Content-origin message branch with `contentSenderTabId`; `onInstalled` migration + orphan sweep; `tabs.onRemoved` → real cleanup |
| `entrypoints/content.ts`                  | Three direct `storage.local.set` calls → `PERSIST_PICK` / `PERSIST_PICKER_STATE` over the existing seam, ack-checked             |
| `entrypoints/sidepanel/SidePanel.tsx`     | Gateway hydration/watch/write; active-tab binding with `tabs.onActivated`; write failures surfaced                               |
| `utils/messaging.ts`                      | Two new message types, deliberately without `targetTabId`                                                                        |
| `src/ui/copy/errors.ts`                   | New `STORAGE_WRITE_FAILED` state (title / cause / action)                                                                        |

## 4. Storage model

- **Namespace** `pg:` · **version** `v2`, in every key **and** in a per-value envelope `{ v, data }`.
- **Keys** — global `pg:v2:<key>`; per tab `pg:v2:tab:<tabId>:<key>`.
- **Areas** — `local`: `code-buffer`, `pw-lang` (durable). `session`: `picker-active`, `last-pick`
  (transient, correct lifetime, keeps churn out of the durable area).
- **Tab scoping** — by `tabId`. A tab-scoped descriptor cannot be read or written globally and a global one
  cannot be given a tab id; both throw rather than writing a malformed key.
- **Validation** — hand-written deterministic validators per descriptor; invalid data becomes the declared
  default, with `valid:false` and a code so the caller can tell "nothing saved" from "not trustworthy".
  Invalid values are also rejected on write, so nothing unreadable can enter storage.
- **Migration** — detect legacy shape structurally → validate → write v2 → **read back and compare** →
  retire legacy key. Quarantine record `pg:v2:__quarantine:<key>` holds key, timestamp, value type and byte
  length only.

## 5. Migration proof

| Scenario                | Result                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Valid v1 → v2           | Content equal; legacy key retired **only after** read-back verification                   |
| Idempotence             | Three runs → one stable state, no duplication, later user edits not clobbered             |
| Failed v2 write         | `ok:false`; `pg_code_buffer` still present and unchanged                                  |
| Quota failure           | `QUOTA_EXCEEDED`; legacy value preserved                                                  |
| Read-back mismatch      | `VERIFY_FAILED`; legacy key **not** retired                                               |
| Malformed legacy        | Quarantined with metadata only; original never deleted; second run does not stack records |
| Quota during quarantine | Migration fails, original retained, no quarantine record written                          |
| Retry after recovery    | Succeeds and completes the migration                                                      |

## 6. Failure-first tests

Baseline 1,037 / 44 → **final 1,126 / 47** (+89 tests, +3 files). Covered: F1 unavailable · F2 write
failure · F3 read failure · F4 quota · F5 malformed · F6 unknown version · F7 migration failure · F8 partial
object · F9 two-tab independence · F10 tab removal · F12 write completes before the caller continues ·
F13 durable across a fresh gateway · F14 legacy detection · F15 empty/default · F16 stale tab state ·
F17 area filtering · F18 unknown extra fields — plus idempotence, zero-loss, quarantine, Clear data,
namespace isolation and no-bypass guards. Tests were written first and confirmed failing for the intended
reason (modules absent) before implementation. No existing test was deleted or weakened.

## 7. Consumer rewiring

**SidePanel:** yes. **content.ts:** yes — via the message seam, not by importing the gateway.
**DevTools:** intentionally unchanged (O5; its buffer persistence is WS5), and guarded by a test.

## 8. Security / privacy

No network, telemetry, external service, `eval`, `new Function`, unsafe HTML or `storage.sync` anywhere in
the new code — asserted directly. Migration logs counts and codes only, never user content or page-derived
data; the quarantine record never copies the value it describes. Privacy suite 11/11 including the
built-bundle layer.

## 9. Bundle

| Measure          | Before           | After                 | Δ            |
| ---------------- | ---------------- | --------------------- | ------------ |
| Total            | 298,842 B        | **308,473 B**         | **+9,631 B** |
| `content.js`     | 31,753 B         | **32,049 B**          | **+296 B**   |
| `background.js`  | 2,861 B          | 9,468 B               | +6,607 B     |
| Side-panel chunk | 34,302 B         | 36,726 B              | +2,424 B     |
| Ceiling          | 278,760 B        | 278,760 B             | unchanged    |
| Overage          | 20,082 B (7.20%) | **29,713 B (10.66%)** | +9,631 B     |

The growth sits where the architecture put it — the gateway, validators and migration live in
`background.js`, and the side panel gained hydration and watch logic. **`content.js` grew by 296 B only**,
which is the two message sends and `normalizeAck`: routing persistence across the background boundary is
what kept the storage implementation off the pick hot path. **No optimisation was performed**, the ceiling
was not changed, nothing was removed, and WS6.2.1 was not reopened.

## 10. Verification

`pnpm verify` — build PASS · typecheck PASS · lint PASS · **1,126 tests / 47 files** · format clean except
the permanent, untouched `ws2-item9-report.md`. R2 `architecture` 7/7 · R3 intact (`environment: 'node'` ×3)
· R5 `devtools-architecture` 18/18 and `verify-locator-panel` 18/18 · privacy 11/11.

Note: the R1 lint guard rejected the new adapter's original location mid-implementation. It was **moved to
`src/browser/storage.ts`**, the location the guard prescribes — the guard was not weakened.

## 11. Evidence limitations

- **Real Chrome multi-tab validation is DEFERRED pending future browser/E2E infrastructure.** Two-tab
  independence is proven at deterministic unit/contract and structural level only.
- Real `onInstalled` firing, real `tabs.onRemoved` firing and real quota limits are equally deferred; the
  tests prove the handlers are registered and the functions behave, not that Chrome invokes them.
- No axe, no Chromium, no real-user migration validation is claimed.

## 12. Exit criteria

| #   | Criterion                              | Status                                                                     |
| --- | -------------------------------------- | -------------------------------------------------------------------------- |
| 1   | v1 install upgrades with zero loss     | **MET** (content equality, verify-before-retire)                           |
| 2   | Migration is idempotent                | **MET** (three runs, no duplication, edits preserved)                      |
| 3   | Failure leaves v1 intact               | **MET** (write, quota and verification failures)                           |
| 4   | Two tabs keep independent picker state | **MET at unit/structural evidence**; browser deferred                      |
| 5   | Corrupted storage degrades to empty    | **MET** (wrong type, partial, invalid enum, unknown version, extra fields) |

## 13. Reported, not resolved

The roadmap's WS4 deliverables name "quota caps + debounced writes" but **define no numeric cap and no
debounce interval anywhere in the authoritative documents**, and §15 of the authorisation forbids inventing
product numbers. Quota-failure _handling_ is implemented (detected, classified as `QUOTA_EXCEEDED`,
surfaced, never silently swallowed); a numeric cap and a debounce interval need an owner number. **No
accepted exit criterion depends on either.**

## 14. Documentation and delivery

`ProgressDocument/DECISION-LOG.md` (**DL-66**, class `LOCKED`) · `MASTER-ROADMAP.md` (WS4 section + §30 row)
· `CURRENT-STATE.md` (WS4 row, execution pointer, Updated line) · `PROGRESS.md` (Updated line, milestone
row) · this report. Backup `ws4-implementation-2026-09-03.zip`, delivered to `E:\Codes\playwrightguru`.

**WS4 = COMPLETE. WS5 is next and has not been started.**
