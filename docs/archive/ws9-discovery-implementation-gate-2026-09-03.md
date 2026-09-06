# 1. EXECUTIVE SUMMARY

WS9 discovery is complete. **Implementation is BLOCKED and no WS9 code was written; no source file was
changed.**

The good news is architectural: §18's commitment that recording consumes the shared verified locator engine
— _"there is never a second locator implementation"_ — requires **no new engine, no second AST, no resolver
change, no new DOM abstraction and no CommandBus**. `resolveStep` is already bundled into `content.js`
through the pre-existing Pick path, and `ElementFactsLite` already exists. Three of the five exit criteria
are implementable with the current architecture and honest evidence.

Two are not, and they need the owner:

1. **"An E2E test that kills the content script proves the RECORDING banner cannot appear."** No extension
   E2E infrastructure exists anywhere in this repository, and creating it is exactly the kind of
   infrastructure decision this gate may not take alone.
2. **"100 stops with preserved state."** Preserved state needs versioned, validated, tab-scoped storage.
   That is **WS4**, which is **NOT STARTED**, and WS9's own "v1 raw-line migration" deliverable is the same
   work as WS4's "zero loss of `pg_code_buffer`" exit criterion.

A third item needs confirmation rather than a design choice: the legacy recorder in `content.ts` is
unreachable dead code of the wrong shape, and §18 implies replacement rather than extension.

# 2. WS9 AUTHORITATIVE PURPOSE

From `MASTER-ROADMAP.md` §12: **"Recording that is real, structured, honest, privacy-safe."**

From §18 (Future Recording Architecture): _"recording consumes the shared verified locator engine. There is
never a second locator implementation"_ —
`Record → capture action → SAME DomProbe → SAME LocatorResolver → verified LocatorChain → verdict +
rationale codes → ElementFactsLite → RecordedWorkflow → codegen ×5 languages`. `RecordedTarget` stores
**the verified chain, not a rendered string**.

# 3. WS9 CONTRACT

**In scope (deliverables).** `runtime/recorder` with noise filter and coalescing · `RecordedWorkflow` with
verified `LocatorChain`s + `ElementFactsLite` · activation handshake + heartbeat · navigation/SPA/frame/tab
handling · limits from the single constant · password/card/file redaction · `renderAction` +
`renderSpecFile` · structured code workspace + v1 raw-line migration · export menu.

**Out of scope.** Assertions (WS10) · DevTools recording · step editing.

**Dependencies.** WS3, WS4, WS5, WS7.

**Data model.** `RecordedWorkflow` holding verified chains plus `ElementFactsLite` per action.
**Runtime.** Content-script event capture, activation handshake, heartbeat, navigation/SPA/frame/tab
lifecycle. **UI.** Banner driven by content-script-written state, counter, export menu, structured code
workspace. **Security/privacy.** Zero network, no `eval`, password/card/file redaction, value truncation.
**Performance/bundle.** ≤500 KB per 100-action workflow; the extension bundle is already over its ceiling
and that debt is separate. **Exit criteria** are reproduced in §5.

# 4. CURRENT IMPLEMENTATION INVENTORY

**Exists and is reusable**

| Item                                               | Evidence                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RECORDING_LIMITS` as the single source of truth   | `src/config/recording.ts` — 40 / 100 / 500 chars / 500 ms / 400 ms / 5 s / 15 s; `ws0-seams.test.ts` pins the values **and** single-module ownership |
| `RECORDING_ENABLED=false` UI gate                  | `src/config/recording.ts`; `preview-gate.test.ts` pins that no recording control renders                                                             |
| `RecordedAction` type + message routing            | `utils/messaging.ts`; `background.ts` knows `START_RECORDING` / `STOP_RECORDING`                                                                     |
| `ElementFactsLite` + `toElementFactsLite`          | `packages/locator-engine/src/facts.ts`                                                                                                               |
| Verified-chain machinery inside the content script | `runtime/capture.ts` calls `resolveStep`; DL-58 proved it is already in `content.js`                                                                 |

**Missing entirely.** `RecordedWorkflow` · `renderAction` · `renderSpecFile` (codegen exports only
`generateLocatorCode`) · activation handshake · **any** heartbeat consumer — all six timing constants have
zero consumers · navigation/SPA/frame/tab handling · export menu · structured code workspace.
`captureSnapshot` exists and is tested but stays deliberately unwired (WS3-deferred); it is the natural
source of per-action `ElementFactsLite`.

**The legacy recorder — dead code, and the wrong shape.** `entrypoints/content.ts` carries
`startRecording`/`stopRecording` and click/input/change listeners that are **unreachable**: there is no
`START_RECORDING` case in the message switch, which is precisely why `RECORDING_ENABLED` is off. Its
defects, all inherited if it were extended rather than replaced:

- stores raw `attrs`, **not** verified chains — contradicts §18;
- **hard-codes a 600 ms debounce where the constant says 500 ms** — DL-4's recorded contradiction, still
  open;
- `appendRecAction` does an unbounded read-modify-write of one flat array, with no cap and no coalescing
  beyond the debounce;
- its input filter excludes checkbox/radio/file/button/submit/reset but **not `password`**, and applies no
  `maxValueLength` truncation and no card redaction.

The password gap is reported as a **finding, not a live vulnerability**: nothing is captured today because
nothing can reach the recorder.

# 5. EXIT-CRITERION CLASSIFICATION

| ID  | Criterion                                                          | Status                   | Evidence                                                                                                                                                       | Gap                                           | Resolution                                 |
| --- | ------------------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------ |
| X1  | E2E test kills the content script → RECORDING banner cannot appear | **BLOCKED**              | `@playwright/test` in no manifest; no `e2e/` directory; all three vitest projects `environment: 'node'` under R3                                               | No extension E2E infrastructure exists        | **Owner decision D1**                      |
| X2  | 40 does not interrupt                                              | **IMPLEMENTABLE**        | `RECORDING_LIMITS.warnAt`, `recordingLimitState`, pinned by `ws0-seams.test.ts`                                                                                | No recorder consumes it                       | Implement with the recorder, unit-tested   |
| X3  | 100 stops with **preserved state**                                 | **BLOCKED (dependency)** | `hardStop`/`shouldStopRecording` exist; persistence is six flat global keys — the defect `StorageGateway`'s doc says **"WS4 implements"**; **WS4 NOT STARTED** | No versioned / validated / tab-scoped storage | **Owner decision D2**                      |
| X4  | passwords never captured                                           | **IMPLEMENTABLE**        | Legacy filter omits `password`; no truncation                                                                                                                  | Redaction absent                              | Implement in the new recorder, unit-tested |
| X5  | workflow ≤500 KB at 100 actions                                    | **IMPLEMENTABLE**        | `ElementFactsLite` exists; DL-53's snapshot byte-budget tests are the precedent                                                                                | `RecordedWorkflow` model does not exist       | Implement + byte-budget test               |

# 6. ARCHITECTURE ANALYSIS

WS9 as specified requires **none** of: second locator engine · second AST · resolver replacement · new DOM
abstraction · CommandBus · network access · `eval`/`new Function` · unsafe HTML · new browser automation
dependency · cross-frame architecture rewrite · bundle restructuring.

It **does** require a persistence layer that does not yet exist (WS4), and X1 requires a browser test
environment that does not exist. Both are surfaced as owner decisions rather than taken unilaterally.

# 7. TEST / EVIDENCE ANALYSIS

The existing architecture — Vitest, Node environments, structural and unit guards — can honestly prove X2,
X4 and X5. It **cannot** prove X1: killing a content script and observing that a banner never appears is a
live-browser behaviour, and no structural assertion would prove it. Manufacturing a structural test and
labelling it as satisfying X1 would be fabricated evidence, so it was not done.

Failure-first plan for the implementable slice (drafted, not implemented): password/card field →
**redacted, never stored**; value longer than `maxValueLength` → truncated; 39/40/41 actions → counter
amber at 40, **no interruption**; 99/100/101 → stops exactly at 100 with actions preserved; detached
element → action dropped honestly, not fabricated; rapid double click inside `dblclickWindowMs` →
one `dblclick`; consecutive edits inside `fillDebounceMs` → one `fill`; storage write failure → recording
degrades visibly rather than silently claiming success; 100-action workflow → serialized size under 500 KB.

# 8. SECURITY / PRIVACY ANALYSIS

WS9 introduces no network access, no telemetry, no remote logging and no unsafe execution. The privacy
risk it does introduce is **retention of typed page content**, which is exactly what the redaction and
truncation deliverables address. The existing privacy guards (11/11 passing, including the built-bundle
layer) remain unweakened. The dead legacy recorder's missing `password` exclusion is documented above.

# 9. PERFORMANCE / BUNDLE ANALYSIS

Verified from the current build, not assumed:

| Measure        | Value                |
| -------------- | -------------------- |
| Total          | **298,842 B**        |
| `content.js`   | **31,753 B**         |
| Locked ceiling | 278,760 B            |
| Overage        | **20,082 B — 7.20%** |

**Unchanged by this gate; measured, not optimised.** Expected WS9 delta if implemented: growth in
`content.js` (the recorder is content-script code, so this is the hot path) plus the panel/shared chunks for
the workspace and export UI, and a new codegen surface for `renderAction`/`renderSpecFile`. That is a
material addition to an already-over-ceiling bundle and would need disclosure at implementation time. No
optimisation was performed and the ceiling was not changed.

# 10. DEPENDENCY ANALYSIS

**No new runtime dependency is required** for the implementable slice — the verified-chain machinery,
`ElementFactsLite` and the limits constant all already exist. The only dependency question is X1's E2E
harness (`@playwright/test` plus an extension-loading fixture), which is part of decision D1 and was not
installed.

# 11. CROSS-WORKSTREAM DEPENDENCIES

| WS      | Status             | Bearing on WS9                                                                                                                                 |
| ------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| WS3     | PARTIALLY COMPLETE | `captureSnapshot` exists but is deliberately unwired; WS9 needs a per-action facts source                                                      |
| WS4     | **NOT STARTED**    | **Hard blocker for X3.** Six flat global keys today; WS9's "v1 raw-line migration" is WS4's own "zero loss of `pg_code_buffer`" exit criterion |
| WS5     | PARTIAL            | `PickSource`/leaf-first extraction unfinished; recording UI state would sit in the same panels                                                 |
| WS6/6.2 | PARTIAL            | No direct WS9 dependency found                                                                                                                 |
| WS7     | CLOSED / COMPLETE  | Supplies the verified-chain contract WS9 consumes. **Not reopened**                                                                            |
| WS8     | CLOSED / COMPLETE  | Recording UI must meet the WS8 a11y/error-state bar. **Not reopened**                                                                          |

A dependency on an incomplete earlier workstream is an owner decision, not a licence to finish it — **WS4
was not started, extended or closed by this gate**.

# 12. MANUAL VALIDATION REQUIREMENTS

X1 (kill the content script, observe the banner) is **automatable only with real-Chrome extension E2E**;
today it is **unavailable**. Multi-tab, multi-frame, navigation/SPA and extension-lifecycle behaviour are
likewise browser-level. The existing smoke-matrix rows 9 and 10 ("No Record button anywhere", "No RECORDING
banner can appear") remain **manual** and are not claimed passed by this gate.

# 13. OWNER DECISIONS REQUIRED

| ID  | Question                                                                  | Recommended                                                                                                                                                                              | Alternatives                                                                                                                                             | Impact                                                                                                         |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| D1  | What evidence level satisfies X1 (kill-the-content-script proof)?         | **Re-scope**, as WS8's axe criterion was re-scoped at DL-62: prove the heartbeat/staleness contract by unit tests plus structural guards, and record that live-browser proof is deferred | (a) Authorise an extension E2E harness (`@playwright/test` + extension fixture) as its own infrastructure workstream; (b) leave X1 permanently open      | Re-scope = no new infrastructure; harness = a real new test architecture and dependency                        |
| D2  | How is the WS4 storage dependency behind X3 ("preserved state") resolved? | **Implement WS4 first** — its exit criterion and WS9's migration deliverable are the same work, and doing it once avoids building recording on keys the roadmap already calls defective  | (a) Authorise WS9 to persist knowingly on the six flat keys and accept the tab-scoping/versioning debt; (b) authorise a bounded storage slice inside WS9 | WS4-first delays WS9 but removes rework; the alternatives create known debt inside a privacy-sensitive feature |
| D3  | Is the legacy recorder **replaced** per §18, rather than extended?        | **Confirm replacement.** It stores raw attrs, not verified chains, and carries DL-4's 600 ms/500 ms contradiction and the missing `password` exclusion                                   | Extend it (not recommended — inherits every defect and contradicts §18)                                                                                  | Replacement also closes DL-4                                                                                   |

# 14. RECOMMENDED IMPLEMENTATION BOUNDARY

Once D1–D3 are answered, the smallest honest first slice is: the `RecordedWorkflow` data model (verified
chains + `ElementFactsLite`), the `runtime/recorder` with coalescing driven by `RECORDING_LIMITS`,
redaction and truncation, and the limit behaviour at 40/100 — with failure-first tests as drafted in §7,
and `RECORDING_ENABLED` left **off** until the handshake and heartbeat exist. `renderAction`/
`renderSpecFile`, the export menu and the structured workspace follow; the workspace migration waits on D2.

# 15. IMPLEMENTATION COMPLETED

**None.** This gate wrote no WS9 code and changed no source file.

# 16. VALIDATION RESULTS

1,037 tests / 44 files PASS · build PASS · typecheck PASS · lint PASS · format clean except the permanent
`ws2-item9-report.md` exception. Unchanged from WS8's closure, as expected for a discovery-only gate. A
modification-time sweep across `packages/**/*.{ts,tsx,css}` confirms zero source drift. No git repository
exists in this environment, so no commit is claimed.

# 17. BUNDLE RESULTS

298,842 B total · 31,753 B `content.js` · ceiling 278,760 B · overage 20,082 B (7.20%). Unchanged. Not
optimised, ceiling not altered.

# 18. DOCUMENTATION CHANGES

- `ProgressDocument/DECISION-LOG.md` — **DL-63** (next available number, confirmed dynamically; DL-62 was
  the prior latest), full 5-column format, class `CURRENT`.
- `ProgressDocument/MASTER-ROADMAP.md` — a discovery-status block under WS9 (original wording untouched)
  and the §30 dashboard WS9 row.
- `ProgressDocument/CURRENT-STATE.md` — new WS9 row and `Updated:` line. WS0–WS8 rows unchanged.
- `ProgressDocument/PROGRESS.md` — `Updated:` line, a milestone-history row, and a WS9 discovery narrative.
  Historical milestones preserved.

WS9 is **not** marked complete or partial anywhere; it remains DEFERRED / NEXT with discovery recorded.

# 19. BACKUP / DELIVERY

`ws9-discovery-gate-2026-09-03.zip` — the four updated documents plus this report — delivered to
`E:\Codes\playwrightguru` (documents into `ProgressDocument\`, report and ZIP at the repository root).

# 20. FINAL GATE STATUS

**OUTCOME C — BLOCKED / REQUIRES OWNER DECISION.**

WS9 discovery is complete and the contract is established. Implementation has not started and will not
start until D1, D2 and D3 are answered. WS10 and beyond were not touched, scaffolded or designed.

---

# OWNER DECISION / RE-BASELINE RESULT

_Appended 2026-09-03 by the WS9 Owner Decision / Re-Baseline Gate. The discovery findings above are
unchanged; this section records only how the owner resolved them. Full entry: **DL-64** in
`ProgressDocument/DECISION-LOG.md`._

- **D1 — X1 evidence level: RE-SCOPE ACCEPTED.** For the current WS9 implementation gate, the
  kill-the-content-script criterion is satisfied by **unit + structural proof of recording activation /
  heartbeat / staleness behaviour**. This is **not equivalent to live-browser E2E validation and must never
  be presented as such**; live-browser proof remains **deferred future infrastructure**. No E2E harness,
  `@playwright/test`, Chromium fixture or DOM test environment was added; R3 unchanged.
- **D2 — WS4 dependency: WS4 IS IMPLEMENTED FIRST.** **WS4 is now the next implementation workstream** and
  **WS9 remains BLOCKED / DEFERRED** until WS4's persistence/workspace foundation exists. No temporary WS9
  persistence layer, ad-hoc storage slice, or recording state on the current flat keys is authorised.
  Canonical roadmap ordering is unchanged — the execution pointer only, and it is dependency-driven. WS4
  itself has **not started**.
- **D3 — legacy recorder: REPLACED, NOT EXTENDED.** The future WS9 recorder is built against §18's
  architecture, storing verified `LocatorChain`s rather than rendered strings. The legacy recorder was not
  modified. **DL-4 stays historical and is not rewritten or fixed by this gate**: its 600 ms value belongs
  to obsolete unreachable code slated for replacement, the future recorder must consume `RECORDING_LIMITS`,
  and no WS9 recorder has been built.

**Implementation status after the decisions:** no WS9 implementation, no WS4 implementation, no production
source change; `RECORDING_ENABLED` remains `false`; bundle unchanged at 298,842 B / `content.js` 31,753 B,
still 20,082 B (7.20%) over the locked ceiling and still unresolved owner-level debt.
