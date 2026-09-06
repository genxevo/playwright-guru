# WS9 — SLICE 4: VERIFIED RECORDING RENDERERS (`renderAction` + `renderSpecFile`)

**2026-09-04 · DL-75 · PARTIAL — a recording can now be rendered, and still cannot be started**

## 1. Verdict

**PARTIALLY COMPLETE.** `renderAction` and `renderSpecFile` are implemented as a pure projection of the
`RecordedWorkflow` into Playwright source, across all seven existing target languages, with honest
refusal instead of fabricated code. WS9 is **not** complete: the export menu, the structured workspace,
persistence, the recording UI and the controller-side liveness marker remain unbuilt, and
`RECORDING_ENABLED` is still `false`, so no user can produce a recording to render.

## 2. Authoritative Boundary

The WS9 discovery gate's **§14** names this slice directly:

> "…and `RECORDING_ENABLED` left **off** until the handshake and heartbeat exist. **`renderAction`/
> `renderSpecFile`**, the export menu and the structured workspace follow; the workspace migration waits
> on D2."

Unlike slice 3 — where §14 named no wiring slice and the boundary had to rest on WS9's Purpose,
Deliverables and Exit criteria — **these two function names are in the roadmap verbatim.** No new
workstream, no reorder, no WS6.3, no closed workstream reopened.

## 3. Owner Decision

**ACCEPTED TEMPORARILY** — the slice-3 bundle cost stands.

DL-74 measured +14,387 B (all in `content.js`, 33,150 → 47,537), leaving the bundle **29,441 B /
10.56 %** over the locked 278,760 B ceiling, and raised three options without taking one. The owner has
chosen **accept**, because slice 3 is the real recording runtime foundation, reversing it would only
defer the identical cost to the flag-flip slice, the ceiling was already exceeded before WS9 began, the
cause is measured and understood, and no unsafe optimisation should be introduced to satisfy an old
number.

**This is explicitly not permission to optimise.** No optimisation was attempted in this slice, and
future bundle work remains a separate owner decision, open since DL-56.

## 4. Implemented

- **`renderAction(action, lang)`** — projects one `RecordedStep` into a single Playwright statement, or
  returns an explicit refusal.
- **`renderSpecFile(workflow, lang)`** — projects a whole `RecordedWorkflow` into a spec file, order
  preserved exactly.
- **Three additive exports from `@playwright-guru/codegen`** — `escapeForQuotedString`, `singleQuoted`,
  `doubleQuoted`, so the renderer reuses the one escaping policy rather than hand-rolling a second.
- **`test/ws9-recording-renderer.test.ts`** — 36 failure-first assertions.

## 5. Rendering Architecture

```
RecordedWorkflow                       [slice 1 — the source of truth]
  → RecordedStep                       kind · target? · value? · redacted? · url?
  → RecordedTarget.locator.chain       the VERIFIED LocatorChain
  → generateLocatorCode(chain, lang)   [WS1 codegen — the ONE generator, 127 goldens]
  → renderAction                       + await · method name · value · terminator
  → renderSpecFile                     + scaffolding · indent · order · refusal comments
```

**The renderer is a thin adapter, because the generator already existed.** Discovery measured that
`generateLocatorCode` already renders a `LocatorChain` across all seven `TargetLanguage` targets, with
`.filter(...)`, `.nth(...)` and the six ARIA state options already handled. A test asserts, for every
language, that the rendered statement **contains `generateLocatorCode`'s own output** — if a second
generator ever appears, that test fails.

**Confirmed absent from `render.ts`** (guards, comments stripped): DOM (`document`, `window`,
`querySelector`, `HTMLElement`, `Event`) · probe/resolver (`LiveDomProbe`, `DomProbe`, `resolveChain`,
`resolveStep`, `captureSnapshot`) · browser (`wxt/browser`, `browser.runtime`, `browser.tabs`,
`chrome.*`) · storage (`localStorage`, `sessionStorage`, `indexedDB`, `StorageGateway`) · UI (`react`,
`.tsx`, `src/ui/`) · non-determinism (`Date.now`, `Math.random`) · selector synthesis
(`buildCandidateSteps`, `rankCandidates`, `scoreCandidate`, `page.locator(`, XPath).

**Import graph:** exactly one value import — `@playwright-guru/codegen` — plus type-only imports. The
renderer pulls no extension runtime and is reachable from a plain node test context.

## 6. Trust Boundary

> **Recording determines WHAT was verified. Rendering determines HOW it is expressed.**

The renderer **does not create or validate locators**. It has no probe and no DOM, so it has nothing to
validate with; the only locator it can emit is the verified chain the recording already holds.

**The `.nth(0)` admission boundary remains in the recording runtime.** Slice 3 refuses a chain carrying
`chain.nth` at capture time, against a live page — the measured case where the engine reports
`verdict: good`, `visibleMatchCount: 1`, `chain.nth: 0` for an ambiguous element. The renderer does not
re-implement that check: re-deciding admission from stored numbers would be a second, weaker gate
pretending to be the first. Consequently `.nth` is rendered **faithfully** when the model carries one —
silently dropping it would be the renderer inventing confidence the recording never had, presenting a
positional locator as an unqualified one.

Guards pin both halves: `chain.nth !== undefined` still appears in `runtime/recording.ts`, and
`render.ts` contains no `visibleMatchCount`, `isTrustworthy` or `verdict ===`.

## 7. Privacy / Security

| Concern              | Result                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| password             | ✅ refused (`redacted-value`); the note names the reason, no value is invented                                   |
| file                 | ✅ same path — the model carries no value to render                                                              |
| card (`cc-*`)        | ✅ same path                                                                                                     |
| redaction            | ✅ the step is **marked as a comment in place** — never dropped (which would misrepresent the flow), never faked |
| truncation           | ✅ slice 1 already bounded the value; the renderer emits what the model holds and adds nothing                   |
| sensitive logging    | ✅ the module contains no `console.*` at all                                                                     |
| fabricated code      | ✅ never emits `page.locator(...)`, guessed text, CSS or XPath; asserted                                         |
| empty-string success | ✅ impossible — the result is a discriminated union, never a bare string                                         |
| dangerous APIs       | ✅ no `eval`, `new Function`, `Function(`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`                        |
| persistence          | ✅ none — the renderer returns a string and writes nothing anywhere                                              |

**Escaping** goes through codegen's single policy. The legacy generator hand-rolled one that replaces
only the quote character, leaving a backslash or newline to break the statement it was building; a test
pins that a `fill` value is escaped identically to a codegen locator literal, and that no raw newline
survives.

## 8. Codegen Regression

**WS1 goldens: 127/127 PASS — unchanged and untouched. No golden was updated.**

The only codegen change is three additive exports from `src/index.ts`; no renderer, no format helper and
no golden fixture was modified.

## 9. Tests

| Suite                         | Result                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm -r test`                | **1,449 / 1,449 passed, 59 files**                                                              |
| — locator-engine              | 383                                                                                             |
| — codegen (incl. 127 goldens) | 127                                                                                             |
| — extension                   | 939                                                                                             |
| new renderer suite            | 36/36                                                                                           |
| slices 1–3 re-run             | 30/30 · 19/19 · 33/33 · 37/37 — unmodified                                                      |
| WS4 storage                   | `storage-gateway` 40/40 · `storage-consumers` 24/24                                             |
| WS8                           | `error-states` 59/59 · `a11y-structure` 22/22 · `panel-truthfulness` 8/8                        |
| WS6.2 / WS7                   | `resolver-chain-scope` 16/16 · `resolver-state-options` 41/41 · `verifier` 12/12                |
| guards                        | `architecture` 7/7 · `privacy` 11/11 · `honesty` 18/18 · `preview-gate` 7/7 · `contracts` 33/33 |

Baseline was 1,413 / 58; **+36, all new**.

**Failure-first:** the suite was written and run before `render.ts` existed and failed for that reason.
One further failure then occurred against my own implementation — a guard matched `test-code` in this
module's own doc comment, which cites the legacy file as the cautionary example — and was corrected by
stripping comments before matching: **strictly stronger** (prose can no longer trip it; an actual import
still would), the claim unchanged, following the precedent set in slices 2 and 3.

## 10. Build / Typecheck / Lint / Format

Each command run **alone**, exit code read independently.

| Command             | Exit | Detail                                                         |
| ------------------- | ---- | -------------------------------------------------------------- |
| `pnpm -r test`      | 0    | 1,449 / 59 files                                               |
| `pnpm -r build`     | 0    | Σ 308,201 B                                                    |
| `pnpm typecheck`    | 0    | —                                                              |
| `pnpm lint`         | 0    | no errors, no warnings                                         |
| `pnpm format:check` | 1    | **only** `ws2-item9-report.md` — the known permanent exception |

Two new files needed prettier and were fixed. **No new format exception was added.**

## 11. Bundle

| Artifact        | Baseline  | Final     | Delta   |
| --------------- | --------- | --------- | ------- |
| **Total**       | 308,201 B | 308,201 B | **0 B** |
| `content.js`    | 47,537 B  | 47,537 B  | 0 B     |
| `background.js` | 9,746 B   | 9,746 B   | 0 B     |
| sidepanel chunk | 7,801 B   | 7,801 B   | 0 B     |
| devtools panel  | 1,386 B   | 1,386 B   | 0 B     |
| shared `client` | 142,932 B | 142,932 B | 0 B     |
| shared `tokens` | 89,251 B  | 89,251 B  | 0 B     |

**Ceiling 278,760 B — over by 29,441 B (10.56 %), unchanged.** That is the accepted debt from §3, neither
chased nor grown.

Verified rather than assumed: `grep` over `.output/chrome-mv3` finds **zero** occurrences of
`renderSpecFile`, `renderAction` and `RecordedStepKind`. Nothing shipped imports the renderer, so
tree-shaking excludes it, and the additive codegen exports changed no shipped byte. **No optimisation is
claimed.**

## 12. Real Browser

**Real Chromium: NOT RUN.**

Renderer verified through deterministic unit and codegen tests. It touches no DOM, so a browser adds
nothing to its evidence. No manual, DevTools or production verification was performed or is claimed.

## 13. Files Changed

| File                                                     | Change                                     |
| -------------------------------------------------------- | ------------------------------------------ |
| `packages/extension/src/recording/render.ts`             | **new** — `renderAction`, `renderSpecFile` |
| `packages/codegen/src/index.ts`                          | modified — three additive escaping exports |
| `packages/extension/test/ws9-recording-renderer.test.ts` | **new** — 36 assertions                    |

**1 source created · 1 source modified · 1 test created · 0 deleted.** No dependency, no lockfile change,
no build-config change. Drift sweep (modification-time; this repository has **no git**, confirmed again,
so `git status`/`git diff` are unavailable): exactly **3** files.

## 14. Documentation

`DECISION-LOG.md` — **DL-75**, class `CURRENT`, inserted above DL-74; no historical entry rewritten ·
`MASTER-ROADMAP.md` — WS9 header, a slice-4 block, and the §30 dashboard row · `CURRENT-STATE.md` —
`Updated:` line and execution pointer · `PROGRESS.md` — `Updated:` line and a milestone row · this report.

WS9 is **not** marked complete, and recording is **not** described as production-ready.

## 15. Backup

`ws9-slice4-renderers-2026-09-04.zip` — full source tree excluding `node_modules`, `.output`, `dist`,
`.wxt` — delivered to `E:\Codes\playwrightguru`.

## 16. Remaining WS9 Work

Roadmap-authorised and still unbuilt: the **export menu** · the **structured code workspace** and its
**v1 raw-line migration** · **persistence** of the recorded workflow · the **recording UI** · the
**controller-side liveness marker** · **navigation / SPA / frame / tab handling** · **legacy-recorder and
legacy-renderer deletion** · **flipping `RECORDING_ENABLED`**.

**Debt carried forward:** the bundle overage (now formally accepted, §3) · `snapshot.ts`'s stale
`RecommendedLocator.stepCounts` doc comment (DL-72) · `storage-migration.test.ts`'s ~6.9 % flake
(untouched) · WS6.1's unstarted items and self-contradiction · WS3's deferred IIFE build and CI
benchmarks · no real-browser infrastructure anywhere.

## 17. Next Authorized Step

§14's own sequencing continues: **the export menu, then the structured code workspace** (with the
workspace migration waiting on D2). Both consume `renderSpecFile`'s string, which now exists.

Note for whoever takes the export slice: it will also need to decide what the **recording UI** shows,
and that decision carries the two items still gating the flag — the banner must read lifecycle state
rather than a local boolean, and the controller-side liveness marker needs persistence or UI to have a
consumer. `RECORDING_ENABLED` cannot honestly flip before then.
