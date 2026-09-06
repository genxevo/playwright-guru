# WS6.2 BUNDLE REDUCTION — FINAL REPORT

## 1. Baseline

- tests: 938 tests / 40 files, all passing (DL-56 state)
- bundle: 293,678 B
- ceiling: 278,760 B (LOCKED)
- current excess: 14,918 B (5.35%)

## 2. Root Cause

Investigated the actual build graph before changing anything. Grepped the built `content.js` for markers unique to locator-engine modules the verify path has no business reaching (`RATIONALE_CODES`, `buildCandidateSteps`, `PLAYWRIGHT_STRATEGY_ORDER`, `recommendLocator`, `assessSnapshotBudget`, `rankCandidates`) — **zero hits**. This confirms Rollup's tree-shaking through the `@playwright-guru/locator-engine` barrel (`export *` from 14 modules in `index.ts`) was already fully effective: `recommendation.ts`/`ranking.ts`/`scorer.ts` are genuinely absent from `content.js`, not merely small. Cross-checked the shared panel chunk for a `VerifyLocatorPanel`/verification-copy marker inside `sidepanel-*.js` and `devtools-panel-*.js` individually — found exactly once, in the shared `tokens-*.js` chunk, confirming no per-panel duplication. Audited every WS6.2-added import for `import type` vs runtime — all were already correctly type-only where the symbol was type-only.

**Conclusion: the DL-56 bundle growth is genuine new reachable code, not waste.** `content.js` (+7.09 kB) now bundles the parser (hand-rolled, ~552 lines of grammar-handling logic, all of it reachable — no unused internal helper), the verifier, and `resolver.ts`'s `resolveChain`/`resolveStep` — none of which the content script reached before WS6.2 (the pre-existing `VERIFY_SELECTOR` path calls `LiveDomProbe`'s `countCss`/`countXPath` directly, never the resolver). The shared panel chunk (+3.47 kB) carries the new `VerifyLocatorPanel` component and its copy map, both genuinely new UI. There was no dependency bloat and no cross-module duplication of scorer/resolver/ranking logic to remove.

## 3. Optimizations

**Optimization 1 — `sideEffects: false` on `locator-engine`'s `package.json`.**

- Problem: a pure-ESM domain package without explicit side-effect-free metadata can, in some bundler configurations, force conservative retention of code a bundler cannot statically prove is side-effect-free.
- Change: added `"sideEffects": false` to `packages/locator-engine/package.json`.
- Reason: standard best practice for a pure, browser-independent domain package; zero risk.
- Bundle delta: **Δ 0 B** — byte-for-byte identical build. Rollup's static ESM analysis was already fully effective without this hint (§2 confirms no unrelated module was ever retained).
- Tests: not applicable (metadata-only change; build/typecheck confirmed no effect).
- Outcome: **reverted** — no measurable benefit, kept the change set to only what measurably helped.

**Optimization 2 — removed 8 dead `ParseError.detail` diagnostic strings from `parser.ts`.**

- Problem: `parser.ts` attached hardcoded English-sentence `detail` strings to 8 `ParseError` return sites ('name must be a string or /regex/', 'level must be a number', a `{key} must be true or false` template, 'getByRole expects a string role', 'getByTestId expects a string or /regex/', a `{method} expects a string or /regex/` template, 'getByTestId takes no options', 'nth() expects a non-negative integer'). Grepping every possible consumer — `ui/copy/verification.ts` (maps only `parseError.code` to prose via `PARSE_ERROR_COPY[code]`), `content.ts`, and all three WS6.2 test files — confirmed `.detail`'s CONTENT is read **nowhere** in the shipped product or the test suite; only `.code` and `.position` (the caret) are ever consumed.
- Change: removed those 8 string literals from their `ParseError` object literals, leaving `code` and `position` on every one of them completely unchanged.
- Reason: dead, unreachable-by-any-consumer static text is exactly the "unnecessary shipped reachability" this gate exists to remove, and removing it changes zero observable behavior — the `ParseErrorCode` union (all 8 codes), the caret `position` on every error, and the "typed `ParseError` with caret position" contract MASTER-ROADMAP's WS6.2 spec requires are untouched. The remaining `detail` values in the file (unchanged) are cheap echoes of already-parsed token data (`keyTok.value`, `methodName`, the 3-character literal `'nth'`), not authored prose, so they were left alone as legitimately near-zero-cost.
- Bundle delta: **Δ −325 B** (`content.js` 31,800 B → 31,471 B; total 293,678 B → 293,353 B).
- Tests: all 42 `test/parser.test.ts` + 12 `test/verifier.test.ts` (54 total) pass unchanged — none of them ever asserted on `.detail`'s content, confirming the removal changes no test-observable behavior. `pnpm -r typecheck`: PASS.
- Outcome: **retained**.

**Investigated, not pursued — a small pre-existing CSS-string-escaping duplication.** `resolver.ts`'s private `escapeCssStringLiteral` (used by `resolveStep`'s placeholder/altText/title/testId branches, now reachable from `content.ts` for the first time via WS6.2) is logically identical, character for character, to the extension's own `dom-read.ts::escapeAttrValue`. `dom-read.ts`'s own doc comment explains this was a deliberate second copy, because before WS6.2 the content-script boundary had no path to import a runtime helper from the pure domain package's internals (it was not exported). WS6.2 makes `resolver.ts` reachable from `content.ts` for the first time, so that justification is now stale — but closing the duplication would mean adding a new public export to `locator-engine`'s barrel and editing `dom-read.ts`, a file outside this gate's authorised WS6.2 file set, for an estimated well-under-100-byte gain. Documented rather than pursued, per this gate's own "no broad refactoring" instruction and the poor size-to-risk ratio.

## 4. Functionality Preservation

- Parser: all 7 `getBy*` factories (role/text/label/placeholder/altText/title/testId), optional `page.` prefix, chaining, options (name/exact/checked/pressed/selected/expanded/disabled/level), string and regex literals, escaped strings, commas inside arguments, and `.nth(n)` — unchanged. All 8 `ParseErrorCode` values still returned with exact caret `position` on every error.
- Verifier: all 6 `VerificationStatus` states (verified/not-found/ambiguous/invalid/unsupported/unverifiable) — unchanged, `classifyVerification` untouched.
- `.filter(...)`, `page.frameLocator(...)`, and `.locator(...)` remain deliberately rejected as `UNSUPPORTED_METHOD` — untouched.
- `VerifyLocatorPanel`: unchanged — same props, same accessibility contract, same mounting in both panels.
- Security: `parser.ts`'s standing security-guard test (greps the module source for `eval(`, `new Function`, dynamic `import(`) re-run and passes; no security-relevant line was touched.
- Playwright semantics: unchanged — `resolveChain`/`resolveStep` were not modified.

## 5. Architecture

- R2 (dependency direction one-way): **PASS**, unchanged.
- R3 (locator-engine browser-independent): **PASS**, unchanged.
- R5 (`ui/` stays out of `browser/`/`runtime/`): **PASS**, unchanged.
- `test/architecture.test.ts`: 7/7. `test/devtools-architecture.test.ts`: 18/18. Both re-run explicitly for this report.

## 6. Tests

- Before: 938 tests / 40 files.
- After: **938 tests / 40 files — unchanged.** No test added, none removed, none weakened.
- Targeted: `test/parser.test.ts` (42) + `test/verifier.test.ts` (12) re-run in isolation after the `detail`-string removal — 54/54 pass.
- Full verification: `pnpm verify` (build + typecheck + lint + test + format:check) — all green except the pre-existing, untouched `ws2-item9-report.md` format exception.

## 7. Bundle

- original WS6.2 baseline (pre-DL-56): 282,102 B
- optimization baseline (DL-56, start of this gate): 293,678 B
- final: **293,353 B**
- total WS6.2 delta (282,102 → 293,353): +11,251 B
- optimization delta (this gate only): **−325 B**
- distance from 278,760 B ceiling: **14,593 B**
- percentage over ceiling: **5.24%** (down from 5.35%)

## 8. Security

- `eval`: NO
- `new Function`: NO
- unsafe dynamic import: NO
- arbitrary execution: NO

(Re-confirmed by re-running `parser.ts`'s standing security-guard test and `verify-locator-panel.test.ts`'s `content.ts` guard; neither file's security-relevant code was touched by this pass.)

## 9. Documentation

- `ProgressDocument/DECISION-LOG.md` — new **DL-57** entry.
- `ProgressDocument/CURRENT-STATE.md` — Updated line, WS6.2 checkpoint row.
- `ProgressDocument/MASTER-ROADMAP.md` — WS6 status callout, WS6.2 bullet, executive summary, §30 dashboard row, closing paragraph.
- `ProgressDocument/PROGRESS.md` — Updated line, CURRENT MILESTONE line, new milestone-history row, new narrative section.

No historical decision (DL-1 through DL-56) was rewritten.

## 10. Backup / Delivery

**Backup** — `/home/claude/backups/ws6-2-bundle-reduction-2026-09-03.zip`, containing only the files this gate changed: `packages/locator-engine/src/parser.ts` and the 4 updated `ProgressDocument/*.md` docs. `locator-engine/package.json` is not included — its `sideEffects: false` edit was reverted, so the file is byte-identical to its DL-56 state.

**Delivery** — attempted to the connected folder (`E:\Codes\playwrightguru`) via the device bridge, if still available at report time; see the delivery confirmation in the accompanying chat message. Not claimed here in advance of that confirmation.

No git commit is claimed — no git repository is present in this cloud environment (confirmed: `git status` → `fatal: not a git repository`), matching every prior pass's precedent.

## 11. Remaining Debt

- **Bundle: still 14,593 B (5.24%) over the locked 278,760 B ceiling.** This is the sole remaining item. Investigation found no dependency bloat, no cross-module duplication, and no un-shaken barrel reachability left to remove without either cutting genuine WS6.2 functionality (explicitly forbidden by this gate) or expanding scope beyond this gate's WS6.2-only authorisation (the CSS-escape dedup in §3 is the only further lead identified, and it is small and out of scope). A larger reduction, if the project owner wants one, would need either an architecture-level change (e.g., exporting a slimmer verify-only entry point from `locator-engine` so the content script does not pull in `resolver.ts`'s full module, or moving verification execution behind a different boundary) — outside this gate's "surgical optimization, no architecture rewrite" mandate — or accepting the overage.
- No real-Chromium/e2e regression infrastructure exists anywhere in this repo (pre-existing, DL-54/DL-55, untouched by this gate).
- All WS6.2 functional debt (leaf-first extraction untouched, `.filter()`/`page.frameLocator()` unsupported by design, `PickSource`/`CommandBus` unchanged) is unchanged from DL-56 — none of it was in this gate's scope.

## 12. Final Status

**WS6.2 PARTIAL — BUNDLE STILL OVER CEILING**
