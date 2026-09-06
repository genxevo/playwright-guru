# WS9 — SLICE 5B: DURABLE RECORDING CONTROLLER STATE + WORKFLOW PERSISTENCE

**2026-09-05 · DL-78 · Owner-authorised implementation gate.**
**`RECORDING_ENABLED` is still `false`. WS9 is still PARTIAL and is NOT complete.**

## 1. Verdict

**IMPLEMENTED.** A recording now has a durable owner, expressed entirely through the existing WS4
persistence architecture. The workflow survives the content script; the liveness marker survives the
Side Panel; tab-close cleanup is the WS4 lifecycle that already existed.

Nothing reads the projection yet, and that is deliberate — §11's precedence rule between live and
durable evidence is an owner decision this slice refused to invent. The write side is complete and
wired; the read side is the next authorised step.

## 2. Owner Decision Executed

The 5B gate, which resolves the second of the two conditions DL-76 §3.1 named as gating the flag.
DL-77 closed the first ("the recording UI reads lifecycle state, not a local boolean"); this closes
the storage half of the second ("the controller-side liveness marker has a consumer outliving the
content script") — see §17 for what remains of it.

## 3. Discovery Findings

Answered from code before any production line was written.

| #       | Question                                 | Finding                                                                                                            |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A       | Who owns the live `RecordingSession`?    | `src/runtime/recording.ts`, in a module closure. Nothing else can see it                                           |
| B       | Who owns the live `RecordedWorkflow`?    | The same closure, via `session.workflow`                                                                           |
| C       | Who knows the `RecordingSessionId`?      | The runtime; the panel holds a copy in a ref for STOP only (DL-77)                                                 |
| D       | Who knows the target tab id?             | **Only the background**, from `sender.tab.id`. A content script cannot know its own                                |
| E       | content → background → storage today?    | `PERSIST_PICK` / `PERSIST_PICKER_STATE`: no `targetTabId`, identity from the sender, write through the one gateway |
| F       | SidePanel → background → storage?        | The panel calls the gateway directly; only tab-origin writes need the background                                   |
| G       | WS4 global vs tab state?                 | O2: `local` + global for durable workspace/preference; `session` + tab for transient per-tab state                 |
| H       | Corrupt persisted state?                 | Validator returns `null` → descriptor default, `valid:false`. Rejected **whole**, never filtered                   |
| I       | Storage failures?                        | Values, never throws: `{ok, code}` on write, `{value, valid, code}` on read                                        |
| J       | What stopped a workflow surviving?       | It had exactly one holder and no message, descriptor or storage slot (DL-76 measured this)                         |
| K       | What stopped a reopened panel seeing it? | The same — there was nothing to read                                                                               |
| **D1**  | **Correct durable owner?**               | **Tab-scoped WS4 state, `session` area.** See §4 — the area is load-bearing, not stylistic                         |
| **D2**  | What exactly must be persisted?          | The bounded observation + the existing `RecordedWorkflow`. Nothing else; see §6                                    |
| **D3**  | Minimum durable liveness marker?         | Five scalars. No new lifecycle states, no transitions — a projection only                                          |
| **D4**  | Staleness, durably?                      | `lastHeartbeatAt` + the SAME `heartbeatTimeoutMs`, re-derived on every read                                        |
| **D5**  | Who writes it?                           | The content runtime emits; the background writes. The UI writes nothing                                            |
| **D6**  | Who clears it?                           | Stop writes `stopped`; staleness ages out; tab close uses the EXISTING `clearTab`                                  |
| **D7**  | Write cadence?                           | Start · each admitted action · each heartbeat (observation only) · stop. **No invented numbers** — see §5          |
| **D8**  | Is the workflow really serialisable?     | **Yes, structurally.** `MatcherValue` models a regex as data, not a native `RegExp`. No DTO needed                 |
| **D9**  | Storage size?                            | Already bounded: `hardStop` 100 · `maxValueLength` 500 · `maxWorkflowBytes` 500 KB. **No new limit needed**        |
| **D10** | Which WS4 pattern?                       | `StateDescriptor` — key, area, scope, default, hand-written validator. Exactly the four existing ones              |

## 4. Durable Lifecycle Architecture

```
CONTENT RUNTIME        the AUTHORITY while it exists
      │                emits; never reads back
      ▼
BACKGROUND             tab identity from sender.tab.id — a page cannot forge it
      ▼
StorageGateway         namespace · version envelope · validator · tab scope
      ▼
DURABLE STATE          a PROJECTION, never a rival authority
```

**Why the record cannot lie.** Slice 2 deliberately made liveness a derivation from the clock rather
than a stored flag, so a recorder that dies silently stops reading as recording. A durable row saying
`active` does not stop being a row when the recorder is gone — so the record stores
`lastHeartbeatAt`, never a trusted boolean, and `observedLifecycle` re-derives staleness on every
read using the **same** `RECORDING_LIMITS.heartbeatTimeoutMs` the runtime uses.

**It is not a second state machine.** No new states, no transitions, no way to begin or end a
recording. It speaks the existing `RecordingLifecycleState` vocabulary and answers one question:
_what does this record, plus the clock, imply?_ `inactive` is what it says when there is no record.

**The area choice is load-bearing.** `clearTab` and `sweepOrphans` sweep **only** the `session` area.
A tab-scoped record in `local` would therefore outlive the tab that owned it forever. Putting both
descriptors in `session` is what makes tab-close cleanup the existing WS4 lifecycle rather than a
second mechanism. The consequence is stated rather than hidden: **a recording does not survive a
browser restart** — see §17.

## 5. Workflow Persistence Architecture

The **existing** `RecordedWorkflow` is stored as it is. No `RecordedWorkflowV2`, no generic
automation model, no storage DTO.

```
capture → same DomProbe → same LocatorResolver → verified LocatorChain
        → RecordedStep → RecordedWorkflow → persistence
```

and **never** `persistence → new locator processing`. Nothing in the persistence module resolves,
probes, ranks, re-verifies, normalises, improves or renders — guarded by name against `DomProbe`,
`resolveChain`, `resolveStep`, `captureSnapshot`, `generateLocatorCode`, `renderSpecFile` and
`buildLocatorChain`.

**Write cadence, and why it invented nothing.** Start · each admitted action · each heartbeat
(observation only) · stop. Bounded entirely by constants that already exist:

| Bound               | Existing constant   | Effect                                                                            |
| ------------------- | ------------------- | --------------------------------------------------------------------------------- |
| Workflow writes     | `hardStop` = 100    | At most 100 workflow writes per recording                                         |
| Keystrokes → writes | `fillDebounceMs`    | Typing already coalesces **at the model boundary**, so a keystroke is not a write |
| Observation writes  | `heartbeatMs` = 5 s | One small write per beat                                                          |
| Record size         | `maxWorkflowBytes`  | Already 500 KB, already reported by `assessWorkflowBudget`                        |

No debounce policy and no quota policy was invented, and **no new byte limit was needed** — which is
why §25's hard stops 7 and 8 were not triggered.

**Serialisation, proven rather than assumed.** A populated workflow round-trips through
`JSON.parse(JSON.stringify(...))` byte-for-byte, and chain, verdict, `matchCount`,
`visibleMatchCount`, `stepCounts` and rationale are compared field by field. It holds **structurally**
because `MatcherValue` models a regex as `{type:'regex', value, flags}` — data, not a native
`RegExp` — and nothing in the graph is a `Date`, `Map`, `Element`, `ScopeHandle` or function.

## 6. Storage Schema

Two descriptors, both `area: 'session'`, `scope: 'tab'`, `defaultValue: null`.

`pg:v2:tab:<tabId>:recording-observation`

```ts
{ schemaVersion: 1, sessionId: string, lifecycle: 'starting'|'active'|'stale'|'stopped',
  startedAt: number, lastHeartbeatAt: number }
```

Five scalars that never grow. **What is deliberately absent** is as important as what is present: no
action count (the workflow beside it already knows, and a second copy of one fact is a second thing
to disagree), no workflow id (it **is** `sessionId`, by construction in `requestActivation` — a test
pins that), no DOM, no HTML, no attributes, no input values, no page text, no probe state.

`pg:v2:tab:<tabId>:recording-workflow` — the `RecordedWorkflow`, unchanged.

Both sit inside WS4's existing `{ v: 2, data }` envelope, so an unknown future version is reported
and **left exactly as written**, never downgraded and never overwritten by a read.

## 7. Fail-Closed Behaviour

| Situation                         | Result                                                      |
| --------------------------------- | ----------------------------------------------------------- |
| No record                         | `inactive`                                                  |
| Malformed record                  | Rejected whole → default `null`, `valid:false` → `inactive` |
| Unknown FUTURE storage version    | `UNKNOWN_VERSION`, default returned, **bytes left intact**  |
| Read failure                      | Default + `READ_FAILED` → `inactive`                        |
| Write failure / quota             | `{ok:false, code}` surfaced; nothing stored                 |
| Heartbeat older than the timeout  | `stale`, whatever the record claims                         |
| `starting` never acknowledged     | Ages out on the same clock                                  |
| Content script dies               | No event needed — the last record ages out                  |
| Stop with a foreign or missing id | Refused, and **nothing is written**                         |
| Duplicate start                   | Same session, same id; no fork                              |
| Tab closed                        | Existing `clearTab` removes both records                    |
| Persistence sink throws           | Recording unaffected; the in-memory authority survives      |

A rejected request leaves **no trace resembling a state change** — that is why the refused-stop tests
assert an empty write log rather than merely a failed result.

## 8. Security / Privacy

The validator rejects whole records (`CODE_BUFFER`'s precedent) and specifically **refuses a redacted
step that still carries a value**. That shape cannot come from `appendStep` — slice 1 removes the
value at the model boundary — and is refused anyway, so a future regression fails at the storage
boundary instead of writing a secret to disk. A measured test writes a workflow whose password step
was redacted and asserts the raw value appears nowhere in the stored bytes.

Truncation survives; ordering survives; a workflow longer than `hardStop` is refused. The session id
is persisted but stays opaque: never rendered, never logged, never in a filename or exported source.
The background's write path logs neither the id nor the contents — only a failure code.

No `eval`, no `new Function`, no dynamic import, no network, no telemetry, no analytics, no new
permission, no new dependency, no `innerHTML`. Sender validation is unchanged: a
`PERSIST_RECORDING_STATE` that does not come from a tab is refused with `UNTRUSTED_SENDER`.

**Playwright-only.** No Selenium, Cypress, WebdriverIO or Puppeteer; no generic framework
abstraction; no second locator engine, resolver or probe; no CommandBus.

## 9. Tests

**Failure-first, verified as such.** The suite was written first and run: it failed on
`Cannot find module '../src/recording/persistence'` before a single production line existed.

| Suite          | Before    | After     | Δ       |
| -------------- | --------- | --------- | ------- |
| locator-engine | 383       | 383       | 0       |
| codegen        | 127       | 127       | 0       |
| extension      | 994       | 1,069     | **+75** |
| **Total**      | **1,504** | **1,579** | **+75** |
| Files          | 60        | 61        | +1      |

**WS1 codegen goldens 127/127 — untouched, none updated.**

`test/ws9-recording-persistence.test.ts` covers the full A–AG matrix: descriptors · valid read ·
invalid read · invalid write · unknown version · safe default · tab isolation · session identity ·
active/starting/stale/stopped markers · heartbeat expiry · heartbeat refresh · stop · foreign stop ·
duplicate start · content death · tab close · workflow write/read/round-trip · ordering · redaction ·
truncation · no sensitive values · storage failure · UI cannot create active truth · UI cannot
heartbeat · no second message architecture · no resolver/probe imports · no workflow leakage · no
session-id leakage.

**Behavioural where behaviour exists.** `persistRecordingState` is exported and exercised against a
real gateway with a fake area, so the background write path is tested rather than inspected; the
runtime's persistence sink is captured and asserted on. Source guards supplement, never replace.

## 10. Build / Typecheck / Lint / Format

Each command run **alone**, exit code read individually.

| Command             | Exit  | Detail                                                         |
| ------------------- | ----- | -------------------------------------------------------------- |
| `pnpm -r test`      | **0** | 1,579 / 61 files                                               |
| `pnpm -r build`     | **0** | Σ 311,875 B                                                    |
| `pnpm typecheck`    | **0** | —                                                              |
| `pnpm lint`         | **0** | no errors, no warnings                                         |
| `pnpm format:check` | **1** | **only** `ws2-item9-report.md` — the known permanent exception |

Verification did **not** pass cleanly: `format:check` is red, as it has been since WS2, and that is
disclosed rather than described as green.

## 11. Bundle

| Artifact        | Baseline  | Final     | Δ          |
| --------------- | --------- | --------- | ---------- |
| **Total**       | 309,739 B | 311,875 B | **+2,136** |
| `background.js` | 9,770 B   | 11,449 B  | +1,679     |
| `content.js`    | 47,616 B  | 48,073 B  | +457       |
| sidepanel chunk | 9,236 B   | 9,236 B   | **0**      |
| devtools panel  | 1,386 B   | 1,386 B   | **0**      |
| shared `client` | 142,932 B | 142,932 B | **0**      |
| shared `tokens` | 89,251 B  | 89,251 B  | **0**      |

Per-artifact deltas sum to exactly the total delta. The background grew because it is the only writer
— it now carries the validators, the two descriptors and the write path. The content script grew by
the injected sink. **The sidepanel's Δ 0 B is the evidence that the UI gained nothing.**

A symbol check on the shipped bundles: `recording-observation` and `recording-workflow` appear
**only** in `background.js`; `PERSIST_RECORDING_STATE` appears in `background.js` and `content.js` and
in no panel; and **`observedLifecycle` appears in zero bundles** — measured proof that the read side
is genuinely unwired rather than merely described as such.

**Ceiling 278,760 B — over by 33,115 B (11.88 %).** Disclosed, not chased. No optimisation was
attempted; that remains the owner decision open since DL-56.

## 12. Real Chromium

**NOT RUN.** No manual, DevTools or production verification was performed, and none is claimed.
`FakeStorageArea` is not Chrome — its own header says so — so real quota behaviour, real
`tabs.onRemoved`, real `onInstalled` and real multi-tab behaviour remain **deferred / future
infrastructure** (WS4 O4). Everything above is unit and structural evidence.

## 13. Pre-Existing Debt

**Carried forward, not fixed.** `storage-migration.test.ts`'s quarantine assertion still fails
whenever the wall-clock millisecond value contains the digits `42`; DL-77 proved by a controlled
clock experiment that the cause is the timestamp, not user content. It passed on every run during
this slice. Product correct, test wrong; untouched.

**Newly found during this slice, and deliberately NOT fixed.** The shared `stripComments` helper in
`test/helpers/surface-source.ts` strips block comments before line comments, so a `/*` sequence
inside a `//` line is treated as a block-comment start and everything up to the next `*/` is blanked
out. A glob such as `entrypoints/**` written in an ordinary code comment can therefore hide real code
from **every** source guard that uses the helper — a guard-blinding hazard in a repository that leans
heavily on source guards. It was hit once, by this slice's own comment prose, and the prose was
reworded. Fixing the helper would change what sixteen guard files see, which is out of this gate's
scope; it is recorded here as a real defect awaiting its own authorisation.

Also unchanged: the accepted bundle overage · `snapshot.ts`'s stale `RecommendedLocator.stepCounts`
doc comment (DL-72) · WS6.1's unstarted items · WS3's deferred IIFE build and CI benchmarks · no
real-browser infrastructure anywhere.

## 14. Files Changed

**Production source: created 1 · modified 5 · deleted 0.** (`git` is unavailable in this repository,
so the documented modification-time drift sweep is the inventory method. No unexpected file changed.)

| File                           | Change                                                                      |
| ------------------------------ | --------------------------------------------------------------------------- |
| `src/recording/persistence.ts` | **NEW** — the projection, the validators, the fail-closed read              |
| `src/storage/state.ts`         | Two WS4 descriptors; `WS4_DESCRIPTORS` 4 → 6                                |
| `src/runtime/recording.ts`     | Injected `persist` sink; publishes on start, admitted action, tick, stop    |
| `entrypoints/content.ts`       | Supplies the sink over the existing persistence message path                |
| `entrypoints/background.ts`    | `persistRecordingState` (exported for direct testing) + router registration |
| `utils/messaging.ts`           | `PersistRecordingStateMessage`; no `targetTabId`, by design                 |

**Tests: created 1 · modified 2.** `test/ws9-recording-persistence.test.ts` (new, 75) ·
`test/storage-consumers.test.ts` and `test/ws9-recording-ui.test.ts` (three guards re-scoped, §15).

**Documentation:** `DECISION-LOG.md` (DL-78) · `MASTER-ROADMAP.md` · `CURRENT-STATE.md` ·
`PROGRESS.md` · this report.

## 15. Documentation, And The Three Re-Scoped Guards

Decision-log entry **DL-78**, class `CURRENT`. No historical entry was rewritten. WS9 is **not**
marked complete anywhere, slice 5 is still recorded as blocked, and `RECORDING_ENABLED` is still
documented as `false`.

Three guards failed against this implementation. Per the gate's rule the architecture was examined
first, and in all three cases the guard's **expression** was broader than the claim it cited:

1. **`storage-consumers.test.ts` — "WS9 recording keys are not part of the WS4 descriptor set (O2)"**
   asserted that no descriptor key matched `/record/i`. DL-66/O2 actually says
   `pg_recording_active`/`pg_recorded_actions` remain WS9-owned and are **neither migrated, cleared
   nor read** by WS4. That claim still holds and is now checked on **all three verbs** — the previous
   guard checked none of them, only a spelling. Strictly stronger.
2. **`ws9-recording-ui.test.ts` — "adds no workflow message type"** banned the word "workflow" from
   any field in `messaging.ts`. The claim it was making is that nothing the **panel** reads carries a
   recording; that is now asserted on `RuntimeMessageAck` itself, plus a positional check that the
   single workflow-carrying declaration is `PersistRecordingStateMessage` and carries no
   `targetTabId`.
3. **`ws9-recording-ui.test.ts` — "adds no WS4 descriptor"** was slice 5A saying "I added no
   persistence". Slice 5B was authorised to add two. It now asserts what that suite is answerable
   for: the slice-5A modules still own no persistence at all. The descriptor set is pinned
   **positively** in the new suite.

Each is commented in place with this reasoning. **No guard was weakened, and none was deleted.**

## 16. Backup

`ws9-slice5b-durable-recording-persistence-2026-09-05.zip` — full source tree excluding
`node_modules`, `.output`, `dist`, `.wxt` — delivered to `E:\Codes\playwrightguru`.

## 17. Remaining WS9 Blockers

- **Export menu** — still blocked by DL-76, but for a smaller reason now: a workflow exists durably;
  what is missing is a reader and the precedence rule below.
- **A durable-state consumer, and its live-versus-durable precedence rule.** Not invented here.
- **Browser-restart recovery.** `session` scope means a recording does not outlive the browser
  session. Changing that means a `local`-area record, which changes the O2 scope semantics **and**
  loses the existing tab-close sweep — an owner decision, not a refactor.
- **Cross-tab recording semantics** beyond today's per-tab ownership.
- Structured code workspace · v1 raw-line migration · truthful action count · navigation / SPA /
  frame / tab handling · legacy-recorder and legacy-renderer deletion · real-browser infrastructure ·
  flipping `RECORDING_ENABLED`.

## 18. Next Owner Decision

**Authorise a durable-state consumer, with an explicit precedence rule.** The honest default, and the
one this slice's architecture is shaped for, is:

```
LIVE CONTENT AUTHORITY   >   DURABLE OBSERVATION   >   UNKNOWN
```

with the rule that a durable record may **never** override a live answer — in particular, a durable
`active` must lose to a live `stale`, or a dead recording is resurrected. That ordering was
deliberately **not** implemented, because §11 forbids inventing it and because it changes what the
panel displays.

Two smaller decisions sit beside it: whether a recording should survive a browser restart (and
accept the tab-cleanup cost that implies), and whether the truthful action count may now be surfaced
once a reader exists.

---

### The final architectural test (§26), answered

| #   | Question                                                   | Answer                                                                                            |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Q1  | Panel closes — where does recording truth live?            | The content runtime, as always; the durable projection is now also readable by another context    |
| Q2  | Can persisted state claim "active" forever?                | **No.** `observedLifecycle` re-derives staleness from the one timeout on every read               |
| Q3  | Old session sends STOP after a new one starts?             | Refused (`wrong-session`) and **nothing is written**                                              |
| Q4  | Can the Side Panel make a recording active?                | **No.** It writes nothing; guarded                                                                |
| Q5  | Can the Side Panel heartbeat the recorder?                 | **No.** Still guarded from DL-77; re-asserted here                                                |
| Q6  | Can persistence change a `LocatorChain`?                   | **No.** It stores; round trip proven identical                                                    |
| Q7  | Can it introduce a locator the resolver never produced?    | **No.** No resolver, probe or chain builder is reachable from it                                  |
| Q8  | Can a password reach durable storage?                      | **No.** Removed at the model boundary, refused again at the storage boundary, proven by bytes     |
| Q9  | Can a malformed record become "active"?                    | **No.** Rejected whole → `null` → `inactive`                                                      |
| Q10 | Can an unknown future version be silently interpreted?     | **No.** `UNKNOWN_VERSION`, default returned, bytes untouched                                      |
| Q11 | Can two tabs overwrite each other?                         | **No.** Tab-scoped keys; tested                                                                   |
| Q12 | Can the workflow survive the content runtime disappearing? | **Yes** — that is this slice                                                                      |
| Q13 | Is the persisted workflow identical after a round trip?    | **Yes**, byte-for-byte                                                                            |
| Q14 | Does this introduce a second source of truth?              | **No.** A projection with no transitions, no new states, and no reader that could outrank live    |
| Q15 | Does this make it honest to build Export next?             | **Nearly.** Export now has a durable source; it still needs the reader and precedence rule in §18 |
