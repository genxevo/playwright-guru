# WS2 Item 9 — Final Validation / Visual + Theme + Accessibility Polish — Final Report

**Date:** 2026-08-31 · **Workstream:** WS2 (Design System / Shared UI Primitives) · **Item:** 9 of 9 (WS2 exit review) · **Decision:** DL-51

**WS2: Items 1–9 COMPLETE.**

## 1. BEFORE state

- Tests: **776 passed / 27 files**
- Bundle: **276,038 B**
- Cumulative WS2 delta vs 273,760 B baseline: **+2,278 B**
- Headroom vs 278,760 B ceiling: **2,722 B**
- Items 1–8 COMPLETE (DL-43…DL-50).

## 2. Authoritative Item 9 definition

The `ProgressDocument/*.md` files (the actively-maintained, non-stale mirror, consistent with all prior items) defined Item 9 tersely as "WS2 exit review," weighing DL-49's exit-criterion-wording question and DL-50's "dark theme is cosmetic" limitation. Your Phase 1/2 prompts supplied the detailed implementation charter for that review — the same pattern used for every prior item, where the roadmap carries a placeholder and the authorizing prompt defines the actual scope. No conflict found; proceeded under the prompt's rules, as authorized in Phase 2.

## 3. Phase 1 findings

Systematic inspection (hex/var() census, token-consumer audit, contrast measurement of every remaining theme-responsive or dual-role colour) found exactly one still-open, concrete, provable defect and reconfirmed three already-known limitations rather than inventing new scope:

- **Finding 1 (HIGH):** main strategy bar's underline `Tabs` used `tabAccent` for both selected-tab TEXT (needs ≥4.5:1) and the border-bottom indicator (needs ≥3:1) — Playwright `#16a34a` 3.30:1 and XPath `#d97706` 3.19:1 failed as text; CSS `#2563eb` 5.17:1 passed. The exact dual-role conflict DL-49 named.
- **Finding 2 (MEDIUM, documented not fixed):** XPath pill sub-tab's white-on-`#d97706` selected state measures 3.19:1 — the "solid-fill + on-solid text" category tokens.css's own item-1 notes flagged as deferred.
- **Finding 3 (informational):** token audit — only 7 declared tokens have any consumer; the rest (mostly `--pg-color-*` plus spacing/radius/typography) are declared but unused, by design (Item 1's foundation, not a defect).
- **Finding 4 (confirms DL-50):** `--pg-focus-ring` is the only theme-responsive value any panel consumes; dark mode is otherwise fully cosmetic.

## 4. Exact defect fixed

Finding 1: the main strategy bar's selected-tab text contrast failure for Playwright and XPath tabs.

## 5. Exact implementation

- `TabItem<T>` (in `src/ui/primitives.tsx`) gained an optional `textColor?: string` — additive, documented, defaults to `accent` when absent.
- `Tabs`'s underline-variant render: `color: selected ? (t.textColor ?? tabAccent) : '#64748b'` (was `selected ? tabAccent : '#64748b'`). The border-bottom indicator line was **not** touched — it still reads `` `2px solid ${tabAccent}` ``.
- `STRATEGY_TABS` (in `src/ui/strategy-meta.ts`) now supplies `textColor: strategyTextColor('role')` for `playwright` and `textColor: strategyTextColor('testId')` for `xpath`; `css` supplies no `textColor` (its accent already passes as text, and omitting it means zero bytes added for that tab). Both values reuse the **existing** `strategyTextColor()` helper from Item 7/8 — no new colour, no new token.

## 6. Tabs accessibility preservation

Zero change to ARIA structure, keyboard handling, roving tabIndex, or any `SubTabBar`/pill-variant behavior. The `TabItem` interface addition is optional and additive; every existing pill caller (`CSS_SUB_TABS`, `XPATH_SUB_TABS`) never sets `textColor`, so their rendering is provably byte-unaffected — confirmed both by a structural test (the pill branch's style object contains no `textColor` reference) and a render test (`variant='pill'` selected-tab color is unchanged at `#fff`). Items 2–6's accessibility work is otherwise completely untouched.

## 7. Contrast calculations

| Tab | Old (text = accent) | New (text = textColor) |
|---|---|---|
| Playwright | `#16a34a` on white = 3.30:1 (FAIL) | `#166534` on white = 7.13:1 (PASS) |
| XPath | `#d97706` on white = 3.19:1 (FAIL) | `#92400e` on white = 7.09:1 (PASS) |
| CSS | `#2563eb` on white = 5.17:1 (PASS, unchanged) | unchanged |

The border-bottom indicator continues to use the raw `accent` values (`#16a34a`/`#2563eb`/`#d97706`), which clear the WCAG 1.4.11 non-text 3:1 bar unaffected by this fix (3.30/5.17/3.19, all ≥3).

## 8. Deferred XPath pill issue

XPath pill sub-tab selected state (white text on `#d97706` fill, in both panels' `CSS_SUB_TABS`/`XPATH_SUB_TABS` category filters via the pill `Tabs` variant) measures **3.19:1**, below 4.5:1 AA. **Not fixed** — a safe fix requires either darkening an already-shipped pill's brand fill or restructuring its text-color treatment, both visible redesign decisions outside "wire up existing infrastructure" and risking the explicit "not a redesign, no new brand colours" boundary. Measured and pinned by a test (`contrast('#ffffff','#d97706')` ≈3.19, asserted `<4.5`) so it is on permanent record, not silently dropped or silently declared fixed.

## 9. Dark-theme limitation

**Confirmed**, not newly discovered: a full token-consumer audit found `--pg-focus-ring` is the only theme-responsive value either panel actually consumes anywhere. Every other declared `--pg-color-*` token has zero consumers. Dark theme remains functionally cosmetic in the shipped UI. Not attempted this item — same bundle-infeasible wall DL-49 already measured for a full migration.

## 10. Token audit decision

**Confirmed**, not deleted. Only 7 declared tokens (`--pg-focus-ring`, `--pg-font-sans`, `--pg-font-size-base`, and the 4-member `--pg-code-*` family) have any consumer. The rest — nearly the entire `--pg-color-*` family plus spacing/radius/line-height/font-weight/non-base font-size tokens — are declared but unused. This is Item 1's intentional design-system foundation for a future bounded migration, not a defect; no test or requirement calls for removing it, and doing so would only delete the target state a later pass could still reach.

## 11. Tests added/modified

- `test/hex-token-migration.test.ts`: new describe block "item 9: main strategy bar selected-tab TEXT contrast" (RED/GREEN pair + 4 supporting guards: textColor derivation, accent/indicator unchanged, indicator still clears 3:1, no new token form) and "item 9 Finding 2" (pinned XPath-pill measurement + confirms the pill branch has no `textColor` concept).
- `test/tabs.test.ts`: new describe block "Tabs · variant='underline' textColor override (item 9)" — 4 real happy-dom render tests: override applies to text only (border-bottom keeps `accent`), fallback preserves prior behavior exactly when `textColor` is absent, an unselected tab is never colored by it, and the `'pill'` variant is completely unaffected.

Net: 776 → 789 tests (+13: 11 in hex-token-migration.test.ts, 3 in tabs.test.ts — a net of one incidental format-only file, `ws2-item8-report.md`, was also reformatted to get a clean `format:check`, carrying no test-count change).

## 12. Failure-first evidence

The RED test reconstructs the pre-item-9 behavior directly and numerically: `contrast('#16a34a', '#ffffff')` and `contrast('#d97706', '#ffffff')` are both asserted `< 4.5`, proving the old `tabAccent`-as-text approach genuinely fails AA. The GREEN test then asserts the actual exported `STRATEGY_TABS.textColor` values pass `≥ 4.5`. All tests ran against the real, delivered source — no scratch-copy corruption was needed since the RED evidence is a direct numeric reconstruction of the prior (真) values, not a source mutation.

## 13. Production source impact

Confirmed via rebuild + chunk scan:
- `textColor` appears 3 times in the shared `tokens` chunk (the property key + 2 assignments).
- `166534`/`92400e` each appear 4 times (2 existing badge-related + 2 new tab-related).
- Zero `var(--pg-color-*-text)` anywhere (Item 8's fix holds).
- No `showcase` leakage.
- `tokens.css` asset is byte-identical (same md5) — zero CSS touched this item.
- Chunk list unchanged — no new chunk, no new dependency.
- Both panel chunk file sizes are byte-identical to before (only their content-hash filenames changed, since the shared `tokens` chunk they reference changed) — confirms zero panel-file changes.

## 14. `pnpm verify` result

Full run: build PASS, typecheck PASS, lint PASS, test PASS (789/27), format:check PASS. Exit 0, confirmed twice (once after code+test changes, once after documentation changes).

## 15. Test count BEFORE → AFTER

**776 / 27 files → 789 / 27 files**

## 16. Exact bundle BEFORE → AFTER bytes

**276,038 B → 276,093 B**

## 17. Item 9 bundle delta

**+55 B**

## 18. Cumulative WS2 delta

**+2,333 B** vs the 273,760 B baseline (276,093 B)

## 19. Remaining headroom

**2,667 B** vs the 278,760 B ceiling (well within budget; the maximum allowed increase was 2,722 B, and Item 9 used just 55 B of it — 2%)

## 20. Risks / deferred items

1. XPath pill sub-tab contrast (3.19:1) — deferred, documented, pinned by a test, candidate for a future targeted pass if the project owner wants one.
2. Dark theme's cosmetic nature — confirmed limitation, same infeasibility wall as Item 7's full-migration finding; would need a separate, larger workstream.
3. Foundation tokens with zero consumers — confirmed intentional, not a risk, no action needed.
4. `--pg-focus-ring`'s own sub-3:1 contrast in some light-theme contexts (Item 8's finding) — still not retuned; unchanged by Item 9.

No risk to shipped product behavior: this item touched only two files (`primitives.tsx`, `strategy-meta.ts`), both UI-layer; zero locator-engine/codegen/WS5/WS6/ranking/matching/visibility/recommendation/R4/privacy/copy-map changes.

## 21. Documentation changes

- `DECISION-LOG.md`: new DL-51 entry, inserted above DL-50 (newest-first convention). Documents the fix, the deferred/confirmed items, the exit-criterion-wording resolution, and exact figures. DL-49/DL-50 left untouched.
- `CURRENT-STATE.md`, `PROGRESS.md`, `MASTER-ROADMAP.md`: WS2 status changed from "IN PROGRESS" to "COMPLETE" throughout (checkpoint row, CURRENT MILESTONE, milestone table, WS2 section header, budget/exit-criterion/remaining lines, dashboard table row, executive summary, §32 recommended-next-action). Items 1–8 history left unrewritten.

## 22. Backup ZIP

**`ws2-item9-final-validation-2026-08-31.zip`** — created fresh, contains exactly the 8 files changed for Item 9 (`primitives.tsx`, `strategy-meta.ts`, `hex-token-migration.test.ts`, `tabs.test.ts`, and all 4 `ProgressDocument/*.md` files). Does not touch or duplicate any of the 8 prior Item 1–8 ZIPs.

## 23. Device delivery

Delivered to `E:\Codes\playwrightguru` using the established staged mtime-guard discipline: all 8 changed files (pre-existing on the device from prior items) were staged first to capture current mtimes, then committed with `expectedMtimeMs` on every one; the backup ZIP was committed without a guard (new file). **Result: all 9 files written, zero rejected.** `git status` remains unavailable in this environment — stated honestly, not claimed.

## 24. Final WS2 status

**WS2: Items 1–9 COMPLETE.** WS2 exit review (Item 9, DL-51) has been conducted: the DL-49 exit-criterion-wording question is formally resolved (literal "zero hardcoded hex" not met and will not be pursued further; the criterion's operative intent — no AA-contrast defect ships uncaught — is met, with one named, deferred exception). The DL-50 dark-theme limitation is confirmed and on permanent record. WS5 stays PARTIAL, WS6 PARTIALLY DELIVERED, ordering unchanged.

## 25. Exact next step

None started here, per your explicit stop instruction. WS2 is complete; the next step is your authorization for a subsequent workstream (WS3 or otherwise).
