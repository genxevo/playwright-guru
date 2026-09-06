# WS6.2.1 VERIFY-PATH DEPENDENCY ISOLATION — FINAL REPORT

## 1. Baseline

- Measured before any change: build/typecheck/lint/test/format-check all run and inspected directly.
- Tests: **938 / 40 files**, all passing.
- Bundle: **293,353 B** (exact, matches the expected DL-57 baseline — no discrepancy found, so no investigation of a mismatch was needed).
- content.js: **31,471 B**.
- Ceiling: 278,760 B (LOCKED).
- Excess: 14,593 B (5.24%).
- R2/R3/R5: confirmed passing via `test/architecture.test.ts` (7/7) and `test/devtools-architecture.test.ts` (18/18).
- Security guards: `parser.ts`'s standing security-guard test confirmed passing.
- Format exception: `ws2-item9-report.md` — confirmed still present, pre-existing, untouched.
- No git repository is present in this cloud environment (`git status` → `fatal: not a git repository`) — no commit is claimed anywhere in this report.

## 2. Dependency Graph Finding

Read `resolver.ts`, `verifier.ts`, `parser.ts`, `index.ts`, `content.ts`, `messaging.ts`, and — critically — `packages/extension/src/runtime/capture.ts` and `fact-model.ts` in full, not snippets, to build the actual (not inferred) dependency graph.

**The decisive finding:** `capture.ts`'s `resolveCandidates()` — called by `capturePick()`, which `content.ts`'s picker invokes on every element click, a WS3-era feature entirely independent of WS6.2 — already imports and calls `resolveStep` directly from `@playwright-guru/locator-engine` (three call sites: unscoped candidate resolution, scoped ancestor resolution, and `findUniqueAncestor`'s uniqueness check). This means `resolver.ts`'s `resolveStep` function and its complete private dependency chain (`fromProbeCount`, `escapeCssStringLiteral`, `TEST_ID_ATTRIBUTES`, `textModeFor`, `unresolved`, plus `rationale.ts`'s `verdictFor`/`PREMIUM_KINDS` and `probe.ts`'s `UNKNOWN_MATCH_COUNT`) were **already bundled into `content.js` before WS6.2 ever existed**.

This corrects an imprecision in DL-56/DL-57's root-cause framing, which described `resolver.ts` as newly reachable from `content.ts` via WS6.2. In fact only `verifier.ts`'s import of `resolveChain` — a thin wrapper (a for-loop calling the already-present `resolveStep`, plus `.nth()` handling) — is genuinely new to `content.js`.

Classification of the dependency graph per the gate's own taxonomy:

- `resolveStep` and its helpers: **(C) required only by another resolver feature (Pick)** — already shipped, zero marginal WS6.2 cost.
- `resolveChain`: **(A) required by verification** — genuinely new, but small (a thin wrapper over already-present logic).
- `parser.ts`: **(A) required by verification** — genuinely new, the dominant cost, and irreducible (it is the feature itself).
- `verifier.ts`: **(A) required by verification** — genuinely new, small.
- Everything else in the `@playwright-guru/locator-engine` barrel (`recommendation.ts`, `ranking.ts`, `scorer.ts`, `accessibility.ts`, `facts.ts`, `snapshot.ts`, `matching.ts`, `engine.ts`): **(F) dead/unreachable from `content.js`** — confirmed absent by DL-57's marker grep, re-confirmed here.

As a side finding: DL-57's identified CSS-escaping duplication (`resolver.ts::escapeCssStringLiteral` vs. `dom-read.ts::escapeAttrValue`) likely predates WS6.2 entirely, since `escapeCssStringLiteral` is reachable via `capture.ts` whenever a placeholder/altText/title/testId candidate step is built — independent of verification. This does not change DL-57's decision not to pursue it (still small, still out of this gate's file scope) — only the attribution of when it became live.

## 3. Architecture Considered

- **Approach A (extract minimal resolution core):** investigated and rejected. `resolver.ts` already contains exactly `resolveStep` + `resolveChain` + their private helpers, and nothing else — confirmed by full source reading and by DL-57's grep showing no `recommendation.ts`/`ranking.ts`/`scorer.ts` content lives there or leaks into `content.js`. It already IS the minimal, single-purpose "verify-specific" module this approach would try to create. There is nothing to extract.
- **Approach B (slim `locator-engine/verify` entry point):** investigated and rejected. Since `resolver.ts` is already minimal and Rollup's tree-shaking already correctly excludes everything unused (DL-57), a narrower package entry point would export exactly the same already-tree-shaken graph. No benefit.
- **Approach C (split mixed-responsibility resolver module):** not applicable — `resolver.ts` is not mixed-responsibility; it has exactly one responsibility (step/chain resolution) and no unrelated logic to split off.
- **Approach D:** none found. The repository does not reveal a better evidence-based solution than the ones above.

## 4. Implementation

**No implementation was retained.** A single diagnostic, non-shipping build experiment was performed to test the dependency-graph hypothesis directly rather than by inference:

1. `content.ts` was backed up to `/tmp/content.ts.orig.bak`.
2. Its `VerifyLocatorExpressionMessage` type import, the `verifyLocatorExpression` runtime import, the `VERIFY_LOCATOR_EXPRESSION` switch case, and the `handleVerifyLocatorExpression` function were removed.
3. The extension was rebuilt and `content.js` measured.
4. `content.ts` was restored from the backup and confirmed **byte-for-byte identical** to its pre-experiment state via `diff` (zero differences reported).
5. The extension was rebuilt again and the bundle confirmed back at the exact baseline (293,353 B / content.js 31,471 B).

No other file was edited during this gate. No code change survives this report.

## 5. Bundle Measurements

| Measurement  | With WS6.2 wiring (shipped) | Without WS6.2 wiring (diagnostic only) | Marginal cost |
| ------------ | --------------------------- | -------------------------------------- | ------------- |
| content.js   | 31,471 B                    | 24,712 B                               | **6,759 B**   |
| Total bundle | 293,353 B                   | 286,594 B                              | **6,759 B**   |

The marginal cost matches exactly between content.js and the total, confirming only content.js was affected by the experiment (no cross-chunk leakage). This 6,759 B is the true, irreducible cost of WS6.2's content-script-side wiring — smaller than DL-56's original ~7.09 kB estimate (which over-attributed cost to `resolver.ts` as a whole), and consisting almost entirely of the hand-rolled parser plus `verifier.ts`'s thin classification logic plus the message handler.

Final state (after reverting the diagnostic experiment):

- content.js: **31,471 B** (unchanged from DL-57).
- Total bundle: **293,353 B** (unchanged from DL-57).
- Panel/shared chunks: unchanged (this gate never touched the panel side) — `sidepanel-*.js` 33.43 kB, `devtools-panel-*.js` 24.2 kB, `tokens-*.js` 49.35 kB.

## 6. Functionality Preservation

Nothing changed. All 7 `getBy*` kinds, chaining, options, string/regex literals, `.nth(n)`, all 8 `ParseErrorCode` values, all 6 `VerificationStatus` states, `.filter(...)`/`page.frameLocator(...)` rejection, and `VerifyLocatorPanel`'s behavior are exactly as DL-57 left them — confirmed by the fact that `content.ts` was restored byte-for-byte and every other file was untouched.

## 7. Tests

- Before: 938 tests / 40 files.
- After: **938 tests / 40 files — unchanged.**
- Full suite re-run after the revert: PASS.

## 8. Architecture Guards

- R2: **PASS** (`test/architecture.test.ts`, re-run).
- R3: **PASS** (`test/architecture.test.ts`, re-run).
- R5: **PASS** (`test/verify-locator-panel.test.ts`'s R5 guard, re-run).
- `test/devtools-architecture.test.ts`: 18/18, re-run.
- Parser security-guard test: 3/3, re-run explicitly.
- `verify-locator-panel.test.ts`'s `content.ts` eval/`new Function` guard: re-run, passing.

## 9. Security

- eval: NO
- new Function: NO
- unsafe dynamic import: NO
- arbitrary execution: NO

No security-relevant code was touched by this gate (the diagnostic experiment only removed and restored wiring; it never introduced any new code path).

## 10. Documentation

- `ProgressDocument/DECISION-LOG.md` — new **DL-58** entry.
- `ProgressDocument/CURRENT-STATE.md` — Updated line, WS6.2 checkpoint row.
- `ProgressDocument/MASTER-ROADMAP.md` — WS6 status callout, WS6.2 bullet, executive summary, §30 dashboard row, closing paragraph.
- `ProgressDocument/PROGRESS.md` — Updated line, CURRENT MILESTONE line, new milestone-history row, new narrative section.

No historical decision (DL-1 through DL-57) was rewritten.

## 11. Backup / Delivery

**Backup** — `/home/claude/backups/ws6-2-1-verify-path-dependency-isolation-2026-09-03.zip`, containing only the 4 updated `ProgressDocument/*.md` docs. No source file is included: `content.ts` was restored to its exact DL-57 state, so it is byte-identical and not part of this gate's changed-file set.

**Delivery** — attempted to the connected folder (`E:\Codes\playwrightguru`) via the device bridge, if still available at report time; see the delivery confirmation in the accompanying chat message. Not claimed here in advance of that confirmation.

No git commit is claimed — no git repository is present in this cloud environment.

## 12. Remaining Debt

- **Bundle: still 14,593 B (5.24%) over the locked 278,760 B ceiling, unchanged.** This gate confirms, by direct build-graph experiment rather than assumption, that the remaining gap is genuine irreducible WS6.2 functionality (the parser, 6,759 B of true marginal cost) — not a dependency-isolation opportunity. Closing it further would require either cutting parser functionality (explicitly forbidden) or a broader architecture change to how `content.ts` reaches `LiveDomProbe`/the resolver for _both_ Pick and Verify together — out of scope for any surgical, verify-path-only gate so far.
- The small, pre-existing CSS-escaping duplication DL-57 identified (and this gate confirms likely predates WS6.2) remains undisclosed-to-fix — small, out of this gate's file scope, unchanged.
- All other WS6.2/WS5/WS3 debt (leaf-first extraction, `PickSource`/`CommandBus`, `.filter()`/`page.frameLocator()` unsupported by design, no real-Chromium infrastructure) is unchanged and was not touched by this gate.

## 13. Final Status

**WS6.2.1 NO-OP — NO SAFE MEANINGFUL REDUCTION FOUND**
