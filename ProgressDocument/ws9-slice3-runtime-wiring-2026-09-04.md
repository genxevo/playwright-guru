# WS9 — SLICE 3: RUNTIME WIRING · TYPED HANDSHAKE · ACTUAL CAPTURE

**2026-09-04 · DL-74 · PARTIAL — recording is wired but gated**

## 1. Verdict

**PARTIALLY COMPLETE.**

Recording now genuinely happens when it is started: a real `START_RECORDING` establishes a content-side
session, real DOM events flow through the existing capture pipeline, and only trustworthy locators are
admitted. It is **gated** — `RECORDING_ENABLED` is `false` and the runtime fails closed on it, so no
user can start a recording. WS9 is **not** complete: persistence, UI, renderers, export, the workspace
and the controller-side liveness marker are all still unbuilt.

One material regression is disclosed and needs an owner decision: the wiring adds **14,387 B to
`content.js`**, taking the bundle to **10.56 %** over the locked ceiling, for a feature nobody can
currently reach.

## 2. Authoritative Boundary

**Stated honestly: the WS9 discovery gate's §14 does not itself name a wiring slice.** It sequences
slice 1 → handshake+heartbeat → renderers/export/workspace. This slice therefore rests on four other
authoritative statements:

| Source                                | What it authorises                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| §WS9 **Purpose**                      | "Recording that is **real**, structured, honest, privacy-safe."                                                                |
| §WS9 **Deliverables**                 | "`runtime/recorder` with the noise filter and coalescing" — a recorder that must actually run                                  |
| §WS9 **Exit** (4 of 5)                | "40 does not interrupt", "100 stops", "passwords never captured", "≤500 KB at 100 actions" — all describe a _running_ recorder |
| **DL-64 / D3**                        | the future recorder is "built against §18's architecture … the unreachable legacy recorder is not the implementation target"   |
| **CURRENT-STATE / §WS9 (post-DL-73)** | lists `content.ts` wiring and message types **first** among remaining work                                                     |

No new workstream, no reorder, no WS6.3, no closed workstream reopened.

## 3. Implemented

- **`src/runtime/recording.ts`** — the content-side recording runtime: owns the session, attaches
  capture-phase `click`/`input`/`change` listeners, gates every event on `isRecording`, applies the
  admission rule, routes through slice 1's `stepFor*` and slice 2's `recordAction`.
- **The typed handshake** — `start()` mints an opaque session id, requests activation and acknowledges
  it (the content script _is_ the side the handshake waits on), and returns the id; `stop(sessionId)`
  refuses any id that is not the live session's.
- **The admission rule** (§5) — the heart of the slice.
- **Heartbeat wiring** — `tick()` plus `HEARTBEAT_INTERVAL_MS` re-exported from `RECORDING_LIMITS`;
  `content.ts` owns the interval so the runtime stays timer-free and deterministically testable.
- **`utils/messaging.ts`** — two optional fields: `StopRecordingMessage.sessionId` and
  `RuntimeMessageAck.sessionId`. Plain strings, because a branded type cannot survive structured
  cloning; comparison happens content-side where the session lives.
- **`entrypoints/content.ts`** — one import, two switch cases, one runtime owner. It stays a bootstrap.
- **Runtime-level flag enforcement** — `enabled` defaults to `RECORDING_ENABLED`, so a message cannot
  start a recording the product has disabled.
- **`test/ws9-recording-runtime.test.ts`** — 37 failure-first assertions.

## 4. Explicitly Not Implemented

Persistence of any kind · UI, banner, toolbar or toast · `renderAction`/`renderSpecFile` · export menu ·
structured code workspace · v1 migration · navigation/SPA/frame/tab · multi-tab orchestration · hover,
drag/drop, keyboard macros · network/API/screenshot capture · **flipping `RECORDING_ENABLED`** ·
**deleting the legacy recorder** · any CommandBus · any bundle optimisation · any new dependency.

**Also deferred, with its reason:** the **controller-side liveness marker**. Slice 2's
`heartbeatTimeoutMs` doc describes a banner "driven by state the content script writes". Its consumer
must _outlive_ the content script, which means persistence or UI — both out of scope — so it was
documented rather than half-built. The heartbeat here does its other job: keeping a long recording from
ageing out.

## 5. Architecture

```
START_RECORDING (panel)
   → background.ts        routes to the target tab; isFromExtensionUI rejects tab senders   [UNMODIFIED]
   → content.ts           bootstrap: one switch case, owns the heartbeat interval
   → runtime/recording.ts session ownership · listeners · ADMISSION
   → runtime/recorder.ts  stepForClick / stepForFill / stepForChange            [slice 1, unchanged]
   → fact-model.ts        captureSnapshot                                       [WS3, unchanged]
   → runtime/probe.ts     LiveDomProbe                                          [WS3, unchanged]
   → locator-engine       resolveCandidates → resolveChain                      [WS0/WS6.2, unchanged]
   → RecommendedLocator   verified chain + verdict + counts + rationale
   → toElementFactsLite   ElementFactsLite                                      [WS1, unchanged]
   → recording/session.ts recordAction gate                                     [slice 2, unchanged]
   → recording/workflow.ts appendStep: limits · coalescing · truncation · redaction  [slice 1, unchanged]
```

**`recording.ts` adds no engine.** It constructs no probe, resolves nothing itself and queries no DOM
for counts; guards pin the absence of `new LiveDomProbe`, `resolveChain(`/`resolveStep(`,
`querySelectorAll`, `document.evaluate` and `outerHTML`/`innerHTML`.

### The admission rule — and the measurement that makes it load-bearing

```ts
chain.nth !== undefined        → REFUSE
visibleMatchCount !== 1        → REFUSE
verdict not excellent | good   → REFUSE
```

**Measured, and the most important finding of this gate.** For two indistinguishable buttons the engine
does **not** report ambiguity to its caller. `buildLocatorChain` appends `.nth(0)` to the ambiguous
winner — its own module doc says it does — and `resolveChain` then measures that chain as:

| field               | value  |
| ------------------- | ------ |
| `verdict`           | `good` |
| `visibleMatchCount` | `1`    |
| `chain.nth`         | `0`    |

So clauses 2 and 3 **both pass**. Only `chain.nth !== undefined` refuses it. Without that clause a
positional guess would have been recorded as a verified result — precisely the failure class WS6.2 spent
two gates removing from verification. A dedicated test pins the measurement, so the refusal is
re-justified rather than silently weakened if the engine ever changes.

No CSS fallback, no XPath fallback, no guessed text, no "best effort recorder selector". **Recording
nothing is the correct outcome**, and the refusal is per action: a page with one ambiguous button still
records everything else.

## 6. Security / Privacy

| Concern              | Result                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| password             | ✅ `.value` replaced by a **throwing getter**, real `input` event dispatched — nothing read it                                             |
| file                 | ✅ same technique, same result                                                                                                             |
| card (`cc-*`)        | ✅ same technique, same result                                                                                                             |
| truncation           | ✅ oversized value bounded by `RECORDING_LIMITS.maxValueLength`                                                                            |
| redaction            | ✅ slice 1's rules, unchanged; redacted steps carry no value                                                                               |
| inactive capture     | ✅ a password typed while inactive is not read either                                                                                      |
| sender validation    | ✅ `isFromExtensionUI` unchanged; `background.ts` not modified                                                                             |
| stale session        | ✅ stale/stopped/foreign session all refuse; listeners detach                                                                              |
| DOM / message leak   | ✅ workflow is `structuredClone`-safe, `containsScopeHandle` false, no `__brand` in JSON                                                   |
| dangerous APIs       | ✅ no `eval`, `new Function`, `Function(`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`                                                  |
| persistence APIs     | ✅ none — no `chrome.storage`, `localStorage`, `sessionStorage`, `indexedDB`                                                               |
| secret logging       | ✅ the new modules contain no `console.*` at all                                                                                           |
| forbidden frameworks | ✅ no Selenium / Cypress / WebdriverIO / Puppeteer / Robot Framework; the pre-existing WS0 `CommandBus` port was neither used nor extended |

**R1** ✅ `wxt/browser` confined · **R2** `architecture` 7/7 · **R3** ✅ all three projects
`environment: 'node'` (this suite is a per-file happy-dom override) · **R5** ✅ `devtools-architecture`
18/18, `verify-locator-panel` 18/18 · privacy 11/11 · honesty 18/18 · contracts 33/33.

**Legacy recorder:** untouched (deletion not authorised by this boundary; DL-64/D3, DL-4 stays
historical) and **proven unreachable** by a new guard asserting the legacy handlers still exist _and_
that nothing calls `startRecording(`, and that the wired path is `createRecordingRuntime` alone.

## 7. Tests

Failure-first: `ws9-recording-runtime.test.ts` was written and run **before** the module existed and
failed with `Failed to load url ../src/runtime/recording`.

Tests use happy-dom with **real `dispatchEvent`** and the **real** `captureSnapshot` / `LiveDomProbe` /
resolver — no stand-in resolver, no mocked probe. The pipeline under test is the production one.

| Command                | Result                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm -r test`         | **1,413 / 1,413 passed, 58 files** (locator-engine 383 · codegen 127 · extension 903)               |
| new suite              | 37/37                                                                                               |
| slices 1 + 2 re-run    | 30/30, 19/19, 33/33 — unmodified                                                                    |
| WS6.2 trust suites     | 16/16, 41/41, 15/15 — no D2/V-3 regression                                                          |
| WS3 / WS4 / WS7 guards | `runtime-fact-model` 14/14 · `storage-gateway` 40/40 · `storage-consumers` 24/24 · `verifier` 12/12 |
| `background-router`    | 4/4 — the file was not modified                                                                     |

## 8. Build / Typecheck / Lint / Format

Each command run **alone**, exit code read independently.

| Command             | Exit | Detail                                                         |
| ------------------- | ---- | -------------------------------------------------------------- |
| `pnpm -r test`      | 0    | 1,413 / 58 files                                               |
| `pnpm -r build`     | 0    | Σ 308,201 B                                                    |
| `pnpm typecheck`    | 0    | —                                                              |
| `pnpm lint`         | 0    | no errors, no warnings                                         |
| `pnpm format:check` | 1    | **only** `ws2-item9-report.md` — the known permanent exception |

## 9. Bundle

| Artifact         | Baseline  | Final         | Delta                   |
| ---------------- | --------- | ------------- | ----------------------- |
| **Total**        | 293,814 B | **308,201 B** | **+14,387 B (+4.90 %)** |
| **`content.js`** | 33,150 B  | **47,537 B**  | **+14,387 B (+43.4 %)** |
| `background.js`  | 9,746 B   | 9,746 B       | 0 B                     |
| sidepanel chunk  | 7,801 B   | 7,801 B       | 0 B                     |
| devtools panel   | 1,386 B   | 1,386 B       | 0 B                     |
| shared `client`  | 142,932 B | 142,932 B     | 0 B                     |
| shared `tokens`  | 89,251 B  | 89,251 B      | 0 B                     |

**Ceiling 278,760 B → now 29,441 B / 10.56 % over**, up from 15,054 B / 5.40 %.

**Attributed by controlled experiment, not inference** (DL-58's method): the wiring was temporarily
removed and rebuilt — `content.js` measured **exactly 33,150 B** — then restored and confirmed
byte-identical by `diff`. The entire delta is the recording wiring.

**The cause is architectural and was foreseen.** `fact-model.ts`'s own header states it is _"NOT
IMPORTED BY `content.ts`, DELIBERATELY"_ because wiring it _"was measured to cross the extension's
raw-size ceiling"_, and explicitly defers the call: _"the workstream that puts a `PickSnapshot` in front
of a UI is the one that should decide whether to import it."_ Recording needs `captureSnapshot` for the
verdict the admission rule depends on, so that workstream is this one. **No optimisation was attempted
and no architecture was rewritten for bytes.**

### Owner decision required (raised, not taken)

`content.js` is injected into **every frame of every page** (`allFrames: true`, `<all_urls>`), so today
every user downloads +14,387 B on the pick hot path for a feature `RECORDING_ENABLED` prevents them from
using. Three options, no recommendation offered and nothing changed to pre-empt the choice:

- **(a) Accept** — the cost starts buying something when the flag flips.
- **(b) Defer the `content.ts` wiring** to the slice that flips the flag. Reversal is three lines (one
  import, two switch cases) and returns `content.js` to 33,150 B exactly, as the experiment proved.
- **(c) Reconsider the ceiling** — open owner debt since DL-56.

## 10. Real Browser Verification

**Real Chromium: NOT RUN.**

Runtime integration is verified through deterministic unit/structural tests; **real Chromium
verification remains pending**. happy-dom is not Chromium — no layout engine, so every element reads as
visible, and no `document.evaluate`. No manual smoke test, no DevTools check and no production
verification was performed, and none is claimed. WS9's X1 criterion stays at DL-64/D1's re-scoped
unit + structural level.

## 11. Files Changed

| File                                 | Change                                                     |
| ------------------------------------ | ---------------------------------------------------------- |
| `src/runtime/recording.ts`           | **new** — the content-side recording runtime               |
| `utils/messaging.ts`                 | modified — two optional `sessionId` fields                 |
| `entrypoints/content.ts`             | modified — one import, two switch cases, one runtime owner |
| `test/ws9-recording-runtime.test.ts` | **new** — 37 assertions                                    |

**1 source file created · 2 source files modified · 1 test file created · 0 deleted.** No dependency, no
lockfile change, no build-config change. Drift sweep (modification-time; this repository has **no git**,
so `git status`/`git diff` are unavailable and the documented sweep is used instead): exactly **4** files.

## 12. Documentation

`DECISION-LOG.md` — **DL-74**, class `CURRENT`, inserted above DL-73; no historical entry rewritten ·
`MASTER-ROADMAP.md` — WS9 header, a slice-3 block, and the §30 dashboard row · `CURRENT-STATE.md` —
`Updated:` line and execution pointer · `PROGRESS.md` — `Updated:` line and a milestone row · this report.

WS9 is **not** marked complete anywhere, and recording is **not** described as production-ready.

## 13. Backup

`ws9-slice3-runtime-wiring-2026-09-04.zip` — full source tree excluding `node_modules`, `.output`,
`dist`, `.wxt` — delivered to `E:\Codes\playwrightguru`.

## 14. Remaining WS9 Work

Roadmap-authorised and still unbuilt: the **controller-side liveness marker** (needs persistence or UI) ·
**persistence** of the workflow · **`renderAction` / `renderSpecFile`** · **structured code workspace +
v1 raw-line migration** · **export menu** · **navigation / SPA / frame / tab handling** · the **recording
UI** (banner driven by lifecycle state rather than a local boolean) · **legacy-recorder deletion** ·
**flipping `RECORDING_ENABLED`**.

**Debt carried forward, unchanged:** the bundle overage (now materially larger, see §9) ·
`snapshot.ts`'s stale `RecommendedLocator.stepCounts` doc comment (recorded at DL-72) ·
`storage-migration.test.ts`'s ~6.9 % flake (untouched) · WS6.1's unstarted items and self-contradiction ·
WS3's deferred IIFE build and CI benchmarks · no real-browser infrastructure anywhere.

## 15. Next Authorized Step

**The bundle owner decision in §9 comes first**, because it determines whether the `content.ts` wiring
stays. After that, §14 of the WS9 discovery gate resumes its own sequencing: _"`renderAction`/
`renderSpecFile`, the export menu and the structured workspace follow; the workspace migration waits on
D2."_ — with persistence and the recording UI required before `RECORDING_ENABLED` can honestly flip,
since a banner driven by a local boolean would claim recording the lifecycle cannot vouch for.
