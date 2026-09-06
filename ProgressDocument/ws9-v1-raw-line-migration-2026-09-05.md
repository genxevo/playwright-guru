# WS9 — V1 Raw-Line Migration

**Date:** 2026-09-05 · **Decision:** DL-82 · **Status:** WS9 remains **PARTIAL / IN PROGRESS** · `RECORDING_ENABLED` remains **`false`**

**Outcome (C):** the V1 **code path** is RETIRED; the V1 **stored data** is PRESERVED and its migration is **DEFERRED** pending an owner decision.

---

## 1. The distinction the whole slice rests on

Two different things wore one name. Separating them is the decision; everything else follows from it.

|                    | What it is                                                                                                                                           | What happened                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **V1 CODE PATH**   | Source: the pre-WS3 recorder in `entrypoints/content.ts`, the `recordedActions` state in `RecordingControl.tsx`, and `src/ui/recording/test-code.ts` | **RETIRED** — deleted after deadness was re-measured           |
| **V1 STORED DATA** | Bytes on users' disks: the flat keys `pg_recording_active` and `pg_recorded_actions`, holding `RecordedAction[]`                                     | **PRESERVED** byte-for-byte — no reader, no writer, no deleter |

Deleting the first is a cleanup. Deleting the second is data loss. Only the first was deleted.

---

## 2. Phase A — Discovery, by measurement

DL-76 previously recorded the legacy recorder as unreachable, dead and wrong-shaped. **That was not assumed.** Every claim was re-measured against the current source. `git` remains unavailable in this repository, so the modification-time drift sweep is the inventory method throughout.

| Claim                                                  | How it was measured                                                                                         | Result                                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Nothing routes to the legacy recorder                  | `case 'START_RECORDING'` / `'STOP_RECORDING'` in the message switch                                         | Both route to `startRecordingSession` / `stopRecordingSession` — the WS9 runtime                 |
| `startRecording` has no caller                         | grep for `startRecording` across the package                                                                | Definition only, zero call sites                                                                 |
| Everything else in the block is reachable only from it | The three capture listeners are registered exclusively inside `startRecording`                              | Confirmed                                                                                        |
| `recordingActive` belongs only to the block            | All 7 reads/writes                                                                                          | All inside the retired block                                                                     |
| The panel's legacy state has no consumer               | `useRecording` has one consumer (`SidePanel.tsx`), which destructures `view`, `pending`, `button`, `toggle` | `recordedActions`, `copyTestCode`, `clearRecording`, `copyState`, `copyFailure` — zero consumers |
| `recordedActions` is permanently empty                 | `setRecordedActions` call sites                                                                             | Exactly two, both passing a literal `[]`                                                         |
| `generateTestCode` is unreachable                      | Its only caller is `copyTestCode`, which early-returns on `!recordedActions.length`                         | Unreachable                                                                                      |
| `actionToCodeLine` has a caller                        | grep                                                                                                        | Zero callers anywhere                                                                            |
| `attrsToLocatorCode` has an external caller            | grep                                                                                                        | Reached only from inside its own file                                                            |

---

## 3. Phase B — Baseline (before any edit)

| Measure                                                     | Value                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| tests                                                       | **1,795 / 64 files** (locator-engine 383 · codegen 127 · extension 1,285) |
| codegen goldens                                             | **127 / 127**                                                             |
| build · typecheck · lint                                    | **0 · 0 · 0**                                                             |
| `format:check`                                              | **1** — `ws2-item9-report.md` only (the permanent accepted exception)     |
| bundle total                                                | **319,841 B**                                                             |
| `content.js` · `background.js` · sidepanel · devtools-panel | 48,073 · 11,449 · 15,614 · 1,386 B                                        |
| ceiling / overage                                           | 278,760 B → **41,081 B (14.74 %)** over                                   |

---

## 4. Phase C — Classification

| Symbol                                                       | File                                      | Kind          | Role              | Class                             | Migration relevance                      | Action                    |
| ------------------------------------------------------------ | ----------------------------------------- | ------------- | ----------------- | --------------------------------- | ---------------------------------------- | ------------------------- |
| `startRecording`, `stopRecording`                            | `entrypoints/content.ts`                  | production    | writer            | **DEAD**                          | the only writer of V1 keys               | **RETIRE**                |
| `appendRecAction`                                            | `entrypoints/content.ts`                  | production    | reader + writer   | **DEAD**                          | the only reader of `pg_recorded_actions` | **RETIRE**                |
| `onRecClick/Input/Change`, `flushRecFill`                    | `entrypoints/content.ts`                  | production    | capture           | **DEAD**                          | produced V1 actions                      | **RETIRE**                |
| `recordingActive`, `recFillTimer/El/Val`                     | `entrypoints/content.ts`                  | production    | state             | **DEAD**                          | —                                        | **RETIRE**                |
| `recordedActions`, `setRecordedActions`                      | `RecordingControl.tsx`                    | production    | state             | **DEAD** (always `[]`)            | —                                        | **RETIRE**                |
| `copyTestCode`, `clearRecording`                             | `RecordingControl.tsx`                    | production    | consumer + writer | **DEAD** (no consumer)            | `clearRecording` WROTE a V1 key          | **RETIRE**                |
| `generateTestCode`, `actionToCodeLine`, `attrsToLocatorCode` | `src/ui/recording/test-code.ts`           | production    | renderer          | **DEAD**                          | rendered V1 actions; fabricated locators | **RETIRE (file deleted)** |
| `RecordedAction`, `RecordedActionKind`                       | `utils/messaging.ts`                      | production    | type              | **DOCUMENTATION-ONLY**            | **the V1 on-disk contract**              | **KEEP, re-documented**   |
| `pg_recording_active`, `pg_recorded_actions`                 | `browser.storage.local`                   | **user data** | stored            | **UNKNOWN — cannot be disproven** | the migration subject                    | **PRESERVE UNTOUCHED**    |
| `LEGACY_KEYS`, `MAPPINGS`                                    | `src/storage/migration.ts`                | production    | migration         | **LIVE**                          | excludes both V1 keys (DL-66/O2)         | **UNCHANGED**             |
| `CodeWorkspace`, `CODE_BUFFER`                               | `src/ui/panel/**`, `src/storage/state.ts` | production    | WS5 buffer        | **LIVE**                          | **not** the recording workspace          | **UNTOUCHED**             |

**No UNKNOWN code was deleted.** The one UNKNOWN row is the stored data, and it is the row that was preserved.

---

## 5. Phase D — M1…M20, proven failure-first

`packages/extension/test/ws9-v1-raw-line-migration.test.ts` — 30 assertions.

|         | Claim                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------- |
| **M1**  | `RECORDING_ENABLED` is still `false`                                                                          |
| **M2**  | No production code writes a V1 key                                                                            |
| **M3**  | No production code reads a V1 key                                                                             |
| **M4**  | No production code removes, clears or empties a V1 key — and no `storage.<area>.clear()` exists anywhere      |
| **M5**  | WS4's `LEGACY_KEYS` still excludes both (DL-66/O2)                                                            |
| **M6**  | `isWs4Key` is false for both, so Clear-data and the orphan sweep cannot reach them                            |
| **M7**  | The WS4 storage modules still never name a V1 key in code                                                     |
| **M8**  | The legacy recorder block is absent; the WS9 session handlers survive                                         |
| **M9**  | `entrypoints/content.ts` makes **zero** storage calls, by any API name                                        |
| **M10** | DL-4 is closed — no hand-written recording timing literal in the content script                               |
| **M11** | `src/ui/recording/test-code.ts` does not exist                                                                |
| **M12** | The tagName fabrication exists in no production file                                                          |
| **M13** | No production file imports the retired renderer                                                               |
| **M14** | `generateTestCode`, `actionToCodeLine`, `attrsToLocatorCode` exist nowhere in production                      |
| **M15** | The panel holds no `recordedActions` / `copyTestCode` / `clearRecording`; its live lifecycle surface survives |
| **M16** | The panel makes **zero** storage calls                                                                        |
| **M17** | No composed surface makes a raw storage call outside the WS4 gateway                                          |
| **M18** | `RecordedAction` survives as the frozen, documented, unimported V1 contract                                   |
| **M19** | No V1→V2 transformation exists, and no module is named as a recording migration                               |
| **M20** | No fabricated verdict or match count; the recording modules never probe, resolve or re-rank                   |

**16 of the 30 assertions were verified FAILING** against the untouched tree before a single production line changed. The remaining 14 are non-regression pins (M1, M5, M6, M7, M20 and parts of M4/M18) that already held; they are reported as pins, not as newly earned.

---

## 6. Phase E — The stored-data decision

**Verdict: `V1 DATA EXISTS BUT SAFE MIGRATION IS NOT POSSIBLE`.**

### 6.1 The structural argument

| V2 `RecordedStep.target` requires | V1 `RecordedAction` provides       |
| --------------------------------- | ---------------------------------- |
| `locator.chain`                   | —                                  |
| `locator.verdict`                 | —                                  |
| `locator.matchCount`              | —                                  |
| `locator.visibleMatchCount`       | —                                  |
| `locator.stepCounts[]`            | —                                  |
| `locator.rationale[]`             | —                                  |
| `facts.attributes`                | `attrs?` (raw `ElementAttributes`) |
| `facts.ancestors[]`               | —                                  |
| `facts.indexInParent`             | —                                  |
| `facts.inShadowRoot`              | —                                  |

Eight of the ten are **measurements against a live DOM**. The page each was captured from is gone, and this gate forbids re-resolution for stored migration — no DOM, no `DomProbe`, no `LocatorResolver`, no re-ranking, no re-verification. There is therefore **no total function from V1 to V2**, and the only way to produce one is to write a verdict nobody measured. **Never fabricate verification.**

### 6.2 The independent privacy argument

V1's input filter never excluded `password`. A stored `RecordedAction.value` may be an **unredacted secret**. The V2 model's Rule 4 guarantees a redacted step cannot hold a value, and nothing on disk records which field was sensitive. Importing V1 values would put secrets inside a structure whose contract says they cannot be there.

### 6.3 Whether any user actually holds V1 data

**UNKNOWN, and that is precisely why it is preserved.** There is no git history here, and the retired block was annotated as unchanged from the pre-WS3 file, so whether a shipped or developer build ever routed a message to it cannot be established by measurement in this repository. Absence could not be proven, so it was not assumed.

### 6.4 Why quarantine was not used

WS4's quarantine writes a metadata record for a key its migration **READS**, and only for keys in `MAPPINGS`. DL-66/O2 rules that these two keys are _"neither migrated, cleared nor read by WS4"_. Quarantining them would require reading them and adding them to `MAPPINGS` — overturning an owner decision this gate did not grant, and breaking three existing guards that pin O2. **Recorded as blocked, not performed.**

---

## 7. Phase F — What was retired

| File                                         | Change                                                                                                                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entrypoints/content.ts`                     | 97-line legacy recorder block + `recordingActive` + two now-unused imports removed (−4,886 B of source), replaced by a comment recording what stood there and why the stored data is untouched                              |
| `entrypoints/sidepanel/RecordingControl.tsx` | `recordedActions`, `setRecordedActions`, `copyTestCode`, `clearRecording`, `copyState`, `copyFailure`, the `lang` parameter, and the `clipboardPort` / `browser` / `generateTestCode` / `RecordedAction` / `PwLang` imports |
| `entrypoints/sidepanel/SidePanel.tsx`        | `useRecording(panel.lang, …)` → `useRecording({ … })` — a lifecycle is not language-shaped                                                                                                                                  |
| `src/ui/recording/test-code.ts`              | **DELETED** (and the now-empty `src/ui/recording/` directory)                                                                                                                                                               |
| `utils/messaging.ts`                         | Documentation only — `RecordedAction` re-documented as the frozen V1 on-disk contract                                                                                                                                       |
| `src/recording/render.ts`                    | Comment only — past-tensed, because the file it cited as the cautionary example no longer exists                                                                                                                            |

### Three defects closed as a consequence

1. **DL-4's last live instance.** `setTimeout(flushRecFill, 600)` contradicted `RECORDING_LIMITS.fillDebounceMs` (500). Gone.
2. **The content script's storage bypass.** Four direct `browser.storage.local` calls → **zero**.
3. **The `page.locator('<tagName>')` fabrication** that DL-75 forbade the new renderer from using now exists **nowhere in production**, so it cannot be resurrected by a future import.

---

## 8. Phase G — What was NOT done

No flag change · no storage descriptor added or removed · no migration module created · no new message type · no new permission · **no read, write, delete, clear or quarantine of `pg_recording_active` or `pg_recorded_actions`** · no conversion of a raw selector string into a `LocatorChain` · no inference of role, text, label, test id, CSS or XPath uniqueness, nth or visibility from V1 data · no rendered-code-to-workflow path · no touch of WS5's `CodeWorkspace` or `CODE_BUFFER` (which stay distinct from `RecordingWorkspace` and `RecordedWorkflow`) · no download, action count, navigation/SPA, frame/tab, cross-tab, browser-restart, assertion, WS10 or WS11 work.

---

## 9. Phase H — Existing guards re-scoped

**Nine guards, every one strictly stronger. None weakened.**

| File                                                             | Guard                         | Before → After                                                                          |
| ---------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| `ws9-recording-persistence.test.ts`                              | AB/AC panel storage           | exactly **1** permitted call → **0**                                                    |
| `ws9-recording-persistence.test.ts`                              | AD content-script storage     | sliced at `// -- Recording`, pinned **4** calls below it → whole file, **0** calls      |
| `ws9-recording-reconcile.test.ts`                                | S — panel writes nothing      | exactly **1** → **0**                                                                   |
| `ws9-recording-ui.test.ts`                                       | adds no storage write         | exactly **1** → **0**                                                                   |
| `ws9-recording-runtime.test.ts`                                  | only one recorder wired       | "exists and is unreachable" → **"is absent"**                                           |
| `ws9-recording-runtime.test.ts`                                  | no timing literal             | cut the file at `function onRecInput` → **whole file**                                  |
| `ws9-recording-renderer.test.ts`                                 | legacy renderer separate      | "exists, unchanged, separate" → **"does not exist"**                                    |
| `panel-truthfulness.test.ts`                                     | strategy order has one source | one file → **every production file**, plus the fallback file is gone                    |
| `storage-consumers.test.ts` ×2, `ws5-devtools-workspace.test.ts` | the one WS4 exception         | **1** permitted exception → **0**, asserted as an empty list rather than a vacuous loop |

**Two of these were repaired, not merely tightened.** `ws9-recording-persistence.test.ts` (AD) and `storage-consumers.test.ts` sliced their file on the `// ── Recording` marker; `ws9-recording-runtime.test.ts` sliced on `function onRecInput`. This slice deleted all three anchors, so `indexOf` would have returned `-1` and `slice(0, -1)` would have silently made "the part above the marker" mean "the whole file bar one character" — a guard that keeps passing while no longer asserting what it says. Each now states its claim directly over the whole file.

---

## 10. A pre-existing flaky guard, found and corrected

`storage-migration.test.ts` → _"the quarantine record carries NO raw user content"_ stringified the entire quarantine record and asserted it did not contain `'42'`, the malformed value under test. The record carries `at: Date.now()`, and roughly a third of all wall-clock milliseconds contain the digits `42`.

It **failed during this slice's validation with `src/storage/migration.ts` untouched**, and `node -e` confirmed the epoch value at that moment (`1788584252790`) contains `42`. This is a latent defect this slice discovered, not one it caused.

Corrected to assert **field by field**, with the timestamp excluded by name and its type checked instead, plus the exact key set — deterministic, and stricter than the string scan it replaces.

---

## 11. Phases I–K — Validation

Each command run **alone**, with its own exit code.

| Command             | Exit  | Detail                                                                                                                                                                        |
| ------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`         | **0** | **1,825 tests / 65 files** (was 1,795 / 64) — locator-engine 383 · codegen **127 incl. 127/127 goldens, untouched** · extension **1,315**                                     |
| `pnpm build`        | **0** | clean rebuild after deleting `.output`                                                                                                                                        |
| `pnpm typecheck`    | **0** | all three packages                                                                                                                                                            |
| `pnpm lint`         | **0** | 3 **pre-existing** warnings, both files untouched by this slice: an unused `eslint-disable` in `src/recording/export.ts` and two in `test/ws9-export.test.ts`, all from DL-80 |
| `pnpm format:check` | **1** | `ws2-item9-report.md` only — the single permanent accepted exception                                                                                                          |

> **Verification is NOT claimed as "all green"** while the `format:check` exception stands.

### Bundle

|                               | Baseline           | Now                    | Δ                    |
| ----------------------------- | ------------------ | ---------------------- | -------------------- |
| total                         | 319,841 B          | **314,371 B**          | **−5,470 B**         |
| sidepanel chunk               | 15,614 B           | 10,226 B               | −5,388 B             |
| `content.js`                  | 48,073 B           | 48,073 B               | **0**                |
| `background.js`               | 11,449 B           | 11,449 B               | 0                    |
| devtools-panel                | 1,386 B            | 1,386 B                | 0                    |
| overage vs. 278,760 B ceiling | 41,081 B / 14.74 % | **35,611 B / 12.77 %** | −5,470 B / −1.97 pts |

The ceiling was **not** re-baselined. This is the first bundle **reduction** of this workstream.

**`content.js` is byte-identical, and that is a finding rather than an omission.** A clean rebuild produced the same size, and the retired symbols appear **zero** times in it — Rollup's dead-code pass had already eliminated the unreachable recorder before this slice. The retirement is a **source and architecture** change, not a content-script size change, and is reported as such rather than credited with bytes it did not save.

---

## 12. Phase M — Drift sweep and backup

`git` is unavailable in this repository; the modification-time drift sweep is the inventory method.

**Production — 5 modified, 1 deleted:**
`entrypoints/content.ts` · `entrypoints/sidepanel/RecordingControl.tsx` · `entrypoints/sidepanel/SidePanel.tsx` · `utils/messaging.ts` (documentation only) · `src/recording/render.ts` (comment only) · **DELETED** `src/ui/recording/test-code.ts` (and the emptied `src/ui/recording/`).

**Tests — 1 added, 9 modified:**
added `test/ws9-v1-raw-line-migration.test.ts`; modified `panel-truthfulness` · `storage-consumers` · `storage-migration` · `ws5-devtools-workspace` · `ws9-recording-persistence` · `ws9-recording-reconcile` · `ws9-recording-renderer` · `ws9-recording-runtime` · `ws9-recording-ui`.

**Docs:** `DECISION-LOG.md` (DL-82) · `MASTER-ROADMAP.md` · `CURRENT-STATE.md` · `PROGRESS.md` · this document.

---

## 13. Evidence NOT collected

- **Real Chromium: NOT RUN.**
- **Manual browser regression: NOT RUN.**

No extension E2E infrastructure exists — unchanged since DL-63. Every claim in this document is a source, unit or byte measurement, and none is presented as browser evidence.

---

## 14. WS9 exit criteria — still not met

The E2E kill-the-content-script proof remains blocked; _40 does not interrupt_, _100 stops with preserved state_, _passwords never captured_ and the 500 KB budget are covered by unit and byte evidence only; and the feature remains switched off.

**WS9 is NOT complete.** Status stays **PARTIAL / IN PROGRESS**.

---

## 15. Owner decision required — the deferred half

The V1 stored data now has **no writer, no reader and no deleter**, and will sit inert on any install that holds it. Three options, **no recommendation offered**.

**(a) LEAVE IT INERT.** Zero risk. The keys quietly persist forever, invisible and unused.

**(b) AUTHORISE A DISCLOSED, USER-INITIATED DISCARD.** A Clear-data path that names these two keys explicitly. Requires an owner decision because it deletes data, and it would also need DL-66/O2 revisited, since O2 says WS4 never clears them.

**(c) AUTHORISE A DEGRADED-IMPORT SLICE.** Turn each V1 action into a step explicitly marked **UNVERIFIED**. This is not a migration task hiding inside a migration: it first requires inventing a way for the workflow model, all seven renderers, the export layer and the workspace to carry and _visibly display_ an unverified step — otherwise the import is indistinguishable from the fabrication this gate forbids.

---

**HARD STOP.** No further roadmap work was performed.
