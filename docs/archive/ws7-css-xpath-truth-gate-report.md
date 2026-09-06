# WS7 FINAL REPORT

## 1. Status

**PARTIAL — FOLLOW-UP REQUIRED**

## 2. Starting Baseline

- tests: 938 tests / 40 files, all passing (DL-58 state)
- bundle: 293,353 B
- previous ceiling: 278,760 B (LOCKED, unchanged by this gate)
- known overage: 14,593 B (5.24%)
- relevant existing debt: WS6.2 bundle overage (owner decision, unrelated to CSS/XPath truth); F-2 ("~138 fabricated reliability labels in `css-xpath.ts`") listed as an open finding in `CURRENT-STATE.md`, never struck through despite Stage 1/WS2 work that appears to have already addressed it — this gate's discovery resolved that ambiguity with direct evidence (§3).

## 3. Discovery

Phase 0 read `DECISION-LOG.md`, `CURRENT-STATE.md`, `MASTER-ROADMAP.md`, `PROGRESS.md` in full, then every CSS/XPath-relevant implementation file end to end: `utils/css-xpath.ts`, `packages/locator-engine/src/probe.ts` (the `DomProbe` contract), `FixtureDomProbe.ts`, `packages/extension/src/runtime/probe.ts` (`LiveDomProbe`), `content.ts`'s `handleVerify`, both panels' Verify Selector wiring, `verifier.ts`, `types.ts` (`LocatorKind`), and the test files `honesty.test.ts`/`panel-truthfulness.test.ts`. A repository-wide grep covered `confidence`, `reliability`, `xpath`/`XPath`, `verified`/`unverified`/`ambiguous`/`invalid`/`unsupported`.

**Confirmed problems (the one genuine gap).** The raw CSS/XPath **Verify Selector** feature (`VERIFY_SELECTOR` message, the free-text box both panels ship — distinct from WS6.2's `VERIFY_LOCATOR_EXPRESSION`, which only parses `getBy*` syntax) classified every `ProbeErrorCode` (`INVALID_SELECTOR`/`INVALID_XPATH`/`UNSUPPORTED`/`SCOPE_DETACHED`/`BUDGET_EXHAUSTED`) into one generic red "⚠ CODE: detail" string, via `verifyColor`/`verifyMessage` logic hand-written **independently** in `SidePanel.tsx` and `Panel.tsx`. This meant "the environment could not answer" (e.g. XPath without `document.evaluate`, a detached scope) rendered visually identical to "this is confirmed wrong" (bad syntax) and to a firm negative result — an overclaim of evidence, and a duplicated (risking silent divergence) classification scheme sitting right alongside `verifier.ts`'s own `classifyVerification`, which already solves exactly this problem for the Playwright-expression path and is a pure function with no dependency on the `LocatorChain` AST.

**Already-correct behavior (found closed by prior stages, not reopened).**

- `utils/css-xpath.ts`'s ~160 generated CSS/XPath variants carry only a hand-authored `SelectorStabilityHint` ('high'/'medium'/'low') that no code ever checks against the DOM — the module's own doc comment says so; `honesty.test.ts` (18 tests, Stage 1/WS2) pins that the rendered labels are neutral prose ("Stable pattern"/"May change"/"Fragile pattern"), carry no ✓/✔/√ glyph, are never coloured with the "measured single match" green, and that `UNVERIFIED_SELECTOR_NOTICE` (shown above every generated list on both panels) states plainly the list is "not checked against the page. Use Verify Selector for a real match count." Generated ≠ verified already holds for CSS/XPath generation.
- `FixtureDomProbe.countXPath` (happy-dom, used by `locator-engine`'s own test suite) already returns `unknownCount({ code: 'UNSUPPORTED' })` — its doc comment states happy-dom has no `document.evaluate` and this is reported honestly through the port's own designed channel, never fabricated.
- `LiveDomProbe.countXPath` (the real browser implementation) calls the actual `document.evaluate` with `XPathResult.ORDERED_NODE_SNAPSHOT_TYPE`, catching genuine syntax errors as `INVALID_XPATH` and reporting `UNSUPPORTED` only if `document.evaluate` itself is unavailable. No code path fakes XPath support anywhere.
- `recommendLocator`/`ranking.ts` never read CSS/XPath data — only `ScoredCandidate`s from the 7 `getBy*` strategies — so ranking inversion (F-1, already CLOSED in Stage 2) is structurally unaffected by anything CSS/XPath-related.
- A repository-wide grep for `confidence`/`reliability` found the words surviving only in guard comments and tests that actively **enforce their absence** from shipped copy (`honesty.test.ts`, `recommendation-ui.test.ts`) — none in product-facing strings.
- `LocatorKind` (the locked AST) has exactly 7 members (`role`/`text`/`label`/`placeholder`/`altText`/`title`/`testId`) — CSS/XPath are not, and were never meant to be, part of it; `classifyVerification` is intentionally independent of the AST, which is what made reusing it for raw selectors possible without any AST change.

**Limitations (genuinely out of this gate's scope, not defects).** Live per-variant verification of the ~160 generated CSS/XPath candidates — floated by `css-xpath.ts`'s own forward-referencing doc comment ("WS7 replaces this file with generation that verifies every candidate against the live DOM") — was considered and NOT pursued. The existing static-hint-plus-notice design is already honest (a disclosed hint with a notice, not a lie of omission), so building live per-candidate verification would be a FEATURE addition — new DOM queries per variant, materially larger bundle/scope — not a truth fix. This gate's own instructions explicitly forbid exactly this kind of scope expansion ("Avoid: broad refactoring... new dependencies"; no re-opening `css-xpath.ts` generation).

**Exact WS7 implementation candidate (what was built).** Unify `VERIFY_SELECTOR`'s truth classification with the existing six-state `VerificationStatus`/`classifyVerification` model, reusing the already-bundled function, with a small typed error-code mapping and one new shared presentation module — see §4.

**Items that should NOT be changed (and were not).** `resolver.ts`, `parser.ts`, `verifier.ts`'s `classifyVerification`/`verifyLocatorExpression` logic, `css-xpath.ts`'s generation, `recommendation.ts`/`ranking.ts`, `FixtureDomProbe`/`LiveDomProbe`'s core query logic, the pre-existing count-based (`verified`/`not-found`/`ambiguous`) wording in both panels.

**Owner decisions required.** `MASTER-ROADMAP.md` §12's original WS7 spec (a new `selector-engine` package, verified per-candidate generation, `GeneratedSelector`/`ReferenceExample` type split, `css-xpath.ts` deletion, a fixture-matched exit criterion) is materially larger than this gate's own charter, which explicitly forbade a second engine/AST/resolver and broad refactoring. That larger scope was not attempted and remains open — recorded as a contradiction in `DECISION-LOG.md` (DL-59), not silently resolved. Whether "WS7" is considered satisfied at this gate's narrower truth-classification bar, or the original package-level rebuild is still required, is an owner decision. The pre-existing bundle-ceiling overage (now further disclosed, not reduced, by this gate — see §11) remains its own separate owner decision, unchanged in kind from DL-57/DL-58.

## 4. Implementation

- **`packages/extension/utils/messaging.ts`** — added `verifyStatus?: VerificationStatus` to `RuntimeMessageAck` (purely additive; `ok`/`count`/`visibleCount`/`error` unchanged) and re-exported the `VerificationStatus` type from the domain package. _Why_: gives `VERIFY_SELECTOR` responses a typed classification in the SAME vocabulary `VERIFY_LOCATOR_EXPRESSION` already uses, instead of an untyped error string.
- **`packages/extension/entrypoints/content.ts`** — `handleVerify` now computes `verifyStatus` via the existing `classifyVerification` (measured evidence) for the success path, and a new exhaustive `statusForProbeError(code: ProbeErrorCode): VerificationStatus` (5-case switch, no `default`) for the probe-error path. _Why_: reuses the single existing truth function instead of a second classification scheme; the exhaustive switch (no default) makes a future `ProbeErrorCode` addition a typecheck failure rather than a silent fallthrough.
- **`packages/extension/src/ui/verify-selector-status.ts`** (new) — `isRawVerifyErrorStatus` (type guard) and `RAW_VERIFY_ERROR_STATUS_STYLE` (colour/prefix for `invalid`/`unsupported`/`unverifiable`). _Why_: one shared, pure presentation module for the three "could not measure a count" states, imported by both panels — mirrors the existing `strategy-meta.ts`/`matchBadge` precedent for "one implementation, reused" rather than two panels hand-rolling their own.
- **`packages/extension/entrypoints/sidepanel/SidePanel.tsx`** — threads `verifyStatus` through every `handleVerify` outcome (success, domain error, "no active tab", transport-exception catch); `verifyColor`/`verifyMessage`'s error branch now consults `RAW_VERIFY_ERROR_STATUS_STYLE` instead of a flat `'#dc2626'`. _Why_: distinguishes bad syntax (still red) from "this environment could not answer" (neutral grey) instead of colouring every probe error identically. The pre-existing count-based success-path logic (`verifyVisible`, the "total, hidden" wording pinned by `honesty.test.ts`'s source-text assertions) is untouched.
- **`packages/extension/entrypoints/devtools-panel/Panel.tsx`** — the same change, mirrored (this panel's Verify Selector logic is deliberately parallel to the Side Panel's, per WS3/WS5 precedent).
- **`packages/extension/test/verify-selector-status.test.ts`** (new, 14 tests) — see §9.

No other file was touched. No new dependency was added.

## 5. CSS Truth

- **Generation** (`utils/css-xpath.ts`, unchanged this gate): ~90 CSS variants per element carry an authored `stability` hint ('high'/'medium'/'low'), never derived from a DOM query — confirmed by `honesty.test.ts`'s structural guard that the module contains no `querySelectorAll`/`document.evaluate`/`getBoundingClientRect`. Rendered as neutral prose labels with `UNVERIFIED_SELECTOR_NOTICE` above the list. Generated ≠ verified, already true.
- **Verification** (`VERIFY_SELECTOR` → `LiveDomProbe.countCss`, this gate's change is the classification layer only): `countCss` calls `querySelectorAll` and reports `{total, visible}` via `measure()`, or `unknownCount({code:'INVALID_SELECTOR'})` on a thrown `SyntaxError`.
  - **valid + unique**: `classifyVerification({matchCount, visibleMatchCount:1})` → `verified`. UI: "✓ 1 visible element matched — unique" (unchanged).
  - **valid + zero**: → `not-found`. UI: "✗ No elements matched" / "✗ 0 visible … not visible" (unchanged).
  - **valid + multiple**: → `ambiguous`. UI: "⚠ N visible elements matched" (unchanged).
  - **invalid selector**: `INVALID_SELECTOR` → `statusForProbeError` → `invalid`. UI now: "⚠ Invalid selector: INVALID_SELECTOR: <engine detail>" in red (previously the same red, generic "⚠ CODE: detail" wording — now typed and consistently coloured with the Playwright-expression `invalid` state).
  - **unsupported/unverifiable**: CSS has no `UNSUPPORTED` case in practice (`querySelectorAll` is always available); `SCOPE_DETACHED`/`BUDGET_EXHAUSTED` map to `unverifiable` and now render neutral grey instead of alarming red.

## 6. XPath Truth

- **Generation** (`utils/css-xpath.ts`, unchanged): ~35 XPath variants per element, same authored-hint model as CSS, same `UNVERIFIED_SELECTOR_NOTICE`.
- **Verification** (`LiveDomProbe.countXPath`): calls real `document.evaluate(...,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,...)`.
  - **valid + unique/zero/multiple**: identical classification path to CSS (`verified`/`not-found`/`ambiguous`), same wording, unchanged.
  - **malformed XPath**: a thrown error from `document.evaluate` → `INVALID_XPATH` → `invalid`. Now presented identically to CSS's `invalid` (same colour/prefix pattern), where before it was an undifferentiated "⚠ CODE: detail" string.
  - **unsupported XPath environment**: `typeof this.doc.evaluate !== 'function'` → `UNSUPPORTED` → `unsupported` → neutral grey "ℹ Unsupported in this environment: …" (previously the same alarming red as a confirmed zero-match result — this is the concrete truth-precision fix for XPath specifically).
  - **fixture (happy-dom) environment**: `FixtureDomProbe.countXPath` unconditionally returns `UNSUPPORTED` — confirmed honest, unchanged, not exercised by the browser-side classification path since it is a `locator-engine`-only test double.
  - **unverifiable**: `SCOPE_DETACHED`/`BUDGET_EXHAUSTED` → neutral grey, same as CSS.

No fake XPath support exists anywhere, confirmed by direct reading of both `DomProbe` implementations (§3).

## 7. Ranking / Reliability

- **Current score semantics**: `recommendLocator`/`ranking.ts` operate only on `ScoredCandidate[]` from the 7 `getBy*` strategies; CSS/XPath data never reaches ranking. The word "confidence" appears nowhere in shipped copy; "reliability" appears only in guard comments/tests enforcing its absence.
- **Whether anything was misleading**: no. F-1 (ranking inversion) was already CLOSED in Stage 2 (`testId` ranks first, pinned by tests). No unearned confidence language was found anywhere in this gate's repository-wide grep.
- **What was changed**: nothing in ranking/recommendation. This gate's only classification change is the raw CSS/XPath Verify Selector's error path (§4–§6), unrelated to ranking.
- **Why it is now truthful**: it already was; this gate found no ranking/reliability defect to fix, confirmed by direct evidence rather than assumed from the historical F-1/F-2 write-up.

## 8. Browser Validation

- **Real Chromium infrastructure found**: none exists anywhere in this repository (confirmed, matching DL-54/DL-55's prior finding — unchanged by this gate).
- **Tests executed**: `pnpm verify`'s full suite (happy-dom + source-text architecture tests), run before and after every change. No browser-based test was run or claimed.
- **XPath validation status**: verified by source reading, not live-browser execution — `LiveDomProbe.countXPath`'s use of the genuine `document.evaluate` API was confirmed by reading `packages/extension/src/runtime/probe.ts` directly; this is the same evidence level DL-52/DL-54/DL-55/DL-58 have used throughout, since no real-Chromium harness exists to execute against.
- **Remaining limitation**: unchanged from every prior gate — no real-Chromium/e2e regression infrastructure exists in this repository, so `LiveDomProbe`'s actual runtime behavior in a real browser is validated only by the 2026-08-30 24-screenshot manual audit (`CURRENT-STATE.md`), not by this gate.

## 9. Tests

- total tests: **952**
- test files: **41**
- new tests: 14 (`test/verify-selector-status.test.ts`) — unit tests of the shared classification module (correct 3-state coverage, no verdict glyph on an unmeasured state, distinct colours from a measured negative); source-text guards that `content.ts` imports/calls `classifyVerification` and exhaustively maps every `ProbeErrorCode` with no `default`; guards that both panels import the one shared presentation module and thread `verifyStatus` through every code path; a regression guard that the pre-existing count-based wording is untouched.
- changed tests: none — no existing test file was edited.
- regression tests: all 938 pre-existing tests pass unchanged, confirmed both before any source edit and after (identical pass count, same files).
- security: `eval`/`new Function`/dynamic-import guards re-run, passing; no security-relevant code touched (the change is pure classification/presentation logic over already-measured evidence).
- R2: PASS (`test/architecture.test.ts`, re-run).
- R3: PASS (`test/architecture.test.ts`, re-run).
- R5: PASS (`test/verify-locator-panel.test.ts`'s R5 guard; the new `verify-selector-status.ts` module has no React/browser import, confirmed by its own source).

## 10. Build / Quality

- build: PASS (`pnpm build`, all 3 workspace packages).
- typecheck: PASS (`pnpm -r run typecheck`, zero errors).
- lint: PASS (`eslint .`, zero errors).
- format:check: clean except the pre-existing, untouched `ws2-item9-report.md` exception — the same documented exception every prior gate (DL-52 onward) has carried forward unchanged.

## 11. Bundle

- Before: 293,353 B (content.js 31,471 B)
- After: **294,425 B** (content.js **31,753 B**)
- Delta: **+1,072 B** total (content.js +282 B; the remainder lands in the shared panel chunk, which both `SidePanel.tsx`/`Panel.tsx` draw from, since `verify-selector-status.ts` is imported by both)
- Previous ceiling: 278,760 B (LOCKED, unchanged)
- Difference from ceiling: **15,665 B (5.62%)**, up from 14,593 B (5.24%) before this gate

This increase is genuine new reachable code (`statusForProbeError`, the `verifyStatus` wiring, the new shared module) — not waste; `classifyVerification` itself was already bundled (WS6.2) and contributes no new bytes. Per this gate's own explicit instruction, the pre-existing 14,593 B/5.24% overage was **not** treated as a WS7 task and was not chased; this gate's own small increase is disclosed in the same spirit, not optimized away at the cost of the truth fix it exists to deliver.

## 12. Documentation

- `DECISION-LOG.md` — new **DL-59** entry (inserted before DL-58, per the file's established convention), including the recorded roadmap-vs-gate scope contradiction.
- `CURRENT-STATE.md` — Updated line, new WS7 checkpoint row.
- `MASTER-ROADMAP.md` — executive summary, §12 WS7 section (new status callout appended below the original spec, spec itself left verbatim), §30 dashboard (WS7 row split out from the former "WS7–WS8" row).
- `PROGRESS.md` — Updated line, CURRENT MILESTONE line, new milestone-history row, new `## WS7` narrative section.

No historical decision (DL-1 through DL-58) was rewritten; a whitespace-only `prettier --write` pass was applied to all 4 docs after editing (table-column realignment only — verified byte-identical after whitespace normalization, confirmed programmatically before delivery).

## 13. Backup / Delivery

- backup filename: `ws7-css-xpath-truth-gate-2026-09-03.zip` (`/home/claude/backups/`), 10 files: the 5 changed/new source files, the 1 new test file, and the 4 updated `ProgressDocument/*.md` docs.
- delivery location: `E:\Codes\playwrightguru` (device-bridge connected folder), confirmed via `get_device_info`.
- changed-file count: 11 (5 source + 1 test + 4 docs + this report), all confirmed written with zero rejections (see accompanying chat message for the commit result).

No git commit is claimed — no git repository is present in this cloud environment (`git status` → `fatal: not a git repository`), matching every prior gate's precedent.

## 14. Remaining WS7 Debt

- **The bundle-ceiling overage** (now 15,665 B/5.62%, up from 14,593 B/5.24%) remains an unclosed owner decision — unchanged in kind from DL-57/DL-58, only further disclosed by this gate's own small, genuine addition.
- **`MASTER-ROADMAP.md` §12's original, larger WS7 spec is unstarted**: no `selector-engine` package, no per-candidate live-verified generation, no `GeneratedSelector`/`ReferenceExample` type split, `css-xpath.ts` not deleted, no fixture-matched "every generated selector actually matches" exit criterion. This is a recorded contradiction (DL-59), not an oversight — this gate's own authorising instructions explicitly bounded it out of scope.
- Live per-variant verification of the ~160 generated CSS/XPath candidates (`css-xpath.ts`'s own forward-referencing doc comment) remains a deliberately-deferred future direction, not a defect — the current static-hint-plus-notice design is already honest.
- All pre-existing WS3/WS5/WS6/WS6.2 debt (leaf-first extraction, `PickSource`/`CommandBus`, no real-Chromium infrastructure, the WS6.2 bundle overage) is unchanged and was not touched by this gate.

## 15. Master Roadmap

```
WS0       = CLOSED / LOCKED
WS1       = CLOSED
WS2       = COMPLETE
WS3       = PARTIALLY COMPLETE
WS4       = NOT STARTED
WS5       = PARTIAL
WS6       = PARTIALLY DELIVERED
WS6.2     = PARTIAL — BUNDLE STILL OVER CEILING
WS6.2.1   = CLOSED
WS7       = PARTIAL — FOLLOW-UP REQUIRED
WS8       = NEXT
WS9       = FUTURE
```

## 16. Recommendation

**FOCUSED WS7 FOLLOW-UP REQUIRED**

The follow-up is an owner decision, not a further engineering investigation: decide whether WS7 is satisfied by this gate's narrower truth-classification bar (in which case `MASTER-ROADMAP.md` §12 should be revised to match what actually shipped), or whether the original package-level `selector-engine` rebuild is still required (in which case that is a materially larger, separately-scoped gate). Either path is unblocked by anything found in this gate — no architectural issue, no missing coverage, no second-implementation risk was left behind.
