# WS9 — Truthful Recording Action Count and Refusal Feedback

**Date:** 2026-09-05 · **Decision:** DL-84 · **Verdict:** **IMPLEMENTED**
**WS9 remains PARTIAL / IN PROGRESS · `RECORDING_ENABLED` remains `false`**

---

## 1. Objective

DL-83 left the admission boundary refusing actions _correctly_ and saying _nothing_. A user clicking inside an iframe got a recording that was silently, correctly empty — fail-closed, and untruthful by omission.

Provide the smallest honest mechanism for: a truthful count of recorded actions, a truthful count and bounded reason for refused ones, and a compact user-visible surface — without a second trust calculation, a second lifecycle, or a second persistence mechanism.

---

## 2. Baseline (before any edit)

| Measure                                                     | Value                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| tests                                                       | **1,863 / 66 files** (locator-engine 383 · codegen 127 · extension 1,353) |
| codegen goldens                                             | **127 / 127**                                                             |
| build · typecheck · lint                                    | **0 · 0 · 0**                                                             |
| `format:check`                                              | **1** — `ws2-item9-report.md` only                                        |
| bundle total                                                | **314,662 B**                                                             |
| `content.js` · `background.js` · sidepanel · devtools-panel | 48,141 · 11,449 · 10,449 · 1,386 B                                        |
| ceiling / overage                                           | 278,760 B → **35,902 B (12.88 %)** over                                   |

---

## 3. Discovery

| Question                                                                             | Measured answer                                                                                                                                       |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does any count already exist?                                                        | **No.** Runtime API was `[start, state, stop, tick, workflow]`.                                                                                       |
| Does any refusal reason exist?                                                       | **No.** `isTrustworthy` returned a bare boolean and `admit` dropped the action.                                                                       |
| Can the runtime distinguish accepted from refused without duplicating locator logic? | **Yes** — it already computes the decision; it was discarding the _reason_.                                                                           |
| Related vocabularies that already exist                                              | `AppendOutcome` (`appended`/`coalesced`/`refused-stopped`), `SessionOutcome` (`rejected-*`), `RenderRefusal`, `LocatorVerdict`, `VerificationStatus`. |

### The recorded baseline probe

A temporary probe measured the untouched implementation:

```
RUNTIME_API ["start","state","stop","tick","workflow"]
HAS_recorded false | HAS_refused false
WORKFLOW_STEPS 0 (frame click was silently refused)
PUBLISH_COUNT_AFTER_REFUSAL 1 (1 = start only; refusal published nothing)
OBSERVATION_KEYS ["lastHeartbeatAt","lifecycle","schemaVersion","sessionId","startedAt"]
HAS_admission_module false
```

The refusal **published nothing**, so nothing could ever have told the user. That is the gap this slice closes.

---

## 4. Existing action semantics

Measured, not assumed:

```ts
// workflow.ts
if (shouldStopRecording(workflow.steps.length)) { … }
return { …, state: recordingLimitState(steps.length) };

// config/recording.ts
export function recordingLimitState(actionCount: number): RecordingLimitState
export function shouldStopRecording(actionCount: number): boolean
```

The limit takes `workflow.steps.length` and the parameter is literally named `actionCount`.

---

## 5. Coalescing semantics

`appendStep` merges two consecutive fills on one target inside `fillDebounceMs`, and two clicks on one target inside `dblclickWindowMs` into a `dblclick`. Both paths call `replaceLast`, so **the workflow length does not grow**.

Because the limit already counts `steps.length`, **coalescing has always been inside the 40/100 contract**. There was no ambiguity to report and no contract to change.

---

## 6. Definition of "recorded action"

> **A `RecordedStep` present in `RecordedWorkflow.steps`.**

Not a captured DOM event. Not an attempted action. Not generated code. `rt.recorded()` returns `session.workflow.steps.length` — it keeps no tally of its own, because a second counter would be a second thing to disagree with the recording. A guard pins that the displayed number and the limit's number are the same quantity.

---

## 7. Definition of "refused action"

> **A step whose target the admission boundary declined, so it never entered the workflow.**

Two things are deliberately **not** refusals:

| Not a refusal                                                                    | Why                                                                                                                                             |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **The noise filter** — `stepForClick` returns `null` for a click on a text input | The FILL owns that element; the user's intent **is** recorded, by the other event. Counting it would invent a failure.                          |
| **A session that is not live** — `recordAction`'s `rejected-*`                   | The **lifecycle** already tells the user, in the banner. A second channel saying the same thing is how one fact starts disagreeing with itself. |

Both exclusions are tested.

---

## 8. Refusal reason taxonomy

Five codes, each naming a state the engine already has a word for — **borrowed, not a parallel taxonomy**:

| Code                | Existing vocabulary it names                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `ambiguous`         | `LocatorVerdict.ambiguous`; also a chain that only became unique via `.nth()` — a positional guess      |
| `not-found`         | `LocatorVerdict.no-match` / `VerificationStatus.not-found`                                              |
| `unverifiable`      | `VerificationStatus.unverifiable`; a capture that threw shares this code                                |
| `frame-unsupported` | DL-83's capability limit; WS6.2's parser independently calls `page.frameLocator()` `UNSUPPORTED_METHOD` |
| `limit-reached`     | `RECORDING_LIMITS.hardStop`                                                                             |

Clause order in `refusalFor` is load-bearing: **frame first** (DL-83 — an in-frame element usually _does_ have exactly one visible match in its own document, so every later clause would wave it through), then `.nth()`, then zero-versus-many, then the verdict.

---

## 9. Storage decision

| Fact               | Where it lives                                                               | Why                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **recorded count** | **Not stored.** Derived from the durable workflow via `readDurableWorkflow`. | `persistence.ts` already ruled: _"There is no action count: the workflow is persisted beside this record and already knows, and a second copy of one fact is a second thing to disagree."_         |
| **refusals**       | Two **optional, additive** fields on the existing `RecordingObservation`     | A refused action is deliberately **not** in the workflow and derivable from nothing else. It is known only to the runtime that refused it, and this record _is_ that runtime's durable projection. |

`refusedCount` is bounded by `RECORDING_LIMITS.hardStop`; `lastRefusal` is one of five codes.

**`RECORDING_OBSERVATION_SCHEMA` stays at 1.** A record written without the fields is still valid and still readable — a widening, not a migration — so no migration discipline was invoked. Present-but-malformed, one field without the other, an out-of-bounds count or a future reason all refuse the **whole** record, following this module's existing rule; the gateway then returns `null`, which reads as no observation at all.

---

## 10. Session ownership

The tally resets on `start()`, so a new recording never inherits the previous one's refusals. It lives in the **runtime closure**, not on `RecordingSession` — the lifecycle module decides lifecycle and nothing else. A stale session refuses nothing (it is not recording); a stop with a foreign id changes no count.

---

## 11. Tab ownership

Unchanged and free: both facts travel on the existing observation and workflow, which the background keys by `sender.tab.id`. `clearTab` already owns their cleanup. **No new descriptor, no new listener, no new message.** A guard pins the descriptor set at exactly six.

---

## 12. Lifecycle interaction

`observedLifecycle` is guarded against ever consulting either new field, so a durable `refusedCount` can never imply that a recording is active. `recordedCount = 5, lifecycle = stale` remains valid and expressible. `LIVE > DURABLE > UNKNOWN` is untouched. A fresh runtime reports zero for both whatever storage holds, and still reads nothing back from storage.

---

## 13. UI design

One line **inside** `RecordingBanner`'s existing status region:

```
● RECORDING — perform actions on the page
  3 actions recorded · 1 not recorded — actions inside a frame can't be recorded yet
```

- **Silent when there is nothing to say** — zero recorded _and_ zero refused renders no claim, so a fresh recording does not announce "0 actions recorded".
- The two numbers are **named differently**, so neither can be read as the other.
- The reason is categorical prose mapped from the typed code via `Record<RecordingRefusal, string>`.
- **The UI computes nothing.** Guards assert it contains no `verdict`, no `visibleMatchCount`, no `frameSelector`, no `isTrustworthy`, no `refusalFor`, no probe, no resolver; that it reaches storage only through the WS4 gateway; that it performs no active-tab lookup; and that it names no V1 key.

---

## 14. Accessibility

- **Exactly one live region.** The counts render inside the banner's existing `role="status" aria-live="polite"` element. A second polite region announcing a changing number would talk over the one that says whether recording is happening at all — and the number _qualifies_ that status rather than rivalling it. A guard pins one `aria-live` in the file.
- **No colour-only meaning** — weight and position separate the two facts; the banner's background already carries state.
- The blinking dot is now `aria-hidden="true"` — it is decoration, and it was being announced.
- No accessibility dependency was added. **No axe validation is claimed.**

---

## 15. Privacy

A refusal is a **code and nothing else** — no selector, no attribute, no value, no element text, no frame URL. A test feeds a secret through a frame selector and asserts the refusal is `frame-unsupported`, containing neither the secret nor the word `iframe`. The serialised observation is asserted to contain no angle bracket, no `iframe`, no `value`, no `html`, and its key set is pinned exactly. The session id remains **used, never shown**.

---

## 16. Failure-first evidence

The 51-assertion suite **could not collect** against the untouched tree — `src/recording/admission.ts`, `rt.recorded()`, `rt.refused()` and the observation fields did not exist. That is the genuine failure, and it is reported as such rather than dressed up as granular red. The recorded baseline probe in §3 supplies the specific, quotable measurements.

### Two guards corrected — the code was not weakened to fit

1. **One of my own guards was too broad.** It banned the string `sessionId` in the panel outright, which would have forbidden the **correct** code: DL-77's rule is _"used, never shown"_, and the panel must present the id on `STOP_RECORDING` for a stale stop to be refusable. Narrowed to the claim actually being made — never interpolated into JSX, never logged.
2. **One existing guard broke on _where_ a clause lives.** `ws9-recording-renderer.test.ts` located "capture time" by finding `chain.nth` inside `src/runtime/recording.ts`. DL-84 moved that clause into the admission module. Repaired to assert the clauses live in the admission module, that the runtime **delegates** to it, and that the renderer gates on nothing — **more** than it checked before.

---

## 17. Tests

`packages/extension/test/ws9-action-count-refusal.test.ts` — **51 assertions** covering COUNT-01…COUNT-24 plus the persistence, UI and failure-mode groups: what the count counts, coalescing identity with the limit, bounding, hostile stored values, the taxonomy per reason, unknown/future reasons failing closed, foreign and stale sessions, tab ownership, durable-versus-live separation, the four non-duplication rules, additive validation, the flag gate, the single live region, and refusal-then-success / success-then-refusal / repeated-refusal / noise-filter ordering.

---

## 18. Files changed

**Production — 1 added, 4 modified, 0 deleted:**

| File                                         | Change                                                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/recording/admission.ts`                 | **NEW** — `RecordingRefusal`, `REFUSALS`, `refusalFor`, `tallyRefusal`, validators                                                                   |
| `src/runtime/recording.ts`                   | `isTrustworthy` = `refusalFor(…) === null`; per-session tally; `recorded()`, `refused()`; publish-on-refusal; capture failure reports `unverifiable` |
| `src/recording/persistence.ts`               | Optional `refusedCount` / `lastRefusal`; `observationFor(session, refusals?)`; paired validation                                                     |
| `entrypoints/sidepanel/RecordingControl.tsx` | `useRecordingFeedback`, `REFUSAL_COPY`, banner tally line                                                                                            |
| `entrypoints/sidepanel/SidePanel.tsx`        | Wires the feedback to the bound tab                                                                                                                  |

**Tests — 1 added, 1 repaired.** **Docs:** `DECISION-LOG.md` (DL-84) · `MASTER-ROADMAP.md` · `CURRENT-STATE.md` · `PROGRESS.md` · this report.

No manifest change, no new descriptor, no new message type, no new permission.

---

## 19. Bundle before/after

|                               | Before             | After                  | Δ                    |
| ----------------------------- | ------------------ | ---------------------- | -------------------- |
| total                         | 314,662 B          | **316,367 B**          | **+1,705 B**         |
| `content.js`                  | 48,141 B           | 48,591 B               | +450 B               |
| sidepanel chunk               | 10,449 B           | 11,051 B               | +602 B               |
| `background.js`               | 11,449 B           | 11,775 B               | +326 B               |
| tokens chunk                  | 90,757 B           | 91,084 B               | +327 B               |
| devtools-panel                | 1,386 B            | 1,386 B                | 0                    |
| overage vs. 278,760 B ceiling | 35,902 B / 12.88 % | **37,607 B / 13.49 %** | +1,705 B / +0.61 pts |

### Tree-shaking, measured rather than claimed

| String                                                       | Shipped?                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `actions recorded`, `not recorded`, `actions inside a frame` | **Zero bundles** — the flag-gated early return in `RecordingBanner` is constant-folded, exactly as DL-81 documented |
| `frame-unsupported`                                          | content.js, background.js, tokens chunk                                                                             |
| `refusedCount`                                               | those three plus the sidepanel chunk                                                                                |

The **user-facing copy** is genuinely shaken out. The **runtime vocabulary is not**: the admission module and the observation validator are on the runtime and background paths regardless of the flag, because the flag gates `start()`, not the module graph. The +1,705 B is real shipped weight and is not presented as free.

---

## 20. Build / typecheck / lint / format

Each command run **alone**, with its own exit code.

| Command             | Exit  | Detail                                                                                                                   |
| ------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test`         | **0** | **1,914 / 67 files** (was 1,863 / 66) — locator-engine 383 · codegen **127 incl. 127/127 goldens** · extension **1,404** |
| `pnpm build`        | **0** | clean rebuild after deleting `.output`                                                                                   |
| `pnpm typecheck`    | **0** | all three packages                                                                                                       |
| `pnpm lint`         | **0** | the same 3 pre-existing DL-80 warnings, in untouched files                                                               |
| `pnpm format:check` | **1** | `ws2-item9-report.md` only                                                                                               |

> **Verification is NOT claimed as "all green"** while that exception stands.

---

## 21. Real Chromium status

**NOT RUN.** No extension E2E infrastructure exists — unchanged since DL-63 — and none was built. The frame evidence is happy-dom with a real sub-frame, real event dispatch and the real capture path: genuine unit evidence, explicitly not browser evidence.

## 22. Manual regression status

**NOT RUN.** The rendered appearance of the status line and screen-reader announcement behaviour are unverified.

---

## 23. Remaining limitations

1. **Feedback is attached to the banner**, so it appears only while the banner has something to say. A user returning to a tab whose recorder is gone sees the recording without its refusal history.
2. **Only the most recent reason is kept.** A session that refused for three different reasons reports the last; a per-reason histogram would grow the record and the product does not yet know it is worth it.
3. **`limit-reached` is defined and validated but not yet produced by the runtime.** `appendStep` already ends the session at `hardStop`, so the lifecycle reports it; emitting a second announcement would be the double-reporting §7 refuses.
4. Frame recording remains **unsupported** (DL-83). This slice makes the refusal visible; it does not lift it.

---

## 24. Owner decisions

**(a) SHOULD REFUSALS SURVIVE THE RECORDER?** They are durable today but rendered only beside a live-ish banner. Showing them for a tab whose recorder is gone is defensible, and is a UI-scope decision.

**(b) SHOULD A PER-REASON BREAKDOWN EXIST?** _"3 not recorded — 2 in a frame, 1 ambiguous"_ is more useful and costs a bounded map on the record plus more UI. The single most-recent reason was chosen as the smallest honest thing.

---

## 25. Final verdict

**IMPLEMENTED.**

The product now tells the truth about what it recorded and what it refused, using one admission authority that returns its reason instead of discarding it, a count derived from the workflow rather than duplicated beside it, and a durable projection that gained two optional fields and no new mechanism.

WS9's exit criteria are **not** met: the E2E kill-the-content-script proof remains blocked, and the feature remains switched off.

**WS9 remains PARTIAL / IN PROGRESS. `RECORDING_ENABLED` remains `false`.**

---

**HARD STOP.** No further roadmap work was performed.
