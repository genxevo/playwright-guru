# 1. GATE PURPOSE

Formally resolve the three blockers raised by the WS9 discovery gate (DL-63), re-baseline the roadmap's
execution pointer, preserve architectural truth, and establish WS4 as the next implementation workstream.

**This was not an implementation run.** No WS9 code, no WS4 code, no production source change, no
dependency installed, no test or browser infrastructure added.

# 2. SOURCE-DRIFT RESULT — PASS

No git repository exists in this environment (`git status` → `fatal: not a git repository`), matching every
prior gate, so drift was checked by a modification-time sweep instead of a diff:

- `packages/**` — **zero** changes to `*.ts`, `*.tsx`, `*.css`, `*.json`, `*.html`.
- Root — **no** change to `package.json`, `pnpm-lock.yaml`, `vitest.workspace.ts`, `tsconfig*` or the
  eslint config.
- Re-checked again after the documentation edits: still zero.

The DL-63 baseline is therefore trustworthy. Every finding the decisions rest on was re-verified rather
than assumed: `@playwright/test` and `axe-core` in no manifest and no `e2e/` directory; all three vitest
projects still `environment: 'node'` (R3 intact); `StorageGateway` still documents the layer **"WS4
implements"** and the same six flat global keys are still in use; the legacy recorder is unchanged — still
`setTimeout(flushRecFill, 600)`, still **zero** `START_RECORDING` occurrences, still unreachable;
`RECORDING_ENABLED = false`.

# 3. BASELINE

| Measure        | Value                  |
| -------------- | ---------------------- |
| Tests          | 1,037 tests / 44 files |
| Total bundle   | 298,842 B              |
| `content.js`   | 31,753 B               |
| Locked ceiling | 278,760 B              |
| Overage        | 20,082 B — 7.20%       |

Unchanged by this gate.

# 4. D1 — X1 EVIDENCE LEVEL: RE-SCOPE ACCEPTED

WS9's exit criterion "an E2E test that kills the content script proves the RECORDING banner cannot appear"
is re-scoped, for the current WS9 implementation gate, to **unit + structural proof of the recording
activation / heartbeat / staleness behaviour**.

That evidence proves the contract structurally and deterministically. It is **not equivalent to
live-browser E2E validation and must never be represented as such.** **Live-browser proof remains DEFERRED
/ FUTURE INFRASTRUCTURE.**

No E2E harness, `@playwright/test`, Chromium fixture or DOM test environment was created, and R3 was not
altered. This mirrors the honest-evidence-level re-scope the owner applied to WS8's axe criterion at DL-62.

# 5. D2 — WS4 DEPENDENCY: WS4 IS IMPLEMENTED FIRST

WS9's "100 actions → stop → state preserved", its structured code workspace and its v1 raw-line migration
all require versioned, validated, tab-scoped persistence. That is WS4's responsibility, and WS9's migration
deliverable is the same work as WS4's own "zero loss of `pg_code_buffer`" exit criterion. Building WS9
persistence first would create a duplicate or throwaway storage architecture on keys the roadmap already
calls defective.

**WS4 becomes the next implementation workstream. WS9 remains BLOCKED / DEFERRED until the required WS4
persistence/workspace foundation exists.** No temporary WS9 persistence layer, no ad-hoc bounded storage
slice, and no recording state on the current flat keys is authorised.

**This is not a roadmap reorder.** Canonical ordering remains WS0 → WS1 → WS2 → WS3 → WS4 → WS5 → WS6 →
WS7 → WS8 → WS9 → WS10 → WS11. Only the execution pointer is clarified, and it is dependency-driven.

# 6. D3 — LEGACY RECORDER: REPLACED, NOT EXTENDED

The future WS9 recorder must be built against §18's authoritative architecture — capture action → SAME
`DomProbe` → SAME `LocatorResolver` → verified `LocatorChain` → verdict + rationale → `ElementFactsLite` →
`RecordedWorkflow` — storing **verified chains, not rendered strings**. The unreachable legacy recorder is
not the implementation target and **was not modified in this gate**.

**On DL-4:** it stays historical and is **not rewritten**. Its 600 ms-vs-500 ms contradiction is **not
"fixed" by this gate** — the 600 ms value belongs to obsolete, unreachable recorder code that D3 designates
for replacement; the future WS9 recorder must consume `RECORDING_LIMITS`; and no WS9 recorder has been
built. The same applies to that dead code's missing `password` exclusion, absent truncation and absent card
redaction: findings against code that will be replaced, not live defects, since nothing can reach it.

# 7. WHY WS4 IS NOW NEXT

Because WS9 explicitly depends on it. The dependency is documented in WS9's own Dependencies line
(WS3, WS4, WS5, WS7), confirmed in the code (`StorageGateway` is a WS0 contract whose doc says "WS4
implements it", against six flat global keys in use today), and reinforced by the overlap between WS9's
"v1 raw-line migration" and WS4's `pg_code_buffer` migration exit criterion.

WS4 has **not started** and must run its own discovery → implementation gate → owner decision →
implementation → validation → closure cycle.

# 8. WHY WS9 REMAINS BLOCKED

Its persistence-dependent criterion cannot be satisfied honestly without WS4's foundation, and building a
parallel storage layer to work around that would create exactly the duplication D2 forbids. WS9 may resume
once WS4 is implemented and closed to the degree its dependency contract requires. D1's live-browser
validation remains future infrastructure; D3 requires replacement of the legacy recorder.

# 9. LEGACY RECORDER DISPOSITION

Replace per §18. Not extended, not retrofitted, and untouched by this gate. It remains unreachable dead
code; `RECORDING_ENABLED` remains `false`.

# 10. BUNDLE BASELINE

298,842 B total · `content.js` 31,753 B · ceiling 278,760 B · **over by 20,082 B (7.20%)**.

**Not optimised, not altered, ceiling unchanged, WS6.2.1 not reopened.** This remains outstanding
owner-level release-budget debt and is **not** presented as solved.

# 11. VALIDATION RESULT

- **Tests: 1,037 passed / 44 files** — unchanged.
- **Build** PASS · **Typecheck** PASS · **Lint** PASS.
- **Format:** clean except the known, untouched `ws2-item9-report.md`.
- **R2** `architecture.test.ts` 7/7 · **R3** intact (`environment: 'node'` × 3) · **R5**
  `devtools-architecture.test.ts` 18/18 and `verify-locator-panel.test.ts` 18/18 · privacy 11/11.
- No `@playwright/test`, no `axe-core`, no new dependency, no lockfile change.

# 12. SECURITY / PRIVACY RESULT

No network calls, telemetry, external services, unsafe execution, `eval`, `new Function`, dynamic code
execution, new storage behaviour, recording activation, password/card capture path or new retention
mechanism was introduced. No implementation means no new recording privacy surface.

# 13. DOCUMENTATION CHANGED

- `ProgressDocument/DECISION-LOG.md` — **DL-64** added (next available number, confirmed dynamically;
  DL-63 was the prior latest), existing 5-column format, class `LOCKED`. No historical entry rewritten or
  renumbered; DL-4 left historical.
- `ProgressDocument/MASTER-ROADMAP.md` — WS9 owner-decision block (discovery findings preserved), WS4
  section execution-pointer note, dashboard rows for WS4 / WS9 / WS10 plus a WS6.2.1 row reflecting DL-58's
  already-recorded outcome, and the executive summary.
- `ProgressDocument/CURRENT-STATE.md` — new "Current execution status" section, WS9 row, `Updated:` line.
  WS0–WS8 history preserved.
- `ProgressDocument/PROGRESS.md` — `Updated:` line, milestone-history row, and a WS9 owner-decision
  narrative section. Historical milestones preserved.
- `ws9-discovery-implementation-gate-2026-09-03.md` — a clearly labelled **OWNER DECISION / RE-BASELINE
  RESULT** addendum appended; the discovery findings themselves are unchanged.

# 14. BACKUP / DELIVERY

- Backup: `ws9-owner-decision-rebaseline-2026-09-03.zip` (project convention
  `ws<N>-<description>-<date>.zip`) — the four updated documents, the annotated discovery report, and this
  report.
- Destination: `E:\Codes\playwrightguru` — documents into `ProgressDocument\`, reports and ZIP at the
  repository root.
- Rejected files: **0**.

# 15. ROADMAP STATE

| WS      | State                                                                   |
| ------- | ----------------------------------------------------------------------- |
| WS0     | CLOSED / LOCKED                                                         |
| WS1     | CLOSED                                                                  |
| WS2     | COMPLETE                                                                |
| WS3     | PARTIALLY COMPLETE                                                      |
| WS4     | **NEXT — NOT STARTED**                                                  |
| WS5     | PARTIAL                                                                 |
| WS6     | PARTIALLY DELIVERED                                                     |
| WS6.2   | PARTIAL / BUNDLE DEBT                                                   |
| WS6.2.1 | CLOSED — NO SAFE MEANINGFUL REDUCTION FOUND                             |
| WS7     | CLOSED                                                                  |
| WS8     | CLOSED / COMPLETE UNDER OWNER-APPROVED RE-BASELINED SCOPE               |
| WS9     | DISCOVERY COMPLETE · IMPLEMENTATION BLOCKED / DEFERRED · DEPENDS ON WS4 |
| WS10    | NOT STARTED (deferred)                                                  |
| WS11    | FUTURE / NOT STARTED                                                    |

Execution pointer: **NEXT IMPLEMENTATION WORKSTREAM = WS4.** Canonical ordering unchanged.

IMPLEMENTATION STATUS:
NO WS4 IMPLEMENTATION
NO WS9 IMPLEMENTATION
OWNER DECISIONS FORMALIZED
ROADMAP RE-BASELINED
HARD STOP
