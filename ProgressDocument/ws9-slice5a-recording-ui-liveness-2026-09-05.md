# WS9 — SLICE 5A: RECORDING UI + LIFECYCLE / LIVENESS CONSUMER

**2026-09-05 · DL-77 · Executes owner decision DL-76 option (a) RE-SEQUENCE.**
**`RECORDING_ENABLED` is still `false`. WS9 is still PARTIAL and is NOT complete.**

## 1. Verdict

**IMPLEMENTED.** The recording UI no longer holds a local boolean standing in for a fact it does
not own. It reads the authoritative lifecycle, fails closed on every non-answer, and surfaces a
recorder that has gone silent instead of leaving the last claim standing.

The objective was the one the gate stated: **make the existing recording lifecycle truthful and
observable** — not make recording work. Nothing here starts a recording that could not already be
started, and the product flag is untouched.

## 2. The Defect, Quoted From The Source It Was In

```tsx
const [recording, setRecording] = useState(false);
…
const ack = await sendRuntimeMessage({ type: next ? 'START_RECORDING' : 'STOP_RECORDING', … });
if (ack.ok !== false) { setRecording(next); … }
```

Slice 2 deliberately made liveness a **derivation**: `isRecording(session, now)` recomputes
staleness from the clock on every read, so a content script that dies the way content scripts
actually die — a reload, a navigation, a tab discard, an extension update, a crash — sends no
message, fires no event, calls no transition, and simply stops reading as recording. Its own module
header says the point in one line: _a caller that forgets to poll cannot obtain a stale `true`,
because there is no stored `true` to obtain._

A boolean in the panel is that stored `true`, restored. It cannot go stale. So the banner outlived
the recorder — the exact failure `config/recording.ts` names as the reason `RECORDING_ENABLED` is
off ("the control could report success while capturing nothing").

## 3. A Second Defect, Found By Measurement

`toggle()` sent `STOP_RECORDING` carrying only `{ type, targetTabId: undefined }` — **no
`sessionId`**. Slice 3's content handler calls `recording.stop(sessionId ?? '', Date.now())`, and
the runtime refuses any id that is not the live session's:

```ts
if (session.id.value !== sessionId) return { ok: false, error: 'wrong-session' };
```

So **stop was refused by construction**, and the old `if (ack.ok !== false)` branch then took the
failure path and left the boolean stuck on `true` — a panel permanently claiming to record.

Pinned by a new regression test that measures the runtime rather than describing it:

```
refuses a stop that presents no session id  →  { ok: false, error: 'wrong-session' }, state still 'active'
accepts a stop that presents the id START handed back  →  { ok: true }, state 'stopped'
```

The panel now holds the id START returned and presents it on stop.

## 4. Discovery (answers by measurement, before any production line was written)

| #   | Question                                                     | Finding                                                                                                                  |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| A   | Which UI owns recording controls?                            | `entrypoints/sidepanel/RecordingControl.tsx` — the only one. DevTools has no copy (`PickSource` capabilities forbid it)  |
| B   | Which component shows recording state?                       | `RecordingBanner`, plus `RecordButton`'s colour/blink                                                                    |
| C   | Local boolean rather than authoritative state?               | **Yes** — `useState(false)` set from a START ack, quoted above                                                           |
| D   | Where does the authoritative lifecycle live?                 | `runtime/recording.ts`'s content-side session closure; `state(at)` → `lifecycleStateOf` (pure)                           |
| E   | Is `state()` a read or a mutation?                           | **A read.** `lifecycleStateOf` → `observe`, which returns a new object and assigns nothing                               |
| F   | Who owns the heartbeat?                                      | `content.ts`, via `setInterval(() => recording.tick(…), HEARTBEAT_INTERVAL_MS)`. The UI must not add a second            |
| G   | Does the ack already carry a session id?                     | **Yes** — `RuntimeMessageAck.sessionId`, added in slice 3 for exactly this handshake                                     |
| H   | Does the panel present it on stop?                           | **No** — the defect in §3                                                                                                |
| I   | Existing runtime-message seam?                               | `RuntimeMessage` + `sendRuntimeMessage` + one background router, one `onMessage` listener                                |
| J   | Router branch for a UI→tab request?                          | **Yes** — the explicit/sender/active-tab fallback branch that already carries START and STOP                             |
| K   | Existing live-region convention?                             | **Yes** — WS8: `role="status" aria-live="polite"`, always mounted, never conditionally rendered                          |
| L   | Existing accessible-name convention?                         | **Yes** — `aria-label` on icon-only buttons; a `title` alone already satisfied the guard, so this is a strengthening     |
| M   | Seam that can carry lifecycle without a second architecture? | The existing `RuntimeMessage` union + one new optional ack field. No new transport, no CommandBus                        |
| N   | Can a workflow be avoided entirely?                          | **Yes** — the UI needs a five-value enum, nothing else                                                                   |
| O   | Existing guard that pins the current UI shape?               | **Yes** — `preview-gate.test.ts` asserts `{RECORDING_ENABLED && recording &&`. Strengthened, §11                         |
| P   | **Does a lifecycle message require persistence?**            | **No.** The runtime answers from its live closure on demand; nothing is stored, and a dead script simply does not answer |

P is the finding that made this slice legal. Had it come out the other way, the instruction was
explicit — stop, do not implement persistence here.

## 5. What Was Built

**One new pure module.** `src/recording/lifecycle-view.ts` — no DOM, no React, no messages, no
storage, no clock. Its whole content is the mapping from "what the authority last said" to "what the
user is told":

```ts
export type RecordingView = RecordingLifecycleState | 'unknown';
export function observedView(reply: LifecycleReply | null | undefined): RecordingView;
export function isRecordingNow(view: RecordingView): boolean; // 'active' and nothing else
export function recordButtonModel(view, pending): RecordButtonModel;
export function recordingBannerLine(view, pending): string | null;
```

**One new message on the existing seam.** `QUERY_RECORDING_STATE` joins the same `RuntimeMessage`
union, the same `sendRuntimeMessage`, the same single background-router branch and the same
`KNOWN_MESSAGE_TYPES` set. The acknowledgement gains exactly one field:

```ts
lifecycle?: RecordingLifecycleState;
```

imported from `recording/session.ts` rather than re-declared, so the wire cannot grow a second
vocabulary for what "recording" means. It is a **type-only** import and shipped **zero bytes** —
proven in §13 by the DevTools chunk's unchanged size.

**One content-side case, which is a read:**

```ts
case 'QUERY_RECORDING_STATE':
  sendResponse({ ok: true, lifecycle: recording.state(Date.now()) }); return false;
```

**The panel rewritten as a consumer.** `useRecording` now holds the view (writable only by
`observedView`), a pending-request marker, and the session id in a ref. A successful START
acknowledgement does **not** make it believe it is recording: it refreshes, and believes the refresh.

## 6. Fail-Closed, Exhaustively

`observedView` collapses **every** kind of non-answer to a sixth honest value, `unknown`:

| Input                                | Produced by                                     | Result    |
| ------------------------------------ | ----------------------------------------------- | --------- |
| `null` / `undefined`                 | before the first query                          | `unknown` |
| `{ ok: false }`                      | `normalizeAck` on a dead/absent content script  | `unknown` |
| `{ ok: true }` with no `lifecycle`   | a handler that answered without saying anything | `unknown` |
| `{ ok: false, lifecycle: 'active' }` | a failed ack that happens to mention a state    | `unknown` |
| `{ ok: true, lifecycle: X }`         | the authority                                   | `X`       |

`unknown` is deliberately **not** `inactive`: "recording is off" is also a claim, and we have no
evidence for it either.

`isRecordingNow` is true for exactly one of the six views. That is measured, not inspected — the test
filters all six and asserts the result is `['active']`, so a new state cannot quietly join the set.

There is no path from an absence to an `active` claim.

## 7. What A Pending Request Is Allowed To Mean

The gate permits a local boolean for "request pending" and forbids one for "recording active". The
distinction is enforced in the pure layer, not by discipline:

- `recordButtonModel(view, 'start').live` is `false` **for every view** — asserted across the full
  cross-product of six views and two pending values;
- the banner reads `Starting — not recording yet`, never `RECORDING`;
- `recordButtonModel(_, pending).action === 'none'` for every view, which is what refuses a second
  request while one is in flight.

That distinction is the entire reason slice 2 has a `starting` state at all.

## 8. Why The Poll Is A Reader And Not A Second Heartbeat

This is the claim the gate's §10 most needed proving, so it was proved rather than argued.

**Structurally.** The content handler calls only `recording.state(now)`. That is `lifecycleStateOf`
→ `observe`, which returns a new object and assigns nothing to the session. A guard extracts the
handler body from the source and rejects any `recording.start(`, `recording.stop(` or
`recording.tick(` inside it.

**Behaviourally, against the real runtime:**

| Test                                                        | Measurement                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| goes stale on schedule however often it is read             | polled every 250 ms across the whole window; still `stale` at `heartbeatTimeoutMs + 1` |
| goes stale at exactly the same instant as an unread runtime | 200 sampled instants; state identical at every one                                     |
| still active before the timeout                             | the reader is not causing early failure either                                         |
| leaves the captured workflow untouched                      | 1,000 reads; `JSON.stringify(workflow())` byte-identical                               |

**No timing number of its own.** `LIFECYCLE_REFRESH_MS = RECORDING_LIMITS.heartbeatMs` — re-used
from the one constants module, mirroring what `runtime/recording.ts` does for the recorder's beat.
A guard proves the timer body sends neither `START_RECORDING` nor `STOP_RECORDING`, and that the word
"heartbeat" appears in the file for exactly one reason: reading that constant.

The recorder owns liveness. The panel asks. Stopping the timer cannot end a recording; running it
faster cannot prolong one.

## 9. What Deliberately Did Not Happen

**No workflow transport.** `GET_RECORDING_WORKFLOW` was not added. No `RecordedWorkflow`, no
`RecordedStep`, no rendered spec and no action value crosses any seam — guarded on the messaging
module and on the panel.

**No persistence.** No WS4 descriptor, no `chrome.storage`, `localStorage`, `sessionStorage` or
`indexedDB` in any new module, no migration, no serialisation. A guard counts `browser.storage`
occurrences in `RecordingControl.tsx` and requires **exactly one** — the pre-existing
`clearRecording`, preserved untouched — which pins that none was added without deleting legacy code
out of scope.

**No session-id exposure.** It lives in a `useRef`: never React state, never rendered, never in a
filename, exported source, visible status, telemetry or log. The file now contains **no `console.`
call at all** (the old `console.warn('Recording toggle failed:', ack.error)` is gone). Presenting it
on STOP is necessary — it is the identity check that makes a stale stop refusable — and every
prohibition the gate listed is separately guarded.

**One false claim withdrawn rather than restated.** The old banner rendered
`{count} action{count !== 1 ? 's' : ''}` from `recordedActions`, an array DL-76 measured as
permanently empty (`setRecordedActions` called twice, both with `[]`). That was a second untruth
beside the first. A truthful count needs a source this slice may not build, so **the badge is gone
and no count crosses the seam** — the honest option, and the smaller one.

**No legacy deletion.** `copyTestCode`, `clearRecording`, `recordedActions` and the legacy recorder
in `content.ts` are untouched and still unreachable.

**No bundle optimisation.** Measured only (§13).

**No unrelated debt fixed.** See §15.

## 10. Accessibility

| Property               | Before                        | After                                                    |
| ---------------------- | ----------------------------- | -------------------------------------------------------- |
| Button accessible name | `title` only, two fixed texts | `aria-label` + `title`, one per lifecycle state          |
| Button pressed state   | none                          | `aria-pressed={model.live}` — true only for `active`     |
| Button busy state      | none                          | `aria-busy={model.busy}`                                 |
| Banner                 | conditionally rendered `div`  | always-mounted `role="status" aria-live="polite"` region |
| Dead-recorder notice   | none — the banner vanished    | announced: "The recorder stopped responding…"            |

The always-mounted live region follows WS8's rule exactly: inserting an `aria-live` node and filling
it in the same tick is the classic way to have the announcement dropped, and the announcement that
matters most here is the one saying a recording died.

Evidence level is unchanged and honestly labelled: **structural guards, not axe-core.** No render
harness exists (R3 — every vitest project is `environment:'node'`), and none was added.

## 11. Guards: One Strengthened, None Weakened

`preview-gate.test.ts` asserted:

```ts
expect(control).toMatch(/\{RECORDING_ENABLED && recording &&/); // the banner gate
```

Both halves had to change. `recording` is the identifier this slice exists to delete. And the `&&`
form was the **weaker** gate — it still rendered the banner's `<style>` sibling while the flag was
off. The replacement requires the same early return the button already used, for **every**
capitalised component in the file, counted:

```ts
const components = [...control.matchAll(/^export function ([A-Z]\w+)\(/gm)].map((m) => m[1]);
const gates = [...control.matchAll(/if\s*\(!RECORDING_ENABLED\)\s*return null;/g)];
expect(gates.length).toBe(components.length);
```

Strictly stronger: no markup can be emitted while the flag is off, and no future component in this
file can quietly skip the gate. The change is commented in place with this reasoning.

Two guards in the new suite were also corrected **before** they were trusted, in the same spirit as
earlier slices' comment-stripping fixes: a crude `not.toMatch(/heartbeat/i)` was rejecting the
legitimate `RECORDING_LIMITS.heartbeatMs` re-use, and is now an exact-mentions assertion that both
bans a UI beat **and** pins the constant re-use; and a `setInterval` regex that missed the real call
shape now scans the whole owning `useEffect`, which is broader.

## 12. Tests

**Failure-first, verified as such.** The suite was written first and run: it failed on
`Cannot find module '../src/recording/lifecycle-view'` before a single production line existed.

| Suite          | Before    | After     | Δ       |
| -------------- | --------- | --------- | ------- |
| locator-engine | 383       | 383       | 0       |
| codegen        | 127       | 127       | 0       |
| extension      | 939       | 994       | **+55** |
| **Total**      | **1,449** | **1,504** | **+55** |
| Files          | 59        | 60        | +1      |

**WS1 codegen goldens 127/127 — untouched, none updated.**

`test/ws9-recording-ui.test.ts` covers: the flag is still off · the five fail-closed mappings · the
one view that means recording · the button across all six views and both pending values · the banner
across the same cross-product · four runtime liveness measurements · four stop/identity cases · the
absence of the local boolean · the view being fed only from the authority · the UI producing no
liveness · no workflow transport · no persistence · no session-id leak · accessibility · router
registration.

## 13. Build / Typecheck / Lint / Format / Bundle

Each command run **alone**, exit code read individually.

| Command             | Exit  | Detail                                                         |
| ------------------- | ----- | -------------------------------------------------------------- |
| `pnpm -r test`      | **0** | 1,504 / 60 files — see the caveat below                        |
| `pnpm -r build`     | **0** | Σ 309,739 B                                                    |
| `pnpm typecheck`    | **0** | —                                                              |
| `pnpm lint`         | **0** | no errors, no warnings                                         |
| `pnpm format:check` | **1** | **only** `ws2-item9-report.md` — the known permanent exception |

**The `pnpm -r test` caveat, stated rather than smoothed over.** That command also exits **1**
whenever the wall-clock millisecond value happens to contain the digits `42`, because of the
pre-existing `storage-migration.test.ts` defect in §16. Both outcomes were observed minutes apart on
an unchanged tree (`1788554284496` → fail, `1788554750990` → pass). With that single file excluded
the remaining **43 files / 973 tests** are green in either case, and the run recorded above is the
one taken outside that window. Nothing in this slice touches storage or migration.

| Artifact        | Baseline  | Final     | Δ          |
| --------------- | --------- | --------- | ---------- |
| **Total**       | 308,201 B | 309,739 B | **+1,538** |
| sidepanel chunk | 7,801 B   | 9,236 B   | +1,435     |
| `content.js`    | 47,537 B  | 47,616 B  | +79        |
| `background.js` | 9,746 B   | 9,770 B   | +24        |
| devtools panel  | 1,386 B   | 1,386 B   | **0**      |
| shared `client` | 142,932 B | 142,932 B | **0**      |
| shared `tokens` | 89,251 B  | 89,251 B  | **0**      |

The per-artifact deltas sum to exactly the total delta. **The three zeros are the evidence** that the
`RecordingLifecycleState` import into `utils/messaging.ts` is genuinely type-only: the DevTools panel
composes that module and grew by nothing.

Symbol check on the shipped bundles: `QUERY_RECORDING_STATE` is present in both the sidepanel chunk
and `content.js` (once each); `RecordedWorkflow`, `appendStep`, `stopWorkflow`, `renderSpecFile`,
`redactionReasonFor` and `mintSessionId` are present in **neither**.

**Ceiling 278,760 B — over by 30,979 B (11.11 %).** Disclosed, not chased. No optimisation was
attempted; that remains the separate owner decision open since DL-56.

## 14. Trust Boundary, Privacy, Security

**Trust boundary untouched.** Nothing in this slice resolved a locator, queried a DOM for counts,
ranked a selector, inspected `nth`/`verdict`/`visibleMatchCount`, or reinterpreted trust. Slice 3's
admission rule remains the sole capture-time gate in `runtime/recording.ts`; slice 4's renderer
remains a pure projection. WS6.2's and WS7's guarantees are unaffected — their suites are green.

**Privacy.** No DOM HTML, input value, password, card value, page content or raw locator attribute
is stored, transported or rendered by anything added here. The lifecycle enum is the entire payload.
No logging of any kind: the file's only `console` call was removed. Privacy 11/11 and honesty 18/18
green.

**Security.** No `eval`, no `new Function`, no dynamic import, no `innerHTML`, no network call, no
new permission, no new dependency. Sender validation is unchanged; `QUERY_RECORDING_STATE` goes
through the same `isFromExtensionUI` check as every other UI-originated message.

**Playwright-only.** No Selenium, Cypress, WebdriverIO, Puppeteer or Robot Framework; no generic
framework abstraction; no second locator engine, resolver or probe; no CommandBus.

## 15. Real Browser

**Real Chromium: NOT RUN.** No manual, DevTools or production verification was performed, and none
is claimed. The message round-trip through the background router, the live region's announcement
behaviour and the poll under a real service-worker lifecycle are **not** verified here — they are
verified deterministically (pure functions, the real runtime under an injected clock) and
structurally (source guards), which is the evidence level DL-64/D1 re-scoped for this workstream and
nothing more.

## 16. Pre-Existing Debt, Re-Measured And Deliberately Not Fixed

`storage-migration.test.ts` → "the quarantine record carries NO raw user content" now fails on
**every** run rather than intermittently. It was measured, and the cause is not this slice.

A controlled clock experiment (temporary test file, run, deleted) settled it:

| System time     | Quarantine record contains `42`? | Why                              |
| --------------- | -------------------------------- | -------------------------------- |
| `1788554284496` | **yes**                          | the **timestamp** contains `42`  |
| `1788555555555` | **no**                           | identical migration, other clock |

The assertion is `expect(record).not.toContain('42')` against a record whose `at` field is
`Date.now()`. It is measuring the clock, not user content — the product never stored the user's
value. Product correct, test wrong. Recorded, out of this gate's scope, **not touched.**

Also carried forward unchanged: the accepted bundle overage · `snapshot.ts`'s stale
`RecommendedLocator.stepCounts` doc comment (DL-72) · WS6.1's unstarted items and self-contradiction
· WS3's deferred IIFE build and CI benchmarks · no real-browser infrastructure anywhere.

**Two stale documentation rows were corrected**, because leaving them would itself be dishonest:
`CURRENT-STATE.md` still described WS9 as "DISCOVERY COMPLETE — IMPLEMENTATION BLOCKED / DEFERRED"
in two places, which DL-72 superseded when WS4 landed and the block lifted. Both corrections are
marked in place as corrections.

## 17. Files Changed

**Production source: created 1 · modified 5 · deleted 0.** (`git` is unavailable in this repository,
as in every prior slice, so the documented modification-time drift sweep is the inventory method.)

| File                                         | Change                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `src/recording/lifecycle-view.ts`            | **NEW** — the pure view mapping                                            |
| `entrypoints/sidepanel/RecordingControl.tsx` | rewritten as a lifecycle consumer; legacy assets preserved                 |
| `entrypoints/sidepanel/SidePanel.tsx`        | passes the view/pending model; picker lock-out now reads `rec.button.live` |
| `entrypoints/content.ts`                     | one read-only `QUERY_RECORDING_STATE` case                                 |
| `entrypoints/background.ts`                  | message type registered on the existing branch                             |
| `utils/messaging.ts`                         | `QueryRecordingStateMessage`; ack gains `lifecycle?`                       |

**Tests: created 1 · modified 1.** `test/ws9-recording-ui.test.ts` (new, 55) ·
`test/preview-gate.test.ts` (one guard strengthened).

**Documentation:** `DECISION-LOG.md` (DL-77) · `MASTER-ROADMAP.md` (WS9 header, slice-5A block,
status row) · `CURRENT-STATE.md` · `PROGRESS.md` · this report.

## 18. Documentation

Decision-log entry **DL-77**, class `CURRENT`. No historical entry was rewritten. WS9 is **not**
marked complete anywhere, slice 5 is still recorded as blocked, and `RECORDING_ENABLED` is still
documented as `false`.

## 19. Backup

`ws9-slice5a-recording-ui-liveness-2026-09-05.zip` — full source tree excluding `node_modules`,
`.output`, `dist`, `.wxt` — delivered to `E:\Codes\playwrightguru`.

## 20. Remaining WS9 Work

**Export menu (blocked, DL-76)** · structured code workspace · workflow persistence · v1 raw-line
migration · a truthful action count in the UI · an error channel for a refused start · navigation /
SPA / frame / tab handling · legacy-recorder deletion · legacy-renderer deletion · real-browser
evidence · `RECORDING_ENABLED` flag flip.

## 21. Next Authorized Step

**An owner decision.** Slice 5A has removed the first of the two conditions DL-76's §3.1 named as
gating the flag ("the recording UI reads lifecycle state, not a local boolean"). The second —
"the controller-side liveness marker has a consumer outliving the content script" — is now
**partly** satisfied and should not be over-claimed: the side panel is a separate context and does
outlive the content script, and it fails closed when the content script is gone. But it only knows
while it is open, and nothing survives the panel being closed. Whether that is sufficient, or
whether the marker still needs a durable home, is the owner's call.

No recommendation is offered, and nothing was changed to pre-empt it. The three DL-76 options remain
on the table for export; option (b) — authorising workflow persistence as its own slice — is the one
this slice did not touch and the one both remaining items still point at.
