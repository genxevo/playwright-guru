# WS9 — Navigation / SPA / Frame / Tab Semantics

**Date:** 2026-09-05 · **Decision:** DL-83 · **Verdict:** **PARTIALLY IMPLEMENTED**
**WS9 remains PARTIAL / IN PROGRESS · `RECORDING_ENABLED` remains `false`**

---

## 1. Objective

Answer, by measurement, what happens to an active recording when the browsing context changes — full navigation, SPA route change, frame, tab switch, tab close, content-script replacement — and implement truthful behaviour only where a gap was proven.

The constraint that shaped every decision: **one recording session, one authoritative workflow, one locator engine, one lifecycle model, one durable observation.** No parallel recording architecture.

---

## 2. Baseline (before any edit)

| Measure                                                     | Value                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| tests                                                       | **1,825 / 65 files** (locator-engine 383 · codegen 127 · extension 1,315) |
| codegen goldens                                             | **127 / 127**                                                             |
| build · typecheck · lint                                    | **0 · 0 · 0**                                                             |
| `format:check`                                              | **1** — `ws2-item9-report.md` only (permanent accepted exception)         |
| bundle total                                                | **314,371 B**                                                             |
| `content.js` · `background.js` · sidepanel · devtools-panel | 48,073 · 11,449 · 10,226 · 1,386 B                                        |
| ceiling / overage                                           | 278,760 B → **35,611 B (12.77 %)** over                                   |

---

## 3. Current architecture, as measured

The recording path, and the three properties that turned out to already answer most of this slice's questions:

1. **Liveness is DERIVED, never stored.** `isRecording(session, now)` recomputes staleness from the clock on every call. A content script that dies — reload, navigation, discard, crash — sends nothing, and the session stops reading as recording anyway.
2. **Identity is an opaque `RecordingSessionId`.** Every mutating entry point (`heartbeat`, `recordAction`, `stopSession`) takes the id it claims to act on and refuses anything else.
3. **WS4 owns tab-scoped storage and its cleanup.** `RECORDING_OBSERVATION` and `RECORDING_WORKFLOW` are both `area: 'session'`, `scope: 'tab'`.

Manifest permissions, unchanged by this slice: `activeTab`, `storage`, `scripting`, `sidePanel`, host `<all_urls>`. **No `tabs`, no `webNavigation`.**

---

## 4. Failure-first evidence

`packages/extension/test/ws9-navigation-tab-frame.test.ts` — NAV-01…NAV-21 in **38 assertions**.

**7 verified FAILING against the untouched tree:**

| Failing assertion                                      | What it proved                                           |
| ------------------------------------------------------ | -------------------------------------------------------- |
| NAV-08 · records nothing for a click inside a frame    | `[ { kind: 'click', … } ]` — a frame action WAS recorded |
| NAV-09 · no recorded step may carry a frameSelector    | `'iframe[src*=""]'` — an unmeasured guess, stored        |
| NAV-09 · a rendered recording never emits frameLocator | the TypeScript render contained `frameLocator`           |
| NAV-21 · top-frame gate                                | no `window.top` test existed in `content.ts`             |
| NAV-10 · every recording message names its tab         | `START_RECORDING` carried no `targetTabId`               |
| NAV-12 · the live query is addressed to the bound tab  | `QUERY_RECORDING_STATE` carried no `targetTabId`         |
| NAV-12 · fails closed when the panel has no tab        | no null-tab short circuit existed                        |

The other **31 are non-regression pins** for behaviour already correct.

### One of my own tests failed for the wrong reason

NAV-04 asserted two clicks after a `pushState` produced two steps; it produced **one**, because `appendStep` legitimately coalesces two clicks on one element inside `dblclickWindowMs` into a `dblclick` — a rule with nothing to do with navigation. The clock is now advanced past that window. A red test that fails for the wrong reason teaches the wrong lesson, so it was corrected rather than accepted as a finding.

---

## 5. Full page navigation — ALREADY CORRECT, now pinned

| Question                                                        | Measured answer                                                                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the old content session remain alive?                      | No. The content script is destroyed; its runtime and session go with it.                                                                                                                       |
| Does the background receive a navigation signal?                | **No** — no `webNavigation`, no `tabs.onUpdated` listener. And none is needed.                                                                                                                 |
| Does the replacement report ACTIVE incorrectly?                 | No. A fresh runtime has `session = null`, so `QUERY_RECORDING_STATE` answers `inactive`.                                                                                                       |
| Can the new content script accept the old session id?           | No — `stop(oldId)` returns `no-session`.                                                                                                                                                       |
| Does a new START mint a new id?                                 | Yes, always — `requestActivation` mints fresh, making the previous id foreign by construction.                                                                                                 |
| Does the durable observation become stale on its own?           | Yes — `observedLifecycle` promotes silence past `heartbeatTimeoutMs` to `stale`.                                                                                                               |
| Does the workflow survive?                                      | **Yes, durably** — it was already published to the tab-scoped `recording-workflow`, which outlives the content script. Not in memory.                                                          |
| Is there a reusable DevTools navigation-invalidation mechanism? | It exists (`chrome.devtools.network.onNavigated`, `src/browser/pick-source.ts`, clearing `$0`) but is **not reusable**: DevTools-page only, inspected tab only. The Side Panel owns recording. |

**No second staleness algorithm was created.** The existing heartbeat/liveness rules already produce the truthful answer.

---

## 6. SPA navigation — DELIBERATELY NOT A STOP

`pushState`, `replaceState`, `popstate` and `hashchange` do not replace the document, so the content script, its listeners and its session all survive.

The gate's own distinction is the correct one, and the architecture already implements it:

- **SESSION lifetime** — survives a route change. Ending a recording on a route change would discard work the user never asked to discard.
- **ELEMENT-FACT lifetime** — already per-action. `recordedTargetFor` calls `captureSnapshot(el)` afresh every time; the recorder memoises no element, snapshot or probe between actions (pinned by NAV-07).

So an action after a route change is resolved against the DOM that exists _then_. **No new seam was required**, and none was added: detecting `pushState` would mean patching a page global, and a real navigation signal in the panel would mean a new permission.

Tested by driving all four real APIs and asserting the session stays `active` and capture continues.

---

## 7. Frame / iframe — **UNSUPPORTED BY DECISION**

This is the headline finding.

| Question                                     | Measured answer                                                                                                                                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does capture see elements inside frames?     | **Yes** — the content script is injected `allFrames: true`.                                                                                                                                                                  |
| Does `LocatorChain` represent frames?        | **Yes** — `chain.frameSelector`.                                                                                                                                                                                             |
| Does codegen render it?                      | **Yes** — `generateLocatorCode` prepends `page.frameLocator(...)` in all seven languages.                                                                                                                                    |
| Is the frame selector measured?              | **No.** `detectFrameInfo` guesses: `iframe[name=…]`, `iframe#id`, `iframe[title=…]`, `iframe[src*=…]`, and finally the bare literal `'iframe'`.                                                                              |
| Are the counts about the emitted expression? | **No.** `verdict`, `matchCount`, `visibleMatchCount` and `stepCounts` are measured **inside the frame's document** and describe the chain _without_ its frame prefix.                                                        |
| Can the product re-verify what it emitted?   | **No** — WS6.2's parser classifies `page.frameLocator()` as `UNSUPPORTED_METHOD`.                                                                                                                                            |
| Did it fail closed or fabricate?             | **It fabricated.** Proven by a real sub-frame test: the recorded step carried `frameSelector: iframe[src*=""]` — a selector matching every iframe with a `src` — and the TypeScript render emitted a `frameLocator` from it. |

**Resolution: frame interaction is classified UNRECORDABLE and refused at admission.** `isTrustworthy` gains a fourth clause:

```ts
if (chain.frameSelector !== undefined) return false;
```

Ordered **before** the count checks deliberately — an in-frame element usually _does_ have exactly one visible match within its own document, so the counts would have waved it through.

What was **not** done: no flattening into a top-level `page.` locator, no invented frame model, no `UNVERIFIED` step, no weakening of WS6.2. The refusal is **per action** — a page with an iframe still records everything in its top document.

---

## 8. Tab ownership

| Question                                         | Measured answer                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Which tab owns the session?                      | The tab whose content script holds it.                                                        |
| Is ownership durably represented?                | Yes — both descriptors are `scope: 'tab'`, `area: 'session'`.                                 |
| Does the durable write require `sender.tab.id`?  | **Yes.** `contentSenderTabId(sender)`; an unidentifiable sender gets `UNTRUSTED_SENDER`.      |
| Can a page choose whose recording it overwrites? | **No** — the `PERSIST_RECORDING_STATE` branch never reads a tab id from the payload (pinned). |
| Can a foreign session id affect another session? | **No** — `rejected-wrong-session` at the lifecycle level.                                     |
| Is there global recording state?                 | **No** — no singleton; state is per content script and per tab key.                           |

---

## 9. Tab switching — **GAP 1, FIXED**

`StartRecordingMessage`, `StopRecordingMessage` and `QueryRecordingStateMessage` all already carried an optional `targetTabId`, and `background.ts` already preferred it. **`RecordingControl.tsx` set it on none of the three.**

Every recording message therefore fell through to:

```ts
browser.tabs.query({ active: true, lastFocusedWindow: true });
```

— a **second active-tab lookup** that the panel's own `panel.pick.tabId` binding does not control. Consequences, all real:

- the panel read **durable** state for the bound tab while asking a possibly **different** tab for **live** state;
- `START_RECORDING` would have begun recording on whatever tab was active;
- `STOP_RECORDING` carrying tab A's session id would have reached tab B, been refused `wrong-session`, and left A recording while the panel believed it had stopped.

**Fixed** by addressing the bound tab on all three. No new message type, no new field, no new permission — and it _removes_ the panel's dependence on the fallback rather than adding a lookup. With no bound tab (`tabId === null`) the panel now **fails closed**: `observe` returns `unknown` without sending, `start`/`stop` return without sending.

The background's fallback is **kept** (`ACTIVATE_PICKER`/`DEACTIVATE_PICKER` legitimately rely on it) and pinned at exactly one occurrence.

---

## 10. Tab close — ALREADY CORRECT, not duplicated

Both recording descriptors are tab-scoped session state, so the **existing** single `tabs.onRemoved` → `storageGateway.clearTab(tabId)` listener already removes them, and `sweepOrphans` covers state left by tabs that vanished while the worker was down. Pinned at exactly one listener, with a guard that no recording-specific cleanup was added beside it. **No new mechanism.**

---

## 11. Content-script replacement — ALREADY FAIL-CLOSED

The structural reason: the runtime is **one-way**. It publishes its state through the injected `persist` sink and reads none back — pinned by a guard that `src/runtime/recording.ts` contains no `readTab`, `readGlobal`, `storage.` or `RECORDING_OBSERVATION`. **No stored record can tell a fresh runtime that it is recording.**

A recreated content script therefore reports `inactive`; the old session id is refused `no-session`; a late heartbeat past the timeout is refused and staleness stays terminal; and a stale durable `active` never outranks live evidence (`LIVE > DURABLE > UNKNOWN`, DL-79).

---

## 12. Session and workflow semantics after this slice

- One session per **tab**, owned by the **top frame** only.
- A session never survives content-script replacement. Staleness remains terminal.
- The **workflow** survives durably, per tab, independent of the session — DL-79's rule that lifecycle and workflow existence are different facts is unchanged.
- The authoritative representation remains **`RecordedWorkflow`**. Nothing was added to it.

### Gap 3 — every frame ran its own recorder, fixed

`allFrames: true` plus `browser.tabs.sendMessage(tabId, message)` with **no `frameId`** meant a START reached every frame; each minted its own session, attached its own listeners, and published to the one tab-scoped key — so the last frame to write became "the" recording, and the panel's id could stop only one of them.

```ts
const isTopFrame = window.top === window.self;
```

A sub-frame returns `false` **without** calling `sendResponse`, so it is not a responder at all and Chrome delivers the top frame's answer deterministically. One comparison, no permission, no new API. If no frame answered, `normalizeAck` yields `NO_HANDLER` and the panel reads `unknown`.

---

## 13. Security and privacy

No new permission, no telemetry, no analytics, no network call, no logging of values or session ids. Redaction is untouched, and the throwing-getter protection is unaffected. The frame refusal happens **at admission**, so no frame-scoped value ever enters a workflow. `PERSIST_RECORDING_STATE` still takes its tab identity from `sender.tab.id`, which a page cannot forge.

---

## 14. Files changed

**Production — 3 modified, 0 added, 0 deleted:**

| File                                         | Change                                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/runtime/recording.ts`                   | Fourth admission clause: refuse a target whose chain carries a `frameSelector`. `isTrustworthy` exported for direct testing. |
| `entrypoints/content.ts`                     | `isTopFrame` gate on the three recording message cases.                                                                      |
| `entrypoints/sidepanel/RecordingControl.tsx` | `targetTabId` on all three sends; null-tab short circuit in `observe`/`start`/`stop`.                                        |

**Tests — 1 added, 2 repaired:**
added `test/ws9-navigation-tab-frame.test.ts`; repaired `test/ws9-recording-runtime.test.ts` and `test/ws9-recording-ui.test.ts`.

**Docs:** `DECISION-LOG.md` (DL-83) · `MASTER-ROADMAP.md` · `CURRENT-STATE.md` · `PROGRESS.md` · this report.

No manifest, storage descriptor, message type, renderer or codegen change.

### Two guards repaired, both strengthened

Both broke on **adjacency**, not on meaning — one required `sendResponse(startRecordingSession` immediately after `case 'START_RECORDING':`, the other sliced the QUERY case on its _first_ `return false;`. The top-frame gate now sits between them. Each was rewritten to read the **bounded case block** and to assert both the original claim _and_ the new gate, so both prove more than before. Neither was weakened, and no marker slice that could silently degrade to `slice(0, -1)` was introduced.

---

## 15. Validation

Each command run **alone**, with its own exit code.

| Command             | Exit  | Detail                                                                                                                                    |
| ------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`         | **0** | **1,863 tests / 66 files** (was 1,825 / 65) — locator-engine 383 · codegen **127 incl. 127/127 goldens, untouched** · extension **1,353** |
| `pnpm build`        | **0** | clean rebuild after deleting `.output`                                                                                                    |
| `pnpm typecheck`    | **0** | all three packages                                                                                                                        |
| `pnpm lint`         | **0** | the same **3 pre-existing** DL-80 warnings, in files this slice did not touch                                                             |
| `pnpm format:check` | **1** | `ws2-item9-report.md` only                                                                                                                |

> **Verification is NOT claimed as "all green"** while that exception stands.

### Bundle

|                               | Before             | After                  | Δ                               |
| ----------------------------- | ------------------ | ---------------------- | ------------------------------- |
| total                         | 314,371 B          | **314,662 B**          | **+291 B**                      |
| `content.js`                  | 48,073 B           | 48,141 B               | +68 B (top-frame gate)          |
| sidepanel chunk               | 10,226 B           | 10,449 B               | +223 B (tab-addressed messages) |
| `background.js`               | 11,449 B           | 11,449 B               | 0                               |
| devtools-panel                | 1,386 B            | 1,386 B                | 0                               |
| overage vs. 278,760 B ceiling | 35,611 B / 12.77 % | **35,902 B / 12.88 %** | +291 B / +0.11 pts              |

The ceiling was **not** re-baselined and no speculative optimisation was performed. 291 bytes is the price of not recording the wrong tab and not shipping an unverified frame locator.

---

## 16. Real Chromium status

**Real Chromium: NOT RUN. Manual browser regression: NOT RUN.**

No extension E2E infrastructure exists — unchanged since DL-63 — and none was built here. The repository contains a `test/conformance` real-Playwright concern for the locator engine, but **no extension harness**: `@playwright/test` is in no extension manifest and all vitest projects are `environment: 'node'` under R3.

The sub-frame evidence is happy-dom with real event dispatch, the real `captureSnapshot`, the real `LiveDomProbe` and the real resolver — genuine unit evidence, and explicitly **not** browser evidence. happy-dom has no layout engine (see `layout-stub.ts`).

**Unverified in a browser:** multi-frame message delivery ordering, real cross-origin frames, real tab switching, and real `tabs.onRemoved` timing.

---

## 17. Remaining limitations

1. **Frame interaction is unrecordable**, so a recording of a page whose real work happens inside an iframe will be **silently empty**. Honest, but not yet _explained_ to the user — a refusal surface is UI this slice was not given.
2. **A recording cannot span a full page load.** The session ends; the durable workflow is preserved.
3. **Coalescing compares verified chains**, so two fills on structurally identical elements across an SPA route change inside `fillDebounceMs` could merge. The merged step is still replayable by the same locator, so it is recorded here rather than fixed.
4. **Browser restart** is out of scope and untouched.

---

## 18. Owner decisions required — three, no recommendation offered

**(a) FRAME RECORDING SUPPORT.** Needs a **measured** frame selector, which needs the parent document to resolve the `<iframe>` element — a cross-frame handshake this architecture does not have — _plus_ lifting WS6.2's `UNSUPPORTED_METHOD` for `page.frameLocator()` so the result can be re-verified. Both are their own slices.

**(b) TELLING THE USER AN ACTION WAS REFUSED.** The admission rule now refuses silently for four different reasons. A counter or reason surface is honest UI — but it _is_ UI, and the action count is explicitly out of scope.

**(c) RECORDING ACROSS A FULL PAGE LOAD.** Needs a session that survives content-script replacement, which needs either a navigation signal (**a new permission**) or a resumption handshake handing a fresh content script an existing session id. The latter **directly contradicts DL-73's rule** that staleness is terminal _because a recorder that went away may have missed actions_. That contradiction is an owner decision, not an implementation detail.

---

## 19. Final verdict

**PARTIALLY IMPLEMENTED.**

Navigation, SPA, tab-ownership, tab-switching, tab-close and content-script-replacement semantics are correct and pinned. Frame recording is **explicitly unsupported**, refused, fail-closed, and documented — which the gate names as an acceptable outcome.

WS9's exit criteria are **not** met: the E2E kill-the-content-script proof remains blocked, and the feature remains switched off.

**WS9 remains PARTIAL / IN PROGRESS. `RECORDING_ENABLED` remains `false`.**

---

**HARD STOP.** No further roadmap work was performed.
