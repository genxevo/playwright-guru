# Playwright Guru — Release Gates

Authority: `MASTER-ROADMAP.md` §11. Nothing ships until its gate is green.

## Gate 0 — WS0 exit ✅ PASSED

Fresh clone runs `install → typecheck → lint → test → build` green · repo verified private ·
a deliberate boundary violation fails lint · 54/54 · CI green on Ubuntu + Windows.

## Gate 1 — TRUTH (v0.1.x blocker)

_Nothing in the UI is a lie._

| #    | Criterion                                                                                                                                         | Status                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1  | No message path can report success without a handler                                                                                              | ✅ done (mirror)                                                                                                                           |
| 1.2  | No visible feature that does nothing (recording gated)                                                                                            | ✅ done (mirror)                                                                                                                           |
| 1.3  | No reliability claim rendered without a measurement behind it                                                                                     | ✅ done (mirror) — DL-15                                                                                                                   |
| 1.4  | One counting semantics, stated (visible-first with total)                                                                                         | ✅ done (mirror) — DL-16                                                                                                                   |
| 1.5  | A render exception cannot produce an unexplained white screen                                                                                     | ✅ done (mirror) — DL-18                                                                                                                   |
| 1.6  | Extension has icons and declares `minimum_chrome_version: '114'`                                                                                  | 🟡 version ✅ · **icons still blocked**                                                                                                    |
| 1.7  | Store copy claims nothing the smoke matrix has not shown                                                                                          | ⬜                                                                                                                                         |
| 1.8  | Privacy contract protected by an automated test over the built bundle                                                                             | ✅ done (mirror) — found and removed a real `fetch`, DL-14                                                                                 |
| 1.9  | Release artifact validated from `packages/extension/.output/chrome-mv3` — manifest at ZIP root, no nesting, no `node_modules`, no source, no maps | ✅ automated — `scripts/validate-package.mjs`                                                                                              |
| 1.10 | Manual smoke matrix executed and recorded honestly                                                                                                | 🟡 **Side-Panel rows executed** via 24-screenshot capture (2026-08-30, PASS); DevTools/Verify/privacy/language rows still **NOT EXECUTED** |
| 1.11 | Clean-clone build loads unpacked                                                                                                                  | 🟡 extension **loaded & ran in real Chrome** (2026-08-30, no runtime error on fresh load); clean-**clone** build still requires user       |

## Gate 2 — PLAYWRIGHT FIDELITY (v0.1.x blocker)

_Guru agrees with Playwright wherever it claims Playwright behaviour._

| #   | Criterion                                                                   | Status                                                                                                  |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 2.1 | `accessibility.ts` has direct unit coverage                                 | ✅ 51 conformance tests + `accessibility.test.ts` (32, WS1) — `computeAccessibleName`/`getImplicitRole` |
| 2.2 | `scorer.ts` has direct unit coverage                                        | ✅ 20 ranking tests + `scorer.test.ts` (16, WS1) — `buildCandidateSteps`/`pickBestUnique`               |
| 2.3 | `engine.ts` has direct unit coverage                                        | ✅ `engine.test.ts` (20, WS1) — was zero direct coverage (F-8)                                          |
| 2.4 | E5 closed — date/time/month/week; listbox vs combobox                       | ✅                                                                                                      |
| 2.5 | E2 closed **on the live path** (`content.ts`), not only in an unused helper | ✅ wired into `countStepMatches`                                                                        |
| 2.6 | N-1 `file` → button                                                         | ✅                                                                                                      |
| 2.7 | N-2 datalist → combobox                                                     | ✅                                                                                                      |
| 2.8 | **Ranking policy decided, implemented, and pinned by tests**                | ✅ DL-21, DL-22                                                                                         |
| 2.9 | Conformance corpus green in CI                                              | ✅ 39 role + 8 label fixtures, Playwright 1.62.1                                                        |

## Gate 3 — VISIBILITY (v0.1.x target, not a hard blocker)

| #   | Criterion                                            | Status |
| --- | ---------------------------------------------------- | ------ |
| 3.1 | One recommendation presented as _the_ recommendation | ⬜     |
| 3.2 | Verdict words replace numeric scores                 | ⬜     |
| 3.3 | "Why this locator?" renders from rationale codes     | ⬜     |
| 3.4 | Ancestor-scoped chaining visible where it applies    | ⬜     |
| 3.5 | `.nth()` shown honestly as a compromise              | ⬜     |
| 3.6 | `frameLocator()` made visible                        | ⬜     |

## Gate 4 — v0.1.x PUBLISH

Gates 1 and 2 fully green · Gate 3 substantially green · privacy policy hosted at a real URL ·
5 screenshots showing only verified behaviour · distribution set to **Unlisted** ·
reviewer notes prepared. **Publishing is PAUSED until explicitly resumed.**

## Gate 5 — Trustworthy Core (internal, NOT a public 1.0)

WS6 + WS7 complete. Nothing shown to the user is unverified. **Per D11 this is a quality gate to
validate against, never a ship date.**

## Gate 6 — v1.0.0 (WS11)

Every WS0–WS10 exit criterion still green · WS9/WS10 surfaces pass the WS8 gates · axe-core clean ·
benchmarks green · packaged build loads from a clean clone · every permission justified in writing.

## Gate 5 — WS5 exit (DevTools consolidation) ✅ PASSED (mirror) · manual pending

_One implementation of locator intelligence, consumed by every surface._

| #   | Criterion                                                                       | Status                                                                                                         |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 5.1 | `EVAL_SCRIPT` deleted, not patched                                              | ✅ — audit finds zero occurrences                                                                              |
| 5.2 | All three DevTools visibility/role duplicates removed (DL-25 as amended)        | ✅ — DL-28                                                                                                     |
| 5.3 | DevTools and Side Panel render the same `StoredPick` from one `buildScoredPick` | ✅ — asserted, exactly one builder                                                                             |
| 5.4 | No second resolver, predicate, role mapper, scorer or ranking introduced        | ✅ — repository-wide audit clean                                                                               |
| 5.5 | Stage 2 visibility predicates and golden unchanged                              | ✅ — staleness ratchet still green                                                                             |
| 5.6 | Strategy ranking and `uniqueCount` semantics unchanged                          | ✅ — 17 ranking tests untouched                                                                                |
| 5.7 | E3 ratchet replaced by a positive architectural assertion, not deleted          | ✅ — DL-29, 16 tests                                                                                           |
| 5.8 | Privacy: no network API in the shipped bundle                                   | ✅ — bundle scan clean                                                                                         |
| 5.9 | Manual Chrome smoke of the new DevTools path                                    | ⬜ **NOT EXECUTED** — S5-1…S5-7 (the 24-screenshot capture is Side-Panel only; DevTools surface not exercised) |

## Gate DL-21 — Recommended locator surfacing ✅ PASSED (mirror) · manual pending

_The product tells the user which locator to use, and only what it can prove._

| #    | Criterion                                                                 | Status                                                                                                                                   |
| ---- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 21.1 | Exactly one recommendation-selection path, in the engine                  | ✅ — `recommendLocator`, 1 definition                                                                                                    |
| 21.2 | Neither panel ranks, scores or picks a best candidate                     | ✅ — asserted on both sources                                                                                                            |
| 21.3 | Both surfaces render the same recommendation from the same `StoredPick`   | ✅ — same call, same argument                                                                                                            |
| 21.4 | No recommendation is fabricated when none qualifies                       | ✅ — `null` + coded reason                                                                                                               |
| 21.5 | A visible-1 / total-2 candidate is never recommended                      | ✅ — `resolvesUniquely`                                                                                                                  |
| 21.6 | The card claims no verification, reliability or stability                 | ✅ — copy asserted word-by-word                                                                                                          |
| 21.7 | `PLAYWRIGHT_STRATEGY_ORDER`, `scoreCandidate`, `pickBestUnique` unchanged | ✅ — untouched, 17 ranking tests green                                                                                                   |
| 21.8 | The seven-strategy comparison remains available on both surfaces          | ✅ — asserted                                                                                                                            |
| 21.9 | Manual Chrome smoke of the Recommended card                               | 🟡 Side-Panel R-1/R-2/R-3/R-6/R-7 **PASS** (2026-08-30); R-4 (`mm/dd/yyyy`), R-5 (DevTools), R-8 (`+Code` append) still **NOT EXECUTED** |
