# WS9 — Finalization / Exit Validation

**Date:** 2026-09-05 · **Decision:** DL-85
**WS9 remains PARTIAL / IN PROGRESS · `RECORDING_ENABLED` remains `false`**

---

## 1. Verdict

**PARTIALLY IMPLEMENTED.** One real defect found and closed. **WS9 cannot close**: four of its five exit criteria have evidence, the fifth requires E2E infrastructure that does not exist, and no infrastructure was invented to pretend otherwise.

---

## 2. Baseline (before any edit)

| Measure                                                              | Value                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| tests                                                                | **1,914 / 67 files** (locator-engine 383 · codegen 127 · extension 1,404) |
| codegen goldens                                                      | **127 / 127**                                                             |
| build · typecheck · lint                                             | **0 · 0 · 0**                                                             |
| `format:check`                                                       | **1** — `ws2-item9-report.md` only                                        |
| bundle total                                                         | **316,367 B**                                                             |
| `content.js` · `background.js` · sidepanel · devtools-panel · tokens | 48,591 · 11,775 · 11,051 · 1,386 · 91,084 B                               |
| ceiling / overage                                                    | 278,760 B → **37,607 B (13.49 %)** over                                   |

Matches DL-84 exactly.

---

## 3. Discovery

**WS9-FINAL-01…24 were checked against the existing suites before anything was written.** 23 of the 24 were already covered by `ws9-action-count-refusal`, `ws9-navigation-tab-frame`, `ws9-recording-persistence`, `ws9-recording-reconcile`, `ws9-recording-runtime`, `ws9-recording-workflow`, `preview-gate` and `storage-consumers`. **None was duplicated** — re-asserting a covered claim in a second file grows a suite without adding evidence, and is how two guards start disagreeing.

**Documentation location, reported not changed:** the roadmap documents live in `ProgressDocument/`, not `docs/`. `docs/` holds only the WS9 slice reports. Moving them would be churn with no reader benefit.

---

## 4. Remaining WS9 matrix

| Item                                    | Status                       | Evidence                                   |
| --------------------------------------- | ---------------------------- | ------------------------------------------ |
| Action count                            | **IMPLEMENTED**              | DL-84                                      |
| Refusal feedback                        | **IMPLEMENTED**              | DL-84                                      |
| Durable refusal observation             | **IMPLEMENTED**              | DL-84                                      |
| Export — clipboard                      | **IMPLEMENTED**              | DL-80                                      |
| Structured workspace                    | **IMPLEMENTED**              | DL-81                                      |
| V1 code-path retirement                 | **IMPLEMENTED**              | DL-82                                      |
| Navigation / SPA / tab semantics        | **IMPLEMENTED**              | DL-83                                      |
| Language preference persistence         | **IMPLEMENTED (this slice)** | DL-85                                      |
| `40 does not interrupt`                 | **EVIDENCED**                | `ws9-recording-workflow`, `ws0-seams`      |
| `100 stops with preserved state`        | **EVIDENCED**                | model + validator                          |
| `passwords never captured`              | **EVIDENCED**                | seven files, incl. throwing-getter         |
| `workflow ≤500 KB at 100 actions`       | **EVIDENCED**                | `assessWorkflowBudget`                     |
| **E2E kill-content-script proof**       | **BLOCKED**                  | no extension E2E infrastructure            |
| Refusal visibility after recorder death | **DEFERRED**                 | safe, but is DL-84 owner decision (a)      |
| Per-reason refusal histogram            | **DEFERRED**                 | DL-84 owner decision (b)                   |
| `limit-reached` reachability            | **DEFERRED**                 | defined, validated, unreachable — recorded |
| iframe recording                        | **DEFERRED**                 | DL-83                                      |
| Full-page reload resumption             | **DEFERRED**                 | DL-83; contradicts DL-73                   |
| Browser restart recovery                | **DEFERRED**                 | out of scope                               |
| V1 stored-data migration                | **DEFERRED**                 | DL-82                                      |
| Download export                         | **DEFERRED**                 | DL-80                                      |
| Manual regression                       | **NOT RUN**                  | —                                          |
| axe                                     | **NOT RUN**                  | —                                          |
| `RECORDING_ENABLED`                     | **FALSE**                    | exit criterion 1 unmet                     |

---

## 5. What was implemented

**One thing: the language preference now persists.**

The product carried **two** language vocabularies:

|                                  | Members                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `TargetLanguage` (codegen)       | typescript · javascript · **python_sync** · python_async · java · csharp_sync · **csharp_async** |
| `StoredLanguage` (WS4 `PW_LANG`) | typescript · javascript · **python** · java · **csharp**                                         |

`LANGS` offers `python_sync` and `csharp_async`. `useLanguage` wrote them with `next as StoredLanguage` — a **cast**, so the compiler never saw the mismatch — and `writeGlobal` validates on the way _in_ and returned `INVALID_VALUE`. **Choosing Python or C# silently did not persist**: the panel showed the choice until reopened, then fell back to TypeScript, and nothing surfaced the failure because the write result is voided.

This was DL-80's recorded open debt, and it is a **WS9** concern rather than only a WS5 one: `RecordingWorkspace` renders `renderSpecFile(workflow, panel.lang)` and `ExportControl` names its file from the same value.

**The fix is one vocabulary, not a migration.** `StoredLanguage` is now `TargetLanguage`, and both casts are gone from `useLanguage` — their absence is what stops the defect returning the way it arrived. The WS4-era `python` and `csharp` are **accepted and mapped forward on read** (`python_sync`, `csharp_async`), so an existing install is upgraded rather than silently reset; that needs no migration entry, because `migrateToV2` already writes whatever `validate` returns. The mappings are the ones `LANGS` itself documents, so no new judgement was introduced.

**No schema version moved. No descriptor added, removed or re-scoped. No migration entry. No new storage mechanism.**

---

## 6. What was intentionally not implemented

| Not done                                                                      | Why                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Refusal visibility after the recorder dies**                                | Technically **safe** — see §10 — but it is DL-84's open owner decision (a). Implementing it would be answering my own outstanding question.                                       |
| Per-reason histogram                                                          | DL-84 owner decision (b). Needs a bounded map, its own validation and backward-compatibility story, and introduces a second derived fact beside a count that is already truthful. |
| Wiring or removing `limit-reached`                                            | Wiring changes refusal semantics at the hard limit without an owner ruling; removing weakens forward compatibility. Neither required.                                             |
| iframe support, full-page resumption, browser restart, V1 migration, Download | Standing deferrals with their own recorded analyses.                                                                                                                              |
| Building an E2E harness                                                       | Explicitly out of scope; it is its own workstream.                                                                                                                                |
| Bundle optimisation                                                           | Not correctness work.                                                                                                                                                             |
| Moving `ProgressDocument/` → `docs/`                                          | Churn with no reader benefit.                                                                                                                                                     |

---

## 7. Failure-first evidence

`packages/extension/test/ws9-finalization.test.ts` — 11 assertions. **6 failed against the untouched tree**, the first through the **real gateway**:

```
× Python (python_sync) must be storable: expected false to be true
× python_sync must validate: expected null to be 'python_sync'
× expected 'python' to be 'python_sync'
× upgraded on read, never discarded: expected 'python' to be 'python_sync'
× no cast to a second language vocabulary: … not to match /as StoredLanguage/
× StoredLanguage is TargetLanguage, not a second list: … to match /StoredLanguage\s*=\s*TargetLanguage/
```

The other 5 passed from the start and are non-regression pins.

### Two WS4 guards repaired — neither weakened

1. **`storage-migration.test.ts` — "migrates the language preference too"** expected the literal `'python'` back. A v1 `python` now migrates to `python_sync`. That is not a loss but the WS4 exit criterion _met properly_: keeping `'python'` would preserve a value `LANGS` no longer offers and the renderer cannot use — a preference the user could see and the product could not act on. The guard now asserts **both** that the choice survived **and** that what survived is usable and is not the default.
2. **`storage-gateway.test.ts` — F18** is about an unknown extra field being ignored, not about how a language is spelled. Its literal moved; it now **also** pins that the extra field never enters the read result.

---

## 8. Recording semantics — unchanged

A **recorded action** is a `RecordedStep` present in `RecordedWorkflow.steps`. `rt.recorded()` returns `session.workflow.steps.length` — the same quantity `appendStep` feeds to `shouldStopRecording`. Coalescing is inside that number and always was.

## 9. Refusal semantics — unchanged

A **refusal** is a step the admission boundary declined, so it never entered the workflow. `refusalFor` is the single authority; `isTrustworthy` is `refusalFor(target) === null`. The noise filter and a dead session are deliberately not refusals. Five codes: `ambiguous`, `not-found`, `unverifiable`, `frame-unsupported`, `limit-reached`.

## 10. Lifecycle interaction — analysed, unchanged

`LIVE > DURABLE > UNKNOWN` untouched. `observedLifecycle` still cannot consult the refusal fields.

**The deferred item, analysed in full so the owner can decide in one step.** Making refusals visible after the recorder dies would need: no second lifecycle (the banner reads the same two durable rows it already reads), no duplicated workflow state, no new storage, no new message, no new descriptor, no lifecycle-semantics change, and no path from a tally to the view. **It is safe.** It was not done because it is precisely DL-84's open owner decision (a).

## 11. Tab interaction — unchanged

One session per tab, top frame only. Both facts travel on the existing observation and workflow, keyed by `sender.tab.id`; `clearTab` owns cleanup. No active-tab lookup in the recording control (re-verified).

## 12. Persistence interaction

`PW_LANG` is the only descriptor touched, and only its accepted vocabulary changed. Descriptor set still **six**; key, area, scope and default unchanged; `isWs4Key` unchanged.

---

## 13. Privacy / security evidence

Re-scanned, all clean: no `eval`, no `new Function`, no `innerHTML`/`outerHTML` assignment, no `dangerouslySetInnerHTML` in production — the three text hits are comments explaining the prohibition. Permissions unchanged (`activeTab`, `storage`, `scripting`, `sidePanel`, host `<all_urls>`); **none added**. No V1 key read, written or deleted. No session id rendered. No selector, value or frame URL in refusal copy.

## 14. Accessibility evidence

Unchanged by this slice: one live region in the banner, no colour-only meaning, decorative dot `aria-hidden`. **No axe validation was run and none is claimed.**

---

## 15. E2E status — **BLOCKED**

The criterion, verbatim: _"An E2E test that kills the content script proves the RECORDING banner cannot appear."_

Its **substance** is proven at unit level — a dead content script yields `NO_HANDLER`, `observedView` collapses that to `unknown`, and no path leads from `unknown` to a recording claim. But the criterion demands an **E2E test**, and there is none.

**A lightweight harness exists and was inspected.** `packages/locator-engine/test/conformance/refresh-golden.mjs` and `packages/extension/test/conformance/refresh-visibility-golden.mjs` both launch a **real Chromium** via an ad-hoc `playwright` install and write JSON goldens the committed node tests read. They **do not close the gap**: neither loads the extension, neither uses `launchPersistentContext` or `--load-extension`, they prove _Playwright's own semantics_, and playwright is deliberately not a repository dependency (DL-20).

**Missing infrastructure, named precisely:** a persistent browser context with the **built extension loaded**, so that the service worker, the side panel and a content script exist together and a content script can be killed while the panel is observed. That is its own workstream and was explicitly out of scope here.

## 16. Manual regression status

**NOT RUN.**

---

## 17. Bundle before / after

|                               | Before             | After                  | Δ                  |
| ----------------------------- | ------------------ | ---------------------- | ------------------ |
| total                         | 316,367 B          | **316,565 B**          | **+198 B**         |
| `background.js`               | 11,775 B           | 11,874 B               | +99 B              |
| tokens chunk                  | 91,084 B           | 91,183 B               | +99 B              |
| `content.js`                  | 48,591 B           | 48,591 B               | **0**              |
| sidepanel chunk               | 11,051 B           | 11,051 B               | **0**              |
| devtools-panel                | 1,386 B            | 1,386 B                | **0**              |
| overage vs. 278,760 B ceiling | 37,607 B / 13.49 % | **37,805 B / 13.56 %** | +198 B / +0.07 pts |

Fully attributed: two extra language members plus a two-entry legacy map, reaching only the two bundles that include `storage/state.ts`. Ceiling **not** re-baselined; no opportunistic optimisation.

---

## 18. Test / build / typecheck / lint / format

Each command run **alone**, with its own exit code.

| Command             | Exit  | Detail                                                                                                                   |
| ------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test`         | **0** | **1,925 / 68 files** (was 1,914 / 67) — locator-engine 383 · codegen **127 incl. 127/127 goldens** · extension **1,415** |
| `pnpm build`        | **0** | clean rebuild after deleting `.output`                                                                                   |
| `pnpm typecheck`    | **0** | all three packages                                                                                                       |
| `pnpm lint`         | **0** | the same 3 pre-existing DL-80 warnings, untouched files                                                                  |
| `pnpm format:check` | **1** | **`ws2-item9-report.md` only**                                                                                           |

> **Verification is NOT claimed as "all green"** while that exception stands.

---

## 19. `RECORDING_ENABLED` decision

**STAYS `false`.**

WS9's own exit list requires the E2E kill-the-content-script proof; that infrastructure does not exist; and the flag is the product's rollback mechanism for exactly the failure mode the missing test would detect. **Four of five criteria having evidence is not four-fifths of a gate.**

---

## 20. Owner decisions still required

**(a)** Refusal visibility after the recorder dies — analysed above as safe and unimplemented.
**(b)** Per-reason refusal histogram.
**(c)** **Authorise an extension E2E harness as its own workstream — the only route to closing WS9.**
**(d)** The four standing deferrals: iframe recording · full-page resumption · browser-restart recovery · V1 stored-data migration.
**(e)** Download export.

---

## 21. Exact remaining work

1. An extension E2E harness (persistent context + loaded extension), then the kill-content-script test. **Blocks WS9 closure and the flag flip.**
2. Manual regression pass and an axe run against the recording surfaces.
3. Whatever the owner rules on (a), (b), (d), (e).

Nothing else in WS9's deliverable list is outstanding.

---

## 22. Final verdict

**PARTIALLY IMPLEMENTED.** The audit found WS9's implementation work essentially complete and one real defect, which is fixed. **WS9 cannot close**, and the reason is a named, missing piece of infrastructure rather than an unfinished feature.

**WS9 remains PARTIAL / IN PROGRESS. `RECORDING_ENABLED` remains `false`.**

---

**HARD STOP.** No further roadmap work was performed.
