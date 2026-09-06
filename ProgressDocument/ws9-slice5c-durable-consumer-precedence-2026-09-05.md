# WS9 — SLICE 5C: DURABLE RECORDING CONSUMER + LIVE/DURABLE PRECEDENCE

**2026-09-05 · DL-79 · Owner-authorised implementation gate.**
**`RECORDING_ENABLED` is still `false`. WS9 is still PARTIAL and is NOT complete.**

## 1. Verdict

**IMPLEMENTED.** The durable projection DL-78 built now has a reader, and the rule that governs it
is written down in exactly one place. The Side Panel can derive recording state from the live
content runtime or, when that runtime cannot be reached, from the durable observation — and a stored
row can never overrule a live answer.

## 2. Owner Decision Executed

```
LIVE CONTENT AUTHORITY  >  DURABLE OBSERVATION  >  UNKNOWN
```

DL-78 deliberately shipped the durable projection with **no** reader, because choosing between a
stored row and a live answer is a precedence rule, and inventing one quietly is how a truthful
system stops being one. The rule is authorised now, and `resolveRecordingView` is the only place it
exists.

## 3. Discovery Findings

| #       | Question                               | Finding                                                                                                                                                                                                                                                                                 |
| ------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | The existing live reader               | `sendRuntimeMessage({type:'QUERY_RECORDING_STATE'})` → background active-tab branch → `dispatchToTab` → `recording.state(now)`. Failure shapes: `NO_HANDLER`, `no-active-tab`, `UNTRUSTED_SENDER`, a rejected send, and `ok:true` with no `lifecycle`. **Sufficient — no new live API** |
| **D2**  | The existing durable reader            | `gateway.readTab(RECORDING_OBSERVATION, tabId)` → `{value, valid, code?}`. A reusable typed reader already exists; no `chrome.storage` needed                                                                                                                                           |
| **D3**  | Where reconciliation belongs           | A NEW pure module, `src/recording/reconcile.ts`. `lifecycle-view.ts` keeps presentation; the reader keeps I/O                                                                                                                                                                           |
| **D4**  | What "live unavailable" means          | No reply · `undefined` · `ok:false` (any code) · `ok:true` with no lifecycle · a lifecycle value outside the five. **None of these is `inactive`**                                                                                                                                      |
| **D5**  | Positive live evidence                 | Exactly the five existing states. `stale` is NOT collapsed to `inactive`; `unknown` is NOT collapsed to anything                                                                                                                                                                        |
| **D6**  | The precedence mapping                 | Live wins for all five. Durable is consulted only when live is `unknown`. Encoded in tests as 35 explicit combinations                                                                                                                                                                  |
| **D7**  | What the panel needs                   | One `RecordingView`. No workflow, no step, no chain, no value, no DOM fact                                                                                                                                                                                                              |
| **D8**  | Does the reader need workflow data?    | **No.** It is never read, and a guard plus a bundle measurement both pin that                                                                                                                                                                                                           |
| **D9**  | Does the action count become possible? | Architecturally yes; **DEFERRED** — see §10                                                                                                                                                                                                                                             |
| **D10** | Browser restart                        | Unchanged: `session` + `tab`. Scope was not touched — see §11                                                                                                                                                                                                                           |

**The tab identity question, answered without new machinery.** `usePickSource` already exposes
`tabId`, and `usePanel` already surfaces it as `panel.pick.tabId`. The Side Panel passes that to the
recording hook, so the durable read is scoped to the tab the panel is **already bound to** — it can
never point at a different page than the pick and picker state do, and no second active-tab query
was introduced.

## 4. Live Authority

Unchanged from slice 5A, and still the authority. `observedView` decides what a reply means, and its
`unknown` is precisely "there was no live answer at all".

**One real gap was found and fixed here.** `observedView` trusted `reply.lifecycle` without checking
it against the five known states:

```ts
if (!reply || !reply.ok || !reply.lifecycle) return 'unknown';
return reply.lifecycle; // ← whatever arrived
```

That field crosses a `structuredClone` boundary from a content script, so it is **data** at runtime
however it is typed. An unrecognised value — a future build's state, a corrupted field — passed
straight through as a `RecordingView`, where the exhaustive switches in `recordButtonModel` and
`recordingBannerLine` fell off the end and returned `undefined`. That is worse than failing closed:
a panel with no button model at all. It now returns `unknown` for anything outside the five, which
is this slice's F18 satisfied at its source rather than patched downstream.

## 5. Durable Observation

`readDurableObservation(gateway, tabId)` — an injected `Pick<StorageGateway, 'readTab'>`, one
descriptor, no browser API, no adapter, no raw storage. It returns **evidence**, never a decision:
`{ value, valid }`, exactly the shape WS4 already produces.

**It never reads the workflow.** `RECORDING_WORKFLOW` is readable and reading it here would be the
cheapest possible way to smuggle a recording into the panel. A source guard forbids naming it, a
behavioural guard asserts the reader touches exactly `['recording-observation']`, and the shipped
bundles confirm it: `recording-workflow` appears in `background.js` **only**.

## 6. Precedence Rule

```
        ┌──────────────────────┐
        │ LIVE CONTENT ANSWER  │
        └──────────┬───────────┘
                   │  observedView(reply)
          ┌────────┴────────┐
      not 'unknown'      'unknown'
          │                  │
          ▼                  ▼
      LIVE WINS      DURABLE OBSERVATION
                            │  valid && value ?
                     ┌──────┴──────┐
                    yes            no
                     │              │
                     ▼              ▼
          observedLifecycle    'unknown'
             (one clock,
              one timeout)
```

**The invariant everything serves: a durable record may never resurrect a recording the live runtime
has already declared dead.** The runtime reports `stale` — it knows, because slice 2 derives
staleness from the clock and the recorder stopped beating — while storage still holds the
observation written moments earlier saying `active`. A panel preferring the row would display
RECORDING for a recorder that is provably gone: the exact lie `RECORDING_ENABLED = false` exists to
prevent, arriving through the back door of a feature meant to make the product **more** truthful.

**Proven exhaustively, not anecdotally.** One test drives all five live states against seven durable
shapes — 35 combinations — and asserts the live answer wins every time.

## 7. Reconciliation Architecture

`src/recording/reconcile.ts` is pure: no DOM, no React, no storage, no messages, no logging, no side
effects, and **no clock** — `now` is injected. Guards pin each of those by name.

It **invents no lifecycle state**: every value it returns comes from `observedView` (5A) or
`observedLifecycle` (5B). It **re-derives no expiry**: a second staleness rule would be a second
timeout waiting to drift, so it defers to the projection that owns it, and a guard asserts the
module contains no four-digit number and does not name `heartbeatTimeoutMs`.

**And the precedence is physically true, not merely computed.** The panel asks the live authority
first and reads the durable record **only** when `observedView(ack)` is `unknown`. When the runtime
answers, the stored row is not out-ranked — it is not even read. A guard extracts the observation
function and requires the durable read to sit behind that test.

## 8. Side Panel Integration

`useRecording(lang, durable?)` gained one optional dependency object — `{ tabId, gateway, now? }` —
supplied by `SidePanel.tsx` from state it already had. The default is **fail-closed**: with no deps
the panel reads live evidence only and reports `unknown` when the content script is unreachable,
which is exactly slice 5A's behaviour. A missing wire degrades; it never fabricates. A guard asserts
the panel really is wired, so that degradation cannot happen silently.

Everything the panel was forbidden to do, it still cannot do: no `writeTab`, no `writeGlobal`, no
`PERSIST_RECORDING_STATE` (measurably absent from its bundle), no raw storage API, no heartbeat, no
`tick`, no session id rendered or logged. **START stays non-optimistic** — the acknowledgement never
sets the view — and **STOP still presents the id START handed back**, so DL-77 is not regressed.

## 9. Fail-Closed Behaviour

| Evidence                                         | Result                           |
| ------------------------------------------------ | -------------------------------- |
| No live reply / `undefined`                      | `unknown`                        |
| `ok:false` (NO_HANDLER, no-active-tab, rejected) | `unknown`                        |
| `ok:true` with no lifecycle                      | `unknown`                        |
| `ok:false` that happens to say `active`          | `unknown`                        |
| A lifecycle value outside the five               | `unknown`                        |
| Live unknown + no durable record                 | `unknown`                        |
| Live unknown + malformed record                  | `unknown`                        |
| Live unknown + unknown FUTURE storage version    | `unknown` (bytes left untouched) |
| Live unknown + durable read failure              | `unknown`                        |
| Live unknown + gateway throws                    | `unknown`                        |
| Live unknown + no bound tab yet                  | `unknown`                        |
| Live unknown + valid record past the timeout     | `stale`                          |
| Live unknown + valid, unexpired `active`         | `active`                         |

`unknown` is deliberately **not** `inactive`. Absence of a live answer is absence of evidence, and
"recording is off" is a claim nothing here has grounds for.

## 10. Action Count Decision

**DEFERRED**, deliberately. The durable workflow is now architecturally readable, but reading it in
the lifecycle consumer would violate this slice's stated boundary and would need a UI decision of
its own. The panel renders no count, and the legacy `recordedActions` array — measured empty in
DL-76 — was not revived. Reported as available; not implemented.

## 11. Browser-Restart Boundary

Unchanged and re-confirmed. Both recording descriptors are `session` + `tab`, so a recording does
**not** survive a browser restart, and tab-close cleanup remains the existing WS4 lifecycle. Storage
scope was not touched. This is an owner-decision boundary, not a defect.

## 12. Security / Privacy

The consumer handles one enum. No password, payment value, raw DOM, HTML, attribute, page content,
locator source, unverified selector or `RecordedWorkflow` can reach it — the acknowledgement it
reads carries none, and the descriptor it reads carries none.

No session id is rendered or logged. No `eval`, no `new Function`, no network, no telemetry, no new
permission, no new dependency. No second locator engine, resolver or `DomProbe`; no generic
framework abstraction. Playwright-only.

## 13. Tests

**Failure-first, verified as such.** The suite failed on `Cannot find module
'../src/recording/reconcile'` before a single production line existed.

| Suite          | Before    | After     | Δ       |
| -------------- | --------- | --------- | ------- |
| locator-engine | 383       | 383       | 0       |
| codegen        | 127       | 127       | 0       |
| extension      | 1,069     | 1,136     | **+67** |
| **Total**      | **1,579** | **1,646** | **+67** |
| Files          | 61        | 62        | +1      |

**WS1 codegen goldens 127/127 — untouched.**

Focused suites, each run separately and all green: `ws9-recording-reconcile` **67** ·
`ws9-recording-persistence` **74** · `ws9-recording-ui` **55** · `ws9-recording-session` **33** ·
`ws9-recording-runtime` **37** · `ws9-recording-workflow` **30** · `ws9-recorder-capture` **19** ·
`ws9-recording-renderer` **36** · `storage-consumers` **25** · `storage-gateway` **40** ·
`storage-migration` **21** (green on every run during this slice — see §17).

The A–AB matrix is covered, with the behavioural cases behavioural: the 35-combination precedence
sweep, the reader against a real gateway with a fake area, a descriptor-read spy proving the
workflow is never touched, a 20-read loop proving reads write nothing, and injected-clock expiry at
the exact `heartbeatTimeoutMs` boundary.

## 14. Build / Typecheck / Lint / Format

Each command run **alone**, exit code read individually.

| Command             | Exit  | Detail                                                         |
| ------------------- | ----- | -------------------------------------------------------------- |
| `pnpm -r test`      | **0** | 1,646 / 62 files                                               |
| `pnpm -r build`     | **0** | Σ 313,146 B                                                    |
| `pnpm typecheck`    | **0** | —                                                              |
| `pnpm lint`         | **0** | no errors, no warnings                                         |
| `pnpm format:check` | **1** | **only** `ws2-item9-report.md` — the known permanent exception |

**Verification is not all green.** `format:check` is red, as it has been since WS2, and that is
stated rather than smoothed over.

## 15. Bundle

| Artifact        | Baseline  | Final     | Δ          |
| --------------- | --------- | --------- | ---------- |
| **Total**       | 311,875 B | 313,146 B | **+1,271** |
| sidepanel chunk | 9,236 B   | 9,819 B   | +583       |
| shared `tokens` | 89,251 B  | 89,939 B  | +688       |
| `content.js`    | 48,073 B  | 48,073 B  | **0**      |
| `background.js` | 11,449 B  | 11,449 B  | **0**      |
| shared `client` | 142,932 B | 142,932 B | **0**      |
| devtools panel  | 1,386 B   | 1,386 B   | **0**      |

Per-artifact deltas sum to exactly the total. The sidepanel grew by the reader and the resolver. The
shared `tokens` chunk grew because the observation descriptor and its validator are now reachable
from the panel's graph and were hoisted into the chunk both panels share. **No module was split or
duplicated to reduce that**, per this gate's explicit instruction.

Symbol check on the shipped bundles: `recording-observation` now appears in the shared chunk and in
`background.js`; **`recording-workflow` appears in `background.js` only** — measured proof the panel
cannot reach the recording; and `PERSIST_RECORDING_STATE` is absent from the panel — measured proof
it cannot write. (Function identifiers are minified, so no claim is made from their absence.)

**Ceiling 278,760 B — over by 34,386 B (12.33 %).** Disclosed, not chased.

## 16. Real Chromium

**NOT RUN.** No Side Panel was really closed and reopened, no service worker was really restarted,
no real `tabs.onRemoved` fired, and no real quota was exercised. None of that is claimed. Evidence
is unit, structural and deterministic injected-clock behaviour only.

## 17. Pre-Existing Debt

Carried forward, untouched, as this gate requires: the `storage-migration.test.ts` `'42'` timestamp
assertion (DL-77 proved the cause is the clock, not user content; it passed on every run here), and
the `stripComments` helper hazard recorded in DL-78. Also unchanged: the bundle overage,
`snapshot.ts`'s stale `stepCounts` doc comment, WS6.1's unstarted items, and the absence of
real-browser infrastructure.

## 18. Files Changed

**Production: created 2 · modified 3 · deleted 0.** (No git; the documented modification-time drift
sweep is the inventory method. No unexpected file changed.)

| File                                         | Change                                                            |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `src/recording/reconcile.ts`                 | **NEW** — the pure precedence rule                                |
| `src/services/recording-observation.ts`      | **NEW** — the durable read, through the injected WS4 gateway      |
| `src/recording/lifecycle-view.ts`            | `observedView` now validates the lifecycle field (the 5A gap, §4) |
| `entrypoints/sidepanel/RecordingControl.tsx` | Gathers both evidence sources; resolves through the one rule      |
| `entrypoints/sidepanel/SidePanel.tsx`        | Supplies the bound tab id and the gateway                         |

**Tests: created 1 · modified 2.** `test/ws9-recording-reconcile.test.ts` (new, 67) ·
`ws9-recording-ui.test.ts` and `ws9-recording-persistence.test.ts` (four guards re-scoped, §19).

**Documentation:** `DECISION-LOG.md` (DL-79) · `MASTER-ROADMAP.md` · `CURRENT-STATE.md` ·
`PROGRESS.md` · this report.

## 19. Documentation, And The Four Re-Scoped Guards

Decision-log entry **DL-79**, class `CURRENT`. No historical entry was rewritten. WS9 is **not**
marked complete, slice 5 is still recorded as blocked, and `RECORDING_ENABLED` is still documented
as `false`.

Four guards failed against this implementation. In each case the architecture was examined first:

1. **Two effect-slicing guards** (`ws9-recording-ui`, `ws9-recording-persistence`) sliced the
   polling effect on the terminator `}, []);`. The effect now depends on the observation callback,
   so that `indexOf` returned **-1** and `slice(start, -1)` silently made "the effect" the whole
   rest of the file — the guards were failing for the wrong reason and would equally have _passed_
   for the wrong reason. They now slice on `}, [` and check **both** the timer and the observation
   callback, which is a wider claim than before.
2. **"feeds the view state from the authority"** required every `setView` argument to contain
   `observedView(`. The same claim now holds one indirection deeper and is checked in two parts:
   every write is the observation function's result, and that function resolves through the single
   precedence resolver — which additionally forbids a **second** observation path.
3. **"keeps every slice-5A module free of storage"** forbade `readTab` in the panel, which is
   exactly what the owner authorised. It is now a ban on **writing**, plus a **new** ban on reaching
   the workflow descriptor.

Each is commented in place with this reasoning. **No guard was weakened, and none was deleted.**

## 20. Backup

`ws9-slice5c-durable-consumer-precedence-2026-09-05.zip` — full source tree excluding
`node_modules`, `.output`, `dist`, `.wxt` — delivered to `E:\Codes\playwrightguru`.

## 21. Remaining WS9 Work

Export menu and the structured code workspace · v1 raw-line migration · a truthful action count ·
navigation / SPA / frame / tab semantics · cross-tab recording · browser-restart recovery ·
legacy-recorder and legacy-renderer deletion · real-browser infrastructure · flipping
`RECORDING_ENABLED`.

## 22. Next Owner Decision

**Authorise the export slice.** Every prerequisite DL-76 named now exists: a workflow that survives
the content script (5B), a truthful lifecycle the panel can trust (5A, 5C), and a reader whose
precedence rule is written down and proven. What export still needs is its own boundary — a workflow
reader (deliberately not built here), a filename/MIME/content decision, and the `ClipboardPort` or
download seam — plus a decision on whether the action count may surface at the same time.

---

### The final architectural questions (§29), answered

| #   | Question                                            | Answer                                                          |
| --- | --------------------------------------------------- | --------------------------------------------------------------- |
| Q1  | Live stale + durable active?                        | **STALE** — the resurrection test                               |
| Q2  | Live inactive + durable active?                     | **INACTIVE**                                                    |
| Q3  | Live unreachable + durable active within timeout?   | **ACTIVE** — the panel-reopened case this slice exists for      |
| Q4  | Live unreachable + durable active expired?          | **STALE**, exactly what `observedLifecycle` already defines     |
| Q5  | Neither source can prove state?                     | **UNKNOWN**                                                     |
| Q6  | Can the Side Panel create an active recording?      | **NO** — it writes nothing; guarded and measured                |
| Q7  | Can the Side Panel heartbeat?                       | **NO**                                                          |
| Q8  | Can durable state resurrect a live stale recording? | **NO** — and when live answers, the row is not even read        |
| Q9  | Does the lifecycle consumer read the workflow?      | **NO** — guarded, and absent from the panel bundle              |
| Q10 | Does a lifecycle message carry a workflow?          | **NO**                                                          |
| Q11 | Does the UI know or render the session id?          | It holds one in a ref for STOP; it **never** renders or logs it |
| Q12 | Does a recording survive a browser restart?         | **NO** — deliberate, session-scoped WS4 architecture            |
| Q13 | Does this slice implement Export?                   | **NO**                                                          |
| Q14 | Does this slice flip `RECORDING_ENABLED`?           | **NO** — it is `false`                                          |
| Q15 | Can Export now be designed honestly?                | **YES**, subject to its own implementation slice                |
