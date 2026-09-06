# WS9 — SLICE 2: ACTIVATION HANDSHAKE · HEARTBEAT · RECORDING LIFECYCLE

**2026-09-04 · DL-73 · PARTIAL — slice 2 of the WS9 discovery gate's §14 sequencing**

## 1. Roadmap Decision

**Boundary confirmed from three authoritative sources, not inferred.**

| Source                                            | Wording                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WS9 discovery §14 (sequencing)                    | slice 1, then _"`RECORDING_ENABLED` left **off** until **the handshake and heartbeat** exist"_, then _"`renderAction`/`renderSpecFile`, the export menu and the structured workspace **follow**"_ |
| **DL-64 / D1** (owner decision, already resolved) | X1 is satisfied by _"unit + structural proof of the recording **activation / heartbeat / staleness** behaviour"_                                                                                  |
| `config/recording.ts`                             | _"WS9 turns recording on by flipping this constant, once the recorder, **the activation handshake and the heartbeat** exist."_                                                                    |

All three name the same unit, and it is the one immediately after slice 1. **No new workstream, no
reorder, and no owner decision was required** — D1 had already authorised both the work and its
evidence level. WS6.3 was neither created nor referenced; no closed workstream was reopened.

## 2. Baseline (re-measured, not quoted)

| Measure         | Value                                     |
| --------------- | ----------------------------------------- |
| Tests           | 1,343 / 56 files                          |
| Total bundle    | 293,814 B                                 |
| `content.js`    | 33,150 B                                  |
| `background.js` | 9,746 B                                   |
| sidepanel chunk | 7,801 B                                   |
| devtools panel  | 1,386 B                                   |
| Locked ceiling  | 278,760 B — overage 15,054 B (**5.40 %**) |

test / typecheck / lint exit 0; format exits 1 for `ws2-item9-report.md` only. Matches DL-72 exactly.

## 3. Authorized Scope

**Included:** the typed recording lifecycle — activation handshake, opaque session identity, heartbeat
liveness, staleness/fail-closed, stop, and duplicate/stale rejection — governing the Slice 1 engine,
proven failure-first at unit + structural level.

**Explicitly excluded, and not stubbed:** `content.ts` wiring · new message types · any CommandBus ·
persistence · UI or banner · `renderAction`/`renderSpecFile` · export menu · structured workspace · v1
migration · navigation / SPA / frame / tab · legacy-recorder deletion · flipping `RECORDING_ENABLED` ·
any bundle work.

## 4. Discovery Findings

**Existing infrastructure that was reused:** `RECORDING_LIMITS` (the single source of every timing) ·
Slice 1's `RecordedWorkflow` / `appendStep` / `stopWorkflow` · the `ScopeHandle` branding pattern.

**Gaps measured, not assumed:**

| #   | Requirement              | Existing                                                    | Gap      | Risk                                                     |
| --- | ------------------------ | ----------------------------------------------------------- | -------- | -------------------------------------------------------- |
| 1   | Activation handshake     | none — `RECORDING_ENABLED` is a build flag, not a lifecycle | complete | a control that reports success while capturing nothing   |
| 2   | Heartbeat / liveness     | `heartbeatMs`, `heartbeatTimeoutMs` — **zero consumers**    | complete | recording "active forever" after the content script dies |
| 3   | Session identity         | none                                                        | complete | a stale stop/heartbeat/action controlling a live session |
| 4   | Fail-closed capture gate | none — Slice 1's `appendStep` accepts any caller            | complete | actions captured while nothing is genuinely recording    |

**Risks considered and avoided:** adding message types nothing sends (speculative scaffolding, §29);
solving staleness with timestamps alone (§7 forbids it); a `stopping` state nobody can observe.

## 5. Failure-First Evidence

| Behaviour                      | Test                            | Expected failure | Observed failure                              | Result   |
| ------------------------------ | ------------------------------- | ---------------- | --------------------------------------------- | -------- |
| The whole lifecycle (33 cases) | `ws9-recording-session.test.ts` | module absent    | `Failed to load url ../src/recording/session` | 33/33 ✅ |

Then, **against my own new implementation**, two architecture guards failed:

| Guard                                           | Failure              | Cause                                            | Resolution                     |
| ----------------------------------------------- | -------------------- | ------------------------------------------------ | ------------------------------ |
| `state: 'active'` assigned in exactly one place | `expected 2 to be 1` | the doc comment **describing** the guard matched | strip comments before matching |
| holds no DOM / probe / resolver / storage       | matched the pattern  | the prose used the words `window` and `storage`  | strip comments before matching |

Both hits were **prose, not code** — the module's code was clean on both counts, verified independently.
Stripping comments is **strictly stronger**, not looser: a doc comment can no longer satisfy the count
_nor_ trip the scan, so the guard now tests the architecture rather than the writing. It follows the
repository's established comment-stripping precedent (`denseCode`, and Slice 1's own timing guard). The
claims themselves are unchanged, and no assertion was weakened, deleted, mocked away or special-cased.

## 6. Implementation

| File                                 | Change  | Purpose                                                            | Architecture impact                                                    |
| ------------------------------------ | ------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `src/recording/session.ts`           | **new** | the five-state lifecycle, session identity, heartbeat, stale, stop | pure — no DOM, probe, resolver, storage, messages or UI; node-testable |
| `test/ws9-recording-session.test.ts` | **new** | 33 failure-first assertions                                        | —                                                                      |

**Drift sweep** (modification-time; no git repository): exactly **2** files. No file modified, none
deleted, no dependency, no lockfile change, no build-config change, no generated artifact.

## 7. Lifecycle Semantics

**Activation.** `requestActivation` yields `starting` — explicitly **not** recording. That state is the
whole reason this is called a handshake: it is the window in which a naive implementation shows
"Recording" while capturing nothing, which is the exact failure `RECORDING_ENABLED` was created for.
`acknowledgeActivation` is the **only** transition into `active`, and a structural guard pins that
`state: 'active'` is assigned in exactly one place in the file.

**Session identity.** `RecordingSessionId` is an opaque branded type minted from an explicit
`{at, nonce}` seed — no clock read, no `Math.random` — so the lifecycle is a pure function of its
inputs and every test is deterministic. The nonce is what distinguishes two sessions started in the
same millisecond: **identity must not degrade into a timestamp** (§7). Every mutating entry point takes
the id it claims to act on; a guard asserts all four signatures do.

**Heartbeat.** Only an `active` session may beat. Repeated beats are idempotent in state and only
advance the marker.

**Staleness — the architectural core.** Liveness is **derived, not stored**:

```ts
(isRecording(session, now) === session.state) === 'active' &&
  now - lastSignal <= heartbeatTimeoutMs;
```

There is no boolean anybody sets. So when a content script dies the way content scripts actually die —
reload, navigation, tab discard, extension update, crash — it sends no message, fires no event and calls
no transition, and the session stops reading as recording anyway, purely because time passed. **A caller
that forgets to poll cannot obtain a stale `true`, because there is no stored `true` to obtain.**

Staleness is **terminal**: a late beat cannot resurrect a session, because a recorder that went away may
have missed actions, and a recording with an unknown hole in it is worse than one that honestly ended.
An activation that is never acknowledged ages out on the same clock, so a handshake nobody answers
cannot wait forever.

**Stop.** Ends the session and preserves everything captured. An existing `endedReason` wins, so a
session that had already gone stale reports that it **died** rather than that the user tidied it away.

**Duplicate handling.** Duplicate acknowledge → `ignored-duplicate`, no restart, same `startedAt` and
id. Duplicate stop → `ignored-duplicate`, first reason and timestamp preserved. Repeated beats →
idempotent.

**Stale rejection, proven for all four directions:** a previous session's id is refused by
`acknowledgeActivation`, `heartbeat`, `stopSession` and `recordAction`. In particular a stale **stop**
cannot end a live recording, and a stale **heartbeat** cannot revive a dead one.

**Fail-closed capture.** `recordAction` gates on `isRecording`, so `starting`, `stale`, `stopped`, a
foreign id, a silent recorder and `null` all refuse. Reaching `hardStop` ends the **session** as well as
the workflow — a recording that cannot accept another action is over, and leaving it `active` would be
the same lie in a smaller room.

## 8. Recording / Locator Architecture

Unchanged, and deliberately so. This slice touches no capture path:

- **`captureSnapshot`** — untouched; Slice 1's `recordedTargetFor` still delegates to it.
- **`DomProbe`** — untouched; one boundary, and `session.ts` cannot see it (asserted structurally).
- **`LocatorResolver`** — untouched; `session.ts` contains no `resolveStep`/`resolveChain` (asserted).
- **`RecordedWorkflow`** — **reused, not duplicated**. No `RecordingWorkflowV2`, no parallel model. The
  lifecycle gates capture; `appendStep` still owns limits, coalescing, truncation and redaction, proven
  by driving a full 100-action recording through the lifecycle and re-asserting the Slice 1 rules.

There is still exactly one locator engine and one locator representation.

## 9. Security / Privacy

| Guard                       | Result                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **R1** `wxt/browser`        | ✅ still only `src/browser/**` + `entrypoints/**`; `session.ts` imports neither it nor `chrome.*`             |
| **R2** `architecture`       | ✅ 7/7                                                                                                        |
| **R3** node environment     | ✅ all three vitest projects `environment: 'node'`; this slice adds a **pure node** suite — no DOM, no timers |
| **R5** `ui/**` isolation    | ✅ clean; `devtools-architecture` 18/18, `verify-locator-panel` 18/18                                         |
| privacy                     | ✅ 11/11                                                                                                      |
| honesty                     | ✅ 18/18                                                                                                      |
| contracts / R4              | ✅ 33/33 and 16/16                                                                                            |
| match-counts                | ✅ 17/17                                                                                                      |
| preview-gate                | ✅ 7/7 — `RECORDING_ENABLED` still pinned `false`                                                             |
| ws0-seams / storage-gateway | ✅ 14/14 and 40/40 — this slice writes no storage                                                             |
| WS6.2 trust suites          | ✅ 16/16, 41/41, 15/15 — no D2/V-3 regression                                                                 |
| **Slice 1 suites**          | ✅ 30/30 and 19/19 — **the throwing-getter privacy tests are intact and unmodified**                          |
| `eval` / `new Function`     | ✅ none                                                                                                       |
| HTML injection              | ✅ no `innerHTML` / `outerHTML` / `insertAdjacentHTML`; the eslint rule is untouched, lint 0                  |
| DOM leakage                 | ✅ the session is `structuredClone`-able and `containsScopeHandle` is `false`                                 |

Slice 1's privacy guarantees are untouched: sensitive values are still classified before access and
never read. This slice adds no value-reading path of any kind.

## 10. Validation

Each command run **alone**, exit code read independently — no `&&`, no `;`, no `||`.

| Command             | Exit | Detail                                                                  |
| ------------------- | ---- | ----------------------------------------------------------------------- |
| `pnpm -r test`      | 0    | locator-engine 383 · codegen 127 · extension 866 = **1,376 / 57 files** |
| `pnpm -r build`     | 0    | Σ 293,814 B                                                             |
| `pnpm typecheck`    | 0    | —                                                                       |
| `pnpm lint`         | 0    | no errors, no warnings                                                  |
| `pnpm format:check` | 1    | **only** `ws2-item9-report.md` — the permanent accepted exception       |

One new test file initially failed `format:check` and was fixed with prettier; `ws2-item9-report.md` was
not modified.

## 11. Bundle

| Artifact        | Before    | After     | Delta   |
| --------------- | --------- | --------- | ------- |
| Total           | 293,814 B | 293,814 B | **0 B** |
| `content.js`    | 33,150 B  | 33,150 B  | 0 B     |
| `background.js` | 9,746 B   | 9,746 B   | 0 B     |
| sidepanel chunk | 7,801 B   | 7,801 B   | 0 B     |
| devtools panel  | 1,386 B   | 1,386 B   | 0 B     |

**0.00 %.** Measured, not assumed: `grep` over `.output/chrome-mv3` finds **zero** occurrences of
`requestActivation`, `acknowledgeActivation`, `mintSessionId`, `isRecording` and `stopSession`. Nothing
shipped imports the module, so tree-shaking excludes it — the same arrangement `fact-model.ts` has had
since WS3 and Slice 1 since DL-72.

**Still over ceiling: YES** — 293,814 B against 278,760 B, **15,054 B / 5.40 % over**. Unchanged by this
gate, not chased, and still owner-level release-budget debt. No refactoring, module splitting, dynamic
import or architecture change was done for bundle reasons.

## 12. Browser Evidence

**Real Chromium tested: NO.**

The evidence is **pure unit tests at `environment: 'node'`** — no DOM, no browser, no timers, and no
fakes were needed because the model takes its clock as a parameter. That is precisely DL-64/D1's
re-scope, and it **is not equivalent to live-browser E2E and is not presented as such**.

What is proven: that a session which stops heartbeating cannot read as recording, that an unacknowledged
activation ages out, that staleness is terminal, and that no stale session can control a live one.
What is **not** proven: that Chrome tears down content scripts on the paths assumed, or any real
end-to-end recording behaviour. WS9's X1 criterion is met at the re-scoped level **only**; live-browser
proof remains deferred future infrastructure, and no E2E harness, `@playwright/test`, Chromium fixture or
DOM test environment was added.

## 13. Documentation

- `ProgressDocument/DECISION-LOG.md` — **DL-73**, class `CURRENT`, inserted above DL-72; no historical
  entry rewritten.
- `ProgressDocument/MASTER-ROADMAP.md` — WS9 header → `SLICES 1–2 IMPLEMENTED`, a slice-2 block appended
  under §WS9 (all earlier wording and the DL-63/DL-64/DL-72 blocks untouched), and the §30 dashboard row.
- `ProgressDocument/CURRENT-STATE.md` — `Updated:` line and the execution-pointer row.
- `ProgressDocument/PROGRESS.md` — `Updated:` line and a new milestone row. History preserved.
- `ProgressDocument/ws9-slice2-lifecycle-2026-09-04.md` — this report.

WS9 is **not** marked complete anywhere.

## 14. Backup

`ws9-slice2-handshake-heartbeat-2026-09-04.zip` — full source tree excluding `node_modules`, `.output`,
`dist`, `.wxt` — delivered to `E:\Codes\playwrightguru`, including the updated documents and this report.

## 15. Remaining Debt

**Unchanged, all pre-existing:**

- **Bundle overage** — 15,054 B / 5.40 % over the locked ceiling. Owner-level decision, open since DL-56.
- **`snapshot.ts`'s stale `RecommendedLocator.stepCounts` doc comment** — WS6.2's tail, recorded at
  DL-72, still not corrected (out of this slice's scope).
- **`storage-migration.test.ts` flake** — ~6.9 % of runs. **Not touched**, and this slice did not need to.
- **WS6.1** — unstarted items plus the recorded "debug mode" self-contradiction.
- **WS3** — deferred IIFE probe build; CI benchmarks not implemented.
- **No real-browser infrastructure** anywhere in the repository.
- **The legacy recorder** in `entrypoints/content.ts` — still present, still unreachable, **untouched**
  (7 `appendRecAction` references, unchanged). Deletion belongs to the slice that actually replaces it
  per DL-64/D3, and this slice does not replace it: it adds no `content.ts` wiring.

**Still ahead in WS9:** `content.ts` wiring · message types for the handshake · persistence · the UI
banner driven by lifecycle state rather than a local boolean · `renderAction`/`renderSpecFile` · export
menu · structured workspace · v1 migration · navigation/SPA/frame/tab · flipping `RECORDING_ENABLED`.

## 16. Final Verdict

**PARTIAL — Slice 2 delivered.**

- The handshake, session identity, heartbeat, staleness and stop are implemented at exactly the boundary
  §14 sequences and DL-64/D1 authorises, with the 33-assertion suite written and run before the module
  existed.
- WS9 as a whole is **not** complete: no wiring, no persistence, no renderers, no export, no workspace,
  and `RECORDING_ENABLED` remains `false`, so recording stays unreachable by any user. It is
  **implemented but gated**, not user-ready.
- WS9's X1 exit criterion is now met at DL-64/D1's re-scoped level — and at that level only. Of the five
  exit criteria, X1, "40 does not interrupt", "passwords never captured" and "≤500 KB at 100 actions" are
  met at unit evidence; "100 stops with preserved state" is met for the stop, with durable preservation
  still awaiting the persistence slice.
- Every locked guarantee survives: one locator engine, one DomProbe, one workflow model, no DOM leakage,
  no CommandBus, no framework expansion, and Slice 1's privacy tests intact and unmodified.
- Bundle Δ 0 B; the 15,054 B overage is unchanged, disclosed, and deliberately not chased.
