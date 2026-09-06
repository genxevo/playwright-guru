# WS9 — RECORDING, IMPLEMENTATION SLICE 1

**2026-09-04 · DL-72 · PARTIAL — slice 1 of the discovery gate's own §14 boundary**

## 1. Roadmap Decision

**Closed work:** WS0, WS1, WS2, WS4 (DL-66), WS5 (DL-68), WS7 (DL-60), WS8 (DL-62). WS6.2's
verification honesty closed at DL-71.

**Next authorised work: WS9, slice 1.** The reasoning is from the documents, not from momentum.

Every workstream earlier in canonical order that is not closed is blocked on an owner decision this
gate may not take:

| Earlier incomplete work     | Roadmap wording                                                                                                                                         | Authorised? |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| WS3 — standalone IIFE probe | "needs a project-owner decision before it can be implemented, not a guess"                                                                              | **No**      |
| WS3 — CI benchmarks         | "left for a future pass if wanted"                                                                                                                      | **No**      |
| WS6.2 — bundle overage      | "PARTIAL — BUNDLE STILL OVER CEILING … owner decision open"                                                                                             | **No**      |
| WS6.1 — hierarchy / F-12    | filed as **debt** by DL-69/D4 Option C; still carries a recorded self-contradiction (a "debug mode" its Exit criterion counts the absence of as a pass) | **No**      |

WS9's §30 status row named exactly **one** blocking dependency — WS4 — and DL-64's D2 worded the block
conditionally: _"WS9 stays BLOCKED / DEFERRED **until that foundation exists**."_ WS4 closed at DL-66,
so the block lifted by its own terms. WS9's other dependencies (WS3 at its accepted scope, WS5, WS7)
are satisfied, and its three blocking owner decisions D1/D2/D3 were resolved at DL-64.

**This is not a reorder.** The canonical ordering WS0 → … → WS11 is untouched. Only the
dependency-driven execution pointer moves — the mechanism DL-64 itself defined and CURRENT-STATE
restates — and there is direct precedent: WS7 and WS8 both ran to CLOSED while WS6 sat PARTIAL.

**Exact roadmap section:** `MASTER-ROADMAP.md` §WS9, plus the DL-63 discovery gate's §14 "Recommended
Implementation Boundary", which defines the slice.

## 2. Baseline (re-measured, not quoted)

| Measure         | Value                                     |
| --------------- | ----------------------------------------- |
| Tests           | 1,294 / 54 files                          |
| Total bundle    | 293,814 B                                 |
| `content.js`    | 33,150 B                                  |
| `background.js` | 9,746 B                                   |
| sidepanel chunk | 7,801 B                                   |
| devtools panel  | 1,386 B                                   |
| shared `client` | 142,932 B                                 |
| shared `tokens` | 89,251 B (+ 4,756 B CSS)                  |
| Locked ceiling  | 278,760 B — overage 15,054 B (**5.40 %**) |

Test/typecheck/lint exit 0; format exits 1 for `ws2-item9-report.md` only. These figures match DL-71
exactly, confirming no drift entering this gate.

## 3. Authorised Scope

**Included — the WS9 discovery gate's §14, verbatim:**

> "the `RecordedWorkflow` data model (verified chains + `ElementFactsLite`), the `runtime/recorder`
> with coalescing driven by `RECORDING_LIMITS`, redaction and truncation, and the limit behaviour at
> 40/100 … and `RECORDING_ENABLED` left **off** until the handshake and heartbeat exist."

**Explicitly excluded, and not stubbed:** the activation handshake · the heartbeat · persistence of any
kind · `renderAction` / `renderSpecFile` · the export menu · the structured code workspace · the v1
raw-line migration · navigation / SPA / frame / tab handling · any UI change · any `content.ts` wiring ·
flipping `RECORDING_ENABLED` · deleting the legacy recorder · any bundle work.

## 4. Discovery Findings — gap matrix

| #   | Requirement                                | Existing implementation                                                                                                 | Gap          | Risk                           | Action                |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------ | --------------------- |
| 1   | `RecordedWorkflow` + verified chains       | none; `RecordedAction` stores raw `ElementAttributes`                                                                   | whole model  | storing raw attrs violates §18 | **Built**             |
| 2   | `runtime/recorder`, coalescing from limits | legacy recorder in `content.ts`, unreachable, hard-codes 600 ms vs the 500 ms constant                                  | whole module | DL-4 drift repeats             | **Built**             |
| 3   | Password / card / file redaction           | legacy filter excludes `checkbox,radio,file,button,submit,reset` — **not `password`**; reads `el.value` unconditionally | complete     | **critical privacy leak**      | **Built**             |
| 4   | Truncation to `maxValueLength`             | legacy never truncates                                                                                                  | complete     | budget + privacy               | **Built**             |
| 5   | 40 warns without interrupting              | `recordingLimitState` exists, **zero consumers**                                                                        | no consumer  | exit criterion unmet           | **Built**             |
| 6   | 100 stops, actions preserved               | `shouldStopRecording` exists, **zero consumers**; legacy array unbounded                                                | no consumer  | exit criterion unmet           | **Built** (stop half) |
| 7   | ≤500 KB at 100 actions                     | no workflow budget model                                                                                                | complete     | exit criterion unmeasurable    | **Built**             |
| 8   | Activation handshake + heartbeat           | six timing constants, zero consumers                                                                                    | complete     | —                              | Later slice (§14)     |
| 9   | `renderAction` / `renderSpecFile`          | none                                                                                                                    | complete     | —                              | Later slice (§14)     |
| 10  | Structured workspace + v1 migration        | none                                                                                                                    | complete     | —                              | Later slice (§14)     |
| 11  | Export menu                                | none                                                                                                                    | complete     | —                              | Later slice (§14)     |
| 12  | Navigation / SPA / frame / tab handling    | none                                                                                                                    | complete     | —                              | Not in §14 slice      |

Rows 8–12 were **not** implemented and **not** scaffolded. "Preserved state" in row 6 means the stop
preserves captured actions in memory; durable preservation is persistence, which §14 sequences later.

## 5. Failure-First Evidence

| Behaviour                                                  | Test                                  | Expected failure | Observed failure                                 | Result   |
| ---------------------------------------------------------- | ------------------------------------- | ---------------- | ------------------------------------------------ | -------- |
| The whole model (limits, coalescing, redaction, budget)    | `ws9-recording-workflow.test.ts` (30) | module absent    | `Cannot find module '../src/recording/workflow'` | 30/30 ✅ |
| The runtime recorder (shared engine, never reads a secret) | `ws9-recorder-capture.test.ts` (19)   | module absent    | `Failed to load url ../src/runtime/recorder`     | 19/19 ✅ |

Both suites were written and run **before** any source file existed, and both failed for exactly that
reason. No assertion was weakened, deleted, mocked away or special-cased to pass; no existing test was
modified.

The strongest single assertion in the slice: `.value` is replaced by a **throwing getter** on password,
file and `autocomplete="cc-*"` inputs. The tests pass, which means nothing read it — a stronger claim
than "the value was not stored".

## 6. Implementation

| File                                  | Change                                                                                                               | Reason                                                                                                    | Architecture impact                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/config/recording.ts`             | **modified** — added `maxWorkflowBytes: 500 * 1024`                                                                  | §WS9 Exit says "≤500 KB at 100 actions"; this file's own contract forbids the number living anywhere else | none — one constant in the file that already owns every recording number     |
| `src/recording/redaction.ts`          | **new** — `redactionReasonFor(SensitiveFieldFacts)` → `password` / `file` / `payment` / `null`                       | decide sensitivity **before** a value is read                                                             | pure; **zero imports**; the type structurally cannot carry a value           |
| `src/recording/workflow.ts`           | **new** — `RecordedTarget` / `RecordedStep` / `RecordedWorkflow`, `appendStep`, `stopWorkflow`, workflow byte budget | the model, with all four rules enforced in one place                                                      | pure — no DOM, probe, resolver, storage or messages; node-testable under R3  |
| `src/runtime/recorder.ts`             | **new** — `recordedTargetFor`, `fieldFactsOf`, `stepForClick`, `stepForFill`, `stepForChange`                        | map a DOM event to a step through the ONE shared engine                                                   | delegates to existing `captureSnapshot`; declares no probe/resolver/counting |
| `test/ws9-recording-workflow.test.ts` | **new** — 30 assertions (node)                                                                                       | failure-first proof of the model                                                                          | —                                                                            |
| `test/ws9-recorder-capture.test.ts`   | **new** — 19 assertions (happy-dom)                                                                                  | failure-first proof of the runtime and the privacy guarantee                                              | —                                                                            |

**Drift sweep** (modification-time; this repository has no git): exactly these **6** files. No file
deleted, no dependency, no lockfile change, no build-config change.

### The four model rules, and the legacy defect each closes

1. **Bounded** — `hardStop` refuses further actions and preserves what was captured. Legacy:
   `[...prev, action]`, unbounded, so the cap could never fire.
2. **Uninterrupted** — `warnAt` changes only the reported state. The 40th action is still recorded and
   the recording runs on to 99 untouched, honouring the constant's own _"a teaching signal, not a gate"_.
3. **Truncated** — values cut to `maxValueLength`, including on a coalesce. Legacy: never truncated.
4. **Redacted** — a redacted step's value is **deleted**, not masked and not truncated, so no length,
   prefix or shape of a secret survives. Legacy: no password exclusion at all.

Rule 4 is defence in depth: the runtime never _reads_ a sensitive value, and the model refuses to
_store_ one. Either alone would be a single point of failure.

### Why name matching is tokenised

`"discardReason".includes("card")` is `true`. A substring test would redact an ordinary field and
quietly make recording useless, so names are split on camelCase and separators and matched as whole
tokens or as phrases. Precision matters in both directions, and the suite asserts `email`, `search` and
`discardReason` are **not** redacted as explicitly as it asserts that `cardNumber` and `CVV` are.

## 7. Architecture

- **One resolver** — ✅ `recordedTargetFor` calls `captureSnapshot`, which calls the existing
  `resolveCandidates` → `resolveStep` / `resolveChain`. Nothing new resolves anything.
- **One DomProbe** — ✅ the probe is constructed inside the existing capture path; the recorder never
  constructs one. A source-text guard pins the absence of `new LiveDomProbe` in `recorder.ts`.
- **No second locator engine** — ✅ `RecordedTarget.locator` **is** the existing `RecommendedLocator`,
  so a recorded action and a pick cannot describe an element two different ways.
- **Scope integrity** — ✅ WS6.2's D2 suites re-run green; `containsScopeHandle(recordedTarget)` is
  `false` and `structuredClone` succeeds, so no `ScopeHandle` escapes into a recording.
- **No DOM leakage** — ✅ the model is pure data; every recorded workflow round-trips through
  `JSON.stringify` and `structuredClone`.
- **No CommandBus** — ✅ none introduced; no message type added or changed.
- **No framework expansion** — ✅ Playwright only. No Selenium, Cypress, WebdriverIO, Puppeteer or
  generic multi-framework anything.

## 8. Security

| Guard                         | Result                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **R1** `wxt/browser` confined | ✅ still only `src/browser/**` + `entrypoints/**`; neither new recording module imports it                                              |
| **R2** `architecture.test.ts` | ✅ 7/7                                                                                                                                  |
| **R3** node test environment  | ✅ all three vitest projects still `environment: 'node'`; the recorder suite is a per-file happy-dom override, the established pattern  |
| **R5** `ui/**` isolation      | ✅ `src/ui/**` imports nothing from `browser/`, `runtime/`, `entrypoints/`; `devtools-architecture` 18/18, `verify-locator-panel` 18/18 |
| privacy                       | ✅ 11/11                                                                                                                                |
| honesty                       | ✅ 18/18                                                                                                                                |
| contracts / R4                | ✅ 33/33 and 16/16                                                                                                                      |
| match-counts                  | ✅ 17/17                                                                                                                                |
| preview-gate                  | ✅ 7/7 — `RECORDING_ENABLED` still pinned `false`                                                                                       |
| ws0-seams                     | ✅ 14/14 — `RECORDING_LIMITS` still the single source                                                                                   |
| storage-gateway               | ✅ 40/40 — this slice writes no storage at all                                                                                          |
| WS6.2 trust suites            | ✅ `resolver-chain-scope` 16/16, `resolver-state-options` 41/41, `resolver-options` 15/15 — **no D2/V-3 regression**                    |
| `eval` / `new Function` scan  | ✅ none in the new modules                                                                                                              |
| HTML injection                | ✅ no `innerHTML` / `outerHTML` / `insertAdjacentHTML`; the eslint `no-restricted-syntax` rule is untouched and lint exits 0            |
| Raw DOM serialisation         | ✅ none — only `ElementFactsLite` and a verified chain                                                                                  |
| Secret persistence            | ✅ nothing is persisted by this slice; and a secret is never read in the first place                                                    |

## 9. Validation

Each command run **alone**, exit code read individually.

| Command             | Exit | Detail                                                                  |
| ------------------- | ---- | ----------------------------------------------------------------------- |
| `pnpm -r test`      | 0    | locator-engine 383 · codegen 127 · extension 833 = **1,343 / 56 files** |
| `pnpm -r build`     | 0    | Σ 293,814 B                                                             |
| `pnpm typecheck`    | 0    | —                                                                       |
| `pnpm lint`         | 0    | no errors, no warnings                                                  |
| `pnpm format:check` | 1    | **only** `ws2-item9-report.md` — the permanent accepted exception       |

## 10. Bundle

| Artifact        | Before    | After     | Delta   |
| --------------- | --------- | --------- | ------- |
| Total           | 293,814 B | 293,814 B | **0 B** |
| `content.js`    | 33,150 B  | 33,150 B  | 0 B     |
| `background.js` | 9,746 B   | 9,746 B   | 0 B     |
| sidepanel chunk | 7,801 B   | 7,801 B   | 0 B     |
| devtools panel  | 1,386 B   | 1,386 B   | 0 B     |

**0.00 %.** This is measured, not assumed: `grep` over `.output/chrome-mv3` finds **zero** occurrences
of `recordedTargetFor`, `redactionReasonFor`, `assessWorkflowBudget`, `maxWorkflowBytes` and
`stepForFill`. Nothing shipped imports these modules, so tree-shaking excludes them entirely — the same
arrangement `fact-model.ts` has had since WS3, and deliberately so: the slice that puts recording in
front of a user is the one that should measure and decide its cost.

**Still over ceiling: YES.** 293,814 B against the locked 278,760 B — **15,054 B, 5.40 % over**.
Unchanged by this gate, not chased, and still owner-level release-budget debt.

## 11. Browser Evidence

**Real Chromium tested: NO.**

What was proven instead: unit tests, happy-dom fixtures, hand-built fakes, and source-text guards that
pin architectural _absences_. happy-dom has no layout engine, so every element reads as visible and
`total === visible` throughout; it has no `document.evaluate`.

This is precisely DL-64's D1 re-scope — unit + structural proof — and it **is not equivalent to
live-browser E2E and is not presented as such**. WS9's X1 exit criterion ("an E2E test that kills the
content script proves the RECORDING banner cannot appear") is untouched by this slice: it belongs to the
activation-handshake / heartbeat slice, and live-browser proof remains deferred future infrastructure.
No E2E harness, `@playwright/test`, Chromium fixture or DOM test environment was added.

## 12. Documentation

- `ProgressDocument/DECISION-LOG.md` — **DL-72**, class `CURRENT`, inserted above DL-71; no historical
  entry rewritten.
- `ProgressDocument/MASTER-ROADMAP.md` — WS9 header `DEFERRED` → `PARTIAL — SLICE 1 IMPLEMENTED`, an
  implementation block appended under §WS9 (the original wording and the DL-63/DL-64 blocks untouched),
  and the §30 dashboard WS9 row rewritten.
- `ProgressDocument/CURRENT-STATE.md` — `Updated:` line and the execution-pointer row.
- `ProgressDocument/PROGRESS.md` — `Updated:` line and a new milestone row. History preserved.
- `ProgressDocument/ws9-implementation-2026-09-04.md` — this report.

WS9 is **not** marked complete anywhere.

## 13. Backup

`ws9-implementation-2026-09-04.zip` — full source tree excluding `node_modules`, `.output`, `dist`,
`.wxt` — delivered to `E:\Codes\playwrightguru`, with the updated documents and this report.

## 14. Remaining Debt

**New, recorded this gate, not fixed:**

- `snapshot.ts`'s `RecommendedLocator.stepCounts` doc comment is **stale since DL-71**. It still reads
  "in WS0 these are INDEPENDENT per-step measurements … They become cumulative when scoped resolution
  lands in WS3", when D2 already made them cumulative. It is a false statement in shipped source about
  trust semantics and could mislead a future implementer into re-introducing the false green — but it is
  WS6.2's tail, not WS9's scope, so it is filed for an owner decision rather than silently corrected.

**Pre-existing, unchanged:**

- **Bundle overage** — 15,054 B / 5.40 % over the locked ceiling. Owner-level decision, open since DL-56.
- **`storage-migration.test.ts` flake** — ~6.9 % of runs; the quarantine record's `Date.now()` can
  contain the literal `42` the assertion forbids. Product correct, test wrong. **Not touched by this
  slice, and not required by it.**
- **WS6.1** — Primary/Secondary/Educational hierarchy and F-12 surfacing unstarted, plus the recorded
  "debug mode" self-contradiction between its Deliverables and WS6's Exit criterion.
- **WS3** — standalone IIFE probe build deferred (owner decision); CI benchmarks not implemented.
- **No real-browser infrastructure** anywhere in the repository.
- **The legacy recorder** in `entrypoints/content.ts` still exists, still unreachable. Deleting it
  belongs to the slice that actually replaces it per DL-64/D3; DL-4 stays historical.

## 15. Final Verdict

**PARTIAL.**

- Slice 1 of WS9 is delivered exactly at the discovery gate's own §14 boundary, with both suites written
  failure-first and confirmed failing before implementation.
- WS9 as a whole is **not** complete: the activation handshake, heartbeat, persistence, renderers,
  export menu and structured workspace are not started, and `RECORDING_ENABLED` remains `false`, so
  recording is still unreachable by any user.
- Two of WS9's five exit criteria are now met at unit evidence ("40 does not interrupt", "≤500 KB at
  100 actions") and one partially ("100 stops" — the stop, not durable preservation); "passwords never
  captured" is met for the recorder that exists, and X1 is untouched and still deferred.
- Every locked architecture and trust guarantee survives: one resolver, one DomProbe, no DOM leakage,
  no fabricated verification, and WS6.2's D2/V-3 suites re-run green.
- Bundle Δ 0 B; the 15,054 B overage is unchanged, disclosed, and deliberately not chased.
