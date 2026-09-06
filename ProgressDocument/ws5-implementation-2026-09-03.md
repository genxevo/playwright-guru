# WS5 — Shared Application Layer + UI Extraction · IMPLEMENTATION REPORT

**2026-09-03 · DL-68 · WS5 COMPLETE at the owner-approved scope**

## 1. Status

**COMPLETE.** All six WS5 exit criteria pass at the evidence level O8 authorised, plus the five
additional criteria E7–E15 this gate set. `SidePanel.tsx` is **98 lines** (bar: ≤150) and `Panel.tsx`
is **89** (bar: ≤100), reached by moving responsibility out — not by compressing lines, deleting
comments or minifying anything.

## 2. Owner decisions

| ID  | Decision                                               | How it was implemented                                                                                                                                                                             |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | ONE global code workspace; DevTools joins it           | `src/services/code-workspace.ts` — a framework-free store over WS4's `CODE_BUFFER`; both surfaces use the same `useCodeWorkspace` hook. No second descriptor, no tab scope, nothing in memory only |
| O2  | DevTools binds to `inspectedWindow.tabId`              | `createDevtoolsPickSource` reads the tab from the inspected-window seam; a guard fails if `tabs.query` appears in the DevTools half. `PICK_DEVTOOLS_TARGET` now writes `LAST_PICK` for that tab    |
| O3  | Watch **and** re-hydrate on becoming visible           | `storage.onChanged` is primary; `panel.onShown` (wired in `entrypoints/devtools/main.ts`, the only page that holds the panel object) re-reads `$0`. Limitation stated, not papered over            |
| O4  | Unify D-a…D-d on the Side Panel's richer behaviour     | One `constants.ts`, one `contextual-actions.ts`, one `rows.tsx`. `.dblclick()` now exists on both surfaces; every hint and N/A reason is the fuller wording. Each pinned by its own test           |
| O5  | Accept WS4's LAST-WRITE-WINS; protect the live edit    | In-flight writes suppress incoming watch events; our own write's echo is recognised by value and ignored, so undo is not silently dropped. No merge, no lock, no invented interval                 |
| O6  | One runtime-messaging seam                             | `src/browser/runtime.ts` — the existing `browser.runtime.sendMessage` + `normalizeAck`, in the one directory R1 permits. Three `chrome.runtime.sendMessage` sites gone. **No CommandBus**          |
| O7  | Re-affirm ≤150 / ≤100 as a staged architectural target | Met, measured: 905 → **98** and 470 → **89**                                                                                                                                                       |
| O8  | Re-scope exit 6 to in-repo evidence                    | Structural guards, unit tests, happy-dom render tests, build/typecheck/lint, privacy suite. **Real-Chrome manual regression is not claimed**                                                       |

## 3. Architecture changes

**New — shared presentation (`src/ui/panel/`, browser-agnostic, R5-clean)**

| Module                                                                        | Responsibility                                                               |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `types.ts`                                                                    | `MainTab`, `PwLang`, `ActionOption`, `SurfaceCapabilities`, `VerifyOutcome`  |
| `constants.ts`                                                                | The seven getBy\* kinds with their N/A copy, the five languages, `NO_ACTION` |
| `contextual-actions.ts`                                                       | Which actions an element offers, the default, and the effective one          |
| `rows.tsx`                                                                    | `LocatorRow`, `CSSRow`, `XPathRow`                                           |
| `RecommendedCard.tsx`                                                         | The DL-21 card — now one implementation (see §5)                             |
| `strategy-tabs.tsx`                                                           | `PlaywrightTab`, `CssTab`, `XPathTab`                                        |
| `VerifySelectorCard.tsx`                                                      | Raw CSS/XPath verify + WS6.2's locator-expression panel                      |
| `verify-message.ts`                                                           | The verdict colour and sentence                                              |
| `ActionStrip.tsx`, `ElementHtml.tsx`, `CodeWorkspace.tsx`, `HeaderButton.tsx` | The remaining leaves                                                         |
| `PanelFrame.tsx`                                                              | The panel — header, live region, error notice, tabs, body, workspace         |

**New — application layer**

| Module                           | Responsibility                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/code-workspace.ts` | The one workspace: value algebra + persistence orchestration + concurrency protection (O1/O5)                                                                              |
| `src/services/verification.ts`   | Both verify calls over the existing seam                                                                                                                                   |
| `src/hooks/*` (8 + a composer)   | `useCodeWorkspace`, `useLanguage`, `usePickSource`, `useVerify`, `useActionMode`, `usePanelTabs`, `useCopyAll`, `useLocatorDerivation`, and `usePanel` which composes them |

**New — browser adapters (`src/browser/`, the only place R1 permits browser APIs)**

| Module           | Responsibility                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime.ts`     | `sendRuntimeMessage` — the one seam (O6)                                                                                                       |
| `tabs.ts`        | `activeTabContext` — the first implementation of WS0's `TabContext` port                                                                       |
| `pick-source.ts` | `createTabPickSource` and `createDevtoolsPickSource` — the first implementations of `PickSource`, and the whole surface difference in one file |

**Changed**

| File                                               | Change                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `entrypoints/sidepanel/SidePanel.tsx`              | 905 → 98 lines. Composes `PanelFrame` from a `usePanel` controller; keeps the picker toggle only |
| `entrypoints/devtools-panel/Panel.tsx`             | 470 → 89 lines. Same frame; keeps the re-inspect control and its status line only                |
| `entrypoints/sidepanel/RecordingControl.tsx` (new) | The WS9 recording control, moved verbatim and still flag-gated                                   |
| `src/ui/recording/test-code.ts` (new)              | The WS9 code generator, moved verbatim out of the entrypoint                                     |
| `entrypoints/devtools/main.ts`                     | `panel.onShown` → the panel page's re-read hook (O3)                                             |
| `entrypoints/background.ts`                        | `persistDevtoolsPick` — a DevTools `$0` pick becomes the inspected tab's `LAST_PICK` (E9)        |
| `eslint.config.mjs`                                | `src/hooks/**` and `src/services/**` added to R1's coverage — a **widening** of the guard        |

## 4. Panel line counts

| File            | Before | After  | Target | Result  |
| --------------- | ------ | ------ | ------ | ------- |
| `SidePanel.tsx` | 905    | **98** | ≤150   | **MET** |
| `Panel.tsx`     | 470    | **89** | ≤100   | **MET** |

No line was compressed, no comment deleted and no statement joined to reach these. Both files keep a
full explanatory header.

## 5. Divergence resolution

| ID  | Divergence                                          | Resolution                                                                            |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| D-a | N/A copy differed for 6 of 7 getBy kinds            | Side Panel's fuller copy, both surfaces. One `ALL_GETBY_KINDS`                        |
| D-b | `.dblclick()` absent from DevTools entirely         | Present on both, on exactly the elements the Side Panel offered it — and on no others |
| D-c | Action hints truncated in DevTools                  | Side Panel's wording, both surfaces                                                   |
| D-d | `CSSRow` pre-computed `variant.code` branch missing | Preserved, in the one shared `CSSRow`                                                 |
| D-e | DevTools workspace in memory only                   | Joined the one persisted workspace (O1)                                               |
| D-f | Active tab vs inspected tab                         | Two `TabContext`/`PickSource` adapters; DevTools cannot reach an active-tab query     |
| D-g | `chrome.` vs `browser.` messaging                   | One seam; `chrome.devtools.*` legitimately retained                                   |

**Four divergences DL-67 did not measure, found while extracting, recorded rather than merged
quietly.** The discovery gate compared module-level declarations; all four of these lived inside each
panel's own `return`, where that sweep could not see them. Every one is copy or ordering drift of
exactly the class O4 governs, and each was resolved by O4's own stated principle:

| ID  | Divergence                                                                                 | Resolution                                                |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| D-h | Unclassified verify error rendered `⚠ <detail>` vs `Error: <detail>`                       | Side Panel's glyph form, consistent with ✓/✗/⚠            |
| D-i | XPath advisory: the fuller one names what to use instead                                   | Side Panel's                                              |
| D-j | `UnverifiedNotice` above the "Suggested:" row vs below it                                  | Above — a caveat precedes what it qualifies               |
| D-k | "No core selectors **generated** for this element" vs "No core selectors for this element" | The first: it separates "we found none" from "none exist" |

**Not reopened.** `RecommendedCard` was measured, not assumed: DL-67 compared both implementations
whitespace-normalised and comment-stripped and found the only differences to be the order of two
props and one local variable name — the copy had already converged when `ui/copy/recommendation.ts`
was extracted, and nothing had noticed. DL-45/DL-48 kept it local because the copy genuinely
differed; that premise stopped being true. The card is now shared, and the reasoning is recorded in
the module itself.

## 6. DevTools workspace

- **Ownership** — one global `CODE_BUFFER` through WS4's `StorageGateway`. No DevTools-specific
  descriptor, no tab scope, no second storage abstraction.
- **Hydration** — `hydrate()` on mount, plus a re-read when the panel becomes visible (O3).
- **Watch** — `gateway.watch(CODE_BUFFER, null, …)`, so an edit in either surface reaches the other.
- **Persistence** — every mutation writes through the gateway and inspects the result.
- **Failure UI** — a rejected write raises WS8's `STORAGE_WRITE_FAILED` (title / cause / action) in
  the shared workspace footer. It cannot vanish, on either surface.
- **Concurrency** — WS4's LAST-WRITE-WINS, unchanged. Two additions, both necessary and both narrow:
  a watch event arriving while this surface has a write in flight is ignored, and the echo of our own
  write is recognised by value so it cannot silently drop the undo reference. Undo is part of the
  workspace value, so it cannot drift from the content; on genuine remote convergence it is dropped
  rather than left pointing at a history that did not happen.

## 7. Tab association

The Side Panel keeps its active-tab model (`activeTabContext`, re-binding on `tabs.onActivated`).
DevTools is fixed to `chrome.devtools.inspectedWindow.tabId` and has no path to an active-tab query —
a structural guard fails if one appears. A DevTools `$0` pick is persisted by the background as that
tab's `LAST_PICK`, using the same descriptor and the same gateway as a picker pick, so a Side Panel
watching that tab sees the same stored fact. The panel itself never touches storage for the pick.

## 8. SOURCE-TEXT GUARD AUDIT

- **Guards inspected:** 16 test files, now containing **254** `it()` / `it.each` blocks, every one of
  which asserted on the two panels' source TEXT.
- **Guards updated:** **all 16.** Each file's `read()` now resolves a panel entrypoint path to the
  **transitive closure of what that surface actually imports** (`test/helpers/surface-source.ts`).
- **Guards converted (not merely repointed):** 14 individual assertions changed shape because the
  property they protect is expressed differently under a composition —
  - 6 "the panel must not re-declare X" → **exactly one declaration, in the module that owns it**
    (`declaringFiles`), which is what they always meant;
  - 5 import-path assertions → `surfaceComposes(surface, module)`, which is path-independent and
    stronger;
  - 3 exact-expression assertions → the same expression compared after `denseCode` normalisation
    (whitespace outside strings, and prettier's trailing commas), because the byte-exact form was an
    artifact of the panels having been dense one-liners.
- **Guards intentionally unchanged:** every assertion about behaviour, copy, contrast, thresholds and
  message contracts. Nothing that measures the product was touched.
- **Guards deliberately inverted, by owner decision:** exactly one —
  `storage-consumers.test.ts`'s "DevTools panel persistence is untouched — that is WS5 (O5)". WS4 set
  that boundary; O1 moved it. The guard was **not deleted**: it now asserts that DevTools composes the
  same gateway and the same workspace service, and still cannot reach raw storage. The supersession is
  named in the test itself.
- **Any guard now capable of passing without guarding its target:** **none found.** The conversion is
  the opposite failure mode: because a surface's closure is followed, moving code out of it BREAKS the
  guard (correctly), and negative assertions now cover every module the surface pulls in, which is
  stricter than before. Two guards had to be scoped away from an implementation they now legitimately
  contain (the clipboard adapter; WS4's own storage gateway) — done by excising those files from the
  scan, never by relaxing the pattern.
- **Result: PASS.**

## 9. Tests

**Before: 1,126 / 47 files. After: 1,214 / 51 files** (+88 tests, +4 files).

**New**

| File                                       | What it proves                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/helpers/surface-source.ts`           | The composition helper the whole audit rests on                                                                                                   |
| `test/ws5-divergence.test.ts` (23)         | D-a…D-d as PRODUCT behaviour, D-g structurally, and that each shared symbol is declared once                                                      |
| `test/ws5-devtools-workspace.test.ts` (31) | The workspace algebra, the store against WS4's fake backend, watch-vs-local-edit, failure surfacing, inspected-tab binding, `persistDevtoolsPick` |
| `test/ws5-shared-ui.test.ts` (28)          | happy-dom render tests for every extracted leaf                                                                                                   |
| `test/ws5-parity.test.ts` (6)              | Exit 5 at the **byte** level (see below)                                                                                                          |

Tests were written first and confirmed failing for the intended reason (modules absent) before any
extraction. **No existing test was deleted, and no assertion about product behaviour was weakened.**

**Failure-first coverage:** F1 leaf render equivalence · F2 guards still guard (§8) · F3 divergences
pinned · F4 `.dblclick()` present where it should be and absent where it should not · F5 shared
`CODE_BUFFER` · F6 inspected-tab binding · F7 DevTools `LAST_PICK` · F8 watch vs local edit · F9
failed DevTools write surfaces · F10 R1 (lint) · F11 no `chrome.*` in `src/ui/` · F12 no duplication
(measured in the bundle, §11). **F13 and F14 are NOT proven and are not claimed** — see §13.

**A measurement worth stating precisely (exit 5).** Two `capturePick` calls on the same element are
byte-identical in every field except `timestamp`, which is `Date.now()` at capture. That is a property
of _when_ a snapshot was taken, not of _which surface_ took it — both read it from the same line of
the same function — so parity is measured with it excluded, and the test proves that is the only
exclusion needed. The render is compared too: the same pick produces byte-identical markup below the
surface-specific header, with React's per-mount `useId` values normalised (they differ between two
mounts of the _same_ surface, so pinning them would test mount order, not parity).

## 10. Validation

| Check     | Result                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build     | **PASS**                                                                                                                                                                  |
| Typecheck | **PASS** (all three projects)                                                                                                                                             |
| Lint      | **PASS**                                                                                                                                                                  |
| Tests     | **PASS — 1,214 / 51 files**                                                                                                                                               |
| Format    | **PASS**, except the permanent, untouched `ws2-item9-report.md`                                                                                                           |
| R2        | `architecture` 7/7                                                                                                                                                        |
| R3        | intact — `environment: 'node'` in all three vitest projects, unchanged; happy-dom stays a per-file override on the five pre-existing files plus the two new render suites |
| R5        | `devtools-architecture` 18/18 · `verify-locator-panel` 18/18                                                                                                              |
| Privacy   | 11/11, source and built-bundle layers                                                                                                                                     |

## 11. Bundle

**No optimisation pass was performed.** The change below is the arithmetic of deleting a duplicated
panel, not of chasing bytes.

| Artifact              | Before            | After                | Δ           |
| --------------------- | ----------------- | -------------------- | ----------- |
| **Total**             | 308,473           | **292,713**          | **−15,760** |
| `content.js`          | 32,049            | **32,049**           | **0**       |
| `background.js`       | 9,468             | 9,746                | +278        |
| side-panel chunk      | 36,726            | 7,801                | −28,925     |
| devtools-panel chunk  | 25,136            | 1,386                | −23,750     |
| shared `tokens` chunk | 52,781            | 89,251               | +36,470     |
| devtools loader       | 179               | 268                  | +89         |
| Ceiling               | 278,760           | 278,760              | unchanged   |
| **Overage**           | 29,713 B (10.66%) | **13,953 B (5.01%)** | **−15,760** |

The two panel chunks collapsed and the shared chunk grew: that is one implementation replacing two.
`content.js` did not move by a byte — WS5 touched no runtime path. **The ceiling was not changed, no
module was split for accounting purposes, and the remaining overage stays disclosed owner-level
release-budget debt.**

## 12. Security / privacy

Confirmed after implementation, by the privacy suite and by direct assertion over the composed
surfaces: no network · no telemetry · no `storage.sync` · no `new Function` · no dynamic import · no
`eval` carrying locator intelligence · no unsafe HTML (`outerHtml` is rendered as text in a `<code>`,
never as markup) · **zero `chrome.*` in `src/ui/`** · no browser API inside `src/ui/`. `EVAL_SCRIPT`
remains gone; `TAG_SCRIPT` moved into the DevTools adapter **unchanged in scope** — one
`setAttribute` on `$0`, returning a boolean. R1's coverage was widened, not relaxed.

## 13. Real-Chrome evidence limitations

- **Real Chrome / DevTools regression was NOT performed.** No Chromium harness was added; no
  `@playwright/test`, Puppeteer, Selenium or `jsdom` was introduced.
- **happy-dom evidence is not Chromium evidence.** It proves a component mounts and produces expected
  structure for given props. It proves nothing about real layout, real CSS, real
  accessibility-tree computation, real DevTools APIs or real extension storage.
- **F13 — a storage change arriving while the DevTools panel is hidden — is not proven.** Whether
  Chrome delivers `panel.onShown` on every dock, undock and remount is unverified here, which is why
  the subscription is primary and the re-read is an addition.
- **F14 — visual neutrality on a real page — is not proven.** Byte-identical render for identical
  props is measured; that a real Chrome paints it identically is not.
- **axe-core was not run** (DL-62's deferral stands).

## 14. Documentation

`ProgressDocument/DECISION-LOG.md` (**DL-68**, class `LOCKED`) · `MASTER-ROADMAP.md` (WS5 section +
§30 row) · `CURRENT-STATE.md` (execution pointer, WS5 row, bundle figures) · `PROGRESS.md` (Updated
line + milestone row) · this report.

## 15. Exit matrix

| #   | Criterion                                                  | Result                                                                                                                   |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| E1  | `SidePanel.tsx` ≤ 150 lines                                | 🟢 **GREEN** — 98                                                                                                        |
| E2  | `Panel.tsx` ≤ 100 lines                                    | 🟢 **GREEN** — 89                                                                                                        |
| E3  | `EVAL_SCRIPT` remains gone                                 | 🟢 **GREEN** — 18 guards; only `TAG_SCRIPT`, unchanged in scope                                                          |
| E4  | Zero `chrome.*` in `src/ui/`                               | 🟢 **GREEN**                                                                                                             |
| E5  | Same `capturePick`, same snapshot for identical input      | 🟢 **GREEN** — byte-level test, `timestamp` excluded and proven the only exclusion; render parity measured too           |
| E6  | Pre-existing features, at the O8 evidence level            | 🟢 **GREEN at the authorised level.** Real-Chrome manual regression **not claimed**                                      |
| E7  | DevTools uses global `CODE_BUFFER` via the gateway         | 🟢 **GREEN**                                                                                                             |
| E8  | DevTools tab state uses `inspectedWindow.tabId`            | 🟢 **GREEN**                                                                                                             |
| E9  | DevTools `$0` pick updates the inspected tab's `LAST_PICK` | 🟢 **GREEN**                                                                                                             |
| E10 | D-a…D-d resolved and pinned                                | 🟢 **GREEN** (plus D-h…D-k, newly found and recorded)                                                                    |
| E11 | Runtime messaging unified where compatible                 | 🟢 **GREEN** — `chrome.devtools.*` legitimately retained                                                                 |
| E12 | No CommandBus                                              | 🟢 **GREEN**                                                                                                             |
| E13 | No browser API leakage into `src/ui/`                      | 🟢 **GREEN**                                                                                                             |
| E14 | R2 / R3 / R5 / privacy all pass                            | 🟢 **GREEN**                                                                                                             |
| E15 | WS4 intact, not semantically changed                       | 🟢 **GREEN** — the gateway, descriptors, migration and semantics are untouched; only WS4's _boundary_ guard moved, by O1 |

## 16. Remaining debt

1. **The bundle overage**, now 13,953 B / 5.01% over the locked ceiling. Reduced as a side effect, not
   solved. Still an owner-level release-budget decision (DL-56…DL-62).
2. **Real-browser evidence** for the DevTools lifecycle, multi-tab behaviour and visual neutrality
   remains future infrastructure, as WS4's O4 and this gate's O8 both require.
3. **WS4's open quota-cap and debounce-interval numbers** are unchanged and still need an owner
   number; WS5 deliberately invented neither.
4. **A latent flake found, not introduced:** `storage-migration.test.ts` asserts a quarantine record
   "does not contain `42`" while the record embeds `Date.now()`, so it fails whenever the millisecond
   timestamp happens to contain those digits (observed once during this gate, passing on every rerun).
   It is a WS4 test defect, not a WS5 regression, and it is **reported rather than quietly patched** —
   fixing it is a change to WS4's test surface and belongs to whoever owns that next.
5. `src/ui/recording/test-code.ts` and the recording control are preserved WS9 assets with no live
   caller — the same status they had before WS5. Nothing was deleted.

## 17. Recommendation

**WS5 COMPLETE.**

Next action: **owner authorisation for the next workstream.** WS6.3, WS9 and WS10 were not started,
`RECORDING_ENABLED` remains `false`, and no bundle-optimisation work was undertaken.
