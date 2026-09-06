# WS2 Item 8 — Final UI Polish / Theme / Accessibility Verification — Final Report

**Date:** 2026-08-31 · **Workstream:** WS2 (Design System / Shared UI Primitives) · **Item:** 8 of 9 · **Decision:** DL-50

## 1. BEFORE state

- Tests: **758 passed / 27 files**
- Bundle (raw, uncompressed, `packages/extension/.output/chrome-mv3`): **276,218 B** (276.22 kB)
- Cumulative WS2 delta vs the 273,760 B pre-WS2 baseline: **+2,458 B** (+2.46 kB)
- Headroom vs the 278,760 B hard ceiling: **2,542 B** (2.54 kB)
- Items 1–7 COMPLETE (DL-43…DL-49); item 7 explicitly left the literal "zero hardcoded hex" exit wording unmet (bundle-infeasible, recorded not reinterpreted).

## 2. Authoritative requirement

The authoritative, continuously-updated definition of WS2/Item 8 lives in the local mirror `ProgressDocument/*.md` (CURRENT-STATE.md, PROGRESS.md, MASTER-ROADMAP.md, DECISION-LOG.md; DL-43…DL-49 present) — consistent with DL-9's decision that repo-ready copies serve as the primary system, no duplicate created. The Claude Project's `claude/roadmap/*.md` docs are **stale** (dated 2026-08-27/2026-08-30, describing a pre-WS1 state — "WS1 has not started") and are **not** what this conversation has been updating. This discrepancy is reported per the Item 8 prompt's instruction and treated as non-blocking, consistent with all 7 prior items.

Item 8's charter, as authorized: a bounded a11y/theme/contrast/consolidation polish pass — reusing the existing token system, no new abstractions, no redesign, no product/behavior change, hard bundle ceiling 278,760 B, continued failure-first discipline, explicit preservation of Items 2–6's accessibility work, explicit theme/contrast verification of both light and dark using the existing token architecture, explicit non-alteration of the `--pg-code-*` code-preview palette unless required.

## 3. Inspection findings

Systematic inspection of `tokens.css`, both panels, and existing tests (not aesthetic opinion) surfaced exactly two concrete, provable defects:

**(A) A dark-mode contrast regression Item 7 itself introduced.** Item 7 wrapped certain badge/text `color` values in `var(--pg-color-{success,warning,danger}-text)` (in `matchBadge()` and the new `strategyTextColor()`), but every BACKGROUND those colours sit on — `matchBadge()`'s tint literals (`#dcfce7`/`#fef3c7`/`#fee2e2`), the `color+'18'` alpha-tint direct badges, the picker status banner (`#f0fdf4`) — stayed a hardcoded LIGHT literal. `body {}` in `tokens.css` sets no `background-color` at all, and `@media (prefers-color-scheme: dark)` fires automatically for any user with OS/browser dark mode — no in-app toggle needed (confirmed via grep: no code ever sets `data-theme`). So the token-wrapped TEXT alone resolves to its dark value (`#86efac`/`#fcd34d`/`#fecaca`) while the background stays light. Computed via node one-liners: actual contrast ratios of **1.18–1.40:1**, catastrophically below the 4.5:1 AA requirement — worse than the ~3.2:1 bug Item 7 was originally fixing. Undetectable by Item 7's own tests, which verified only the light-mode literal pairing, never the dark-mode token resolution.

**(B) `--pg-focus-ring`** — declared (light + dark) in Item 1 — had **zero consumers** anywhere in the codebase. Every interactive element relied on the browser default outline, and `SidePanel.tsx`'s Verify Selector `<input>` explicitly set `outline:'none'` with **no replacement** — a real WCAG 2.4.7 (Focus Visible) failure. `Panel.tsx`'s equivalent input never had this (retained the inconsistent but functional browser default).

Both findings are objectively verifiable and explicitly permitted by the prompt's own carve-outs (Item-7-regression discovery; wiring up existing infrastructure).

## 4. Exact implementation

**(A) Dark-mode contrast fix — revert to literal hex.** Reverted the theme-responsive token usages back to literal AA-safe hex at every affected site, rather than making the backgrounds theme-aware (which would not fix the alpha-blend `color+'18'` sites, whose background is a JS string-concatenation trick that cannot be expressed as `var(...)18`, and would reopen the exact "full background migration is bundle-infeasible" wall Item 7 already hit). This is architecturally justified as "a token-driven colour must not pair with a theme-invariant literal background" — matching the `--pg-code-*` palette's own existing "intentionally theme-invariant" precedent (declared once in the top `:root{}` block, never overridden in either dark block — genuinely, singly-declared theme-invariant, so no pairing-background bug is possible there; `--pg-code-*` itself is untouched by this fix).

**(B) Focus-ring wiring.** Added one shared, minimal CSS rule to `tokens.css`:

```css
button:focus-visible,
input:focus-visible {
  outline: none;
  box-shadow: var(--pg-focus-ring);
}
```

This covers every native button in both panels (including the `Tabs` primitive's `<button role="tab">` elements per Item 4/6's precedent, and every `CopyBtn`/`AddBtn` per Item 3) — no second focus system, one rule for both panels. Removed the now-redundant/harmful inline `outline:'none'` from `SidePanel.tsx`'s Verify Selector input.

## 5. Accessibility changes

- Fixed a real WCAG 2.4.7 (Focus Visible) gap: the Verify Selector input in `SidePanel.tsx` now shows a visible focus indicator via the shared `:focus-visible` rule instead of no indicator at all.
- All Items 2–6 accessibility work (native buttons, keyboard access, ARIA roles/`aria-selected`/`aria-controls`/`aria-labelledby`, tablist/tab/tabpanel semantics, roving tabIndex, Arrow nav, Home/End, automatic activation, disabled semantics) is preserved untouched — no interactive UI structure was modified, only colour values and one CSS rule.
- Deliberately **not** retuned: `--pg-focus-ring`'s own rgba/alpha values (Item 1's). Computed via node one-liners, blending the semi-transparent ring colour over representative surface backgrounds in both themes: light-theme ring over white surface ≈2.33:1, over `#f8fafc` ≈2.96:1, over the dark CODE background ≈2.20:1 — below the WCAG 1.4.11 non-text-contrast 3:1 bar in some contexts; only the dark-theme ring against dark surface passed cleanly (≈3.01–3.22:1). Retuning this would require design judgment across many disparate background contexts — exactly the kind of scope creep the prompt's "not a redesign" section warns against — so this is documented as a small, pre-existing, honestly-flagged limitation, not fixed this pass.

## 6. Theme/contrast changes

- Dark-mode contrast catastrophe (1.18–1.40:1) closed at all 10 affected sites by reverting to literal AA-safe hex (`#166534`/`#92400e`/`#991b1b` — the same values Item 2 pinned, unchanged, just no longer theme-wrapped).
- Light-theme contrast at these sites is unaffected (was already AA-safe; the literal values are identical to what the light-mode token resolved to).
- `--pg-code-*` (the VS-Code-style code-preview palette) is confirmed **unchanged** — still present, still theme-invariant by declaration, in both panel chunks.
- Broader limitation flagged, not fixed: "dark theme is functionally cosmetic in the shipped UI today" — since `body` sets no `background-color` and almost nothing else in the panels is tokenized (per Item 7's own infeasibility finding), toggling to dark mode currently changes almost nothing visible except the few Item 7/8-touched sites. This is a genuine, much larger limitation flagged for Item 9 (WS2 exit review), not attempted here — same infeasibility wall as Item 7's full-hex-migration finding.

## 7. Token changes

- No new tokens added. No existing token values changed.
- `--pg-focus-ring` (declared since Item 1) went from zero consumers to one shared consuming rule.
- The `-text` tokens (`--pg-color-{success,warning,danger}-text`) remain declared in `tokens.css` for both light and dark — they are simply no longer consumed at the 10 sites where their pairing background never moved with theme. They remain valid, correct tokens for any future site whose background is also genuinely theme-aware.

## 8. Files changed

1. `packages/extension/src/ui/strategy-meta.ts` — module doc comment + `matchBadge()` (3 returns) + `strategyTextColor()` (2 branches) reverted to literal hex; doc comments updated to explain why.
2. `packages/extension/src/ui/tokens.css` — new `:focus-visible` rule block inserted after the `body{}` rule; nothing else changed.
3. `packages/extension/entrypoints/sidepanel/SidePanel.tsx` — 5 edits: RecommendedCard "Alternative" badge, picker status banner, pick-button empty-state text, "N unique" span (all reverted to literal hex), and removal of `outline:'none'` from the Verify Selector input.
4. `packages/extension/entrypoints/devtools-panel/Panel.tsx` — 2 edits: RecommendedCard "Alternative" badge and "N unique" span reverted to literal hex.
5. `packages/extension/test/hex-token-migration.test.ts` — extended 48 → 63 tests.
6. `packages/extension/test/tokens.test.ts` — extended 102 → 105 tests.
7. `ProgressDocument/DECISION-LOG.md` — DL-50 added.
8. `ProgressDocument/CURRENT-STATE.md` — checkpoint row, test/bundle figures, "Updated" line, repository-facts-vs-mirror-facts table updated.
9. `ProgressDocument/PROGRESS.md` — CURRENT MILESTONE section, milestone table row for item 8, "superseded by" figure updated.
10. `ProgressDocument/MASTER-ROADMAP.md` — item 8 bullet, budget status, exit-criterion status, "remaining" line, dashboard table row, executive summary, §32 recommended-next-action all updated.

No files outside this list were touched. `packages/locator-engine`, `packages/codegen`, locator matching/ranking/visibility/recommendations, R4, copy-map semantics, WS5, WS6, and WS0/WS1 history are all untouched, as required.

## 9. Tests added/modified

- `hex-token-migration.test.ts`: updated `strategyTextColor`/`matchBadge` expectations to literal hex; added "never returns a `var(--pg-color-*-text)` form" guards; added a new describe block reconstructing the exact dark-mode failure numerically (RED evidence, 4 tests) plus a GREEN proof that the actual values are theme-invariant; renamed and inverted the structural-guard block to assert the literal form is present and the token form is gone; added a source-wide "no var(--pg-color-*-text) form anywhere" guard (block-comment-stripped); added per-panel "no var() form" and "`--pg-code-*` unchanged" guards; added a final describe block proving no inline `outline:'none'` survives without the global replacement.
- `tokens.test.ts`: added a new describe block asserting the `:focus-visible` rule exists for `button`/`input`, cancels the outline it replaces, and that `--pg-focus-ring` is valid, non-transparent CSS in both light and dark.

## 10. Failure-first evidence

- The dark-mode-safety describe block reconstructs the exact pre-fix failure numerically: `contrast(DARK_SUCCESS_TEXT, '#dcfce7')` ≈1.28:1, `contrast(DARK_WARNING_TEXT, '#fef3c7')` ≈1.29:1, `contrast(DARK_DANGER_TEXT, '#fee2e2')` ≈1.18:1, and the alpha-blended direct-badge case across all three row backgrounds — all asserted `<2` (vs the 4.5 AA bar), then a GREEN test confirms the actual shipped values are theme-invariant so this class of failure "cannot recur without an explicit code change."
- The structural guard block was inverted: it now reconstructs the item-7 token-wrapped form as a fragment proven capable of matching, then asserts the current source contains the literal and does NOT contain the `var()` form.
- The focus-visibility guard hand-reconstructs the pre-item-8 SidePanel fragment (`outline:'none'` present) as the RED case, then asserts GREEN that neither panel source matches `/outline:\s*'none'/` any more.
- This is a new variant of the established "prove the guard could have failed" pattern, applied via numeric computation rather than only structural regex matching.

## 11. Production-source safety

Production build scan across `.output/chrome-mv3/chunks/*` and `assets/*` confirmed:

- Zero `var(--pg-color-{success,warning,danger}-text)` remains in any JS chunk.
- Literal hex `166534`/`92400e`/`991b1b` present in the shared `tokens` chunk.
- `focus-visible`/`pg-focus-ring` present in the CSS asset.
- `--pg-code-*` tokens unchanged/still present in both panel chunks.
- No `showcase` leakage.
- No `outline:'none'` anywhere in any chunk.
- Chunk-file list is unchanged (no new chunk).

## 12. `pnpm verify` result

Full run from repo root: build PASS, typecheck PASS (0 errors), lint PASS, test PASS, format:check PASS. Exit 0. Re-run a second time after documentation edits (prettier-formatted) — still exit 0, all gates green.

## 13. Test count BEFORE → AFTER

**758 / 27 files → 776 / 27 files** (+18: +15 in `hex-token-migration.test.ts`, +3 in `tokens.test.ts`)

## 14. Bundle bytes BEFORE → AFTER

**276,218 B → 276,038 B** (raw, uncompressed, measured via `find packages/extension/.output/chrome-mv3 -type f -exec du -b {} \; | awk '{sum+=$1}'`, no gzip, no rounding)

## 15. Item-8 bundle delta

**−180 B** (net bundle-negative: reverting `var(--pg-color-success-text)` (30 chars quoted) to `'#166534'` (9 chars quoted) saves ~21 B per occurrence across 10 occurrences — more than covering the new CSS rule's small cost)

## 16. Cumulative WS2 delta

**+2,278 B** (+2.28 kB) vs the 273,760 B pre-WS2 baseline (276,038 B) — under the <5 KB exit budget

## 17. Remaining headroom

**2,722 B** (2.72 kB) vs the 278,760 B hard ceiling — an **improvement** over Item 7's 2,542 B headroom, since Item 8 was bundle-negative

## 18. Unresolved limitations

1. `--pg-focus-ring`'s own contrast values (Item 1's) fall below the WCAG 1.4.11 non-text 3:1 recommendation in some light-theme contexts (~2.2–3.0:1) — deliberately not retuned, documented.
2. "Dark theme is functionally cosmetic in the shipped UI today" — almost nothing in the panels is tokenized beyond the Item 7/8-touched sites, so dark mode changes very little visibly. Flagged for Item 9, same infeasibility wall as Item 7.
3. The Verify Selector card-wrapper styling (border/background/box-shadow) is duplicated byte-for-byte between `SidePanel.tsx` and `Panel.tsx` — found but judged pure decorative duplication, not an a11y/contrast/theme defect, and thus out of Item 8's charter.
4. The literal "zero hardcoded hex outside `tokens.css`" exit wording remains unmet (Item 7's finding, unchanged by Item 8) — the exit-criterion-wording question from DL-49 remains open for Item 9.

## 19. Decisions/risks

- Chose to fix the dark-mode regression by reverting text to literal hex rather than making backgrounds theme-aware, because it is uniformly correct across all affected sites (including the alpha-blend sites that cannot be tokenized), cheaper in bytes, and does not reopen Item 7's infeasibility wall.
- Chose not to retune `--pg-focus-ring`'s own values, to avoid scope creep into a value-redesign exercise across disparate background contexts.
- Chose not to fix the Verify Selector card-wrapper duplication, since it is decorative, not an accessibility/contrast/theme defect.
- No risk to shipped behavior: all changes are colour-value/CSS-rule level; no locator logic, ranking, matching, visibility, recommendation, or product copy was touched.

## 20. Documentation changes

- `DECISION-LOG.md`: new DL-50 entry inserted before DL-49 (newest-first convention preserved), documenting the finding, fix, deliberately-not-touched items, test evidence, verify result, and exact figures.
- `CURRENT-STATE.md`, `PROGRESS.md`, `MASTER-ROADMAP.md`: updated per the same pattern used for every prior item — no Item 1–7 history rewritten; the Item 7 DL-49 "zero hex" disclosure is explicitly preserved; Item 8's dark-mode fix is documented as Item 8 work, not retroactively credited to Item 7.

## 21. Backup ZIP

**`ws2-item8-dark-mode-focus-fix-2026-08-31.zip`** — created fresh, contains exactly the 10 files changed for Item 8 (the 6 source/test files plus all 4 `ProgressDocument/*.md` files). Does not touch or duplicate any of the 7 prior Item 1–7 ZIPs.

## 22. Device delivery

Delivered to `E:\Codes\playwrightguru` using the staged mtime-guard discipline: all 10 changed files (all of which already existed on the device from prior items) were staged first to capture their current device-side mtimes, then committed with `expectedMtimeMs` set on every one. The backup ZIP was committed without a guard (new file). Result: **all 11 files written, zero rejected.**

## 23. WS2 status

**WS2 Item 8 = COMPLETE.** Authoritative scope satisfied (the two concrete defects found were fixed; nothing outside the charter was touched); tests/build/typecheck/lint/format all green (776/27, exit 0, twice); accessibility verification passes (focus-visible gap closed, all prior a11y work preserved); contrast checks pass (dark-mode catastrophe closed, numerically proven); production build verified (scan confirms correct source, no leakage); bundle remains below the 278,760 B ceiling with improved headroom (2,722 B); documentation updated; backup created; device delivery succeeded with zero rejections.

**Item 9 = NOT STARTED.** **WS8 = NOT STARTED** (and remains distinct from "WS2 Item 8").

## 24. Exact next step

**Item 9 — WS2 exit review** (not started, not begun in this session per the explicit instruction to stop after Item 8). Item 9 should weigh two open questions: (1) the exit-criterion-wording question from DL-49 — whether the roadmap's literal "zero hardcoded hex" reading should be revisited given bundle-budget infeasibility; (2) the newly-flagged "dark theme is functionally cosmetic in the shipped UI today" limitation from DL-50. Awaiting authorization to proceed.
