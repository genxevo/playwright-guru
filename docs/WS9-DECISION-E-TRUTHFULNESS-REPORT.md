# WS9 — Owner Decision E: Durable Recording Observation Truthfulness

**Date:** 2026-09-05 · **Decision:** DL-89
**Verdict:** **NARROW UI-TRUTH CORRECTION REQUIRED — IMPLEMENTED**

**Production `RECORDING_ENABLED` is still `false`. DL-79's precedence is unchanged. Three production files changed; bundle +186 B.**

---

## 1. Decision Question

DL-88 closed the WS9 E2E exit criterion and, in doing so, exposed one residual issue. After a content script is killed, the Side Panel continued to display

> **RECORDING — perform actions on the page**

for up to `heartbeatTimeoutMs`, while the durable row still literally read `lifecycle: 'active'`.

The question was **not** "can the banner disappear faster?" It was:

> Is it architecturally acceptable for durable evidence to continue producing an ACTIVE recording view after the live recording authority has disappeared, until heartbeat expiry?

**The answer this report reaches: the ACTIVE VIEW is acceptable and was left alone. The CLAIM the panel made about that view was not.** Those are two different things, and separating them is the whole decision.

---

## 2. Authoritative Contracts Reviewed

| Source                                            | What it says                                                                                                                                                                                                                     | Bearing                                                                                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DL-79**                                         | `LIVE > DURABLE > UNKNOWN`. "A durable record may never resurrect a recording **the live runtime has already declared dead**." Durable is fallback evidence, "consulted only when the live authority produced no answer at all". | The observed behaviour is **inside** this contract. A destroyed content script _declares_ nothing; it produces no answer, which is exactly the fallback case. |
| **`session.ts`, line 6**                          | "**the product must never believe it is recording when it is not.**"                                                                                                                                                             | The property actually at stake.                                                                                                                               |
| **`heartbeatTimeoutMs` doc**                      | "After this much silence the UI shows a degraded state… stale state is surfaced rather than trusted."                                                                                                                            | The timeout **is** the documented staleness-surfacing mechanism. A delay is by design.                                                                        |
| **`RECORDING_ENABLED` doc**                       | The flag exists because "the control could report success while capturing nothing."                                                                                                                                              | Names this exact failure mode.                                                                                                                                |
| **`recording-observation.ts`**                    | Durable evidence exists so the panel can answer "**was** this tab recording?" when the content script cannot be reached — "after the panel was closed and reopened, or while the script is being re-injected."                   | A **past-tense** question, rendered by the panel as a **present-tense imperative**.                                                                           |
| **DL-73**                                         | Staleness is terminal and derived from the clock.                                                                                                                                                                                | Why the window is bounded and self-healing.                                                                                                                   |
| **DL-83 / DL-84 / DL-85 / DL-86 / DL-87 / DL-88** | Navigation semantics, truthful counts, finalization, the harness, feasibility, the E2E build.                                                                                                                                    | No conflict; DL-88's own evidence is corrected in §4.                                                                                                         |

---

## 3. Current Implementation

Verified in source, not from report prose.

```
panel poll (useRecording.observe)
  └─ sendRuntimeMessage QUERY_RECORDING_STATE {targetTabId}
       └─ background router  → isFromExtensionUI(sender)?  → dispatchToTab(tabId, msg)
            ├─ tabs.sendMessage → ack                                  ← LIVE
            └─ catch "Receiving end does not exist"
                 └─ scripting.executeScript(content.js) + 300 ms + retry   ← RE-INJECTION FALLBACK
  └─ observedView(ack) !== 'unknown'  ?  use live  :  readDurableObservation → resolveRecordingView
```

**Two facts here were not previously written down anywhere and change the analysis materially:**

1. **`dispatchToTab` re-injects.** The production path does not merely fail on a dead content script — it tries to put one back, on every poll. So a dead content script on an _injectable_ page is replaced within one poll, the fresh runtime answers `inactive`, and live evidence wins immediately.
2. **The panel poll is not the documented 5 s.** `useRecording({ tabId, gateway })` receives a **fresh object literal on every render**, so `observe`'s `useCallback` and the `useEffect` that owns the interval both re-run every render. **Measured reaction latency to a state change: 59–66 ms**, not 5,000 ms. This is pre-existing, makes the panel _more_ responsive rather than less, and is **reported, not changed** (§16).

---

## 4. Failure-First Reproduction

Reproduced with the DL-88 harness against `.output-e2e`, the real extension in real Chromium. No internal recorder function was called, no storage was mutated to manufacture the state, no synthetic `STOP_RECORDING` was dispatched.

|       | Claim                                             | Result                                                   |
| ----- | ------------------------------------------------- | -------------------------------------------------------- |
| **A** | recording genuinely becomes ACTIVE                | `{ok:true, sessionId:'mtoahm7x…'}`, `lifecycle:'active'` |
| **B** | a real RecordedStep exists                        | 1 step, `getByRole`, verdict `excellent`                 |
| **C** | the Side Panel displays a recording banner        | yes                                                      |
| **D** | the content script is killed without calling stop | `about:blank` navigation                                 |
| **E** | live authority becomes unavailable                | `Receiving end does not exist`                           |
| **F** | durable observation still says active             | `lifecycle:'active'`, row intact                         |
| **G** | the panel therefore displays active until expiry  | **yes — 14,820 ms**                                      |
| **H** | after expiry it becomes stopped-responding        | yes                                                      |

### A correction to DL-88's own evidence

Reproducing this exposed something DL-88 did not know about its own test. **The Side Panel is hosted as an ordinary TAB in the harness**, because Playwright cannot drive Chrome's side-panel container. A tab carries a `sender.tab`, and `isFromExtensionUI` requires `sender.tab === undefined`, so **every live query from the harness panel is rejected**:

```
router response to a message from the panel PAGE
  = {"ok":false,"code":"UNTRUSTED_SENDER","error":"This message must come from the extension UI."}
```

Proven behaviourally as well as from source: with the recorder **provably still alive** (`{ok:true, lifecycle:'active'}`), removing the durable row made the banner disappear.

```
2. content script is still alive: {"ok":true,"lifecycle":"active"}
   banner with the durable row REMOVED (recorder alive) = NONE
   → RECORDING means LIVE-fed; anything else means DURABLE-fed
```

**So DL-88's E2E-A4/A5 exercised the DURABLE path only. The confirmed banner line was never fed by live evidence in a browser, and DL-88's report should not have implied otherwise.** That is corrected here and in DL-89, and it is now _asserted_ inside E2E-A4 rather than left as a footnote.

### The control that stops E2E-A5 passing for the wrong reason

If the banner expired regardless of the kill, E2E-A5 would prove nothing. It does not:

```
3. CONTROL — banner over 25,000 ms with NO kill = [{"b":"NONE","at":165},{"b":"RECORDING","at":671}]
```

The recorder's `tick()` refreshes `lastHeartbeatAt` every `heartbeatMs` while alive, so the row only ages once the kill stops those writes. **The expiry is caused by the kill.**

### Why the re-injection fallback cannot rescue `about:blank`

```
4. executeScript re-injection into about:blank
   = {"injected":false,"error":"Cannot access contents of the page.
      Extension manifest must request permission to access the respective host."}
```

`<all_urls>` does not match `about:blank`. **This is the sharpest fact in the whole report:** at the moment the panel is displaying "RECORDING — perform actions on the page", the extension has just been told, in the background, that the page _cannot host a content script at all_. That is not silence. It is a positive statement of impossibility — and the architecture discarded it, because `dispatchToTab` collapses every failure into `{ok:false, error:<string>}` with no `code`, and `observedView` maps every `ok:false` to `unknown`.

---

## 5. Measured Timing

Five independent runs, each a fresh browser, fresh profile, fresh recording.

| Run | heartbeat age at kill | window until non-RECORDING |
| --- | --------------------- | -------------------------- |
| 1   | 410 ms                | 15,267 ms                  |
| 2   | 402 ms                | 15,099 ms                  |
| 3   | 404 ms                | 14,803 ms                  |
| 4   | 594 ms                | 14,445 ms                  |
| 5   | 402 ms                | 14,715 ms                  |

- configured `heartbeatTimeoutMs` = **15,000 ms**; `heartbeatMs` = **5,000 ms**
- **min 14,445 ms · max 15,267 ms · spread 822 ms**
- **Deterministic**, not a rare race. The window is `heartbeatTimeoutMs` minus the age of the last heartbeat write.
- **The panel poll contributes almost nothing** (spread 822 ms, not the 5,000 ms a strict 5 s beat would produce) because of the re-render polling in §3.2.

---

## 6. State Machine

`resolveRecordingView(live, durable, now)`, exactly as implemented:

| live evidence                      | durable evidence                       | resolved view                          |
| ---------------------------------- | -------------------------------------- | -------------------------------------- |
| any of the five states, `ok:true`  | anything, valid or not, fresh or stale | **the live state** (row not even read) |
| `ok:false` / absent / unrecognised | absent, invalid, or unreadable         | `unknown`                              |
| `ok:false` / absent / unrecognised | valid, `active`, age ≤ timeout         | **`active`** ← the window              |
| `ok:false` / absent / unrecognised | valid, `active`, age > timeout         | `stale`                                |
| `ok:false` / absent / unrecognised | valid, `stopped` / `stale`             | that value (terminal)                  |

Scenario mapping:

| Scenario                   | content script                     | live           | durable         | view                   |
| -------------------------- | ---------------------------------- | -------------- | --------------- | ---------------------- |
| recording, healthy         | alive                              | `active`       | fresh `active`  | `active`               |
| **normal reload**          | **re-injected by manifest**        | **`inactive`** | stale `active`  | **`inactive`**         |
| `about:blank`              | destroyed, **not injectable**      | none           | `active` → ages | **`active` → `stale`** |
| dead on an injectable page | **re-injected by `dispatchToTab`** | `inactive`     | stale `active`  | `inactive`             |
| panel closed & reopened    | alive                              | `active`       | fresh           | `active`               |
| no bound tab yet           | n/a                                | not sent       | not read        | `unknown`              |
| SW/panel timing race       | alive                              | none           | fresh `active`  | `active` (bridged)     |

**No new state was invented.** Decision E adds no lifecycle state, no view, and no persisted field.

---

## 7. Normal Reload vs Content-Script Destruction

This comparison is the centre of the decision, and it was measured.

```
RELOAD CASE
  before: live = {"ok":true,"lifecycle":"active"}
  after reload (+38 ms): live = {"ok":true,"lifecycle":"inactive"}
  durable row still says   = "active"
```

**The reload path is already correct and is not touched.** The re-injected content script answers in **38 ms**, live wins, and the stale durable row — which still claims `active` — is never even read. Decision E preserves this exactly; a regression test pins it.

The contrast: on `about:blank` the page cannot host a content script, no live answer is ever produced, and the durable row governs until expiry.

**So the stale window is confined to tabs the extension cannot inject into** — `about:blank`, `chrome://`, the Web Store, the PDF viewer, `view-source:`, other extensions' pages — plus genuinely transient failures.

---

## 8. Temporary Live Unavailability Analysis

**Can the architecture distinguish permanent content-script death from a transient live failure?**

**As delivered to the panel: NO.** `observedView` sees one `unknown` for all of it.

**Inside the background: PARTLY, and more than it passes on.** `dispatchToTab` already separates the cases and acts on the difference — it re-injects on "Receiving end does not exist" and reports a distinct message when injection is refused. That information is then discarded: the returned ack carries no `code`, so "the page cannot host a content script" and "the send failed for some other reason" arrive at the panel identically.

**Would immediate invalidation (Option B) be safe?** **No, and it is not proposed.** Legitimate `unknown` windows exist where the recorder is alive: panel startup before the first answer, panel reopen, service-worker restart, injection still completing, and the send racing a navigation. In those windows durable evidence is doing exactly the job it was built for. Turning `unknown` straight into "not recording" would produce false negatives during ordinary transitions and would rewrite DL-79.

**This is why Decision E changes what the panel SAYS and not what it CONCLUDES.** The view stays `active` — bridging the transient case — while the panel stops asserting a confirmation it does not have.

---

## 9. Options A–E Evaluation

**A — keep everything, change nothing.** _Rejected._ Defensible on contracts: the window is bounded, self-healing, cannot survive a browser restart (`area: 'session'`), fabricates nothing, and `heartbeatTimeoutMs` documents itself as the staleness-surfacing mechanism. But the banner does not merely _state_ a status — it issues an **imperative**, "perform actions on the page", and actions taken on it are lost in silence. Against `session.ts`'s own opening line that is a truthfulness violation, not a tolerance.

**B — live-missing immediately invalidates durable active.** _Rejected as unsafe, and it would rewrite DL-79._ See §8: it would produce false negatives during panel startup, panel reopen, SW restart and injection windows, where the recorder is genuinely alive.

**C — shorten `heartbeatTimeoutMs`.** _Rejected. The value was not changed._ That constant is the **recorder's own liveness tolerance** — three missed beats at `heartbeatMs` — and it is consumed by `isRecording`, `lifecycleStateOf` and `observedLifecycle` alike. Shortening it to make one banner honest would change when a _live_ recording is declared dead, in every consumer at once. Decision E does not buy UI truth with lifecycle semantics. (Note for the record: because the panel effectively re-polls per render, a change here would translate almost 1:1 into the window — which makes it tempting and no less wrong.)

**D — change only the UI presentation.** **ACCEPTED, in its narrowest form.** The panel already knew the provenance and threw it away: `observe()` has always had two branches, one where the live authority answered and one where it did not. Carrying that one bit through to the banner changes no precedence, no schema and no state machine.

**E — add a new "recovering" view or lifecycle state.** _Rejected as unnecessary._ No new state is required. The distinction is derivable from evidence the panel already has, and inventing a sixth view would put lifecycle vocabulary in a second place.

---

## 10. Security / Privacy

Verified in the browser during the stale window and after expiry.

| Question                                                                      | Answer                                                                                                                  |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Can user actions be recorded during the window?                               | **No.** No content script exists; `START_RECORDING` is undeliverable.                                                   |
| Can a new `RecordedStep` be appended?                                         | **No.** Steps: 1 before, 1 mid-window, 1 after expiry.                                                                  |
| Can the workflow claim activity after content death?                          | **No.** The only writer is `PERSIST_RECORDING_STATE` from a content script.                                             |
| Can export expose fabricated steps?                                           | **No.** It exposes the one real recorded step.                                                                          |
| Is the tally truthful during the window?                                      | **Yes** — "1 action recorded", matching the workflow.                                                                   |
| Can the stale state survive indefinitely?                                     | **No.** Expiry is re-derived on every read.                                                                             |
| Can it survive a browser restart?                                             | **No.** `area: 'session'`.                                                                                              |
| Can it survive re-injection?                                                  | The row survives; **live wins**, so it cannot govern.                                                                   |
| Passwords / cards / secrets / session ids / frame URLs / telemetry / network? | **None.** Zero `eval`, `new Function`, `innerHTML`, `fetch`, `XMLHttpRequest`, `sendBeacon` in the three changed files. |
| New capability from DL-88 or DL-89?                                           | **None.** Permissions unchanged: `activeTab`, `storage`, `scripting`, `sidePanel` + `<all_urls>`.                       |

**The precise harm, stated without blurring:** the UI said it was recording and instructed the user to act, while **nothing could be captured**. No data was fabricated, no step invented, no count inflated. It was a false claim, not a false record.

---

## 11. Decision

> ## **DECISION E — NARROW UI-TRUTH CORRECTION REQUIRED**

The current UI wording implies stronger real-time truth than the architecture can guarantee (the gate's §4 question 10 — measured answer: **yes**). The correction is confined to what the panel is entitled to _say_; the precedence rule that decides _what is true_ is untouched.

---

## 12. Implementation

**Three production files. `resolveRecordingView`, `observedView`, `observedLifecycle`, `session.ts`, `persistence.ts` and the storage schema were NOT touched.**

**1. `src/recording/lifecycle-view.ts`** — one optional parameter, defaulting to the previous behaviour:

```ts
export function recordingBannerLine(view, pending, confirmed = true): string | null {
  …
  case 'active':
    return confirmed
      ? 'RECORDING — perform actions on the page'
      : 'Recording unconfirmed — the page has not answered, so actions may not be captured';
```

Unconfirmed is deliberately **not silent** (a user would believe a recording runs off-screen) and deliberately **not "ended"** (a second unevidenced assertion, in the other direction).

**2. `entrypoints/sidepanel/RecordingControl.tsx`** — the provenance the hook already computed, now carried:

```ts
const confirmed = observedView(ack) !== 'unknown';
if (!durable || confirmed) { … }
```

**One expression, bound once, governing both consequences** — whether to fall back to the durable row, and whether the banner may claim a live recording. Two copies could drift, and a panel that fell back to storage while still claiming confirmation is precisely the untruth being fixed.

The banner's **colour** is treated as a claim too: `const live = view === 'active' && !pending && confirmed`. A green ground and a blinking dot assert recording in the loudest channel available; leaving them lit under an "unconfirmed" sentence would state exactly what the sentence withdraws.

**3. `entrypoints/sidepanel/SidePanel.tsx`** — `confirmed={rec.confirmed}`.

### Deliberately NOT changed

- **`recordButtonModel` and the picker lock-out.** `model.live` also drives `disabled={rec.button.live}` on Inspect, so reacting to confirmation there would **unlock the picker during a transient failure while a recording is genuinely running**. That is a behaviour change with its own risk. Left alone, guarded, and raised as an open follow-up (§17) rather than done quietly.
- **`heartbeatTimeoutMs`.** See Option C.
- **The `active` view itself.** DL-79 unchanged.

### Effect

**The false imperative is withdrawn at the first poll after the live authority stops answering — one panel poll (documented `heartbeatMs` = 5,000 ms; measured 59–66 ms), instead of one heartbeat timeout (14,445–15,267 ms).** The `active` _view_ still expires at `heartbeatTimeoutMs`, exactly as before, and then reports "the recorder stopped responding".

---

## 13. Tests

**Failure-first.** `test/ws9-decision-e-truthfulness.test.ts` was written before any production line and run: **9 failed / 14 passed**. The 14 that passed were the "nothing else moved" anchors, which must pass both before and after. After implementation: **24/24**.

**Five mutations injected; four caught immediately, one survived and exposed a real gap:**

| Mutation                                                                   | Caught by                                     |
| -------------------------------------------------------------------------- | --------------------------------------------- |
| the slice-5A lie returns under a new name (`useState(false)` + `setIsRec`) | repaired `ws9-recording-ui` boolean guard     |
| confirmation hard-coded `true`                                             | that guard **and** WS9-DE-5                   |
| banner stops honouring confirmation                                        | WS9-DE-5                                      |
| unconfirmed silently reuses the confirmed line                             | WS9-DE-1 (×3)                                 |
| **green ground + blinking dot survive unconfirmed**                        | **NOTHING — every assertion was about words** |

The survivor was fixed by adding a guard on the banner's `live` derivation, then re-mutated to confirm it fails. **A guard that only checks the sentence misses a claim made in colour.**

### Three pre-existing guards repaired — none weakened

1. **`ws9-recording-ui`: "declares no boolean state at all"** banned `useState(false)` outright, reasoning that "the defect cannot come back under another name". But the defect it names is a boolean that **stands for recording and is set from an acknowledgement** — and a ban on the literal caught one _spelling_. `useState<boolean | null>(null)` plus `setX(ack.ok)` would have sailed through while re-introducing the exact lie. It now bans **any setter called with a boolean literal**, and requires **every boolean state to be written only with the observation function's own answer**. Mutation-proven to catch the original defect; **strictly stronger**.
2. **`ws9-recording-ui`: `setView` argument shape** — `observe()` now yields `{view, confirmed}`, so the argument must be that value's **`.view` projection**. Stronger: it no longer accepts the whole observation object where a view belongs.
3. **`ws9-recording-reconcile`: the same assertion**, deliberately duplicated per DL-79, repaired identically.

### E2E

`E2E-A4` and `E2E-A5` were rewritten. A4 now **asserts the `UNTRUSTED_SENDER` rejection**, making the harness limitation a measured fact rather than a footnote, and asserts that the panel reports the recording **without** the confirmed line and **without** the imperative — while still showing the truthful "1 action recorded" and the real generated code. A5 proves the claim ends after the kill and never returns in either form.

**Honest consequence:** the confirmed banner line is **not observable in this harness at all**, because the panel can never reach the live authority. `chrome.sidePanel.open()` was tried and fails with _"may only be called in response to a user gesture"_, and the container never appears as a Playwright page — so **owner decision B is now measured, not merely asserted**.

**Regression coverage:** normal reload still recovers (live `inactive` at 38 ms wins over a stale `active` row); live wins when restored, across all five states × seven durable shapes; no false permanent stop; workflow uncorrupted; `RECORDING_ENABLED` still `false`.

---

## 14. Validation Matrix

Each command run alone, from the repository root.

| Command             | Result                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`        | **PASS** — 316,751 B                                                                                                                    |
| `pnpm build:e2e`    | **PASS** — 321,101 B in `.output-e2e`                                                                                                   |
| `pnpm typecheck`    | **PASS** — 0 errors                                                                                                                     |
| `pnpm lint`         | **PASS** — 0 errors; **3 pre-existing warnings**, unchanged                                                                             |
| `pnpm test`         | **PASS** — **1,974 tests / 70 files** (was 1,950 / 69)                                                                                  |
| `pnpm format:check` | **1 file** — `ws2-item9-report.md`, the known permanent exception, untouched. **This is not "all green" and is not described as such.** |
| `pnpm test:e2e`     | **PASS — 15/15**, real Chromium, both artifacts                                                                                         |

**Manual regression: NOT RUN.** **axe: BLOCKED** (still not a dependency — owner decision D). **CI: BLOCKED** (no browser/extension environment — owner decision C).

---

## 15. Bundle / Permission Impact

|                 | Before    | After         | Δ          |
| --------------- | --------- | ------------- | ---------- |
| **total**       | 316,565 B | **316,751 B** | **+186 B** |
| sidepanel chunk | 11,051    | 11,237        | +186       |
| `content.js`    | 48,591    | 48,591        | 0          |
| `background.js` | 11,874    | 11,874        | 0          |
| tokens chunk    | 91,183    | 91,183        | 0          |
| devtools-panel  | 1,386     | 1,386         | 0          |

+186 B, entirely in the panel: one parameter, one branch, one string. Overage against the locked 278,760 B ceiling is **37,991 B / 13.63 %** — disclosed, not chased. No optimisation was attempted, per the gate.

**Permissions: UNCHANGED** — `activeTab`, `storage`, `scripting`, `sidePanel` + host `<all_urls>`, asserted in the built manifest and in-browser on both artifacts. **No new dependency.** **No new persisted field; `RECORDING_OBSERVATION_SCHEMA` stays 1.**

---

## 16. Remaining WS9 Work

Untouched and still deferred: iframe recording · `frameLocator` · full-page reload resumption · browser-restart recovery · V1 stored-data migration · Download · refusal visibility after recorder death · per-reason histogram · `limit-reached` reachability. **WS10 and WS11 are NOT started.**

**Observations recorded, deliberately not acted on:**

- **The panel re-polls on every render.** `useRecording({ tabId, gateway })` builds a fresh object literal each render, so the hook's `useCallback`/`useEffect` identity changes and the interval is torn down and restarted. Measured reaction latency **59–66 ms** against a documented beat of 5,000 ms. It makes the panel more responsive, not less, and the file's own comment ("the panel keeps one beat") is now inaccurate. Changing it is a behaviour/perf change outside this gate.
- **`dispatchToTab` discards what it knows.** It distinguishes "the content script is missing" (re-inject and retry) from "this page cannot host one" and reports both as an untyped `{ok:false, error}`. A machine-readable code would let the panel treat provable impossibility differently from silence. That is the natural home of any future narrowing — and it is an **architectural** change to the ack contract, so it is raised, not made.

---

## 17. Owner Decisions Still Outstanding

- **(B) Side-panel container automation** — now **measured**: `sidePanel.open()` requires a user gesture Playwright cannot supply, and the container never surfaces as a page. Consequence: the confirmed banner line is unobservable in E2E, and DL-88's sufficiency claim is corrected accordingly.
- **(C) CI browser/extension environment** for the E2E suite.
- **(D) `axe-core`** as an ad-hoc or dev dependency.
- **(E) RESOLVED by this report** — narrow UI-truth correction implemented; DL-79 unchanged.
- **(F) A general `.gitignore`** for this repository (pre-existing; only `.output-e2e` is ignored).
- **(G) NEW — the record button and picker lock-out during an unconfirmed window.** The banner now withholds its claim; `recordButtonModel(...).live` still reports `true`, which keeps the Inspect control disabled. Making it react to confirmation would unlock the picker during a transient failure while a recording may genuinely be running. Not done; needs a decision.
- **(H) NEW — a typed ack code for "this page cannot host a content script."** See §16. Would allow provable impossibility to be treated differently from silence, and would shorten the `active` window itself rather than only the claim. **Changes the message contract and DL-79's inputs — architectural, deferred.**

---

## 18. HARD STOP

No further WS9 slice was started. WS10 and WS11 were not touched. No bundle optimisation, no unrelated refactor, no deferred item picked up.

**WS9 remains PARTIAL / IN PROGRESS. Production `RECORDING_ENABLED` remains `false`.**
