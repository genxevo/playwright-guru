# Playwright Guru — Release Gates

Authority: `MASTER-ROADMAP.md` §11. Nothing ships until its gate is green.

## Gate 0 — WS0 exit ✅ PASSED

Fresh clone runs `install → typecheck → lint → test → build` green · repo verified private ·
a deliberate boundary violation fails lint · 54/54 · CI green on Ubuntu + Windows.

## Gate 1 — TRUTH (v0.1.x blocker)

*Nothing in the UI is a lie.*

| # | Criterion | Status |
|---|---|---|
| 1.1 | No message path can report success without a handler | ✅ mirror · ⏸ not placed |
| 1.2 | No visible feature that does nothing (recording gated) | ✅ mirror · ⏸ not placed |
| 1.3 | No reliability claim rendered without a measurement behind it | ⬜ |
| 1.4 | One counting semantics, stated (visible-first with total) | ⬜ |
| 1.5 | A render exception cannot produce an unexplained white screen | ⬜ |
| 1.6 | Extension has icons and declares `minimum_chrome_version: '114'` | ⛔ blocked |
| 1.7 | Store copy claims nothing the smoke matrix has not shown | ⬜ |
| 1.8 | Privacy contract protected by an automated test over the built bundle | ⬜ |
| 1.9 | Release artifact validated from `packages/extension/.output/chrome-mv3` — manifest at ZIP root, no nesting, no `node_modules`, no source, no maps | 🟡 structure validated in mirror |
| 1.10 | Manual smoke matrix executed and recorded honestly (PASS / FAIL / KNOWN LIMITATION / N/A) | ⛔ requires user |
| 1.11 | Clean-clone build loads unpacked | ⛔ requires user |

## Gate 2 — PLAYWRIGHT FIDELITY (v0.1.x blocker)

*Guru agrees with Playwright wherever it claims Playwright behaviour.*

| # | Criterion | Status |
|---|---|---|
| 2.1 | `accessibility.ts` has direct unit coverage | ⬜ |
| 2.2 | `scorer.ts` has direct unit coverage | ⬜ |
| 2.3 | `engine.ts` has direct unit coverage | ⬜ |
| 2.4 | E5 closed — date/time/month/week; listbox vs combobox | ⬜ |
| 2.5 | E2 closed **on the live path** (`content.ts`), not only in an unused helper | ⬜ |
| 2.6 | N-1 `file` → button | ⬜ |
| 2.7 | N-2 datalist → combobox | ⬜ |
| 2.8 | **Ranking policy decided, implemented, and pinned by tests** | ⬜ |
| 2.9 | Conformance corpus (if authorised) green in CI | `NOT AUTHORIZED` |

## Gate 3 — VISIBILITY (v0.1.x target, not a hard blocker)

| # | Criterion | Status |
|---|---|---|
| 3.1 | One recommendation presented as *the* recommendation | ⬜ |
| 3.2 | Verdict words replace numeric scores | ⬜ |
| 3.3 | "Why this locator?" renders from rationale codes | ⬜ |
| 3.4 | Ancestor-scoped chaining visible where it applies | ⬜ |
| 3.5 | `.nth()` shown honestly as a compromise | ⬜ |
| 3.6 | `frameLocator()` made visible | ⬜ |

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
