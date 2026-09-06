# Playwright Guru — v0.1.x Manual Smoke Matrix

**Status: PARTIALLY EXECUTED (2026-08-30).** A real-Chrome capture of **24 Side-Panel
screenshots** (8 elements × Playwright/CSS/XPath tabs) on `playwrightautomation.com/practice.html`
was audited against the live DOM and against **real Playwright 1.62.1 / Chromium 141**. Rows the
capture genuinely demonstrates are recorded **PASS** below; every row it does not exercise stays
**⬜ NOT EXECUTED**. The audit found **zero confirmed bugs** and made **no source change**
(`/home/claude/reports/screenshot-audit.md`). A green build is still not a green smoke test.

**Scope of the capture (what it can and cannot close):** the 24 shots are **Side-Panel** locator
generation only. They do **not** exercise DevTools, Verify Selector, the privacy Network check, the
language switcher, or the `placeholder="mm/dd/yyyy"` dangerous-ambiguity case — those rows remain
NOT EXECUTED and must be confirmed separately.

**Extension runtime (fresh load):** Earlier content-script error did not reproduce after a fresh
extension/page load; evidence is consistent with an orphaned content-script context caused by
extension reload while the page remained open. No source patch made. (Every one of the 24 captures
shows the panel populated and rendering with no `content.js` error.)

**Setup:** `pnpm build` → `chrome://extensions` → Developer mode → _Load unpacked_ →
`packages/extension/.output/chrome-mv3`

Record each row as **PASS** / **FAIL** / **KNOWN LIMITATION** / **N/A** with a one-line note.
Rows marked **PASS (2026-08-30)** were closed by the 24-screenshot capture.

## Core journeys

| #   | Journey                                                | Expected                                                    | Result                                                                                                       |
| --- | ------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Install → toolbar icon → side panel opens              | Panel opens directly (popup is invisible by design)         | ✅ PASS (2026-08-30) — panel open & populated in all 24 captures; toolbar-icon click not separately captured |
| 2   | Inspect → click a button → locator appears             | An idiomatic Playwright locator, correct for the element    | ✅ PASS (2026-08-30) — idiomatic Playwright locators for 8 distinct elements, each correct for its element   |
| 3   | Switch language ×5                                     | TypeScript, JavaScript, Python, Java, C# each idiomatic     | ⬜ not in this set (single language captured)                                                                |
| 4   | Add to code buffer → copy → paste                      | Valid, runnable code                                        | ⬜ `+ Code` control visible on the cards; full buffer/copy/paste round-trip not captured                     |
| 5   | Undo / clear, close and reopen the panel               | State correct and persisted                                 | ⬜ not in this set                                                                                           |
| 6   | DevTools → select in Elements → locator appears        | Panel tracks the Elements selection                         | ⬜ these are Side-Panel captures, not DevTools                                                               |
| 7   | Verify Selector: valid CSS, valid XPath, invalid input | Correct counts; invalid input gives a clear error, no crash | ⬜ Verify not exercised (capture is generation tabs)                                                         |
| 8   | Restricted page (`chrome://extensions`)                | Clear message, no crash                                     | ⬜ not in this set                                                                                           |

## Stage 1 guarantees — the point of this milestone

| #   | Check                                        | Expected                                                                                                                     | Result                                                                                                                       |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 9   | **No Record button anywhere**                | Absent from the side panel toolbar                                                                                           | ✅ PASS (2026-08-30) — no Record control in any capture                                                                      |
| 10  | **No RECORDING banner can appear**           | Never shown under any interaction                                                                                            | ✅ PASS (2026-08-30) — no banner in any capture                                                                              |
| 11  | **CSS/XPath notice visible**                 | _"Syntax reference — built from this element's attributes, not checked against the page"_ above both lists, on both surfaces | ✅ PASS (2026-08-30) — disclaimer present on CSS & XPath tabs across the set (**Side-Panel surface**; DevTools not captured) |
| 12  | **No verdict badges on generated selectors** | `Stable pattern` / `May change` / `Fragile pattern` — no `✓ High`                                                            | ✅ PASS (2026-08-30) — stability hints only (e.g. `Stable pattern`); no `✓ High` anywhere                                    |
| 13  | **Verify reports visible and total**         | e.g. _"✓ 1 visible element matched — unique"_, and _"(3 total, 2 hidden)"_ when they differ                                  | ⬜ Verify not exercised (candidate-badge visible/total transparency IS shown — see rows 33 / R-4)                            |
| 14  | **Counts agree**                             | A candidate badge and Verify report the same visible number for the same selector                                            | ⬜ requires Verify; not exercised                                                                                            |
| 15  | **Side panel and DevTools agree**            | Same element → same counts and same wording on both surfaces                                                                 | ⬜ DevTools surface not captured                                                                                             |
| 16  | **Chrome version floor**                     | `chrome://extensions` shows no compatibility warning on Chrome 114+                                                          | ⬜ `chrome://extensions` not captured (extension did load & run in real Chrome)                                              |

## Stage 2 guarantees — new rows, NOT EXECUTED

Stage 2 changed what the panels display for several element types. These need eyes.

| #   | Check                            | Expected                                                                                                                  | Result                                                                                                                                        |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 27  | File input                       | `getByRole('button')` offered — **not** `textbox`                                                                         | ⬜ no file input in this set                                                                                                                  |
| 28  | Input backed by a `<datalist>`   | `getByRole('combobox')` offered — not `textbox`                                                                           | ⬜ no datalist input in this set                                                                                                              |
| 29  | `<select multiple>` / `size > 1` | `getByRole('listbox')`; a plain `<select>` still `combobox`                                                               | ✅ PASS (2026-08-30) — plain `<select>` (Select Country, shot 22) → `combobox`. `multiple`/`size>1` → `listbox` NOT in this set               |
| 30  | Date / time / month / week input | `getByRole('textbox')` offered                                                                                            | ✅ PASS (2026-08-30) — `input[type=date]` (Date of Birth, shot 16) → `getByRole('textbox')` offered. time/month/week subtypes not in this set |
| 31  | Element with a `data-testid`     | `getByTestId` is **recommended first**, matching `npx playwright codegen`                                                 | ✅ PASS (2026-08-30) — Name/Submit/DoB/Country (shots 7,10,16,22) all recommend `getByTestId` first                                           |
| 32  | …that also has a unique role     | the role locator appears immediately after, flagged as the user-facing alternative                                        | ✅ PASS (2026-08-30) — role offered as the user-facing alternative on shots 7,10,22                                                           |
| 33  | Label counting                   | a partial, differently-cased label query now finds the field instead of showing 0                                         | ✅ PASS (2026-08-30) — substring label matching returns non-zero: getByLabel('Name')→1, getByLabel('Male')→2, getByLabel('Date of Birth')→2   |
| 34  | **DevTools vs side panel**       | **KNOWN LIMITATION:** DevTools still uses its own role inference (E3) and will disagree on the rows above. WS5 removes it | ⬜ DevTools surface not captured (documented KNOWN LIMITATION; WS5 consolidation is code-verified in mirror)                                  |

## Negative and edge cases

| #   | Case                                      | Expected                                                                                         | Result                                                                                                                                         |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 17  | Invalid selector in Verify                | Clear error, no crash, no silent success                                                         | ⬜ Verify not exercised                                                                                                                        |
| 18  | Element with no attributes (bare `<div>`) | Honest fallback; **known limitation:** may emit `getByText('div')` (E8, WS1)                     | ⬜ no bare `<div>` in this set                                                                                                                 |
| 19  | Very long text content                    | **Known limitation:** text truncated at 100 chars before generation (E1, WS3)                    | ⬜ not in this set                                                                                                                             |
| 20  | Duplicate text on the page                | Ambiguity shown honestly, not hidden                                                             | ✅ PASS (2026-08-30) — Practice link (shot 1, 4 matches) and Male label (shot 4, 2 matches) surface ambiguity honestly; neither is recommended |
| 21  | Password field                            | Playwright reports `textbox`; Guru should agree (E6 invalidated — this is **correct** behaviour) | ⬜ no password field in this set                                                                                                               |
| 22  | Cross-origin iframe                       | **Known limitation:** frame identity is guessed (WS3)                                            | ⬜ not in this set                                                                                                                             |
| 23  | Shadow DOM host                           | **Known limitation:** unhandled (Phase 2)                                                        | ⬜ not in this set                                                                                                                             |
| 24  | Hidden element matching a selector        | Verify shows 0 visible with the total disclosed                                                  | ⬜ Verify not exercised (candidate-badge total disclosure is shown — Name getByLabel 1 visible·2 total, shot 7)                                |

## Privacy spot-check

| #   | Check                                            | Expected                             | Result |
| --- | ------------------------------------------------ | ------------------------------------ | ------ |
| 25  | DevTools → Network, while using every feature    | **Zero** requests from the extension | ⬜     |
| 26  | `chrome://extensions` → service worker → Network | Zero requests                        | ⬜     |

## Sites to use

Public demo sites only. **Never a client application or real data.**
`todomvc.com/examples/react` · `playwright.dev` · `the-internet.herokuapp.com/tables`

Avoid password fields and label-heavy forms for **screenshots** — E2 (label matching) is not fixed
until Stage 2, so those paths can still produce a wrong count.

## WS5 — DevTools consolidation (NOT EXECUTED)

Run with the extension rebuilt and reloaded, DevTools open on a real page.

| #    | Scenario                                                                                | Expected                                                                     | Status          |
| ---- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------- |
| S5-1 | Open DevTools → Elements → select any element → Playwright Guru panel                   | Panel populates; same locators the Side Panel shows for that element         | ⬜ NOT EXECUTED |
| S5-2 | Select a different element in Elements                                                  | Panel updates on selection change                                            | ⬜ NOT EXECUTED |
| S5-3 | Select `<input type="file">`                                                            | Role reads **button** (was `textbox` before WS5)                             | ⬜ NOT EXECUTED |
| S5-4 | Select `<select multiple>`                                                              | Role reads **listbox** (was `combobox`)                                      | ⬜ NOT EXECUTED |
| S5-5 | Select an element whose locator has hidden duplicates (e.g. `placeholder="mm/dd/yyyy"`) | Badge reads `⚠ 1 visible · 2 total`, amber — DevTools now has the total      | ⬜ NOT EXECUTED |
| S5-6 | Verify Selector: enter a CSS selector, then an XPath                                    | Both report `N visible (M total, K hidden)`, matching the Side Panel exactly | ⬜ NOT EXECUTED |
| S5-7 | After S5-1, inspect the page DOM for `data-pg-devtools-target`                          | Attribute is **absent** — the marker is removed immediately                  | ⬜ NOT EXECUTED |

## DL-21 — Recommended locator (NOT EXECUTED)

Rebuild, reload, and check the Recommended card on BOTH surfaces.

| #   | Scenario                                                                               | Expected                                                                                                                       | Status                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | Side Panel: pick an element with a unique role and no test id                          | Card shows `getByRole(...)`, badge "resolves to 1 element", rationale chips, "Also listed below…"                              | ✅ PASS (2026-08-30) — `<h2>` "Form Controls" (shot 13): rec `getByRole('heading',{name})` resolves-to-1, rationale chips shown, role IS the rec  |
| R-2 | Side Panel: pick an element that HAS a `data-testid` (e.g. the practice Submit button) | Card recommends **getByTestId** — correct under the locked policy — and offers the role locator as the user-facing alternative | ✅ PASS (2026-08-30) — Submit (shot 10) & Name/DoB/Country recommend `getByTestId` with the role locator offered as alternative                   |
| R-3 | Side Panel: pick an ambiguous element (e.g. the "Male" radio, name matches Female too) | Card shows the grey empty state and **no locator**; the seven cards below still list the candidates                            | ✅ PASS (2026-08-30) — Practice link (shot 1) & Male label (shot 4): honest empty state, no locator; the 7 cards still list candidates            |
| R-4 | Side Panel: pick the `placeholder="mm/dd/yyyy"` input (visible 1, total 2)             | **Not recommended.** Empty state, not a green card                                                                             | ⬜ NOT EXECUTED — `mm/dd/yyyy` input not in this screenshot set; verify separately                                                                |
| R-5 | DevTools: select the same element as R-2 in the Elements panel                         | Identical recommendation to the Side Panel — same strategy, same code, same chips                                              | ⬜ NOT EXECUTED — DevTools surface not captured                                                                                                   |
| R-6 | Either surface: read the card carefully                                                | No "verified", "reliable", "guaranteed" or "stable" anywhere                                                                   | ✅ PASS (2026-08-30) — recommendation cards carry rationale chips only; none of those words appears on the card (Side-Panel surface)              |
| R-7 | Either surface: confirm the seven strategy cards below the recommendation              | All present and functional, including N/A rows and `+ Code`                                                                    | ✅ PASS (2026-08-30) — all seven `getBy*` cards present across the set, N/A rows shown (e.g. `getByRole` N/A on the Male label), `+ Code` present |
| R-8 | Click `+ Code` on the Recommended card, then on the alternative                        | Both append to the CODE pane, using the selected language and action                                                           | ⬜ NOT EXECUTED — `+ Code` control visible (R-7) but the append action / CODE-pane state not captured                                             |
