# Playwright Guru — Master Roadmap

**Status:** AUTHORITATIVE · single source of truth
**Created:** 27 August 2026 · **Supersedes:** nothing — it _indexes_ the locked blueprint, it does not replace it
**Locked base:** `claude/phase-1-blueprint.md` (Phase 1 Blueprint, FINAL, LOCKED)

> **Reading rule.** Where this document and the locked blueprint disagree, **the blueprint wins** and the disagreement is a defect in this document. Where this document records evidence that _contradicts_ the blueprint, it is recorded in the Decision Log (§29) and flagged — never silently resolved.

**Classification legend used throughout:**
`LOCKED` · `CURRENT` · `PROPOSED` · `DEFERRED` · `FUTURE` · `UNKNOWN` · `NOT AUTHORIZED`

---

## 1. Executive Summary

Playwright Guru is a Chrome extension that turns _"I found an element"_ into _"I have a Playwright locator I can trust."_ WS0 is closed and locked; the architecture, boundary rules, CI and contracts exist and are proven. **WS1 is CLOSED** (2026-08-30, DL-42) — direct unit tests + happy-dom harness + `FixtureDomProbe` + codegen goldens + R4 structural guard landed, and the exit review met all five criteria (the failing-first gate closed by demonstrated regression protection, Path B). **WS2 — Design System / Shared UI Primitives is now COMPLETE** (item 1 tokens foundation, DL-43; item 2 typography + contrast, DL-44; item 3 shared primitives, DL-45; item 4 accessible Tabs, DL-46; item 5 dev-only showcase, DL-47; item 6 component consolidation + main strategy bar → Tabs, DL-48; item 7 hex → semantic token migration, bounded scope, DL-49; item 8 final UI polish / theme / accessibility verification, DL-50; item 9 final validation / WS2 exit review, DL-51). **WS3 — Capture / Performance / Live DomProbe is now PARTIALLY COMPLETE** (DL-52, DL-53): content-script split into `runtime/{capture,probe,picker}`, a real `LiveDomProbe` replacing the old O(n²) counting, `all_frames:true`, sender validation, and the E4 CSS-escaping fix are all landed and verified, including (DL-53) the snapshot byte-budget exit criterion previously flagged as untested; the standalone IIFE probe build is deliberately deferred (undeterminable consumer), and the whole-extension bundle is disclosed as 1.98 kB (0.71%) over its ceiling. **A WS5+WS6 closure pass (DL-54)** landed the `ClipboardPort` adapter (real failure handling on 4 previously-uncaught copy call sites) and DevTools `network.onNavigated` invalidation, audited WS6 clean against every other exit criterion (now permanently guarded by `test/recommendation-parity.test.ts`), flagged WS6's "chain renders with frameLocator/nth" exit line as stale against a locked architectural decision rather than implementing it, and reported `PickSource`/`CommandBus` as genuinely blocked rather than forcing an implementation — the bundle is now 3,342 B (1.2%) over ceiling, disclosed. **A subsequent owner-decision gate (DL-55)** resolved all three flagged items as documentation/contract corrections, zero production bundle change: `PickSource.getCurrent()`/`subscribe()` are now honestly typed against `StoredPick` (the type it was always going to receive); the WS6 Exit line is reworded to describe the locked trust architecture (determinism, valid Playwright strategy, frame-aware semantics, stable output, no fabricated claims, correct UI surfacing) instead of a specific `frameLocator`/`nth` string form `recommendation.ts` deliberately never produces; and the leaf-first extraction is documented honestly as not started, with no real-Chromium regression coverage available for it anywhere in this repo. **WS6.2 Verification V2 (DL-56)** then implemented the Playwright-subset locator parser (hand-rolled, no `eval`/`new Function`/dynamic import, security-guard tested), the `verifier.ts` six-state classifier reusing the single existing `LocatorResolver`, and `VerifyLocatorPanel` (mounted in both panels' existing Verify Selector card) — 938 tests / 40 files, R2/R3/R5 unchanged, but the bundle grew to 293,678 B, now 14,918 B (5.35%) over the locked 278,760 B ceiling, disclosed rather than hidden. **A WS6.2 bundle reduction gate (DL-57)** then investigated the actual build/dependency graph before changing anything — confirmed tree-shaking was already excluding every unrelated locator-engine module from `content.js`, confirmed the panel UI was not duplicated per panel, confirmed every import was already correctly type-only where applicable — tried `sideEffects: false` (Δ 0 B, reverted) and removed 8 dead `ParseError.detail` diagnostic strings never read by any consumer (Δ −325 B, retained), with zero functional change (938 tests / 40 files unchanged, R2/R3/R5 unchanged). Bundle is now 293,353 B, 14,593 B (5.24%) over ceiling. **A WS6.2.1 dependency-isolation gate (DL-58)** then investigated, by a controlled build experiment rather than inference, whether the verification resolver's dependency graph could be isolated from `content.ts` for a further reduction — and proved it could not: `capture.ts`'s pre-existing Pick hot path already calls `resolveStep` on every click, so `resolver.ts`'s core logic was already bundled into `content.js` before WS6.2 existed; only the thin `resolveChain` wrapper is genuinely new. Temporarily removing WS6.2's `content.ts` wiring (fully reverted, confirmed via diff) measured the true irreducible marginal cost at 6,759 B — almost entirely the parser itself. No code was changed or retained. WS6.2 status is **PARTIAL — BUNDLE STILL OVER CEILING** pending an owner bundle-policy decision — confirmed by direct experiment to be a genuine architectural/budget question, not an optimization gap. WS5 remains PARTIAL; WS6 PARTIALLY DELIVERED. **A WS7 CSS/XPath truth gate (DL-59)** then ran its own discovery-first audit of every CSS/XPath generation and verification path against §12's original WS7 spec and the historical F-1/F-2 findings — and found the substantive concerns (fabricated stability labels, fake XPath support in the fixture probe, ranking inversion, unearned "confidence"/"reliability" language) already closed by Stage 1/WS1/WS2/WS3/WS6, evidenced by direct source reading and repo-wide grep, not assumption. The one genuine gap found — the raw CSS/XPath **Verify Selector** feature classifying every probe error into one generic red string via two independently hand-rolled panel implementations, instead of reusing WS6.2's own `classifyVerification` six-state truth function — was fixed: `content.ts` now classifies every raw-selector outcome through that same function/vocabulary, and a new shared `src/ui/verify-selector-status.ts` presents the result identically in both panels. 952 tests / 41 files, R2/R3/R5 unchanged; bundle now 294,425 B, 15,665 B (5.62%) over the 278,760 B ceiling (disclosed, not chased, per this gate's own explicit instruction). **This gate's charter was materially narrower than §12's original WS7 spec** (a new `selector-engine` package, verified generation for every candidate, `css-xpath.ts` deletion) — that larger scope remains unstarted and was recorded as a contradiction, not silently resolved (DL-59). **The owner has since formally decided that contradiction (DL-60, 2026-09-03): WS7 is CLOSED / COMPLETE at the DL-59 truth-classification scope, which is now the accepted WS7 exit bar; §12's original package-level rebuild is DEFERRED / FUTURE DIRECTION, not outstanding WS7 debt.** WS7 status: **CLOSED / COMPLETE (DL-60)**. **WS8 then ran (DL-61) and is PARTIAL — FOLLOW-UP REQUIRED**: its discovery found that two of its own four Exit criteria were unmeetable as written — `§20.6` is a dangling reference to a section that does not exist, and axe-core presumes a rendered-DOM test environment this repository deliberately does not have (R3) — so the gate stopped before implementing and put the scope question to the owner. With those two criteria re-scoped by explicit owner decision, WS8 delivered the two it could close honestly: keyboard reachability with a focus ring retuned from 1.98:1/1.74:1 to clear 3:1 against every surface token per theme, and an error-state matrix giving all 9 error states a title, a cause and an action; plus live regions on both status bars, reduced-motion support, and accessible names for four icon-only buttons that had none. **A WS8 owner-decision & closure gate (DL-62) then formalised those decisions and re-baselined WS8's exit bar, closing WS8 as COMPLETE at the authorised scope** — accessibility at structural-guard evidence (axe-core **deferred**, not run, and not claimed equivalent), keyboard/focus, the error-state matrix, reduced motion and the repository's real budgets all closed and pinned; `§20.6` recorded as superseded; real-site/manual smoke validation left as owner-side release validation; the toast system deferred; and the 20,082 B (7.20%) bundle overage left standing as separate, disclosed owner-level release-budget debt rather than chased. **WS9 discovery then ran (DL-63) and its three blockers were formally resolved by the owner (DL-64): D1 re-scopes the kill-the-content-script criterion to unit + structural proof of activation/heartbeat/staleness for the current implementation gate — live-browser E2E proof stays deferred future infrastructure and is never claimed as achieved; D2 makes WS4 the next implementation workstream, because WS9's preserved state, structured workspace and v1 migration all depend on WS4's persistence foundation; D3 confirms the unreachable legacy recorder is replaced per §18, not extended, with DL-4 left historical and not fixed here.** The canonical ordering WS0 → … → WS11 is unchanged — only the execution pointer moves, and it is dependency-driven. **WS4 is NEXT and NOT STARTED; WS9 remains BLOCKED / DEFERRED on WS4; no WS4 or WS9 implementation has begun and `RECORDING_ENABLED` remains `false`.**

Three findings define the current moment:

1. **WS0 delivered contracts, not connections.** Every WS0 module — probe, resolver, facts, snapshot, rationale, ports, adapters, recording limits, copy map — is imported by **zero production paths**. Architecture improved; user-facing reliability did not. `LOCKED` (fact)
2. ~~**Guru's locator ranking is inverted against Playwright's own generator.**~~ **RESOLVED in Stage 2 (DL-21):** `testId` now ranks first, matching `selectorGenerator.ts`, pinned by tests against silent re-inversion. `RESOLVED`
3. **The product's biggest features are partly surfaced.** The Recommended-locator card now shows the engine's choice on both surfaces (DL-21/DL-32 surfacing, mirror); ancestor-scoped chaining, `.nth()` handling and `frameLocator()` remain built, tested and **still not shown** — WS6 work.

The Pre-v0.1.0 Reliability Gate (truth → fidelity → visibility) is **implemented in the mirror/working tree** — Stage 1, Stage 2, the WS5 DevTools consolidation and the DL-21 surfacing all landed; the WS0–WS11 ordering is **unchanged**, and host git placement remains user-verified only. The project is now in **WS1** (in progress), evolving toward recording and framework-aware generation that reuse the _same_ locator intelligence.

**Recommended next action:** **WS1 is CLOSED** (DL-42). **WS2 — Design System / Shared UI Primitives is COMPLETE** (items 1–9, DL-43…DL-51). **WS3 — Capture / Performance / Live DomProbe is PARTIALLY COMPLETE** (DL-52): the content-script split, `LiveDomProbe`, `all_frames:true`, sender validation, and the E4 fix are all landed and verified (847/33 tests, `pnpm verify` exit 0 — the one previously-flagged snapshot byte-budget test gap is now closed, DL-53); the standalone IIFE probe build is DEFERRED pending a project-owner decision on its consumer/purpose (genuinely undeterminable from the repository, not guessed at); the whole-extension bundle is currently 1.98 kB (0.71%) over the 278.76 kB ceiling, disclosed rather than silently shipped or fixed by cutting functionality. **Two decisions are needed from the project owner before WS3 can be marked fully COMPLETE:** (1) name the IIFE probe build's actual consumer, or accept it stays unbuilt; (2) accept the current 1.98 kB overage, raise the ceiling, or authorize a future pass to claw the bytes back. Until then, the next slice is either that decision or authorisation for WS4. WS5 stays PARTIAL and WS6 PARTIALLY DELIVERED.

---

## 2. Product Vision `LOCKED`

```
INSPECT → UNDERSTAND → GENERATE → VERIFY → BUILD
```

> **Playwright Guru never shows the user something it cannot justify.**

Three load-bearing words, each mapped to an architectural commitment:

| Word         | Commitment                                                   | Home                                            |
| ------------ | ------------------------------------------------------------ | ----------------------------------------------- |
| **reliable** | the recommendation is the one the engine can _prove_ is best | `LocatorResolver` + Recommended card (WS3, WS6) |
| **verified** | nothing displays a signal it did not measure                 | `DomProbe` + verdict model (WS1, WS3, WS7)      |
| **flow**     | the output is a workflow, not a string                       | workspace + recording + assertions (WS9, WS10)  |

## 3. Product Principles `LOCKED`

Deterministic where possible · locally processed · privacy-first · Playwright-faithful · evidence-based · explainable · maintainable · no fabricated reliability · no silent failures · no unnecessary AI dependency.

**Scope, explicit:** the product is **Playwright-only**. Selenium, Cypress, WebdriverIO and Robot Framework are studied competitively and **never built**. Differentiation is _Playwright-native + opinionated + provably correct + locally processed_.

---

## 4. Current Repository State

| Item                    | Value                                                                                                                           | Verified by                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Rollback point          | `bb928eac8547a1ad1b0cc119c41673e0553adece`                                                                                      | user-reported, **immutable**                   |
| WS0 commits             | `6457f7c` → `2cabc8a` → `68604e2`                                                                                               | user-reported                                  |
| HEAD                    | `68604e2fe1c0bb32db2b93aa66eb1e734f296974`                                                                                      | **user-reported — NOT independently verified** |
| `origin/main`           | expected `= HEAD`                                                                                                               | **user-reported**                              |
| Working tree            | `?? docs/` (untracked `privacy-policy.html`); root `playwright-guru-v0.1.0.zip` (gitignored)                                    | Claude, via bridge listing                     |
| File-content spot check | `package.json`, `README.md`, `wxt.config.ts`, `extension/package.json`, `docs/privacy-policy.html` **byte-identical** to mirror | Claude, via bridge staging                     |
| Icons                   | **none anywhere** — `packages/extension/public/` does not exist                                                                 | Claude                                         |
| `docs/roadmap/`         | **does not exist**                                                                                                              | Claude                                         |

> **Git safety rule `LOCKED`.** Claude cannot run git against the host. Claude must never assert HEAD, branch, remote sync, or a clean tree. User-supplied `git status --short` / `git log --oneline -5` / `git branch -vv` / `git remote -v` is the only authoritative host state.

**Repository facts vs mirror facts are separated everywhere in this document.** The mirror is `/home/claude/pg` inside Claude's container; nothing in it exists on the user's machine until explicitly placed.

## 5. WS0 Closure `LOCKED`

26 new · 9 modified · 0 deleted · **+44 / −29** · 54/54 tests · local Windows PASS · CI Ubuntu + Windows PASS (run `32149336770`) · branch-protection prerequisite now satisfied.

**Documented divergences — must remain documented, never silently corrected:**

| #   | Divergence                                                                                                        | Note                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| D-A | `Panel.tsx` **not** reformatted; quarantined in `.prettierignore`. 74 lines >120 chars, incl. the 3,891-char line | The blueprint's "no line >120 chars" criterion is **not literally satisfied** |
| D-B | Test files renamed/relocated; coverage is a **superset**                                                          | —                                                                             |
| D-C | `FakePickSource` deferred to WS5, where it first has a consumer                                                   | —                                                                             |
| D-D | `eslint.config.js` → `.mjs` for ESM                                                                               | naming only                                                                   |
| D-1 | `DomProbe.countByLabel` added (APPROVED)                                                                          | interface completion                                                          |
| D-2 | 16 pre-existing type errors fixed (APPROVED)                                                                      | required for the typecheck gate                                               |

**Node 20 clarification `LOCKED`:** the GitHub Actions deprecation concerns the **action runtime** (`actions/checkout@v4` etc. → `@v5`), _not_ the project's `node-version: 20`. **Do not change the project's Node version because of that annotation.**

**The critical qualifier:** WS0 improved architecture, contracts and tests. It did **not** materially improve user-facing reliability, because none of it is wired to a production path. This distinction stays visible.

---

## 6. Current Reliability State `CURRENT`

From the audit: **7 GREEN · 9 YELLOW · 8 RED · 1 NOT WIRED.**

**GREEN:** Playwright locator output · five-language codegen · popup · code buffer/copy/undo · bundle size · manifest permissions · **privacy behaviour** (verified: zero network calls, `storage.local` only — no `storage.sync`, clipboard write-only, no analytics/telemetry/remote code).

**RED:** recording was dead while reporting success · CSS badges fabricated · XPath badges fabricated · DevTools `EVAL_SCRIPT` is a separate implementation · O(n²) match counting · background synthesised success · cross-origin iframe behaviour guessed · shadow DOM unhandled.

**NOT WIRED:** every WS0 contract module.

## 7. All Known Findings `CURRENT`

| ID   | Finding                                                                                                       | Severity       | Owner                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1  | **Ranking inverted vs Playwright's generator**                                                                | 🔴 highest     | WS1                                                                                                                                                                                                                                                                                          |
| F-2  | **~138 `v.push` sites in `css-xpath.ts` carry literal `reliability` labels never derived from a match count** | 🔴             | WS7 (honesty fix now)                                                                                                                                                                                                                                                                        |
| F-3  | Recording dead + synthetic success = visible lie                                                              | 🔴             | fixed in mirror                                                                                                                                                                                                                                                                              |
| F-4  | Two match-count semantics in one panel (candidates = visible; verify = all)                                   | 🟠             | WS6.2                                                                                                                                                                                                                                                                                        |
| F-5  | DevTools `EVAL_SCRIPT` disagrees with `content.ts` on accessible name (E3)                                    | 🟠             | WS5                                                                                                                                                                                                                                                                                          |
| E2   | `getByLabel` counted with `===`; Playwright uses case-insensitive substring                                   | 🟠             | WS1 (domain) / **fixed on the live path in mirror, WS3, DL-52** — `LiveDomProbe.countByLabel` routes through `matchesPlaywrightText`                                                                                                                                                         |
| E5   | `date/time/month/week` missing from textbox; `select[multiple]`/`size>1` mis-roled                            | 🟠             | WS1                                                                                                                                                                                                                                                                                          |
| N-1  | `input[type=file]` → Playwright **button**; Guru **textbox**                                                  | 🟠 **new**     | WS1                                                                                                                                                                                                                                                                                          |
| N-2  | `text/email/tel/url` + `list`→`<datalist>` → Playwright **combobox**; Guru **textbox**                        | 🟡 **new**     | WS1                                                                                                                                                                                                                                                                                          |
| E1   | `innerText` truncated to 100 chars _before_ generation                                                        | 🟠             | WS3 — **not directly addressed in WS3 Phase 2**; `captureSnapshot`'s `ElementContext` captures a 1000-char bound separately (DL-52), but the shipped `capturePick`/`StoredPick` path still uses the 100-char `safeText` default, unchanged                                                   |
| E4   | `CSS.escape` inside quoted attribute values on the live path                                                  | 🟡             | **fixed in mirror, WS3, DL-52** — `escapeAttrValue` at all 8 confirmed call sites                                                                                                                                                                                                            |
| E7   | `computeAccessibleName` falls through to `innerText` for arbitrary elements                                   | 🟡             | WS1                                                                                                                                                                                                                                                                                          |
| E8   | fallback emits `getByText('div')` — no raw-locator `LocatorKind` exists                                       | 🟡             | WS1                                                                                                                                                                                                                                                                                          |
| E9   | `buildLocatorChain` calls `pickBestUnique` twice                                                              | 🟢             | WS1                                                                                                                                                                                                                                                                                          |
| F-6  | O(n²) full-document text scan per candidate                                                                   | 🟠             | **fixed in mirror, WS3, DL-52** — `LiveDomProbe`'s indexed/memoized counting                                                                                                                                                                                                                 |
| F-7  | No error boundary — render throw = white screen                                                               | 🟠             | WS5                                                                                                                                                                                                                                                                                          |
| F-8  | Zero unit tests for `accessibility.ts` / `scorer.ts` / `engine.ts`                                            | 🔴             | WS1                                                                                                                                                                                                                                                                                          |
| F-9  | Global (not tab-scoped) picker state                                                                          | 🟡             | WS4                                                                                                                                                                                                                                                                                          |
| F-10 | Cross-origin iframes guessed; shadow DOM unhandled                                                            | 🟡             | WS3 / Phase 2 — **partially addressed in mirror, WS3, DL-52**: `all_frames:true` + same-origin frame identification now live; cross-origin frames still guessed (no cross-origin API makes it precise) and shadow DOM stays unhandled, both confirmed to remain out of reach this workstream |
| F-11 | No sender validation on message listeners                                                                     | 🟡             | **fixed in mirror, WS3, DL-52** — `isFromExtensionUI` rejects any sender carrying `sender.tab`                                                                                                                                                                                               |
| F-12 | Ancestor-scoped chain, `.nth()`, `frameLocator()` **built, tested, invisible**                                | 🟠 opportunity | WS6.1                                                                                                                                                                                                                                                                                        |

## 8. Corrected / Invalidated Findings `LOCKED`

### E6 — INVALIDATED BY EVIDENCE

The blueprint claimed `input[type=password]` must return no implicit role because _"getByRole('textbox') will not find it."_ Verified against `playwright-core@1.62.1`, `packages/injected/src/selectorGenerator.ts`:

```js
"INPUT": (e) => {
  const type = e.type.toLowerCase();
  if (["email","search","tel","text","url",""].includes(type)) { … }
  if (type === "hidden") return null;
  if (type === "file")   return "button";
  return inputTypeToRole[type] || "textbox";   // ← password lands here
}
// inputTypeToRole = { button, checkbox, image:button, number:spinbutton, radio, range:slider, reset:button, submit:button }
```

`password` is not whitelisted, not `hidden`, not `file`, not in `inputTypeToRole` → **`textbox`**. Playwright **does** expose password inputs as `textbox`. Guru's current code already matches.

> **E6 is CLOSED — INVALID / SUPERSEDED BY EVIDENCE. Do not implement an E6 fix.** Replaced by N-1 and N-2, which the same investigation found.

**Also confirmed against source:** `date`/`time`/`month`/`week` → `textbox` · `select[multiple]` or `size>1` → `listbox`, otherwise `combobox` · `getByLabel` defaults to case-insensitive substring.

## 9. Competitive Landscape `CURRENT`

|                 | Locator Labs                                                                      | Playwright CRX                                                                       | Official Playwright Extension                |
| --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| Rating / users  | 4.9★ · ~10k                                                                       | 5.0★ (17) · ~10k _(listing observed elsewhere as 40k — **UNKNOWN**, treat as ~10k+)_ | 4.9★ (13) · ~90k                             |
| Owns            | locator-quality **education** across 5 frameworks                                 | running **real Playwright** in-browser via `chrome.debugger`                         | **session/auth transport** to CLI/MCP/agents |
| Ranking         | BEST / GOOD / OK                                                                  | none — silent                                                                        | none                                         |
| Rationale       | yes, failure-mode based                                                           | none                                                                                 | none                                         |
| Live validation | count + highlight + **step between matches**                                      | Playwright's own                                                                     | n/a                                          |
| Weakness        | framework-agnostic ⇒ Playwright-_compatible_, not native; cannot prove its advice | no opinion, no ranking, no rationale; `chrome.debugger` banner                       | generates no locators at all                 |

> **Strategic hypothesis (not asserted market fact):** _"Nobody we have studied currently combines Playwright-native locator intelligence, verification, ranking, rationale, and framework-aware generation into one coherent product."_ — `PROPOSED`, to be revisited as the market changes.

## 10. Current v0.1.x Strategy `CURRENT`

Ship a **Developer Preview** that is honest, Playwright-faithful, and shows what it already has. Not feature-complete. Not 1.0.

**Publishing is PAUSED.** No store listing work, no screenshots, no privacy declarations, no distribution settings, no submission. The draft item exists and stays untouched.

---

## 11. Pre-v0.1.0 Reliability Gate `CURRENT`

**Not a workstream. Not WS12.** A sequencing decision that pulls selected items _forward from existing workstreams_. Every item maps to an existing WS owner.

### Stage 1 — TRUTH

_Goal: nothing in the UI is a lie._

| Task                                                                                              | Owner WS             | Status                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Place P0-1A — `RECORDING_ENABLED=false`, Record button + banner gated                             | WS9 rollback flag    | ✅ mirror · ⏸ not placed                                                                                                                                                                      |
| Place P0-1B — remove both `?? { ok: true }`; `normalizeAck()` → `NO_HANDLER`                      | WS3 (§12.3 Layer 1)  | ✅ mirror · ⏸ not placed                                                                                                                                                                      |
| Relabel CSS/XPath honestly — _"Syntax reference — not verified against the page"_; drop the badge | WS7 (honesty subset) | ⬜                                                                                                                                                                                            |
| Unify counts — visible-first with total                                                           | WS6.2                | ⬜                                                                                                                                                                                            |
| Error boundaries on both panel roots                                                              | WS5                  | ⬜                                                                                                                                                                                            |
| Icons (16/32/48/128) + `minimum_chrome_version: '114'`                                            | WS11                 | ⛔ blocked — icon decision                                                                                                                                                                    |
| Honest store copy (prepared, not published)                                                       | WS11                 | ⬜                                                                                                                                                                                            |
| Privacy regression test over the built bundle                                                     | WS8                  | ✅ **already done, row was stale** (DL-61) — `privacy.test.ts` carries a `describe('privacy contract — built bundle')` layer reading `.output/chrome-mv3`, skipped only when nothing is built |
| Packaging validation from `packages/extension/.output/chrome-mv3`                                 | WS11                 | 🟡 structure validated in mirror                                                                                                                                                              |
| Manual smoke matrix (8 journeys + 6 negatives)                                                    | WS8                  | 🟡 Side-Panel rows PASS via 24-screenshot capture (2026-08-30); DevTools/Verify/privacy rows still require the user                                                                           |
| Clean-clone validation                                                                            | WS11                 | ⬜                                                                                                                                                                                            |

> **On F-2, explicitly:** relabelling is an _honesty_ fix, not a solution. The real fix is WS7's evidence-based generation. **Do not recolour the badges and declare the problem solved.**

### Stage 2 — PLAYWRIGHT FIDELITY

_Goal: Guru agrees with Playwright wherever it claims Playwright behaviour._

| Task                                                                                | Owner WS               |
| ----------------------------------------------------------------------------------- | ---------------------- |
| Unit tests for `accessibility.ts` **(first)**                                       | WS1                    |
| Unit tests for `scorer.ts`                                                          | WS1                    |
| Unit tests for `engine.ts`                                                          | WS1                    |
| E5 — role-selector gaps + listbox/combobox                                          | WS1                    |
| E2 — label matching on the **live path** (`content.ts`), not only the unused helper | WS1/WS3                |
| N-1 `file` → button                                                                 | WS1                    |
| N-2 datalist → combobox                                                             | WS1                    |
| **Ranking policy decision** + tests pinning it                                      | WS1                    |
| Playwright conformance corpus                                                       | WS1 — `NOT AUTHORIZED` |

### Stage 3 — VISIBILITY

_Goal: expose what is already built._

Recommended Locator card · `LocatorVerdict` words replacing scores · rationale rendering ("Why this locator?") · Primary/Secondary/Educational collapse · surface ancestor-scoped chaining, `.nth()`, `frameLocator()`. **Owner: WS6.1 subset.**

**Then → v0.1.x preview. Then WS1 proper.**

---

## 12. WS0–WS11 — Exact Roadmap `LOCKED`

Definitions recovered verbatim from the locked blueprint §32. Status added.

### WS0 — Foundation / Seams / Contracts · S · 1–2 d · **CLOSED / LOCKED**

**Purpose.** Make every subsequent change recoverable, reviewable, automatically verified.
**Deliverables.** git + `.gitignore` + baseline commit · private repo + branch protection · `.editorconfig` · ESLint + Prettier + **R1–R5** · format `Panel.tsx` (isolated commit) · `@types/chrome` · vitest config · GitHub Actions · README · remove `declarativeContent` · remove Firefox scripts · licence decision.
**Out of scope.** Any behaviour change · any test content · any UI change · any interface implementation.
**Exit.** Fresh clone runs `install/typecheck/lint/test/build` green · repo verified private · a deliberate boundary violation fails lint.
**Status.** CLOSED. **Known issues:** D-A (`Panel.tsx` unformatted) · every module unwired.
**Future relationship.** Everything depends on it.

### WS1 — Domain / Contract Tests · L · 6–8 d · **CLOSED** (exit criteria met — DL-42)

> **Status (2026-08-30).** Started in canonical order. **Landed (no source change):** the direct
> unit-test deliverable — `accessibility.ts` (32), `scorer.ts` (16), `engine.ts` (20) = **68**; and the
> **happy-dom fixture harness** (`test/fixtures/dom.ts`) + **`FixtureDomProbe`** (`test/fakes/FixtureDomProbe.ts`)
> = **+22**. FixtureDomProbe reuses the domain's own role/name/text functions (an adapter, not a second
> engine) and surfaces happy-dom's limits honestly — XPath `UNSUPPORTED`, visibility `visible === total`
> (DL-38). And the **codegen goldens** (`packages/codegen/test/`): 98 (chain × language) goldens + 29
> supplementary = **+127**, self-contained (no FixtureDomProbe), expected authored from the Playwright
> per-language API — all passed first run, so no production change (DL-39). And the **R4 structural
> guard** (`test/r4-structural-guard.test.ts`, **+16**): R4's copy-map bijection was already proven by
> WS0 (`ws0-seams` + the E-2 `satisfies`), so this closes the one gap — applying the E-4 `areRationales`
> guard to real `recommendLocator` output + catalog membership + `RATIONALE_KEYS`↔type sync; no
> production change (DL-40). **Exit review (DL-41 → DL-42): all 5 criteria met — WS1 CLOSED.** ≥200
> assertions (634) · every applicable E-fix (E2, E5) shows **demonstrated** failing-first regression
> protection (Path B: reverting each fix in an isolated scratch copy turns its protecting test — incl.
> the independent Playwright golden — RED; restoring → GREEN; mirror hash-verified untouched) · R4
> guard · copy map exhaustive/zero-orphans · domain `packages/*` free of browser globals. This is
> _experimental regression_ evidence, **not** historical git chronology. Exit criteria met in the
> mirror/working tree; host git placement remains user-verified.

**Purpose.** Make the domain provably correct; land the contracts everything depends on.
**Inputs.** WS0. **Dependencies.** WS0 (tests need CI and lint to mean anything).
**Deliverables.** happy-dom fixture harness · `FixtureDomProbe` · unit tests for `accessibility`/`scorer`/`engine` · ~98 codegen golden files · **failing tests first for E1–E9, then the fixes** · `probe`/`resolver`/`rationale`/`facts`/`snapshot` types + guards · R4 structural guard · `renderAction`/`renderAssertion` signatures.
**Architectural reason.** _The most valuable days in the project — every later workstream is faster and safer because of this one._
**Out of scope.** Any extension code · any UI · `LiveDomProbe` · selector generation.
**Validation.** §22.1 + §22.2 suites green; goldens reviewed line by line against the Playwright docs per language.
**Exit.** ≥200 assertions · every E-fix has a test that failed before it · R4 guard passes · copy map exhaustive, zero orphans · `packages/*` contain zero `document`/`window`/`chrome`.
**Known issues.** E6 invalidated (§8) · N-1/N-2 added · ranking policy must be decided here · conformance corpus `NOT AUTHORIZED`.

### WS2 — Design System / Shared UI Primitives · M · 4–5 d · **COMPLETE** (items 1–9, exit review DL-51)

**Purpose.** Tokens and accessible primitives **before** any component is extracted, so extraction happens once.
**Deliverables.** `tokens.css` from the existing palette · contrast + font-size fixes (9px → 12px base, 11px min) · dark theme tokens · ~15 primitives incl. **`Tabs` with the full ARIA pattern** · `?showcase=1` dev route.
**Dependencies.** WS0. **Out of scope.** Product components · wiring into panels · behaviour changes.
**Scope decision (project owner).** Token-migration scope = **all rendered UI**: `src/ui/**`, `entrypoints/sidepanel/**`, `entrypoints/devtools-panel/**` (the panels hold ~196 of the ~206 hex). This is visual tokenisation, **not** component extraction or a redesign.
**Exit.** Zero hardcoded hex outside `tokens.css` in the agreed UI scope · every token pair ≥4.5:1 · `Tabs` passes ARIA keyboard tests · bundle impact <5 KB.

**Progress (2026-08-31).**

- **Item 1 — tokens foundation ✅ landed (DL-43).** `packages/extension/src/ui/tokens.css` is the single source of visual truth: semantic colour tokens (neutrals + success/info/warning/danger/accent; each family carried strong/surface/tint/border/text — the unused `-surface` role was later removed in item 2, DL-44, leaving strong/tint/border/text), a 12px-base / 11px-floor type scale, spacing/radius/focus, a theme-invariant VS Code code-preview palette, and a full dark-theme layer (system `prefers-color-scheme` + explicit `data-theme`). Loaded into both rendered panels via `main.tsx`. `test/tokens.test.ts` (108 cases) gates token existence, light/dark parity, the type rule (12/11, no 9px), and **≥4.5:1 contrast on every declared pair** in both themes (failure-first: a 9px value or a sub-AA pair was demonstrated RED, then restored GREEN). Verify green (662 tests / 23 files). **Bundle Δ +4.98 kB** (273.76 → 278.74 kB) — within the <5 KB exit budget but nearly all of it; see the headroom note below.
- **Item 2 — typography + contrast application ✅ landed (DL-44).** Established the 12px base + sans stack on both panels from one `body` rule in `tokens.css` (removing the sidepanel inline `font-family` and the DevTools `font-size:13px` as duplicates). Eliminated every sub-11px inline size — **62 `fontSize:9` + 50 `fontSize:10` → 11** across `SidePanel.tsx` and `Panel.tsx`. Fixed the unambiguous neutral muted-text contrast failures — `color:'#94a3b8'` (×18) and `color:'#cbd5e1'` (×2, text only) → `#64748b` (4.76:1 on white). New failure-first guard in `tokens.test.ts` scans the panel source and fails on any sub-11px inline size (demonstrated RED against the 9/10px, then GREEN). To stay under budget the 5 unused `-surface` accent tokens were removed (DL-44), leaving each family with base/strong/tint/border/text. Verify green (656 tests / 23 files). **Item-2 bundle Δ −0.46 kB** (278.74 → 278.28 kB): the font-digit growth and base rule were more than offset by the `-surface` removal and index.html dedup.
- **Item 3 — shared accessible primitives ✅ landed (DL-45).** Inspection found four leaf components duplicated identically in both panels (`CopyBtn`, `AddBtn`, `UnverifiedNotice`, `NARow`) plus an identical `ACTION_MAP`/`applyAction`. Extracted once into `src/ui/primitives.tsx` (+ pure `src/ui/actions.ts`); both panels now import the shared copy (aliased, so call-sites were untouched) and the local duplicates + tables were deleted. Interactive primitives render a native `<button>` (a11y contract pinned by `test/primitives.test.ts`, 9 cases, also the failure-first consolidation guard RED→GREEN). Styling preserved byte-for-byte (internal hex stays literal until item 7). **Evidence over the "~15" number:** under the hard budget only the genuinely-duplicated leaves justify extraction now; speculative generic primitives are deferred (item 6 completes the migration). Verify green (666 tests / 24 files). **Item-3 bundle Δ −2.50 kB** (278.28 → 275.78 kB): both panel chunks −2.6 kB, shared chunk +2.68 kB (one copy); no CSS/HTML change.
- **Item 4 — accessible Tabs primitive ✅ landed (DL-46).** Built `Tabs` + `tabPanelProps` in `src/ui/primitives.tsx` and adopted them for the duplicated `SubTabBar` (CSS/XPath category pills) in both panels — full WAI-ARIA tab pattern (named `tablist`; `tab` with `aria-selected`/`aria-controls`; roving tabIndex; ArrowLeft/Right wrapping + Home/End moving focus AND selection; `tabpanel` with `id`/`aria-labelledby`), automatic activation (arrow selects — the category only filters an already-generated list). Real happy-dom render test (`test/tabs.test.ts`, 9) drives the live keyboard contract; the structural guard in `primitives.test.ts` was RED→GREEN. The `SubTabBar` local copies were deleted (consolidation). **The main strategy bar (Playwright/CSS/XPath) is also genuine tabs but its content restructuring is high blast-radius, so its ARIA conversion is deferred to item 6** (tracked, not skipped). Appearance preserved. Verify green (682 tests / 25 files). **Item-4 bundle Δ +0.56 kB** (275.78 → 276.34 kB): shared chunk +1.11 kB (Tabs logic), panel chunks −0.29/−0.26 kB; no CSS/HTML change; no domain files touched.
- **Item 5 — dev-only `?showcase=1` route ✅ landed (DL-47).** `src/ui/showcase.tsx` renders every shared primitive (buttons, notice, N/A row, Tabs) for visual/AT review; `sidepanel/main.tsx` reaches it via a dynamic `import()` gated behind `import.meta.env.DEV && ?showcase===1`. Because the gate is statically false in `wxt build`, Vite dead-code-eliminates the whole branch — the showcase is **not in the production bundle** (verified: total + `sidepanel.js` byte-identical, 0 showcase strings in `.output`). Real happy-dom render test proves the demonstration; three isolation guards (RED→GREEN) pin the dev-only gating. Verify green (686 tests / 26 files). **Item-5 bundle Δ 0.00 kB** — dev-only, zero production impact.
- **Item 6 — component consolidation + main strategy bar → accessible Tabs ✅ landed (DL-48).** Converted the last duplicated tab-like structure — the main Playwright/CSS/XPath strategy bar, deliberately deferred by item 4 (DL-46) for blast radius — to the shared `Tabs` primitive rather than a second Tabs component: `Tabs` gained a `variant?: 'pill' | 'underline'` prop (default `'pill'`, so the existing `SubTabBar` call sites are byte-unaffected) and `TabItem` gained an optional per-tab `accent` (the main bar uses three different accent colours, unlike the single-accent `SubTabBar` groups); the `'underline'` variant reproduces the bar's exact prior look (equal-width segments, 2px underline indicator, no pill background). Both panels now render `<Tabs tabs={STRATEGY_TABS} … variant="underline"/>`, with tab-specific content wrapped in `tabPanelProps('pg-main', mainTab)` (Element HTML / Verify Selector stay outside, unchanged — shared across all three strategies). Also extracted the genuinely byte-identical `STRATEGY_COLORS`/`STRATEGY_LABELS`/`matchBadge`/`STRATEGY_TABS` into a new pure module `src/ui/strategy-meta.ts` (no React/JSX/domain import, mirroring the item-3 `actions.ts` precedent); confirmed `LocatorRow`/`CSSRow`/`XPathRow`/`RecommendedCard`/`getContextualActions`/`ALL_GETBY_KINDS` stay local (genuinely divergent product copy between panels, per DL-45's standing precedent) and left the dead `getDefaultAction` untouched. Failure-first demonstrated in an isolated `/tmp` scratch copy (not the mirror): every new structural guard was RED against the reconstructed pre-migration source, GREEN after. Verify green (**710 tests / 26 files**, 686→710). **Item-6 bundle Δ −0.74 kB** (276.34 → 275.60 kB) — net negative: both panel chunks shrank more than the shared chunk grew.
- **Item 7 — hex → semantic token migration, bounded scope, exit criterion NOT fully met (honestly recorded) — ✅ landed (DL-49).** Inspection quantified this item's literal "zero hardcoded hex outside `tokens.css`" reading against the remaining budget: ~384 hex occurrences across ~70 distinct values in the agreed UI scope, only 3.16 kB headroom left after item 6. The decisive constraint: a `var(--pg-*)` reference is a **string literal**, not an identifier — esbuild/Vite's minifier shortens names, never string contents — so each substitution costs a deterministic ~+21 B (e.g. `'#64748b'` → `'var(--pg-color-text-subtle)'`), and a full migration was estimated at ~6–9 kB+, infeasible without introducing CSS classes (out of scope — the panels are inline-style-object by design) or breaching the ceiling. **Scope-down, not silent substitution:** delivered (A) the two AA-contrast bugs item 2 measured and deferred (DL-44) — `STRATEGY_COLORS.role`/`.label` (#16a34a, ~3.3:1) and `.testId` (#d97706, ~3.2:1) as small/bold badge TEXT — via a new `strategyTextColor(kind)` helper in `strategy-meta.ts` that routes just those two kinds to the token `-text` role, leaving `STRATEGY_COLORS` itself (which also drives a `color+'18'` tint background at the same call sites) byte-for-byte unchanged, so the fix cannot darken the tint as a side effect; `matchBadge()`'s already-AA-safe literal returns tokenized 1:1 (zero visual change); (B) the VS-Code-style CODE-preview footer's exact-match literals (`#1e1e1e`/`#252526`/`#d4d4d4`/`#6a9955`/`#569cd6`/`#2a2d2e`/`#ce9178`) tokenized to the existing `--pg-code-*` family in both panels. **Deliberately deferred, tracked not dropped:** the XPath `Tabs` underline tab's `accent="#d97706"` — the same literal drives both the tab's text (would want the fix) and the shared `Tabs` primitive's border-bottom indicator (would not want it dimmed) — a dual-role conflict inside the primitive, recommended for item 8. New `test/hex-token-migration.test.ts` (48 tests): `strategyTextColor` unit contract, `matchBadge` token/text/bg triples, numeric WCAG re-derivation for the solid `matchBadge` tint AND the alpha-blended direct-badge tint over all three row backgrounds, plus structural absence/presence guards at every call site this item edited in both panels. Verify green (**758 tests / 27 files**, 710→758). **Item-7 bundle Δ +0.62 kB** (275.60 → 276.22 kB) — confirmed by rebuilding and grepping the production chunks (tokens present at the intended sites, deliberately-preserved literals still present, no new chunk, no dev-only leakage). **The literal "zero hardcoded hex" exit wording is NOT met** — recorded plainly rather than reinterpreted; the two named AA bugs are closed and the code-preview palette is token-backed, with every remaining literal either category-E (no matching token) or the one named, tracked deferral above.
- **Item 8 — final UI polish / theme / accessibility verification ✅ landed (DL-50).** Bounded inspection (not a redesign) found exactly two concrete, provable defects. **(A) A dark-mode contrast regression item 7 itself introduced:** item 7 wrapped certain badge/text `color` values in `var(--pg-color-{success,warning,danger}-text)`, but every background those colours sit on — `matchBadge()`'s tint literals, the `color+'18'` alpha-tint direct badges, the picker status banner — stayed a hardcoded LIGHT literal, unresponsive to `@media(prefers-color-scheme:dark)` (which fires automatically off OS/browser dark mode, no in-app toggle needed). Computed via node one-liners: the dark-resolved token text over the still-light background measured **1.18–1.40:1**, worse than the ~3.2:1 bug item 7 was fixing, and undetectable by item 7's own tests (which verified only the light-mode pairing). Root cause: "a token-driven colour must not pair with a theme-invariant literal background" — the same principle that already makes `--pg-code-*` intentionally theme-invariant (declared once, never overridden, so no pairing bug is possible there). Fix: reverted the 10 affected sites (`strategy-meta.ts`'s `matchBadge()` ×3 + `strategyTextColor()` ×2 branches used across 6 call sites; `SidePanel.tsx` ×4; `Panel.tsx` ×2, overlapping) back to the same literal AA-safe hex (`#166534`/`#92400e`/`#991b1b`) rather than chasing background-tokenization down the same bundle-infeasible wall item 7 hit — cheaper in bytes and fixes every affected site uniformly. **(B) `--pg-focus-ring`** (declared light+dark since item 1) had **zero consumers** anywhere in the codebase; every interactive element relied on the browser default outline, and `SidePanel.tsx`'s Verify Selector `<input>` explicitly set `outline:'none'` with **no replacement** — a real WCAG 2.4.7 (Focus Visible) failure (`Panel.tsx`'s equivalent input never had this). Fix: one shared rule added to `tokens.css` — `button:focus-visible, input:focus-visible { outline:none; box-shadow:var(--pg-focus-ring) }` — covering every native control in both panels (the `Tabs` primitive's tab buttons, every `CopyBtn`/`AddBtn`) with no second focus system; removed the now-redundant inline `outline:'none'`. **Deliberately not retuned:** the ring's own rgba/alpha values (item 1's, unchanged) measure ~2.2–3.0:1 against several light-theme backgrounds (below the WCAG 1.4.11 non-text 3:1 recommendation in some contexts; ~3.0–3.2:1 in dark) — retuning would require design judgment across disparate background contexts, exceeding "wire up an existing token" and risking the "not a redesign" boundary; documented honestly as a smaller, pre-existing, not-fixed-this-pass gap. **Found but out of scope:** the byte-identical Verify Selector card-wrapper styling duplicated between panels (pure decorative duplication, not an a11y/contrast/theme defect); the broader "dark theme is functionally cosmetic in the shipped UI today" limitation (since `body` sets no `background-color` and almost nothing else in the panels is tokenized, toggling dark mode changes almost nothing visible beyond the item 7/8-touched sites) — both flagged for item 9, not attempted here (same infeasibility wall as item 7's full-hex-migration finding). `test/hex-token-migration.test.ts` extended 48→63 (numeric RED-evidence reconstructions of the dark-mode failure, GREEN proofs of the current literal form, structural guards that no `var(--pg-color-*-text)` form remains, guards that `--pg-code-*` is unchanged, guards that no inline `outline:'none'` survives); `test/tokens.test.ts` extended 102→105 (the `:focus-visible` rule exists and cancels the outline it replaces; `--pg-focus-ring` is valid, visible CSS in both themes). Production build scan confirmed: zero `var(--pg-color-*-text)` in any JS chunk, literal hex present in the shared `tokens` chunk, `focus-visible`/`pg-focus-ring` present in the CSS asset, `--pg-code-*` unchanged in both panel chunks, no `outline:'none'` anywhere, no new chunk, no showcase leakage. Verify green (**776 tests / 27 files**, 758→776). **Item-8 bundle Δ −0.18 kB** (276.22 → 276.04 kB) — net bundle-negative: reverting `var(--pg-color-*-text)` (30 chars) to literal hex (9 chars) saves ~21 B per site across 10 sites, more than covering the new CSS rule's cost.
- **Item 9 — final validation / visual + theme + accessibility polish; WS2 EXIT REVIEW ✅ landed (DL-51).** Phase 1 inspection (source-level hex/var() census, token-consumer audit, contrast measurement of every remaining theme-responsive or dual-role colour) found exactly one still-open, concrete, provable defect and closed out DL-49/DL-50's other open threads as permanent decisions. **Fixed:** the main strategy bar's underline `Tabs` used the same per-tab `accent` for both the selected tab's TEXT (needs ≥4.5:1 AA) and its border-bottom indicator (needs only ≥3:1, WCAG 1.4.11) — the exact dual-role conflict DL-49 named and left for "item 8 or 9." Measured: Playwright `#16a34a` 3.30:1 and XPath `#d97706` 3.19:1 both failed as text (CSS `#2563eb` 5.17:1 already passed, unaffected — its accent doubles safely). Fix: `TabItem` gained an optional `textColor?: string` — additive, every existing `SubTabBar` pill caller and the CSS main-bar tab never set it, so their rendering is provably byte-unaffected; `STRATEGY_TABS` supplies it for `playwright`/`xpath` via the **existing** `strategyTextColor()` helper (item 7/8) — `strategyTextColor('role')`=`#166534` (7.13:1), `strategyTextColor('testId')`=`#92400e` (7.09:1) — no new colour, no new token; `accent` itself is completely unchanged, so the border-bottom indicator keeps its original, already-passing colour. **Deferred, not fixed:** the XPath **pill** sub-tab's selected state (`CSS_SUB_TABS`/`XPATH_SUB_TABS` feed `accent="#d97706"` into the pill `Tabs` variant; selected text is white on that fill) measures 3.19:1 — the exact "solid-fill + on-solid text pairs deferred to WS2 Phase B/C" category `tokens.css`'s own item-1 design notes pre-flagged. A safe fix means redesigning an already-shipped, actively-used pill's fill colour or text treatment — outside item 9's "not a redesign, no new brand colours" boundary — so it stays open, measured and pinned by a test rather than silently dropped or silently declared fixed. **Confirmed, not new:** a full token-consumer audit found `--pg-focus-ring` is the _only_ theme-responsive value either panel actually consumes anywhere — every other declared `--pg-color-*` token, plus nearly all spacing/radius/line-height/font-weight/non-base font-size tokens, have zero consumers. This reconfirms (does not newly discover) DL-50's "dark theme is functionally cosmetic" finding, and is recorded as a **confirmed limitation**, not attempted here — the same bundle-infeasible wall DL-49 already measured. The mostly-unused foundation tokens are **confirmed intentionally retained** — not deleted, since no defect requires their removal and doing so would only delete item 1's own target state for a future bounded migration. **Exit-criterion-wording formally resolved:** the roadmap's literal "zero hardcoded hex outside `tokens.css`" reading is **not met and will not be pursued further** under the current inline-style-object architecture and bundle ceiling — a permanent, evidence-based scope-down, not an open question. The criterion's _operative intent_ — no AA-contrast defect ships uncaught — **is met**: every concrete, measured text-contrast failure found across items 2, 7, 8 and 9 is closed, with exactly one named, measured, deliberately-deferred exception (the XPath pill) and the dark-theme limitation both now permanently on record. `test/hex-token-migration.test.ts` gained a RED/GREEN pair reconstructing the pre-item-9 tabAccent-as-text failure before asserting the new `textColor` values pass, plus guards that `accent`/the indicator is unchanged and still clears 3:1, that no new token was introduced, and a pinned (not weakened) measurement of the deferred XPath-pill gap; `test/tabs.test.ts` gained real happy-dom render cases proving the `textColor` override affects only selected TEXT (border-bottom keeps `accent`), that omitting it preserves prior behaviour exactly, that an unselected tab is never coloured by it, and that the `'pill'` variant is completely unaffected. Verify green (**789 tests / 27 files**, 776→789). **Item-9 bundle Δ +0.05 kB** (276.04 → 276.09 kB) — confirmed via rebuild + chunk diff: only the shared `tokens` chunk grew, both panel chunks are byte-identical in size, the `tokens.css` asset is byte-identical (zero CSS touched), chunk list unchanged, zero `var(--pg-color-*-text)` anywhere, zero domain/WS5/WS6 files touched.
- **Budget status (raw, uncompressed).** Cumulative WS2 growth is **+2.33 kB** vs the 273.76 kB pre-WS2 baseline (276.09 kB) — under the <5 KB exit budget with **2.67 kB** headroom. The Chrome-114 minimum still rules out `light-dark()`, so the dark palette remains declared twice (media + explicit) by necessity. Not switched to gzip accounting.
- **Exit-criterion status — RESOLVED (item 9, DL-51).** "Zero hardcoded hex outside `tokens.css`" is **not met** in the literal, exhaustive sense (bundle-budget arithmetic under the inline-style-object architecture, DL-49) and this is now a **permanent, closed decision**, not an open question — the project will not pursue the literal reading further. The criterion's operative intent (no AA-contrast defect ships uncaught) is met: every concrete, measured text-contrast defect found across items 2, 7, 8 and 9 is closed, with one named, deliberately-deferred exception (the XPath pill sub-tab, 3.19:1) and the "dark theme is functionally cosmetic" limitation (DL-50) both now permanently on record rather than open questions.
- **Remaining (canonical numbering):** none — **WS2 items 1–9 are all COMPLETE.** WS2's own exit review (item 9) has been conducted and is recorded above; the next step is authorisation for a subsequent workstream.

### WS3 — Capture / Performance / Live DomProbe · L · 7–9 d · **PARTIALLY COMPLETE**

> **Status (DL-52).** PARTIALLY COMPLETE, not fully closed. Every deliverable below landed and is
> verified except the **standalone IIFE probe build**, which stays explicitly deferred — its
> consumer/purpose is not determinable from the repository (re-confirmed this pass: DevTools no
> longer uses `inspectedWindow.eval` at all, so no live eval-context channel exists for it to feed) —
> and needs a project-owner decision before it can be implemented, not a guess. The whole-extension
> bundle ceiling (278.76 kB) is currently **exceeded by 1.98 kB (0.71%)**, disclosed rather than
> silently absorbed or fixed by cutting functionality; this is an open item for the project owner
> (accept, raise the ceiling, or claw the bytes back in a future pass), not a WS3 failure to close.

**Purpose.** Rebuild the content script as a fact-capture host implementing `DomProbe`; eliminate the O(n²) scan; enable frames; harden the picker; enforce the snapshot budget.
**Deliverables.** split `content.ts` into `runtime/capture`, `runtime/probe`, `runtime/picker` · normalized text index · lazy memoised visibility · `LiveDomProbe` + per-pick memo cache · `ElementContext` with all §17.6 caps · snapshot size guard + degradation ladder · `all_frames: true` + frame identification · overlay into a **closed shadow root** · rAF-throttled highlight · standalone IIFE probe build · background: one typed router, **sender validation**, **no synthetic `{ok:true}`**, validated `executeScript` target · CI benchmarks.
**Dependencies.** WS0, WS1. **Out of scope.** Recording · assertions · selector generation · UI · storage v2.
**Exit — reviewed against evidence, DL-52.** ≤1 whole-document traversal per pick — **✅ PROVEN** (`wholeDocumentTraversals` diagnostic + a direct test). Every fixture snapshot <25 KB, `<body>` worst case <50 KB — **✅ PROVEN (DL-53)**: two tests added to `runtime-fact-model.test.ts` close the gap flagged at DL-52 — a realistic `captureSnapshot` pick asserts `assessSnapshotBudget(...).status==='ok'` and `.bytes < 25,600`; a deliberately pathological synthetic snapshot (first asserted to genuinely exceed 50 KB pre-degradation, so the test cannot pass vacuously) asserts `assessSnapshotBudget(degradeSnapshot(...)).bytes < 51,200` and that the pick's core fields survive degradation untouched. Iframe picking works — **✅** `all_frames:true` live, same-origin frame identification correct, cross-origin frames guessed (as designed — no cross-origin API makes this precise) — **not manually smoke-tested in a real browser**. Sender validation rejects foreign senders — **✅ PROVEN** (`isFromExtensionUI`, tested). Background never returns success for an unhandled message — **✅ PROVEN**, pre-existing (`normalizeAck`) and re-verified. Content bundle ≤60 kB — **✅** (`content-scripts/content.js` is 24.71 kB, comfortably under). No side-panel regression — **✅**, by construction (`StoredPick` shape and ranking policy unchanged) and by the full `pnpm verify` pass, but **not manually smoke-tested in a real browser**. **Standalone IIFE probe build — ⬜ DEFERRED**, per the design blueprint's own §17/§27 finding. CI benchmarks (§18 of the design blueprint) — **⬜ NOT IMPLEMENTED** this pass (not named in the implementation authorization's required deliverables; left for a future pass if wanted).
**Note.** Stage-1's P0-1B is a pre-landed subset of this workstream's "no synthetic success" deliverable.

### WS4 — Session Storage (Storage V2: Session & Persistent State) · M · 4–5 d · **CLOSED / COMPLETE** (DL-66)

> **Execution pointer (DL-64, 2026-09-03).** WS4 is the **next implementation workstream**, because WS9
> explicitly depends on its persistence/workspace foundation (D2). **WS4 has not started**: it runs its own
> discovery → implementation gate → owner decision → implementation → validation → closure cycle, and no
> WS4 work was performed in the gate that set this pointer. The canonical roadmap ordering is unchanged;
> only the execution pointer is clarified, and it is dependency-driven.

> **Status (DL-66, 2026-09-03 — WS4 IMPLEMENTED AND CLOSED).** Owner decisions O1–O5 were approved and
> implemented. Delivered: one additively-extended `StorageGateway` with typed `StateDescriptor` access
> (namespace `pg:v2:`, per-value version envelope, deterministic validators, `local`/`session` split,
> `tabId` scoping); a verify-before-retire v1→v2 migration on `onInstalled` that is idempotent, leaves v1
> intact on any failure and quarantines malformed legacy values without copying their content; real
> `tabs.onRemoved` cleanup plus a bounded orphan sweep; Clear data; and rewired `SidePanel` + `content.ts`,
> the latter through the existing RuntimeMessage seam (`PERSIST_PICK` / `PERSIST_PICKER_STATE`, tab identity
> taken from `sender.tab.id`) so the storage implementation never enters `content.js`. **All five exit
> criteria are met**, criterion 4 at unit/structural evidence with real-browser multi-tab validation
> **deferred**. DevTools persistence stays WS5; recording stays WS9. Bundle +9,631 B, disclosed and not
> optimised. The roadmap's "quota caps + debounced writes" deliverable defines no numeric limit or interval
> anywhere, so quota-failure handling is implemented and the two numbers await an owner decision.
>
> **Discovery record (DL-65, 2026-09-03 WS4 discovery gate — discovery only, no implementation, no source
> change).** Traced: `StorageGateway`
> exists as a WS0 port with **zero implementations and zero consumers**; all persistence is direct
> `browser.storage.local` against the **six flat global keys**, with no namespace, version, validation, tab
> scope, quota handling or debounce; `background.ts`'s `tabs.onRemoved` listener exists but only logs; there
> is **no `onInstalled` listener**, so no migration exists. `pg_code_buffer` is written only by the side
> panel as fire-and-forget full-array overwrites and read back through an unchecked cast; **the DevTools
> panel never persists its buffer at all**. **All five exit criteria are RED**, consistent with NOT STARTED,
> and F-9 (global picker state) is the direct cause of the two-tab criterion. Architecturally compatible —
> no second engine, AST, resolver, `DomProbe`, CommandBus or persistence layer, and **no dependency
> required**. Under R3 the contract is provable at **UNIT + STRUCTURAL** level with a fake backend; real
> Chrome multi-tab, `onInstalled`, quota and service-worker behaviour is **DEFERRED / FUTURE
> INFRASTRUCTURE**. **Five owner decisions block implementation:** O1 contract sufficiency · O2 which state
> is tab-scoped (notably whether `pg_code_buffer` is global or per-tab) · O3 migration criticality, since
> §25 Unknown #3 is still open · O4 evidence level for two-tab independence · O5 how far consumer rewiring
> goes before it becomes WS5. See `ws4-discovery-implementation-gate-2026-09-03.md`.

**Purpose.** Versioned, validated, tab-scoped storage with a lossless v1 upgrade.
**Deliverables.** `StorageGateway` with runtime validation · namespace + `local`/`session` split · tab-scoped keys · idempotent, failure-safe migration on `onInstalled` · `tabs.onRemoved` cleanup + orphan sweep · quota caps + debounced writes · "Clear data".
**Dependencies.** WS0 (independent of WS1/WS2). **Out of scope.** History/favourites UI · settings UI · recording _usage_.
**Exit.** A v1 install upgrades with **zero loss of `pg_code_buffer`** · migration is idempotent · failure leaves v1 intact · two tabs keep independent picker state · corrupted storage degrades to empty.
**Future relationship.** Natural home for the `testIdAttribute` preference (§15 of the audit, U9).

### WS5 — Shared Application Layer + UI Extraction (incl. DevTools) · L · 11–13 d · **COMPLETE (DL-68)**

> **Status (DL-34, DL-54).** PARTIAL, not complete. The **DevTools consolidation** landed (`EVAL_SCRIPT`
> deleted, one `buildScoredPick` for both surfaces — DL-28…DL-31). **DL-54** landed the `ClipboardPort`
> adapter (real `writeText` with typed failure, replacing 4 previously-uncaught call sites) and
> DevTools `network.onNavigated` invalidation (a real, previously-undocumented staleness bug: a reload
> could leave the panel showing facts about a detached element). The `PickSource`/`CommandBus`
> adapters, the hooks/services layer and the leaf-first component extraction (`SidePanel.tsx` →
> ~120 lines) are **outstanding** — DL-54 found `PickSource` genuinely blocked (its `getCurrent()` is
> typed to return `PickSnapshot`, but WS3 deliberately keeps `PickSnapshot` out of the live capture
> path at zero bundle cost, so an honest adapter cannot satisfy the port's literal signature without
> reopening that WS3 decision), and found `CommandBus` redundant with the already-working
> `RuntimeMessage`/`normalizeAck` seam (implementing it would be a valueless wrapper or a protocol-wide
> rewrite, not the smallest necessary change). Must not be recorded COMPLETE until the extraction lands.
>
> **Discovery gate, 2026-09-03 (DL-67) — measured, not implemented.** A discovery-only pass re-measured
> this workstream against its own contract and changed no production source. `SidePanel.tsx` is
> **905 lines** — 209 ABOVE the 696 the Deliverables line below assumes, because WS4, WS6.2, WS7 and
> WS8 all legitimately added to it — and `Panel.tsx` is **470**. `src/hooks/` and `src/services/` **do
> not exist**; `PickSource`, `CommandBus` and `TabContext` still have zero implementations and zero
> consumers. Of the six Exit criteria: `EVAL_SCRIPT` gone 🟢, zero `chrome.*` in `src/ui/` 🟢,
> byte-identical snapshots 🟡 **structurally** satisfied (one `capturePick` for both surfaces, pinned
> by `devtools-architecture.test.ts` — but no byte-level comparison test exists), the two line-count
> criteria 🔴, and manual regression 🔵 BLOCKED. Phase 0's "diverged in seven ways" was re-measured
> symbol by symbol rather than repeated: **eight shared symbols are genuinely identical** and safe to
> extract mechanically, `RecommendedCard` differs only cosmetically, and **seven real divergences**
> exist — including `.dblclick()` being **entirely absent from the DevTools panel** (a capability, not
> copy), the DevTools code buffer being **in-memory only**, and the two surfaces resolving **different
> tabs** (`tabs.query({active:true})` vs `inspectedWindow.tabId`). The extraction risk is now concrete:
> **16 test files containing 220 `it()` blocks assert on the panels' source TEXT**, so extraction moves
> the text those guards search for and the failure mode is a guard that still passes while guarding
> nothing. One capability DL-54/DL-55 did not weigh: this repo has a working per-file
> `@vitest-environment happy-dom` render pattern (`tabs.test.ts`, `showcase.test.ts`) with R3 untouched
> — **not Chromium, and never offered as Chromium evidence**, but a real in-repo net for leaf
> extraction. **Eight owner decisions (O1–O8) are required before any WS5 implementation**, including
> whether ≤150/≤100 is still the exit bar against the real 905. See
> `ws5-discovery-implementation-gate-2026-09-03.md`. **WS5 remains PARTIAL; nothing was implemented.**
>
> **IMPLEMENTED AND CLOSED (DL-68, 2026-09-03).** The owner approved O1–O8 and WS5 was built.
> `SidePanel.tsx` is **98 lines** and `Panel.tsx` **89** — against bars of ≤150 and ≤100, reached by
> moving responsibility out, not by compressing anything. The presentation lives once in
> `src/ui/panel/**`, the orchestration in `src/hooks/**` (eight focused hooks and one composer) and
> `src/services/**`, and the one thing that genuinely differs between the surfaces — how a verified
> `StoredPick` is obtained — is now two `PickSource` adapters in `src/browser/pick-source.ts`.
> **WS0's `PickSource` and `TabContext` ports finally have implementations**, five workstreams after
> they were declared. DevTools joined the ONE global code workspace (O1) through WS4's gateway, binds
> to `inspectedWindow.tabId` and never to the active tab (O2), and its `$0` pick now becomes that
> tab's `LAST_PICK`. All seven measured divergences are resolved, and **four more that DL-67's
> declaration-level sweep could not see (D-h…D-k) were found while extracting and recorded rather than
> merged quietly.** `CommandBus` stays unimplemented (DL-54 locked). **All 16 source-text guard files
> — 254 `it()` blocks — were converted to follow a surface's real import closure**, so a guard can no
> longer pass while guarding nothing; exactly one guard was inverted, by O1, with the supersession
> named in the test. Exit criterion 5 is now a **byte-level measurement** rather than a structural
> argument. 1,214 tests / 51 files; R2/R3/R5 and privacy unchanged; R1's coverage widened to the new
> directories. Bundle **308,473 → 292,713 B (−15,760)** as the arithmetic of deleting a duplicated
> panel — **not** an optimisation pass — with `content.js` unmoved. **Real-Chrome regression was not
> performed and is not claimed.** See `ProgressDocument/ws5-implementation-2026-09-03.md`.

**Purpose.** One implementation of the product, consumed by both surfaces.
**Deliverables.** ports (`PickSource`, `CommandBus`, `ClipboardPort`, `TabContext`) · **both** adapters · 8 hooks · services · leaf-first component extraction · `SidePanel.tsx` 696 → ~120 lines · `Panel.tsx` → ~80 lines · **`EVAL_SCRIPT` deleted** · `network.onNavigated` invalidation ✅ (DL-54) · DevTools theme sync (not attempted — unverifiable without a real Chrome DevTools session) · runtime validation of eval results · delete `element-scorer.ts` + dead code ✅ (audited — never existed under that name, nothing to delete) · **error boundaries** ✅ (already landed, `ErrorBoundary.tsx`) · clipboard with fallback and failure UI ✅ (DL-54, `ClipboardPort`).
**Dependencies.** WS2, WS3, WS4. **Out of scope.** New features · visual redesign — **must be visually neutral** · recording · assertions.
**Exit.** `SidePanel.tsx` ≤150 lines · `Panel.tsx` ≤100 · `EVAL_SCRIPT` gone · zero `chrome.*` in `ui/` · **both surfaces produce byte-identical snapshots for identical input** · every pre-existing feature verified by manual regression.
**Risk.** Highest-risk workstream — touches everything, proves nothing. Strangler pattern, leaf-first, revertible per step. DL-54 deliberately did not attempt the leaf-first extraction for this reason — no real-browser manual regression coverage was available to prove it safe.

### WS6 — Recommended Locator (incl. WS6.2 Verification V2) · M+L · 8–10 d · **PARTIALLY DELIVERED** (WS6.2: **PARTIAL — FOLLOW-UP REQUIRED**)

> **Status (DL-34, DL-54, DL-56, DL-57, DL-58).** PARTIALLY DELIVERED, not complete. DL-21's **recommendation
> surfacing** shipped ahead of the workstream (`recommendLocator()` reads the ranked candidates; both
> surfaces render the card — DL-32/DL-33). **DL-54 audited every other exit criterion below and found
> each one already met** (no duplicated ranking logic — now permanently guarded by
> `test/recommendation-parity.test.ts`; `resolvesUniquely` reused; every rationale code has copy,
> compile-time enforced; no raw score ever rendered). `RecommendedLocatorCard`/`VerdictBadge` were
> investigated as a possible extraction and found to be an **existing locked decision, not a gap** —
> DL-45/DL-48 already examined and kept `RecommendedCard` local twice, as genuinely divergent product
> copy between panels; DL-54 did not reopen it. **WS6.2 Verification V2** (the Playwright-subset
> parser, `VerifyLocatorPanel`) is now **implemented** (DL-56) — hand-rolled parser + `verifier.ts`'s
> six-state `classifyVerification` reusing the single existing `LocatorResolver`, wired through the
> existing `RuntimeMessage` seam, `VerifyLocatorPanel` mounted in both panels' existing Verify Selector
> card. All functional/test/architecture requirements met (938 tests / 40 files; R2/R3/R5 unchanged).
> **DL-57's bundle reduction gate** then investigated the build graph (confirmed tree-shaking already
> excludes every unrelated module from `content.js`; confirmed no panel-side duplication; confirmed
> imports were already correctly type-only), tried one metadata fix (`sideEffects: false`, Δ 0 B,
> reverted) and removed 8 dead diagnostic strings never read by any consumer (Δ −325 B, retained) — zero
> functional change, same 938 tests. **DL-58's dependency-isolation gate** then proved, via a controlled
> build experiment (WS6.2's `content.ts` wiring temporarily removed, measured, then fully reverted), that
> `resolver.ts`'s core (`resolveStep`) was already bundled into `content.js` before WS6.2 — the Pick
> feature's `capture.ts` has called it since WS3 — so there is no "broad resolver" left to isolate; the
> true irreducible WS6.2 marginal cost is 6,759 B, almost entirely the parser itself. No code was changed.
> The sole open item is a disclosed bundle overage, still 293,353 B,
> 14,593 B/5.24% over the locked 278,760 B ceiling, awaiting an owner
> bundle-policy decision — **WS6.2 status: PARTIAL — BUNDLE STILL OVER CEILING**, not COMPLETE, and not
> BLOCKED (no missing code, no missing verification coverage, no architecture issue — confirmed by direct
> experiment, not assumption). WS6 as a whole
> must not be recorded COMPLETE.
>
> **DISCOVERY FINDINGS ONLY (DL-69, 2026-09-03) — recorded, NOT corrected, NOT implemented.** A gate
> asked for "WS6.3" and found that **no such workstream exists**: this section defines WS6.1, WS6.2 and
> the WS6.2.1 gate and nothing else, and every `WS6.3` string in the repository is a negative "not
> started" disclaimer written by the WS5 gates from their own prompt's exclusion list. What that gate
> did find, by tracing the verification path and measuring it, are **two honesty defects inside WS6.2's
> accepted scope**, neither previously recorded: **V-1** — `resolveChain` calls `resolveStep` with no
> scope, so every step of a chained expression is measured against the whole document and the chain
> reports the TERMINAL step's document-wide count; `page.getByRole('list').getByText('Save')` can read
> **verified, 1 match** where Playwright resolves **0**. WS0's own `contracts.test.ts:170` pins this and
> names WS3 as its owner; WS3 shipped `ProbeOpts.scope`/`ScopeHandle` (already used by `capture.ts:78`)
> and never wired `resolveChain`, and WS6.2 then built expression verification on top of it. **V-2** — a
> regex `name` option is silently dropped, so `getByRole('button', { name: /Sav/ })` is verified as if
> unconstrained; measured, the string and regex forms issue the identical probe call and the identical
> verdict. **Also recorded, not corrected:** the bundle figures quoted above (293,353 B / 14,593 B /
> 5.24%) are **stale** — WS5 reduced the bundle to 292,713 B / 13,953 B / 5.01%, though WS6.2's _status_
> is unchanged; and WS6.1's Deliverables ask for a "debug mode for raw scores" while the Exit criterion
> below counts the **absence** of a debug mode as a pass, which is self-contradictory. WS6.1's
> Primary/Secondary/Educational hierarchy and F-12's "built, tested, invisible" surfacing remain
> genuinely NOT STARTED. All of it awaits owner decisions D1–D4. See
> `ProgressDocument/ws6-3-discovery-gate-2026-09-03.md`.
>
> **TRUST CORRECTION (DL-70, 2026-09-04) — two of three landed, one stopped at its boundary.**
> **The "WS6.3" label is RETIRED as accidental. It is NOT a roadmap workstream and no WS6.3 section
> exists**; the defects belong here, in WS6.2, and the outstanding UI items stay in WS6.1 below.
> **V-2 is corrected:** a regex accessible-name option no longer silently becomes `undefined` — one
> guard beside the regex guard WS0 has had since the beginning returns the **existing**
> `UNSUPPORTED_STEP`, which the **existing** six-state verifier already maps to `unsupported`. No new
> verification state was invented, the parser was not modified, and regex name matching is neither
> implemented nor approximated. **V-1 is NOT corrected**, deliberately: scoped chain resolution needs a
> scope derived from a step's matches, and the `DomProbe` port cannot supply one — `scopeOf` only
> validates an existing handle, `ProbeCount` returns counts alone, and `scopeFor(el)` lives only on the
> concrete `LiveDomProbe`. Changing the port is an owner decision, so `resolveChain` was left
> byte-identical rather than partially scoped, and rejecting all chains was refused as the dishonest
> alternative. **V-3 was discovered and recorded, not fixed:** the parser accepts eight options and the
> resolver reads two, so `checked`, `pressed`, `selected`, `expanded`, `disabled` and `level` are parsed
> and then ignored — the same fabrication as V-2, six more times. The **`§WS6.2` bundle figures quoted
> above remain stale** and are still not corrected here; measured now: 292,801 B total, 14,041 B /
> 5.04% over the locked ceiling, of which +88 B is this correction's guard. 1,229 tests / 52 files;
> lint, typecheck and build all pass. **Real-browser evidence remains unavailable and is not claimed.**
> See `ProgressDocument/ws6-2-trust-correction-2026-09-04.md`.
>
> **VERIFICATION TRUST GATE (DL-71, 2026-09-04) — D2 and V-3 CLOSED. WS6.2's
> verification honesty is complete at happy-dom evidence level.**
> The owner supplied the ambiguity policy DL-70 stopped for, and both remaining
> fabricated verifications are gone. **V-1 (D2) is corrected: a chained locator is
> now measured INSIDE its parent.** The port gained exactly one optional field —
> `ProbeCount.scope?: ScopeHandle` — and **no method was added, none removed, and no
> signature changed**; the shape is the one WS0's own `ResolveResult.stepCounts` doc
> comment specified ("requires the probe to return scope handles for matched
> elements"), so this is a wiring change, not a new architecture. The owner's policy
> is implemented verbatim: a parent matching **0** makes the chain **not-found**, a
> parent matching **exactly 1** scopes the child to that element, and a parent
> matching **2+** makes the chain **ambiguous** with the child never evaluated. There
> is no first-match, no `.nth(0)`, no arbitrary parent and no document-wide fallback;
> a unique parent the probe cannot name is reported `unsupported` rather than quietly
> widened. The handle is minted only when `visible === 1` (enforced once, in
> `measuredCount`), remains opaque and runtime-only, and `resolveChain` never returns
> one — so no DOM reference reaches a message, snapshot, AST or stored pick.
> `stepCounts` is now cumulative, exactly as WS0 predicted, with its shape unchanged.
> **V-3 is corrected as UNSUPPORTED, not implemented:** `checked`, `pressed`,
> `selected`, `expanded`, `disabled` and `level` now return the **existing**
> `UNSUPPORTED_STEP` and surface through the **existing** `unsupported` status. No new
> verification state and no new error code were introduced, ARIA state matching is
> neither implemented nor approximated, and presence disqualifies rather than
> truthiness — `{ checked: false }` selects unticked boxes and is a real filter. The
> refusal lives in the resolver, not the parser, because these expressions are valid
> Playwright and reporting them `invalid` would be a different, untrue claim.
> **D3 is preserved and asserted, not assumed:** a string `name` still resolves, a
> regex `name` is still `unsupported`, and `exact` is still honoured everywhere it was.
> Bundle: 292,801 B → **293,814 B (+1,013 B, +0.35%)**, measured not targeted; the
> `§WS6.2` figures quoted above remain stale and are still not corrected here.
> **1,294 tests / 54 files** (from 1,229 / 52) — +65, all new and all written
> failure-first (7/16 and 33/41 failing against the old implementation). Test, build,
> typecheck, lint and format each run alone with its exit code read individually.
> **Real-browser evidence remains unavailable and is not claimed.**
> See `ProgressDocument/ws6-2-verification-trust-gate-2026-09-04.md`.

**WS6.1.** `RecommendedLocatorCard` · rationale copy layer · `VerdictBadge` · Primary/Secondary/Educational hierarchy · scoping / `nth` / frame explanations · verdicts replace scores · debug mode for raw scores · N/A rows migrated to rationale codes.
**WS6.2.** Syntax detection · Playwright subset parser (recursive descent, **no eval**) · reuse `LocatorResolver` · **visible-vs-total reporting** · typed `ParseError` with caret position · `VerifyLocatorPanel`. **Implemented DL-56, bundle-reduced DL-57, dependency-isolation investigated DL-58** — `packages/locator-engine/src/parser.ts`/`verifier.ts`, `src/ui/VerifyLocatorPanel.tsx`; `.filter(...)`/`page.frameLocator(...)` deliberately rejected as `UNSUPPORTED_METHOD` (the resolver doesn't read those AST fields — parsing them would fabricate verification), `.nth(n)` supported (the resolver does implement it). DL-57 investigated the build graph and removed 8 dead `ParseError.detail` diagnostic strings (Δ −325 B) with zero functional change. DL-58 proved by a controlled build experiment that `resolver.ts`'s core was already bundled for the pre-existing Pick feature, leaving no isolation opportunity; the true irreducible WS6.2 marginal cost is 6,759 B. Status: **PARTIAL — BUNDLE STILL OVER CEILING** — functionally complete, bundle overage disclosed (still 14,593 B/5.24%, confirmed irreducible without cutting functionality), owner decision open.
**Dependencies.** WS5. **Out of scope.** CSS/XPath generation · recording · assertions · full Playwright grammar · expression editing.
**Exit.** _(Reworded DL-55, owner-decision gate — replaces the DL-54-flagged "chain renders with `frameLocator`/`nth`" wording, which described a representation `recommendation.ts` deliberately never produces, not a gap in it.)_ The recommendation is **deterministic** — the same ranked `candidates` always yield the same `strategy` — is always a **valid Playwright locator strategy** Playwright itself can execute, applies **correct frame-aware semantics** via `frameInfo` when the picked element is inside a nested frame, produces **stable strategy/rationale output** across repeated calls on the same pick, **never fabricates a locator claim** (a candidate that was not actually verified is never presented as recommended — no `pick.chain`-style unmeasured fallback, no silent `.nth(0)` on an ambiguous winner), and is **surfaced identically** in both panels. It is explicitly _not_ required to render as a specific string form such as `frameLocator(...)`/`nth(...)`; `recommendation.ts`'s own module doc explains why that representation was rejected — `buildLocatorChain`'s `chain` can synthesise an unmeasured fallback step and append `.nth(0)` to an ambiguous winner, a positional locator the product warns against elsewhere, so showing it as "recommended" would be an assertion, not a finding. · every rationale code has copy ✅ (compile-time enforced) · no raw score ever leaks to the UI ✅ (no raw score anywhere; no debug mode exists) · all supported forms verify · zero `eval`/`new Function` ✅ — WS6.2's parser is now built (DL-56) and a standing security-guard test enforces this against the actual parser source, not merely true by absence.
**Note.** Stage 3 of the gate is a WS6.1 subset landed early.

### WS7 — CSS / XPath Truth & Verification · **CLOSED / COMPLETE** (DL-60, 2026-09-03) at accepted scope · original selector-engine spec below is DEFERRED / FUTURE DIRECTION

> **Accepted scope (owner decision, DL-60, 2026-09-03).** WS7 is closed at the truth-classification scope
> implemented and verified by the DL-59 gate: raw CSS/XPath `VERIFY_SELECTOR` results are classified
> through the same six-state `classifyVerification` function WS6.2's `VERIFY_LOCATOR_EXPRESSION` already
> used, so both features speak one vocabulary for "was this a real match." This is now the stated exit bar
> for WS7 — not a partial or interim state. Generated CSS/XPath variants (`utils/css-xpath.ts`, ~160 per
> element) remain what they always were: an authored, DOM-unqueried stability **hint**, rendered as neutral
> prose, with `UNVERIFIED_SELECTOR_NOTICE` stating the list is not checked against the page. Nothing in
> this closure changes that, and nothing should be read as implying those generated variants are now live
> per-candidate verified — they are not. See §12 History below for what the original spec described and why
> it remains deferred, not implemented.

**Purpose (as closed).** Make the raw CSS/XPath "Verify Selector" result truthful, using the existing
six-state `VerificationStatus` model rather than a bespoke one, without merging it into or changing
`VERIFY_LOCATOR_EXPRESSION`, and without implying generated CSS/XPath variants are live-verified.
**Deliverables (as closed).** `classifyVerification` reused for `VERIFY_SELECTOR`'s success and error paths
(`content.ts`) · a shared `src/ui/verify-selector-status.ts` presenting the six-state result identically in
both panels · `RuntimeMessageAck.verifyStatus` threaded end to end · 14 new tests plus source-text guards.
**Exit (as closed).** Raw `VERIFY_SELECTOR` responses carry a `verifyStatus` from the same six-state model
`VERIFY_LOCATOR_EXPRESSION` uses · no independent, hand-rolled classification remains in either panel ·
existing count-based success-path copy and its pinned `honesty.test.ts` assertions untouched · 952/41 tests
green · no new engine/AST/resolver/DOM abstraction introduced.

> **History — original spec (pre-DL-59, retained verbatim for record; DEFERRED / FUTURE DIRECTION, not
> current WS7 scope).**
>
> **Purpose.** Make generated CSS/XPath _true_, and separate it from reference material.
> **Deliverables.** new `selector-engine` package · context-aware **verified** generation · dynamic-id +
> utility-class heuristics · correct escaping + XPath `concat()` quoting · Generated/Reference UI split ·
> reference data migrated with `whenToUse`/`caution` · `GeneratedSelector` vs `ReferenceExample` types
> making badge misuse **structurally impossible**.
> **Dependencies.** WS1, WS3, WS5. **Out of scope.** Shadow-DOM selectors · selector editing.
> **Exit.** **For every fixture, every generated selector actually matches the intended element** ·
> reference examples carry no badge or count · `css-xpath.ts` deleted · probe budget ≤60 · snapshot budget
> respected.
> **Note.** This is the real fix for F-2. Stage 1 only tells the truth in the meantime.
>
> This larger package-level rebuild — live per-candidate verified generation, `css-xpath.ts` deletion, the
> `GeneratedSelector`/`ReferenceExample` type split — is **not** a failed or unfinished part of WS7. It is
> **not** a hidden requirement for the closure above. It is future direction, undertaken (if ever) as its
> own separately-numbered workstream, not as unfinished WS7 debt.
>
> **Status (DL-59, 2026-09-03 CSS/XPath truth gate — discovery record, superseded by the DL-60 closure
> above).** A separately-chartered "WS7 truth gate" — narrower than this section's original spec, and
> explicitly bounded that way by its own authorising instructions (no new engine/AST/resolver, no broad
> refactor) — ran a discovery-first audit of every CSS/XPath generation and verification path against F-1/F-2
> and the original Purpose above. **Found already closed**, by prior stages, with direct evidence:
> `utils/css-xpath.ts`'s ~160 generated variants already carry only an authored, DOM-unqueried hint rendered
> as neutral prose (never a tick-mark verdict), with `UNVERIFIED_SELECTOR_NOTICE` already stating the list is
> "not checked against the page" — Stage 1/WS2, pinned by `honesty.test.ts`; `FixtureDomProbe.countXPath`
> already honestly returns `UNSUPPORTED` rather than faking happy-dom XPath support; `LiveDomProbe.countXPath`
> already uses real `document.evaluate`; ranking never touches CSS/XPath data (F-1 stays closed); no
> "confidence"/"reliability" word survives in shipped copy. **Found and fixed one genuine gap**: the raw
> CSS/XPath `VERIFY_SELECTOR` feature (separate from WS6.2's `VERIFY_LOCATOR_EXPRESSION`) classified every
> probe error into one generic string via two independently hand-rolled panel implementations, never reusing
> WS6.2's own `classifyVerification` six-state function — now unified (`content.ts` classifies through the
> same function/vocabulary; a new shared `src/ui/verify-selector-status.ts` presents it identically in both
> panels). **Did not implement** the original Deliverables/Exit above — no `selector-engine` package, no
> per-candidate verified generation, no Generated/Reference type split, `css-xpath.ts` not deleted, no
> fixture-matched exit criterion. 952 tests / 41 files, R2/R3/R5 unchanged; bundle 293,353 B → 294,425 B
> (+1,072 B), now 15,665 B (5.62%) over the 278,760 B ceiling, disclosed per this gate's own explicit
> instruction not to re-open bundle optimization. **Resolved by DL-60**: the accepted scope above is now the
> WS7 exit bar; this larger spec is deferred/future direction as stated.

### WS8 — Polish / a11y / Security / Performance Validation · M · 4–5 d · **CLOSED / COMPLETE** (DL-62) at the owner-authorised, re-baselined scope

> **Accepted exit bar (owner decision, DL-62, 2026-09-03).** This is what WS8 is scored against from now
> on. The original wording is preserved below as historical record; two of its four criteria were found
> unmeetable as written and are **superseded / re-scoped**, not quietly dropped.
>
> 1. **Accessibility — structural guards.** `test/a11y-structure.test.ts` (22) covers the approved WS8
>    accessibility scope: native-control-only interaction, accessible names on icon-only buttons, live
>    regions on both panels' status bars, the tablist's roving-tabIndex contract, and the shared focus
>    rule. **axe-core is DEFERRED**, because no DOM or browser test environment exists under the current
>    R3 architecture (all three vitest projects declare `environment: 'node'` by design) and standing one
>    up is an infrastructure decision in its own right. **axe-core was not run, and structural guards are
>    not equivalent to it.**
> 2. **Keyboard / focus.** Every interactive element is structurally verified as a native,
>    keyboard-reachable control, with the project-approved visible focus ring — solid, and asserted at
>    ≥3:1 against every background/surface token in its own theme, plus a `forced-colors` outline.
> 3. **Error states.** Every supported WS8 error state carries title, cause and action through the shared
>    error-state matrix (`src/ui/copy/errors.ts`, 9 states, exhaustive `Record`, rendered only through
>    `ErrorNotice`, which takes a code and never caller-supplied prose).
> 4. **Motion.** `prefers-reduced-motion` is implemented and guarded.
> 5. **Performance.** The budgets this repository actually defines — `SNAPSHOT_BUDGET` (25 KB/50 KB and
>    its collection caps) and WS3's `content.js ≤ 60 kB` — are pinned and pass (`test/budgets.test.ts`).
> 6. **Real-site validation** remains **manual / release validation** (the smoke matrix, WS11). It is not
>    represented as automated WS8 evidence, and the smoke matrix is **not** claimed complete.
> 7. **Toast system — DEFERRED / FUTURE.** No accepted criterion depends on it.
> 8. **Bundle** — 298,842 B total, 31,753 B `content.js`, against the locked 278,760 B ceiling:
>    **20,082 B (7.20%) over**. This is separate, disclosed **owner-level release-budget debt**, not part
>    of this closure decision, and the ceiling is **not** claimed to be met.

**Purpose.** Validate and harden everything through WS7 before feature work resumes.
**Deliverables.** ARIA audit · focus management · live regions · reduced motion · full error-state matrix · toast system · empty/loading/error states · dark-mode polish · keyboard shortcut docs · copy review · **security review checkpoint** · **performance validation on real sites**.
**Dependencies.** WS5, WS6, WS7.
**Exit (original wording — retained as historical record; criteria 1 and 4 SUPERSEDED / RE-SCOPED per DL-62, see the accepted exit bar above).** axe-core zero critical/serious in both panels in both themes · every interactive element keyboard-reachable with a visible focus ring · every error has title, cause, action · §20.6 budgets hold on 3+ real sites. — _`§20.6` does not exist anywhere in this repository: §20 is "FrameworkProfile Concept `FUTURE`", it has no numbered subsections, and the string `20.6` occurs exactly once, in this very line. Recorded as a roadmap defect (DL-61, DL-62)._
**Known issue.** WS9/WS10 land _after_ this pass — mitigated by (a) mandatory WS2 primitive composition and (b) WS11 re-running these gates.

> **Implementation record (DL-61, 2026-09-03 WS8 discovery/implementation gate — superseded as a status
> line by the DL-62 closure above, retained for its findings).** Two of the four Exit criteria
> above were **re-scoped by owner decision** during this gate, because discovery found defects in the
> criteria themselves rather than in the code:
>
> | #   | Criterion (as written above)                               | Status                                                                                                                                                                                                                                                                                                                                                                                                              |
> | --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | E1  | axe-core zero critical/serious, both panels, both themes   | 🟡 **RE-SCOPED** → structural a11y guards (`test/a11y-structure.test.ts`, 22), honestly labelled as **not axe and not Chromium**. axe-core is in no manifest; every vitest project is `environment: 'node'` by deliberate R3 design and no render harness exists. Real axe validation is **named follow-up work**, not a silent omission.                                                                           |
> | E2  | every interactive element keyboard-reachable, visible ring | ✅ **MET.** All interaction is on native controls (guarded). The ring — measured at 1.98:1 light / 1.74:1 dark, under WCAG 1.4.11, and deferred at DL-50 — is retuned solid and now clears **3:1 against every surface token in its own theme**, asserted per token. Four icon-only buttons that had no accessible name were named. Forced-colors mode gets a real outline.                                         |
> | E3  | every error has title, cause, action                       | ✅ **MET.** `src/ui/copy/errors.ts` — 9 states × {title, cause, action}, exhaustive `Record`, rendered through one shared `ErrorNotice` that accepts a code and never caller-supplied prose.                                                                                                                                                                                                                        |
> | E4  | §20.6 budgets hold on 3+ real sites                        | 🟡 **RE-SCOPED** → **`§20.6` does not exist.** §20 is "FrameworkProfile Concept `FUTURE`", has no subsections, and `20.6` appears exactly once in this repository: in the Exit line itself. No time-based budget was ever written. Bound instead to the budgets that do exist (`SNAPSHOT_BUDGET`, `content.js ≤ 60 kB` — `test/budgets.test.ts`); real-site validation stays with the manual smoke matrix and WS11. |
>
> **Also delivered:** live regions on both panels' status bars (previously announced to nobody), reduced
> motion via one `!important` stylesheet block that overrides the panels' inline animations. **Deferred by
> owner decision:** the toast system — no Exit criterion depends on it and the bundle is already over its
> ceiling. **Not delivered, and not claimed:** keyboard shortcut docs (no `commands` are declared in the
> manifest, so there is nothing to document yet), dark-mode polish beyond the ring (DL-51 already recorded
> that the dark theme is functionally cosmetic — `--pg-focus-ring` is the only theme-responsive value any
> panel consumes, which this gate improved rather than expanded).
>
> 1,037 tests / 44 files; bundle 294,425 B → 298,842 B (Δ +4,417 B, now 20,082 B / 7.20% over ceiling —
> disclosed, not chased); `content.js` byte-identical at 31,753 B.

### WS9 — Recording · L · 8–10 d · **PARTIAL — SLICES 1–4, 5A, 5B, 5C, EXPORT (CLIPBOARD), THE CODE WORKSPACE, THE V1 CODE-PATH RETIREMENT, NAVIGATION/SPA/TAB SEMANTICS AND THE TRUTHFUL ACTION COUNT / REFUSAL FEEDBACK IMPLEMENTED (DL-72…DL-75, DL-77…DL-84); DOWNLOAD BLOCKED (DL-80); V1 STORED-DATA MIGRATION DEFERRED (DL-82); FRAME RECORDING UNSUPPORTED BY DECISION (DL-83)**

**Purpose.** Recording that is real, structured, honest, privacy-safe.
**Deliverables.** `runtime/recorder` with the noise filter and coalescing · `RecordedWorkflow` with **verified `LocatorChain`s** + `ElementFactsLite` · **activation handshake + heartbeat** · navigation/SPA/frame/tab handling (**navigation, SPA and tab semantics done; FRAME recording refused as unrecordable — DL-83**) · **limits from the single constant** · **password/card/file redaction** · `renderAction` + `renderSpecFile` · structured code workspace · v1 raw-line migration (**code path retired; stored-data migration DEFERRED — DL-82**) · export menu.
**Dependencies.** WS3, WS4, WS5, WS7. **Out of scope.** Assertions (WS10) · DevTools recording · step editing.
**Exit.** **An E2E test that kills the content script proves the RECORDING banner cannot appear** — **MET (DL-88)**: proven in both halves, `ws9-fail-closed.e2e.mjs` (shipped artifact, banner absent) and `ws9-recording-enabled.e2e.mjs` (E2E-only artifact, banner observed then stopped), 15/15 in real Chromium · 40 does not interrupt · 100 stops with preserved state · passwords never captured · workflow ≤500 KB at 100 actions.

> **FINAL RELEASE GATE (DL-90, 2026-09-05) — WS9 IS _NOT_ WEB STORE RELEASE READY, AND NOT BECAUSE
> OF A CODE DEFECT. ZERO production source and ZERO production config files changed; the bundle is
> unchanged at 316,751 B.** Every technical gate that could be executed PASSED, in real Chromium,
> against the exact package that would be uploaded: production `START_RECORDING` returns
> `recording-disabled` and writes nothing; the production and E2E manifests differ in EXACTLY ONE key
> (`name`) with identical permissions; the package carries zero E2E or test leakage; password and
> payment values are never captured (proven at runtime with deliberate non-secrets, with the
> generated code emitting `// fill: value withheld (password) — supply it yourself` rather than
> inventing a value); and CSS/XPath truth holds across all ten cases.
>
> **Publication is blocked on FOUR OWNER-SUPPLIED INPUTS**, three of which `RELEASE-GATES.md` already
> lists as v0.1.x blockers: **icons** (absent entirely — Gate 1.6, and the packager prints "NONE —
> release input still outstanding" on every run), a **privacy policy** (none exists; current Web Store
> policy requires one for user data handled even locally, and Gate 4 requires it hosted at a real
> URL), **store listing assets** (no 128×128 icon, no 1280×800 screenshot, no 440×280 promo tile, no
> description, no category), and **manual Chrome validation** (Gate 1.10 records the DevTools, Verify,
> privacy and language rows as NOT EXECUTED; Gate 1.11's clean-clone load also outstanding). Gate 4
> further states **"Publishing is PAUSED until explicitly resumed"**, and nothing here resumes it. No
> URL, asset, category or version was invented.
>
> **REPOSITORY-LOCATION CORRECTION.** The previous gate's "not a git repository" phrasing was too
> broad. Git is installed in the execution container; the CONTAINER tree is not a worktree; but the
> OWNER'S repository IS one and was inspected: HEAD `refs/heads/main` =
> `8a4b5942f6a0e1182e04f00eaa9adf1b91943677`, last commit DOCS-ONLY from 2026-08-30. Working-tree
> status is NOT VERIFIABLE from here (file access, no shell). **That tree is at the DL-86 state** — no
> `wxt.e2e.config.ts`, no `build:e2e` — so it contains neither DL-88 nor DL-89, and a package built
> there today would not be the audited one. Mirroring is an OWNER ACTION.
>
> **A DL-88 HAZARD FOUND AND CORRECTED.** DL-88 claimed this repository had no `.gitignore` and wrote
> one containing only `.output-e2e`. The owner's repository has a 1,799-byte `.gitignore` predating
> this session, and the DL-88 file would have REPLACED it — un-ignoring `node_modules/`, `.output/`
> and secret patterns. The real rules are restored with `.output-e2e/` appended, the guard now pins
> both, and **owner decision F is WITHDRAWN**.
>
> **Owner decisions G and H were investigated and classified NON-BLOCKING; neither was implemented** —
> the current picker lock-out is the conservative state, and a typed dispatch ack code changes the
> message contract and DL-79's inputs. All 30 WS9 inventory items are classified, and every deferral
> is non-blocking for one structural reason: `RECORDING_ENABLED = false`, so no recording feature is
> reachable by a user in the shipped artifact. **RELEASE READY and FEATURE COMPLETE are separate
> concepts: WS9 remains FEATURE-PARTIAL, and neither is claimed.** Nothing was submitted to the
> Chrome Web Store.

> **OWNER DECISION E RESOLVED (DL-89, 2026-09-05) — NARROW UI-TRUTH CORRECTION IMPLEMENTED.
> `LIVE > DURABLE > UNKNOWN` IS UNCHANGED; THE PERSISTED SCHEMA IS UNCHANGED; `RECORDING_ENABLED`
> REMAINS `false`.** DL-88 raised the residual window in which the panel kept displaying
> `RECORDING — perform actions on the page` after a content script died. **The resolution separates
> two things DL-88 conflated: the ACTIVE VIEW is an acceptable consequence of DL-79 and was left
> alone; the CLAIM the panel made about that view was not.** The banner did not merely state a
> status — it issued an imperative, and actions taken on it are lost in silence. Measured over five
> real-Chromium runs at 14,445–15,267 ms, deterministic.
>
> Three facts were established that no document held before: `dispatchToTab` RE-INJECTS the content
> script on every poll, so the stale window is confined to pages the extension cannot inject into;
> re-injection into `about:blank` is refused with `Cannot access contents of the page`, so the
> extension held POSITIVE evidence of impossibility and discarded it into an untyped `ok:false`; and
> the panel re-polls on every render (59–66 ms) rather than at the documented 5,000 ms.
>
> **This also CORRECTS DL-88's own evidence.** The E2E harness hosts the Side Panel as an ordinary
> TAB, so `isFromExtensionUI` rejects every live query as `UNTRUSTED_SENDER`; E2E-A4 and E2E-A5
> exercised the DURABLE path only, and the confirmed banner line was never fed by live evidence in a
> browser. **Owner decision B is now measured** — `chrome.sidePanel.open()` requires a user gesture
> Playwright cannot supply, and the container never surfaces as a page — so the confirmed line
> remains unobservable in E2E. A control run confirms the kill, not the clock, causes the expiry.
>
> The fix is three production files and +186 B: one optional `confirmed` parameter on
> `recordingBannerLine`, one bound expression (`observedView(ack) !== 'unknown'`) governing both the
> durable fallback and the banner claim so the two cannot drift, and the banner's green ground and
> blinking dot withdrawn together with the sentence. **The false imperative now ends at the first
> poll rather than at heartbeat expiry.** Options B (immediate invalidation) and C (a shorter
> `heartbeatTimeoutMs`) were rejected with reasons, and no timing constant moved.
>
> **NEW, RAISED NOT MADE: (G)** the record button and picker lock-out during an unconfirmed window;
> **(H)** a typed ack code for "this page cannot host a content script", which would shorten the
> ACTIVE window itself rather than only the claim — an architectural change to the message contract
> and to DL-79's inputs, therefore DEFERRED.

> **DECISION A IMPLEMENTED (DL-88, 2026-09-05) — THE E2E EXIT CRITERION IS NOW PROVEN IN ITS SUFFICIENT
> FORM. `RECORDING_ENABLED` IN PRODUCTION REMAINS `false` AND ZERO PRODUCTION SOURCE FILES CHANGED.**
> The owner authorised Candidate D. `packages/extension/wxt.e2e.config.ts` — invoked by no build, verify,
> zip or package script — INHERITS the production config and differs in exactly three ways: `outDir` is
> `.output-e2e`, the manifest `name` is `Playwright Guru — E2E RECORDING BUILD`, and one module is
> substituted at resolution time (`src/config/recording.ts` → `test/e2e/recording-enabled.config.ts`,
> whose `RECORDING_ENABLED` is `true` and which re-exports the limits rather than copying them). **The
> substitution is keyed on the RESOLVED ABSOLUTE PATH** — DL-87's correction — and the build **throws and
> writes no artifact** if it never fires, if any module but the substitute still imports production, or if
> the production line stops saying `false`; all three were fault-injected and measured. **The two loaded
> manifests differ in exactly one key, `name`; the permission set is identical.** In real Chromium the
> E2E artifact accepts `START_RECORDING`, reaches `lifecycle: active`, turns a real click into a real
> `RecordedStep` through the real engine, **displays `RECORDING — perform actions on the page`**, and then
> — after a real navigation to `about:blank` kills the content script — stops claiming it, reports
> `The recorder stopped responding — nothing is being captured`, and never returns. E2E **15/15**.
>
> **X1's re-scope (D1, DL-64) is therefore SUPERSEDED for this criterion.** D1 accepted "unit +
> structural proof" as a stand-in and required that it never be presented as live-browser evidence. It no
> longer has to be: the criterion is now met by a real browser running the real built artifacts. D1 stays
> in the record as the honest interim position it was.
>
> **RESIDUAL FINDING (OWNER DECISION E) — reported, not fixed.** Making the banner observable for the
> first time exposed a pre-existing gap: for up to `heartbeatTimeoutMs` (15,000 ms; measured 15,129 ms)
> after the content script dies, the panel CONTINUES to display RECORDING, sourced from the durable
> observation while the stored row still literally reads `lifecycle: 'active'`. That is DL-79's authorised
> precedence (LIVE > DURABLE > UNKNOWN) with DL-73's clock-derived expiry as its only bound. Narrowing it
> is a new owner decision and was **not** made inside this slice.

> **DECISION A FEASIBILITY (DL-87, 2026-09-05) — FEASIBLE, AWAITING AUTHORIZATION; nothing implemented, zero production
> files changed.** A disposable experiment built BOTH artifacts and ran BOTH in a real Chromium. **Class 3 is impossible**
> (the runtime's `enabled` seam is unreachable from a built extension). **Class 1 is rejected** (it would change the
> guarantee from "disabled unless the SOURCE changes" to "disabled unless the ENVIRONMENT says otherwise"). **Class 2 works
> — but only in one specific form.** The obvious form, a vite `resolve.alias` on the specifier string, built cleanly and
> produced a **half-enabled artifact: UI on, runtime off**, because two different specifiers reach the flag module
> (`'../config/recording'` from six `src/` files including the runtime, `'../../src/config/recording'` from the three panel
> components). Keying on the **resolved absolute path** instead was proven end to end: production `recording-disabled` /
> `inactive`; E2E `lifecycle: 'active'` with a real session id, a real click admitted into the real durable workflow
> (`RECORDED_STEPS=1`), then the content script killed and the live authority gone. **Rollback semantics preserved
> verbatim; zero guard changes; zero new dependencies; permissions identical; production bundle Δ 0.** Second finding:
> **byte size cannot tell the artifacts apart** (`!0`/`!1` are the same length) — verification must be behavioural.
> **Owner decision A is now a yes/no with a recommendation, not an open question.**
>
> **E2E HARNESS BUILT (DL-86, 2026-09-05).** The infrastructure DL-85 named now exists:
> `packages/extension/test/e2e/` launches a real Chromium, loads the real built extension, and drives its real
> service worker, content script and Side Panel document — **9/9 passing, nothing mocked**. Measured first: MV3
> extensions do NOT load in Playwright's default headless shell (`SERVICE_WORKER=NO`); they DO under Chrome's new
> headless via `channel: 'chromium'`. No new dependency — playwright stays ad-hoc per DL-20, the runner is
> `node --test`, and the built bundle is **byte-identical** with no trace of the harness in it. **Kill = navigating
> the tab to `about:blank`**, which `<all_urls>` does not match, destroying the content-script context while the tab
> survives; the resulting `Receiving end does not exist` is exactly what `normalizeAck` turns into `NO_HANDLER`.
> Newly proven in a browser: the loaded manifest's permissions, the real lifecycle answer, the real Side Panel
> rendering, that a planted durable `active` row cannot fabricate a live active, and **DL-74's runtime flag gate**
> (`START_RECORDING` → `recording-disabled`). **The gate is still NOT closed:** proving a banner _cannot_ appear is
> only meaningful if it _could_, and `RECORDING_ENABLED=false` means it never can. Reaching ACTIVE needs a test-only
> build in which that literal is not `false` — **owner decision A**. The blocker moved from "no infrastructure" to
> "one authorization".
>
> **EXIT AUDIT (DL-85, 2026-09-05).** Four of the five have evidence, verified individually: _40 does not interrupt_
> (`ws9-recording-workflow` + `ws0-seams`), _100 stops with preserved state_, _passwords never captured_ (seven files,
> including the throwing-getter test), _≤500 KB at 100 actions_ (`assessWorkflowBudget`). **The first is BLOCKED.** Its
> substance is proven at unit level — a dead content script yields `NO_HANDLER`, `observedView` collapses that to
> `unknown`, and nothing leads from `unknown` to a recording claim — but the criterion demands an E2E TEST and none
> exists. The two `refresh-*-golden.mjs` conformance scripts DO launch real Chromium, and were inspected: they prove
> Playwright's own semantics, load no extension, use no persistent context, and playwright is deliberately not a repo
> dependency (DL-20). **Missing infrastructure, named:** a persistent context with the built extension loaded, so the
> service worker, side panel and a content script coexist and the content script can be killed while the panel is
> observed. That is its own workstream. **Four of five is not four-fifths of a gate — `RECORDING_ENABLED` stays
> `false`.**
> **Current status.** Recording UI is **intentionally disabled** (`RECORDING_ENABLED=false`) until this workstream makes it real. WS9 turns it on by flipping one constant.

> **Discovery status (DL-63, 2026-09-03 WS9 discovery gate — no implementation started, no source changed).**
> The contract above was traced against the repository. **Architecturally clear:** §18's "SAME DomProbe →
> SAME LocatorResolver" needs no new engine — `resolveStep` is already reachable inside `content.js`
> through the pre-existing Pick path (`runtime/capture.ts`, proven by DL-58) — and `ElementFactsLite` /
> `toElementFactsLite` already exist. **Already owned:** `RECORDING_LIMITS` is genuinely the single source
> of truth and is pinned by `ws0-seams.test.ts`; the `RECORDING_ENABLED` gate is pinned by
> `preview-gate.test.ts`. **Missing:** `RecordedWorkflow`, `renderAction`, `renderSpecFile`, the activation
> handshake, any heartbeat consumer (all six timing constants have zero consumers today),
> navigation/SPA/frame/tab handling, the export menu and the structured code workspace.
> **The legacy recorder in `entrypoints/content.ts` is dead code and is not a foundation:** it is
> unreachable (no `START_RECORDING` case), it stores raw `attrs` rather than verified chains — contradicting
> §18 — it hard-codes a 600 ms debounce against the constant's 500 ms (DL-4, still open), and its input
> filter does not exclude `password`. Nothing is captured today because nothing can reach it.
>
> **FINALIZATION / EXIT VALIDATION (DL-85, 2026-09-05).** An audit, not a feature slice. WS9-FINAL-01…24 were checked
> against the existing suites first and **23 of 24 were already covered**, so nothing was duplicated. One real defect
> was found and fixed: **the language preference never persisted for Python or C#.** `PW_LANG` declared its own
> five-member vocabulary while `LANGS` offered `TargetLanguage`'s `python_sync` and `csharp_async`; `useLanguage` wrote
> them through an `as StoredLanguage` cast that hid the mismatch, and `writeGlobal` — which validates on the way in —
> returned `INVALID_VALUE`, so the choice silently fell back to TypeScript on reopen. This was DL-80's recorded debt,
> and it reached WS9 because the workspace and export both render in `panel.lang`. **`StoredLanguage` is now
> `TargetLanguage`** — one vocabulary, both casts gone — with the WS4-era `python`/`csharp` **accepted and mapped
> forward on read**, so no existing install loses its saved choice. No schema version moved, no descriptor changed, no
> migration entry was added. Two WS4 guards were repaired to assert the intent rather than the old literal. Bundle
> +198 B, in `background.js` and the tokens chunk only. **Refusal visibility after the recorder dies was analysed as
> technically safe and deliberately NOT implemented** — it is DL-84's open owner decision (a), and answering it here
> would be answering my own question.
>
> **TRUTHFUL ACTION COUNT AND REFUSAL FEEDBACK (DL-84, 2026-09-05).** DL-83 left the admission boundary refusing
> actions correctly and saying nothing, so a user clicking inside an iframe got a recording that was silently,
> correctly empty. **What "action count" means was MEASURED, not chosen:** `appendStep` already feeds
> `workflow.steps.length` to `shouldStopRecording`, and `config/recording.ts` already names that parameter
> `actionCount` — so the 40/100 contract has ALWAYS counted accepted `RecordedStep`s, coalescing included. This
> slice re-labels nothing; it surfaces the number the limit already uses. The recorded count is DERIVED from the
> durable workflow (persistence.ts's own rule: "a second copy of one fact is a second thing to disagree"), while
> refusals — which are deliberately NOT in the workflow and derivable from nothing else — ride two OPTIONAL,
> ADDITIVE fields on the existing `RecordingObservation`, with **no schema-version bump**. The boolean at the
> centre of the trust boundary became `refusalFor` in a new pure `recording/admission.ts`, and `isTrustworthy` is
> now literally `refusalFor(target) === null`: **one authority, returning its reason instead of discarding it.**
> Five codes, every one borrowed from the engine's existing vocabulary. The noise filter and a dead session are
> deliberately NOT refusals. The UI is one line inside the banner's existing live region. Bundle +1,705 B; the
> user-facing copy is genuinely tree-shaken, the runtime vocabulary is not, and both are reported.
>
> **NAVIGATION / SPA / FRAME / TAB (DL-83, 2026-09-05).** Measured, not assumed. Full navigation, content-script
> replacement and tab close were ALREADY correct — derived liveness, opaque session identity and WS4's tab-scoped
> `clearTab` between them — and are now pinned by 38 assertions rather than trusted. Three real gaps were closed:
> the Side Panel named no target tab on `START_RECORDING`/`STOP_RECORDING`/`QUERY_RECORDING_STATE`, so every one fell
> through to the background's active-tab fallback (a second lookup the panel's `panel.pick.tabId` binding did not
> control); every frame ran its own recorder, because `allFrames: true` plus a `frameId`-less `tabs.sendMessage`
> reached them all; and **an in-frame action produced a step whose `frameSelector` was GUESSED by `detectFrameInfo`
> while its counts were measured inside the frame**, which `generateLocatorCode` then rendered as
> `page.frameLocator(<guess>)`. **Frame interaction is now classified UNRECORDABLE and refused at admission** — no
> flattening, no invented frame model, no UNVERIFIED step. SPA route changes deliberately do NOT end a recording:
> session lifetime is not element-fact lifetime, and every action re-resolves against the DOM that exists then.
> **No new permission** — `webNavigation`/`tabs` were considered and rejected, and the existing DevTools
> `network.onNavigated` invalidation is unavailable to the Side Panel. Bundle +291 B. Frame support, refusal
> feedback in the UI, and recording across a full page load all require owner decisions.
>
> **RETIRED (DL-82, 2026-09-05).** Every sentence above was re-measured against the current source and held,
> so the block, the panel's permanently-empty `recordedActions` state and `src/ui/recording/test-code.ts`
> were deleted. DL-4's last live instance went with them, `entrypoints/content.ts` now makes zero direct
> `browser.storage` calls, and the `page.locator('<tagName>')` fabrication exists nowhere in production.
> **The V1 STORED DATA was not touched.** `pg_recording_active` and `pg_recorded_actions` hold
> `RecordedAction[]`, which carries none of the eight measured fields a V2 `RecordedStep.target` requires,
> so no honest transformation exists and re-resolution is forbidden for stored migration. The keys are
> preserved byte-for-byte with no reader, no writer and no deleter; **the migration half of this deliverable
> is DEFERRED and requires an owner decision** (leave inert · disclosed user-initiated discard · a
> degraded-import slice that would first have to make an UNVERIFIED step representable end to end).
>
> **Exit criteria:** "40 does not interrupt", "passwords never captured" and "≤500 KB at 100 actions" are
> **implementable** with existing architecture and honest unit/byte-budget evidence. Two are **blocked**:
> the **E2E kill-the-content-script proof** (no extension E2E infrastructure exists — `@playwright/test` is
> in no manifest, there is no `e2e/` directory, and all three vitest projects are `environment: 'node'`
> under R3), and **"100 stops with preserved state"**, which needs versioned, validated, tab-scoped storage
> — the six flat global keys in use today are precisely the defect `StorageGateway`'s own doc says
> **"WS4 implements"**, and **WS4 is NOT STARTED**. WS9's "v1 raw-line migration" deliverable is the same
> work as WS4's own "zero loss of `pg_code_buffer`" exit criterion. **Three owner decisions are required
> before WS9 implementation can begin** (DL-63): the E2E evidence level, the WS4 dependency, and
> confirmation that the legacy recorder is replaced per §18 rather than extended.

> **Owner decisions (DL-64, 2026-09-03 WS9 owner decision / re-baseline gate — documentation only, no
> implementation).** All three blockers above are now resolved, and **WS9 implementation has not started**.
>
> - **D1 — X1 evidence level: RE-SCOPE ACCEPTED.** For the current WS9 implementation gate, "an E2E test
>   that kills the content script proves the RECORDING banner cannot appear" is satisfied by **unit +
>   structural proof of the recording activation / heartbeat / staleness behaviour**. This is **not
>   equivalent to live-browser E2E validation and must never be presented as such**; live-browser proof
>   remains **DEFERRED / FUTURE INFRASTRUCTURE**. No E2E harness, `@playwright/test`, Chromium fixture or
>   DOM test environment was added, and R3 is unchanged.
> - **D2 — WS4 dependency: WS4 IS IMPLEMENTED FIRST.** WS9's "100 stops with preserved state", its
>   structured code workspace and its v1 raw-line migration all depend on versioned, validated, tab-scoped
>   persistence, which is WS4's responsibility. **WS4 is now the next implementation workstream** and
>   **WS9 stays BLOCKED / DEFERRED until that foundation exists.** No temporary WS9 persistence layer, no
>   ad-hoc storage slice and no recording state on the current flat keys is authorised. **The canonical
>   ordering WS0 → WS1 → … → WS9 → WS10 → WS11 is unchanged** — this clarifies the _execution pointer_
>   only, and it is dependency-driven, not a reorder. WS4 itself is **NOT STARTED** and runs its own
>   discovery → implementation → owner decision → validation → closure cycle.
> - **D3 — legacy recorder: REPLACED, NOT EXTENDED.** The future WS9 recorder is built against §18's
>   architecture — capture action → SAME `DomProbe` → SAME `LocatorResolver` → verified `LocatorChain` →
>   verdict + rationale → `ElementFactsLite` → `RecordedWorkflow`. The unreachable legacy recorder is not
>   the implementation target and was not modified. **DL-4 stays historical and is not rewritten**: its
>   600 ms-vs-500 ms contradiction is **not "fixed" by this gate** — that value lives in obsolete
>   unreachable code slated for replacement, the future recorder must consume `RECORDING_LIMITS`, and no
>   WS9 recorder has been built.
>
> `RECORDING_ENABLED` remains `false`. No dependency, no infrastructure, no bundle optimisation and no
> source change occurred in this gate.
>
> **IMPLEMENTATION — SLICE 1 (DL-72, 2026-09-04). WS9 is PARTIAL, not closed, and
> `RECORDING_ENABLED` is still `false`: recording remains unreachable by any user.**
> D2's block ("WS9 stays BLOCKED / DEFERRED **until that foundation exists**") lifted
> by its own terms when WS4 closed at DL-66; D1 and D3 were already answered. The
> scope is this gate's own §14 "Recommended Implementation Boundary", verbatim: the
> `RecordedWorkflow` data model (verified chains + `ElementFactsLite`), the
> `runtime/recorder` with coalescing driven by `RECORDING_LIMITS`, redaction and
> truncation, and the limit behaviour at 40/100.
>
> **NOT built and NOT stubbed:** the activation handshake, the heartbeat, persistence
> of any kind, `renderAction`/`renderSpecFile`, the export menu, the structured code
> workspace, the v1 raw-line migration, navigation/SPA/frame/tab handling, and any UI
> or `content.ts` wiring. Those are §14's own later slices.
>
> **§18 honoured literally — there is no second locator implementation.**
> `recordedTargetFor` calls the EXISTING `captureSnapshot`, which calls the EXISTING
> `resolveCandidates` → `LiveDomProbe` → `resolveStep`/`resolveChain` path the Pick
> feature has used since WS3, and reduces with the EXISTING `toElementFactsLite`.
> `RecordedTarget.locator` **is** the existing `RecommendedLocator`, so a recorded
> action and a pick describe a located element in exactly one way. A source-text guard
> pins that `recorder.ts` contains no `new LiveDomProbe`, no `resolveChain(`/
> `resolveStep(` call and no `querySelectorAll`/`document.evaluate` — it pins the
> absence, so the guarantee survives future edits.
>
> **Privacy: a secret is never READ, not merely never stored.** The field is classified
> first from descriptive facts alone (`SensitiveFieldFacts` structurally cannot carry a
> value) and `.value` is touched only when the answer is "not sensitive" — proven by
> making `.value` a throwing getter for password, file and `autocomplete="cc-*"` fields.
> The model additionally DELETES (not masks, not truncates) any value on a redacted
> step. Name matching is tokenised rather than `includes()`, so `discardReason` is
> correctly NOT redacted — over-redaction would break the feature just as surely as
> under-redaction would leak. This closes the legacy recorder's filter, which excludes
> `checkbox,radio,file,button,submit,reset` and **not** `password`.
>
> **DL-4 is not repeated and not rewritten.** Every number comes from
> `config/recording.ts`, guarded by an assertion that the recorder's code contains no
> `600`/`500`/`400` literal. The legacy recorder was not modified, extended or deleted:
> deleting it belongs to the slice that actually replaces it per D3. One constant was
> added where that file's own contract requires it — `maxWorkflowBytes = 500 × 1024`,
> for §WS9's "≤500 KB at 100 actions" — as a REPORTING budget that measures and never
> truncates; 100 realistic actions measure ~35 KB.
>
> **1,343 tests / 56 files** (from 1,294 / 54) — +49, all new. Both suites were written
> first and confirmed failing because the modules did not exist. Test, build, typecheck,
> lint and format each run alone with the exit code read individually; all pass but the
> permanent `ws2-item9-report.md`. R1/R2/R3/R5, privacy, honesty, `preview-gate` (7/7,
> `RECORDING_ENABLED` still pinned `false`) and WS6.2's trust suites all green — no
> D2/V-3 regression.
>
> **Bundle: 293,814 B → 293,814 B, Δ 0 B**, verified by finding zero occurrences of the
> new symbols in `.output/chrome-mv3` — nothing shipped imports them, so tree-shaking
> excludes them, the same arrangement `fact-model.ts` has had since WS3. The overage is
> unchanged at 15,054 B / 5.40% over the locked ceiling and remains owner-level debt.
>
> **Real Chromium tested: NO.** Unit + happy-dom + structural guards only — DL-64/D1's
> re-scope, which is **not equivalent to live-browser E2E and is not presented as such**.
> WS9's X1 exit criterion is untouched by this slice; it belongs to the handshake /
> heartbeat slice and live-browser proof remains deferred future infrastructure.
> See `ProgressDocument/ws9-implementation-2026-09-04.md`.
>
> **IMPLEMENTATION — SLICE 2 (DL-73, 2026-09-04): the recording LIFECYCLE.
> WS9 is still PARTIAL and `RECORDING_ENABLED` is still `false`.**
> The boundary was confirmed from three authoritative sources rather than inferred:
> §14 above sequences the handshake+heartbeat as the unit between slice 1 and the
> renderers; **DL-64's D1** already authorises it and fixes its evidence level
> ("unit + structural proof of the recording activation / heartbeat / staleness
> behaviour"); and `config/recording.ts` says the flag flips "once the recorder,
> the activation handshake and the heartbeat exist". The gap was measured, not
> assumed — `heartbeatMs` and `heartbeatTimeoutMs` had **zero consumers**.
>
> **Built:** `src/recording/session.ts`, a pure five-state lifecycle — `inactive`
> (no session) · `starting` (requested, content has NOT answered — the window in
> which a naive implementation shows "Recording" while capturing nothing) ·
> `active` (acknowledged AND heartbeating; the only state that records) · `stale`
> (**terminal**) · `stopped` — with an opaque branded `RecordingSessionId`.
>
> **Liveness is DERIVED, not stored — the architectural core.**
> `isRecording(session, now)` recomputes staleness from the clock on every call;
> no boolean is ever set. So a content script that dies the way content scripts
> actually die — reload, navigation, tab discard, extension update, crash — sends
> no message, fires no event and calls no transition, and the session stops
> reading as recording anyway, purely because time passed. A caller that forgets
> to poll cannot obtain a stale `true`, because there is no stored `true` to
> obtain. This is the structural answer to "what happens if the controlling
> context disappears", and it needed no browser to establish.
>
> **Identity, not timestamps.** Every mutating entry point takes the session id it
> claims to act on, so a stale start, heartbeat, stop and action are each refused
> for naming a different session. Staleness is terminal: a late beat cannot
> resurrect a recorder that may have missed actions, because a recording with an
> unknown hole is worse than one that honestly ended. An activation nobody
> acknowledges ages out on the same clock, so a handshake cannot wait forever.
>
> **Slice 1 is reused, not re-implemented.** The lifecycle gates capture and owns
> none of the workflow rules — `appendStep` still owns the limits, coalescing,
> truncation and redaction — and a test drives a full 100-action recording through
> the lifecycle to prove it end to end. Reaching the hard stop ends the SESSION as
> well as the workflow.
>
> **NOT built and NOT stubbed:** `content.ts` wiring · new message types · any
> CommandBus · persistence · UI or banner · `renderAction`/`renderSpecFile` ·
> export menu · structured workspace · navigation/SPA/frame/tab · legacy-recorder
> deletion (untouched, per DL-64/D3). **The flag stays off on its own reasoning:**
> flipping it now would expose a Record control that starts a session and captures
> nothing — precisely the defect `RECORDING_ENABLED` was created to prevent.
>
> **1,376 tests / 57 files** (from 1,343 / 56) — +33, all new, written
> failure-first. Two architecture guards then failed against the new module; both
> hits were in **prose, not code**, and the guards were corrected to strip comments
> — strictly stronger, and neither loosened. Test, build, typecheck, lint and
> format each run alone with the exit code read individually; all pass but the
> permanent `ws2-item9-report.md`. R1/R2/R3/R5, privacy, honesty, `preview-gate`
> (`RECORDING_ENABLED` still pinned `false`), WS6.2's trust suites and Slice 1's
> suites all green — no regression, and Slice 1's throwing-getter privacy tests are
> intact and unmodified.
>
> **Bundle: 293,814 B → 293,814 B, Δ 0 B**, verified by finding zero lifecycle
> symbols in `.output/chrome-mv3`. Overage unchanged at 15,054 B / 5.40 %.
>
> **Real Chromium tested: NO.** Pure `environment: 'node'` unit tests — no DOM, no
> browser, no timers, since the model takes its clock as a parameter. Exactly
> DL-64/D1's re-scope, **never presented as live-browser E2E**. WS9's X1 criterion
> is now met at that re-scoped level; live-browser proof remains deferred
> infrastructure. See `ProgressDocument/ws9-slice2-lifecycle-2026-09-04.md`.
>
> **IMPLEMENTATION — SLICE 3 (DL-74, 2026-09-04): RUNTIME WIRING + ACTUAL CAPTURE.
> Recording really happens when started — and `RECORDING_ENABLED` is still `false`,
> so no user can start it. WS9 remains PARTIAL.**
> Slices 1–2 built the engine and the lifecycle and neither was reachable. This
> slice wires them into `entrypoints/content.ts`. **Recorded honestly: §14 above
> does not itself name a wiring slice** — it sequences slice 1 → handshake+heartbeat
> → renderers/export/workspace — so this rests on WS9's Purpose ("Recording that is
> **real**"), its Deliverables, four of its five Exit criteria (which all describe a
> _running_ recorder), DL-64/D3, and the post-DL-73 current-state.
>
> **The message seam needed almost nothing, measured not assumed.**
> `START_RECORDING`/`STOP_RECORDING` were already typed, already routed to the
> target tab, and already sender-validated by `isFromExtensionUI`. **`background.ts`
> was not modified at all.** Two optional `sessionId` fields were added; no new
> message type, no event bus, no CommandBus.
>
> **THE ADMISSION RULE — and the measured finding that makes it load-bearing.**
> `isTrustworthy` refuses `chain.nth !== undefined`, `visibleMatchCount !== 1`, and
> any verdict outside `excellent`/`good`. For two indistinguishable buttons the
> engine does **not** report ambiguity to its caller: `buildLocatorChain` appends
> `.nth(0)` and `resolveChain` measures that chain as **verdict `good`,
> visibleMatchCount 1, chain.nth 0**. Both the "one match" and "good verdict"
> clauses pass — **only the `nth` clause refuses it.** Without it a positional guess
> would be recorded as a verified result, the exact failure class WS6.2 removed from
> verification. A test pins the measurement. No CSS fallback, no XPath fallback, no
> guessed text: **recording nothing is the correct outcome**, and the refusal is per
> action.
>
> **Fail-closed everywhere** — inactive, `starting`, `stale`, `stopped`, foreign
> session, disabled flag, and a detached target (caught, not recorded, never thrown
> into the page). **The product flag now fails closed at the runtime too**, because
> hiding the Record button is not a security boundary. **Privacy re-proven on the
> live path:** throwing `.value` getters plus real `dispatchEvent` for password,
> file and `cc-*` fields; Slice 1's tests preserved unmodified. **Legacy recorder
> untouched and proven unreachable** by a new guard; its deletion remains debt.
>
> **1,413 tests / 58 files** (+37, all new, failure-first, exercising the real
> capture/probe/resolver pipeline). Every gate run alone: test/build/typecheck/lint/
> format 0 bar the permanent `ws2-item9-report.md`. WS3/WS4/WS5/WS6.2/WS7/WS8 guard
> suites green — no regression, and `background-router` and `runtime-fact-model` are
> untouched.
>
> **BUNDLE — MATERIAL REGRESSION, DISCLOSED, OWNER DECISION REQUIRED.**
> 293,814 B → **308,201 B (+14,387 B, +4.90 %)**, _all_ in `content.js`
> (33,150 → **47,537 B, +43.4 %**); background/sidepanel/devtools Δ 0 B. Now
> **29,441 B / 10.56 %** over the locked 278,760 B ceiling, up from 5.40 %.
> Attributed by controlled experiment (DL-58's method): wiring removed → `content.js`
> measured exactly 33,150 B → restored, confirmed `diff`-identical. The cause was
> foreseen — `fact-model.ts` states it is "NOT IMPORTED BY `content.ts`,
> DELIBERATELY" because wiring it "was measured to cross the extension's raw-size
> ceiling", and defers the decision to "the workstream that puts a `PickSnapshot` in
> front of a UI". Recording needs `captureSnapshot` for the verdict the admission
> rule depends on, so that workstream is this one. No optimisation was attempted.
> Because `content.js` is injected into every frame of every page, users today
> download +14,387 B for a feature the flag prevents them using. **Options raised,
> none taken:** accept · defer the `content.ts` wiring to the flag-flip slice
> (reversal is three lines and returns `content.js` to 33,150 B exactly, proven) ·
> reconsider the ceiling, open owner debt since DL-56.
>
> **Real Chromium tested: NO.** Runtime integration is verified through
> deterministic unit/structural tests; **real Chromium verification remains
> pending** and no manual, DevTools or production check was performed or is claimed.
> **Deferred, documented, not built:** the controller-side liveness marker (its
> consumer must outlive the content script, so it needs persistence or UI — both out
> of scope), persistence, UI/banner, renderers, export menu, structured workspace,
> v1 migration, navigation/SPA/frame/tab, legacy-recorder deletion, and flipping
> `RECORDING_ENABLED`. See `ProgressDocument/ws9-slice3-runtime-wiring-2026-09-04.md`.
>
> **IMPLEMENTATION — SLICE 4 (DL-75, 2026-09-04): the RENDERERS. A recording can
> now be projected into Playwright source. WS9 remains PARTIAL and
> `RECORDING_ENABLED` is still `false`.**
> §14 above names this slice directly — "`renderAction`/`renderSpecFile`, the
> export menu and the structured workspace follow" — so unlike slice 3 no
> supporting argument was needed.
>
> **OWNER DECISION RECORDED: the slice-3 bundle cost is ACCEPTED TEMPORARILY.**
> DL-74's +14,387 B (29,441 B / 10.56 % over the locked ceiling) stands: slice 3
> is the real recording runtime foundation, reversing it would only defer the
> identical cost to the flag-flip slice, the ceiling was already exceeded before
> WS9, and no unsafe optimisation should be introduced to satisfy an old number.
> **This is not permission to optimise**, and none was attempted. Future bundle
> work remains a separate owner decision, open since DL-56.
>
> **The renderer is a THIN ADAPTER, because the generator already existed.**
> `generateLocatorCode` already renders a `LocatorChain` across all seven
> `TargetLanguage` targets, pinned by WS1's **127 goldens**, with `.filter(...)`,
> `.nth(...)` and the six ARIA state options already handled. `renderAction` asks
> codegen for the locator and appends the action call: **no second locator
> renderer, no second language table, and no second escaping policy** — codegen's
> `singleQuoted`/`doubleQuoted` were exported rather than hand-rolled, as the
> legacy generator did with an escaper that misses backslashes and newlines. A
> test asserts per language that the statement contains codegen's own output.
>
> **HONEST REFUSAL is the defining rule, and it is not hypothetical.** The legacy
> `ui/recording/test-code.ts` rebuilds a locator from raw `ElementAttributes`
> with **no DOM uniqueness check** and, on failure, returns a fabricated
> `page.locator('<tagName>')`. The new renderer instead returns `{ok:false,
refusal}` — `no-target` · `missing-url` · `redacted-value` — and never guesses
> a selector, never substitutes CSS or XPath, never invents a value and never
> returns `''` as though it had succeeded. A redacted step is refused and marked
> as a comment **in its original position**: never dropped, never faked.
>
> **The trust boundary holds.** The renderer does not re-implement slice 3's
> admission rule — that is a capture-time decision made against a live DOM, and
> re-deciding it here from stored numbers would be a second, weaker gate. `.nth`
> is rendered faithfully rather than quietly dropped, which would be the renderer
> inventing confidence the recording never had. Guards pin that admission stays
> in `runtime/recording.ts`.
>
> **1,449 tests / 59 files** (+36, all new, failure-first). **WS1 codegen goldens
> 127/127 unchanged and untouched — no golden was updated.** Every gate run alone:
> test/build/typecheck/lint/format 0 bar the permanent `ws2-item9-report.md`.
> WS4, WS6.2, WS7 and WS8 guard suites all green.
>
> **Bundle: 308,201 B → 308,201 B, Δ 0 B**, every entrypoint unchanged, verified
> by finding zero renderer symbols in `.output/chrome-mv3` — nothing shipped
> imports it. Overage unchanged at 29,441 B / 10.56 %.
>
> **Real Chromium: NOT RUN.** The renderer touches no DOM and is verified through
> deterministic unit and codegen tests. **Deferred:** the export menu (this slice
> produces a string; nothing is copied, downloaded or written), the structured
> code workspace, persistence, the recording UI, the controller-side liveness
> marker, v1 migration, navigation/SPA/frame/tab, legacy deletions, and flipping
> `RECORDING_ENABLED`. See `ProgressDocument/ws9-slice4-renderers-2026-09-04.md`.
>
> **SLICE 5 — EXPORT MENU: BLOCKED, OWNER DECISION REQUIRED (DL-76, 2026-09-05).
> Discovery only — zero production files created, modified or deleted.**
> §14 sequences the export menu after the renderers, and the renderers landed at
> DL-75. But discovery found, by measurement rather than inference, that **the
> export layer has no way to obtain a `RecordedWorkflow`:**
>
> - its only holder is `runtime/recording.ts`'s content-side session closure, and
>   **`rt.workflow()` has zero callers** outside that module and its tests;
> - **none** of the nine `RuntimeMessage` members carries workflow data, and
>   `RuntimeMessageAck` carries only `sessionId` and counts;
> - WS4 defines exactly four descriptors — `code-buffer`, `pw-lang`,
>   `picker-active`, `last-pick` — and none is a recording workflow;
>   `code-buffer` is WS5's **workspace** buffer, which this boundary forbids
>   confusing with export;
> - **no download or export abstraction exists anywhere** (zero hits for
>   `download`, `Blob`, `URL.createObjectURL`, `chrome.downloads`).
>   `ClipboardPort` / `useCopyAll` do exist and would have been reused for copy.
>
> **The legacy path is a trap, not a shortcut.** `RecordingControl`'s
> `recordedActions` is permanently empty — `setRecordedActions` is called exactly
> twice and both calls pass `[]` — and it holds the OLD raw-attribute
> `RecordedAction`, rendered through the legacy `attrsToLocatorCode` that
> fabricates `page.locator('<tagName>')`: the precise path DL-75 forbade the
> verified renderer from using.
>
> **The blocker chain is NOT simply "persistence".** Export needs a workflow → the
> only holder is a live content-side session → a session requires `rt.start()` to
> succeed → `start()` **fails closed** on `RECORDING_ENABLED = false`, because
> DL-74 made the flag a runtime gate rather than a UI hide → the flag cannot
> honestly flip until the recording UI reads lifecycle state and the
> controller-side liveness marker has a consumer that outlives the content script.
> So an export menu built today would be a control permanently stuck in its empty
> state — a dead affordance in the user's panel, which §26's UX-honesty rule and
> this workstream's whole trust posture forbid.
>
> **The obvious workaround was considered and rejected.** A
> `GET_RECORDING_WORKFLOW` message would be an in-memory handoff rather than
> persistence, and the workflow is `structuredClone`-safe — but it is NEW plumbing,
> not the "already-existing approved seam" the boundary permits, and with the flag
> off it would still return `null`.
>
> **Validation was run anyway to prove the tree is clean and untouched:** test 0
> (1,449 / 59 files; codegen goldens 127/127) · build 0 (308,201 B) · typecheck 0 ·
> lint 0 · format 0 bar the permanent `ws2-item9-report.md`. Bundle unchanged;
> overage unchanged at 29,441 B / 10.56 %.
>
> **OWNER DECISION REQUIRED — three options, no recommendation offered:**
> **(a) re-sequence** — build the recording UI and the controller-side liveness
> marker first, the two items that gate the flag, which is the order §14's own
> dependencies imply; **(b) authorise workflow persistence** as its own slice (a
> fifth WS4 descriptor), after which export has a durable source that survives the
> content script; **(c) authorise a narrower export slice** explicitly scoped as a
> pure, unwired projection layer (filename/MIME/content plus the `ClipboardPort`
> seam, no menu), accepting that it ships unreachable exactly as slices 1–4 did —
> noting the honesty argument is weaker here, because export's remaining half is UI.
> See `ProgressDocument/ws9-slice5-export-menu-2026-09-05.md`.
>
> **SLICE 5A — RECORDING UI + LIFECYCLE / LIVENESS CONSUMER: IMPLEMENTED (DL-77,
> 2026-09-05). This executes owner decision DL-76 option (a) RE-SEQUENCE. WS9
> remains PARTIAL and `RECORDING_ENABLED` is still `false`.**
> The objective was to make the EXISTING lifecycle truthful and observable, not to
> make recording work.
>
> **The defect, quoted from the source it was in.** `useRecording` held
> `const [recording, setRecording] = useState(false)` and set it to `true` on a
> successful START acknowledgement. Slice 2 had deliberately made liveness a
> DERIVATION — `isRecording(session, now)` recomputes staleness from the clock on
> every read — so a panel-side boolean re-introduced exactly the stored `true`
> that design existed to remove. A boolean cannot go stale, so the banner outlived
> the recorder: the precise failure `config/recording.ts` names as the reason the
> flag is off.
>
> **A second defect was found by measurement and fixed.** `toggle()` sent
> STOP_RECORDING with no `sessionId`, while slice 3's handler calls
> `recording.stop(sessionId ?? '', …)` and refuses a non-matching id — so stop was
> refused by construction, and the old `if (ack.ok !== false)` branch then left the
> boolean stuck on `true`. A regression test pins the runtime behaviour and the
> panel now presents the id START handed back.
>
> **One new message on the existing seam, carrying one enum.**
> `QUERY_RECORDING_STATE` joins the same `RuntimeMessage` union, the same
> `sendRuntimeMessage`, the same single background-router branch and the same
> `KNOWN_MESSAGE_TYPES` set — no second messaging architecture, no CommandBus, no
> second listener (guarded). Its ack adds exactly one field,
> `lifecycle?: RecordingLifecycleState`, imported rather than re-declared.
> **No workflow transport, no persistence:** `GET_RECORDING_WORKFLOW` was not
> added, no `RecordedWorkflow` or `RecordedStep` crosses any seam, no WS4
> descriptor was created, and no new module touches a storage API — all guarded.
>
> **Why the poll is a reader and not a second heartbeat — measured, not asserted.**
> The content handler calls only `recording.state(now)`, which is
> `lifecycleStateOf`, a pure derivation that assigns nothing; a guard rejects any
> `start`/`stop`/`tick` call inside it. Two runtime tests then measure it: a
> runtime polled every 250 ms across the whole window still goes stale at
> `heartbeatTimeoutMs + 1`, and its trajectory is identical at 200 sampled instants
> to a runtime nobody reads. The interval is re-used from
> `RECORDING_LIMITS.heartbeatMs`, so the panel declares no timing number of its own.
>
> **Fail-closed is the whole mapping.** `observedView` collapses no answer, a
> `NO_HANDLER` failure from a dead content script, an `ok:true` reply with no
> state, and a failed ack that happens to carry `lifecycle:'active'`, all to a
> sixth honest value `unknown` — deliberately not `inactive`, which is also a
> claim. `isRecordingNow` is true for exactly one of six views. A pending request
> never becomes a recording claim. `stale` and `stopped` are SURFACED, as
> `heartbeatTimeoutMs`' own doc requires.
>
> **One false claim withdrawn rather than restated.** The old banner's
> `{count} action(s)` badge read from an array DL-76 measured as permanently
> empty; a truthful count needs a source this slice may not build, so the badge is
> gone and no count crosses the seam. The session id is used, never shown — a ref,
> never state, never rendered, never logged. Accessibility: `aria-label`,
> `aria-pressed`, `aria-busy`, and an always-mounted polite live region.
>
> **One guard strengthened, none weakened.** `preview-gate.test.ts` asserted
> `{RECORDING_ENABLED && recording &&` — an identifier that is the defect, and the
> weaker gate (it still rendered the banner's `<style>` sibling). It now requires
> the early-return form for EVERY capitalised component in the file, counted.
>
> **1,504 tests / 60 files** (+55, all new, failure-first — seen to fail on a
> missing module before any production line existed). Goldens 127/127 untouched.
> Every gate run alone: build/typecheck/lint 0; format 1 for the permanent
> `ws2-item9-report.md` exception only. `pnpm -r test` is 0 — with the caveat that it
> also exits 1 whenever the wall-clock millisecond value happens to contain the digits
> `42`, because of the PRE-EXISTING `storage-migration.test.ts` defect below. Both
> outcomes were observed minutes apart on an unchanged tree; with that one file
> excluded the remaining 43 files / 973 tests are green in either case.
>
> **Bundle: 308,201 B → 309,739 B, Δ +1,538 B** (sidepanel chunk +1,435 · content.js
> +79 · background.js +24; DevTools panel, shared client and tokens chunks all
> Δ 0 B, confirming the type-only messaging import shipped no bytes). Overage
> 30,979 B / 11.11 %, disclosed and not chased.
>
> **Real Chromium: NOT RUN.** No manual, DevTools or production verification was
> performed or is claimed.
>
> **Pre-existing debt, re-measured and deliberately NOT fixed.**
> `storage-migration.test.ts`'s quarantine test now fails every run rather than
> intermittently. A controlled clock experiment (temporary, run, deleted) proved the
> cause is unrelated: at system time 1788554284496 the record contains `42` because
> the TIMESTAMP does; the identical migration at 1788555555555 does not.
> `expect(record).not.toContain('42')` measures the clock, not user content.
>
> **Deferred, documented, not built:** the export menu (still blocked, DL-76), the
> structured workspace, persistence, the v1 migration, navigation/SPA/frame/tab,
> legacy deletions, a truthful action count, an error channel for a refused start,
> real-browser evidence, and flipping `RECORDING_ENABLED`. **WS9 is NOT complete.**
> See `ProgressDocument/ws9-slice5a-recording-ui-liveness-2026-09-05.md`.
>
> **SLICE 5B — DURABLE RECORDING CONTROLLER STATE + WORKFLOW PERSISTENCE:
> IMPLEMENTED (DL-78, 2026-09-05), through the EXISTING WS4 architecture. WS9
> remains PARTIAL and `RECORDING_ENABLED` is still `false`.**
>
> **The problem DL-77 left open.** Slice 5A made the panel a truthful consumer of
> the live lifecycle — but the panel only knows while it is open, and the
> `RecordedWorkflow` still existed solely inside the content-side runtime's
> closure. A recording could not survive the content script, so export stayed
> blocked (DL-76) and so did a truthful action count.
>
> **The architectural line, and it is the whole design:**
>
> ```
> CONTENT RUNTIME  →  the AUTHORITY while it exists
>        │ projection (one-way; nothing is read back)
>        ▼
> BACKGROUND  →  supplies tab identity from sender.tab.id
>        ▼
> StorageGateway  →  namespace · version envelope · validator · tab scope
>        ▼
> DURABLE STATE  →  a PROJECTION, never a rival authority
> ```
>
> Slice 2 made liveness a DERIVATION from the clock rather than a stored flag,
> and any durable record risks undoing that: a row saying `active` does not stop
> being a row when the recorder is gone. So the record stores `lastHeartbeatAt`
> and NOT a trusted boolean, and `observedLifecycle` re-derives staleness on
> every read from the SAME `RECORDING_LIMITS.heartbeatTimeoutMs`. There is no
> path from an absence, a read error, a malformed record or an old clock to
> `active`. It is **not a second state machine**: no new states, no transitions,
> no way to begin or end a recording.
>
> **No second persistence mechanism.** Two WS4 descriptors —
> `recording-observation` (bounded: schema, opaque session id, lifecycle,
> startedAt, lastHeartbeatAt) and `recording-workflow` (the EXISTING
> `RecordedWorkflow`, stored as it is) — both `session` + `tab`, exactly like
> `picker-active` and `last-pick`. **That scope is load-bearing:** `clearTab` and
> `sweepOrphans` sweep only the SESSION area, so a tab-scoped record in `local`
> would outlive its tab forever. The honest consequence is stated rather than
> hidden — **a recording does not survive a browser restart**, and changing that
> would change the scope semantics O2 locked.
>
> **O2 re-scoped by owner authorisation, not silently broken.** DL-66/O2's claim
> — `pg_recording_active`/`pg_recorded_actions` remain WS9-owned and are neither
> migrated, cleared nor read by WS4 — still holds, and is now guarded on all
> three verbs (the previous guard only checked a descriptor key's spelling).
> What changed is that WS9 describes its OWN state THROUGH this architecture
> rather than beside it; the alternative was a second persistence mechanism.
>
> **One message, existing seam, existing direction.** `PERSIST_RECORDING_STATE`
> joins the same union, the same known-types set, the same single listener and
> the same content-to-background branch `PERSIST_PICK` uses — so it carries no
> `targetTabId` and the tab comes from `sender.tab.id`, which a page cannot
> forge. `observation` always; `workflow` only when the recording changed.
>
> **Write cadence invented no numbers.** Start · each admitted action · each
> heartbeat (observation only) · stop — bounded entirely by existing constants:
> `hardStop` caps workflow writes at 100, `fillDebounceMs` already coalesces
> typing at the model boundary so keystrokes never become writes, `heartbeatMs`
> sets the observation cadence, `maxWorkflowBytes` already bounds the size. **No
> new byte limit was needed and none was invented.**
>
> **Serialisation proven, not assumed.** A populated workflow round-trips through
> JSON byte-for-byte, with chain, verdict, counts, stepCounts and rationale
> compared field by field. It holds structurally because `MatcherValue` models a
> regex as `{type:'regex', value, flags}` — data, not a native `RegExp`. **No
> storage DTO was needed, so none was introduced.**
>
> **Privacy.** Whole-record rejection (`CODE_BUFFER`'s precedent), plus an
> explicit refusal of a redacted step that still carries a value — impossible
> from `appendStep`, refused anyway. A measured test proves a redacted password
> appears nowhere in the stored bytes. Truncation and ordering survive; the
> session id stays opaque.
>
> **Nothing reads the projection yet, deliberately — and it is measured.**
> Reconciling durable state with a live answer is a precedence rule the gate
> forbids inventing, so no consumer exists, a guard pins that, and
> `observedLifecycle` appears in ZERO shipped bundles. The Side Panel was not
> touched: sidepanel chunk Δ 0 B.
>
> **1,579 tests / 61 files** (+75, failure-first). Goldens 127/127 untouched.
> Every gate alone: test/build/typecheck/lint 0; format 1 for the permanent
> `ws2-item9-report.md` exception only.
>
> **Bundle: 309,739 B → 311,875 B, Δ +2,136 B** (background.js +1,679 · content.js
> +457 · sidepanel, DevTools, client and tokens all Δ 0 B). Overage 33,115 B /
> 11.88 %, disclosed and not chased.
>
> **Real Chromium: NOT RUN.** `FakeStorageArea` is not Chrome, so real quota,
> real `tabs.onRemoved` and real multi-tab behaviour remain deferred.
>
> **Three prior guards re-scoped, none weakened**, each commented in place.
> **Newly found pre-existing hazard, NOT fixed:** the shared `stripComments` test
> helper treats `/*` inside a `//` line as a block-comment start, so a glob in a
> code comment can blank out real code from every guard that uses it.
>
> **Deferred, documented, not built:** the export menu, the structured workspace,
> the v1 migration, navigation/SPA/frame/tab, cross-tab recording, browser-restart
> recovery, a durable-state consumer and its live-versus-durable precedence rule,
> a truthful action count, legacy deletions, real-browser infrastructure, and
> flipping `RECORDING_ENABLED`. **WS9 is NOT complete.**
> See `ProgressDocument/ws9-slice5b-durable-recording-persistence-2026-09-05.md`.
>
> **SLICE 5C — DURABLE RECORDING CONSUMER + LIVE/DURABLE PRECEDENCE:
> IMPLEMENTED (DL-79, 2026-09-05). WS9 remains PARTIAL and `RECORDING_ENABLED`
> is still `false`.**
>
> **The owner decision, executed verbatim:**
>
> ```
> LIVE CONTENT AUTHORITY  >  DURABLE OBSERVATION  >  UNKNOWN
> ```
>
> DL-78 shipped the durable projection with no reader on purpose: choosing
> between a stored row and a live answer is a precedence rule, and inventing one
> quietly is how a truthful system stops being one. `resolveRecordingView` is now
> the only place that rule exists.
>
> **The invariant everything serves: a durable record may never resurrect a
> recording the live runtime has already declared dead.** The content runtime
> reports `stale` — it knows, because slice 2 derives staleness from the clock —
> while storage still holds the observation written moments earlier saying
> `active`. Preferring the row would display RECORDING for a recorder that is
> provably gone. So durable evidence is FALLBACK evidence, consulted only when
> the live authority produced no answer at all.
>
> **Proven exhaustively:** one test drives all five live states against seven
> durable shapes and asserts the live answer wins in every one of the 35
> combinations. **And made physically true, not merely computed:** the panel
> reads the durable record ONLY when `observedView(ack)` is `unknown`, so when
> the runtime answers the row is not even read.
>
> **A real fail-closed gap in slice 5A was found and fixed** by a test written
> for this slice. `observedView` trusted `reply.lifecycle` without checking it
> against the five known states — and that field crosses a `structuredClone`
> boundary, so it is DATA at runtime however it is typed. An unrecognised value
> passed straight through as a `RecordingView`, where the exhaustive switches in
> `recordButtonModel` and `recordingBannerLine` fell off the end and returned
> `undefined`: worse than failing closed. It now reads as `unknown`.
>
> **No new state, no new clock, no new transport.** Reconciliation returns only
> what `observedView` (5A) or `observedLifecycle` (5B) already produce, injects
> `now`, re-derives no expiry of its own, and reuses the existing
> `QUERY_RECORDING_STATE` message. No second listener, no CommandBus.
>
> **Fail-closed on every path, tested:** no reply · `undefined` · `NO_HANDLER` ·
> `ok:true` with no state · a failed ack that mentions `active` · a malformed
> lifecycle value · no durable record · a malformed record · an unknown FUTURE
> storage version (refused, bytes untouched) · a read failure · a gateway that
> throws · no bound tab. All become `unknown` — deliberately not `inactive`,
> because absence of an answer is absence of evidence.
>
> **The reader goes through WS4 and nothing else:** an injected
> `Pick<StorageGateway,'readTab'>`, one descriptor, no browser API. **It never
> reads the workflow** — guarded in source AND measured in the bundles, where
> `recording-workflow` appears in `background.js` only. The tab is the one the
> panel is already bound to (`panel.pick.tabId`), never a second query.
>
> **Action count: still deferred**, deliberately. **Browser-restart boundary
> unchanged:** `session` + `tab` means a recording does not survive a restart,
> and storage scope was not touched.
>
> **1,646 tests / 62 files** (+67, failure-first). Goldens 127/127 untouched.
> Every gate alone: test/build/typecheck/lint 0; format 1 for the permanent
> `ws2-item9-report.md` exception only — verification is not all green.
>
> **Bundle: 311,875 B → 313,146 B, Δ +1,271 B** (sidepanel +583 · shared `tokens`
> +688, the observation descriptor and its validator now reachable from the panel
> graph; content.js, background.js, client and DevTools all Δ 0 B). Overage
> 34,386 B / 12.33 %, disclosed and not chased.
>
> **Real Chromium: NOT RUN.** No Side Panel was really closed and reopened, no
> service worker restarted, no real `tabs.onRemoved`, no real quota.
>
> **Four prior guards re-scoped, none weakened**, each commented in place — two
> of them were silently mis-slicing after this change and would have failed for
> the wrong reason.
>
> **Deferred, documented, not built:** export, the structured workspace, the v1
> migration, navigation/SPA/frame/tab, cross-tab recording, browser-restart
> recovery, a truthful action count, legacy deletions, real-browser
> infrastructure, and flipping `RECORDING_ENABLED`. **WS9 is NOT complete.**
> See `ProgressDocument/ws9-slice5c-durable-consumer-precedence-2026-09-05.md`.
>
> **EXPORT — IMPLEMENTED for the clipboard; DOWNLOAD BLOCKED and reported rather
> than invented (DL-80, 2026-09-05). WS9 remains PARTIAL and `RECORDING_ENABLED`
> is still `false`.**
>
> DL-76 blocked the export menu with four measured proofs. Slices 5A, 5B and 5C
> removed the first three; this is the fourth arrow and only the fourth arrow:
>
> ```
> panel.pick.tabId → readDurableWorkflow → RecordedWorkflow
>                  → renderSpecFile → ExportArtifact → ClipboardPort
> ```
>
> **Export decides nothing, and that is why it is safe to build.** Every locator
> was decided ONCE, at capture, by the one resolver and the one probe. Guarded by
> name against `DomProbe`, `resolveChain`, `resolveStep`, `captureSnapshot`,
> `buildLocatorChain`, `verifyLocatorExpression`, `classifyVerification` and the
> rankers — and against `generateLocatorCode` and `page.locator(`, so no second
> generator can appear either. A test asserts per language that the exported
> content is **byte-identical** to `renderSpecFile`'s output.
>
> **It refuses rather than fabricates:** `no-workflow` (decided by the EXISTING
> `validateWorkflow`, reused not duplicated), `empty-workflow` (an empty file
> would look like a successful export of nothing), `unsupported-language`.
>
> **The reader** is one function over the one injected `StorageGateway`, reads
> `recording-workflow` and never `recording-observation` — DL-79's rule that
> lifecycle is not workflow existence, preserved — and fails closed on no bound
> tab, an unreadable record, an unknown FUTURE version and a throwing gateway.
>
> **Download is BLOCKED, by measurement.** No download seam exists anywhere
> (zero hits for `chrome.downloads`, `URL.createObjectURL`, `new Blob`), and the
> manifest grants no `downloads` permission — which this gate forbids adding. The
> artifact nevertheless carries language, filename, MIME and content, so a later
> download slice consumes it unchanged.
>
> **Filename policy:** deterministic, and carrying nothing about the recording —
> no session id, no value, no URL, no timestamp, no count. Shapes follow the
> renderer (`recorded-test.spec.ts`, `test_recorded.py`, `RecordedTest.java`,
> `RecordedTest.cs`). MIME is uniform `text/plain;charset=utf-8`, because
> inventing `application/x-typescript` would fabricate a standard.
>
> **The UI keeps three ideas apart:** the FLAG decides whether the feature is
> offered (same early return the record button uses, so no dead affordance
> ships); the WORKFLOW decides whether the button is actionable; the LIFECYCLE is
> not asked at all.
>
> **Privacy proven by bytes:** a recorded password exports as slice 4's
> `value withheld (password)` comment and appears in no language's output, no
> filename, no refusal payload and no log.
>
> **1,725 tests / 63 files** (+79, failure-first). **Goldens 127/127 untouched.**
> Every gate alone: test/build/typecheck/lint 0; format 1 for the permanent
> `ws2-item9-report.md` exception only — verification is not all green.
>
> **Bundle: 313,146 B → 319,185 B, Δ +6,039 B** — sidepanel +5,240 because
> **slice 4's renderer reaches a consumer for the first time** (DL-75 measured it
> at Δ 0 B precisely because nothing imported it); shared `tokens` +799 for the
> workflow descriptor and validator. **`content.js` Δ 0 B** — export never
> reached the content script, measured rather than asserted. Overage 40,425 B /
> 14.50 %, disclosed and not chased.
>
> **Real Chromium: NOT RUN.** No clipboard was really written, no file really
> downloaded.
>
> **Newly discovered pre-existing debt, NOT fixed:** the language preference
> cannot persist for two of the five offered languages — `PW_LANG`'s validator
> accepts `python`/`csharp` while the selector offers `python_sync`/
> `csharp_async`, so choosing Python or C# writes a value the validator rejects
> and the preference is silently dropped.
>
> **Deferred, documented, not built:** download · the structured workspace · the
> action count · v1 migration · navigation/SPA/frame/tab · cross-tab recording ·
> browser-restart recovery · legacy deletions · real-browser infrastructure ·
> flipping `RECORDING_ENABLED`. **WS9 is NOT complete.**
> See `ProgressDocument/ws9-export-2026-09-05.md`.
>
> **STRUCTURED CODE WORKSPACE — IMPLEMENTED as a READ-ONLY review surface
> (DL-81, 2026-09-05). WS9 remains PARTIAL and `RECORDING_ENABLED` is still
> `false`.**
>
> A user could record (gated), the recording was durably owned, truthfully
> observed and copyable — but they could not LOOK at it. This is that, and its
> whole design is one word: **projection**.
>
> ```
> panel.pick.tabId → readDurableWorkflow → RecordedWorkflow
>                  → renderSpecFile(workflow, language) → read-only <pre><code>
>                                                       → CopyButton → ClipboardPort
> ```
>
> **The naming collision was handled, not inherited.** WS5's
> `ui/panel/CodeWorkspace.tsx` is a DIFFERENT thing — the user's locator code
> BUFFER, with Undo/Clear/Remove, persisted in `CODE_BUFFER`. DL-76 warned
> against confusing them. This slice adds `RecordingWorkspace`, touches that file
> not at all, and adds no storage descriptor; a guard pins the descriptor set at
> the existing six.
>
> **Review-only is an architectural boundary, not a scope cut.** A recorded
> `LocatorChain` is a verified artifact. The moment a user can edit it the
> product owes an answer to "is an edited locator still verified?", and every
> honest answer needs verification this layer may not run. No textarea, no
> `contentEditable`, no editor library, no locator field, no strategy dropdown,
> no reordering, insertion, deletion or assertions — each guarded by name.
>
> **The invariant, asserted per language:** `workspace.code === renderSpecFile(
workflow, language)` for all seven targets. No second renderer, no
> `generateLocatorCode`, no resolver, probe, verifier, scorer or ranker is
> reachable. **Goldens 127/127 untouched.**
>
> **Four states, none of them the lifecycle:** `unavailable` · `empty` (a real
> recording that captured nothing — a blank panel would imply a successful render
> of nothing) · `ready` · `error`. DL-79's rule that lifecycle and workflow
> existence are different facts is preserved and guarded: an inactive recorder
> does not erase a recording worth reviewing.
>
> **The code is text, never markup.** A test drives
> `<img src=x onerror=alert(1)>` through a recorded fill and asserts it survives
> byte-identically and un-escaped in the model, while `innerHTML`,
> `dangerouslySetInnerHTML`, `eval` and friends are guarded out.
>
> **Every seam reused, none duplicated:** the existing `readDurableWorkflow`, the
> existing `CopyButton`/`ClipboardPort`, the existing `panel.pick.tabId`, the
> existing panel language, the existing `validateWorkflow`.
>
> **1,795 tests / 64 files** (+70, failure-first). Every gate alone:
> test/build/typecheck/lint 0; format 1 for the permanent `ws2-item9-report.md`
> exception only — verification is not all green.
>
> **Bundle: 319,185 B → 319,841 B, Δ +656 B** (sidepanel +555 · `tokens` +101;
> **`content.js` Δ 0 B**, measured; background, client and DevTools Δ 0 B). Small
> for a measured reason: DL-80's export slice was the renderer's FIRST consumer
> and already paid its +5,240 B. Measured too: with the flag off, the review UI's
> own strings appear in **no** shipped bundle — the early return is
> constant-folded away. Overage 41,081 B / 14.74 %, disclosed and not chased.
>
> **Real Chromium: NOT RUN. Manual browser regression: NOT RUN.**
>
> **One guard widened, none weakened** — `preview-gate`'s flag-gate rule now
> covers the review surface as a third recording affordance.
>
> **Deferred, documented, not built:** download · the action count · v1
> migration · navigation/SPA/frame/tab · cross-tab recording · browser-restart
> recovery · legacy deletions · real-browser infrastructure · language-preference
> persistence · flipping `RECORDING_ENABLED`. **WS9 is NOT complete.**
> See `ProgressDocument/ws9-structured-code-workspace-2026-09-05.md`.

### WS10 — Guided Assertion Capture · M · 3–4 d · **DEFERRED**

**Purpose.** Explicit assertion authoring against verifiable facts. **No inference (D8).**
**Deliverables.** assertion mode in the picker · derivation of assertions _valid for that element_ · `AssertionPicker` · `Assertion` model · `renderAssertion` in all four renderers · assertions as `CodeItem`s and `RecordedAction`s.
**Dependencies.** WS9. **Out of scope.** Inferred assertions · post-capture editing · DevTools assertions · soft assertions · custom matchers.
**Exit.** Correct verified assertion in all 5 languages · only valid assertions offered per element type · **no assertion ever added without an explicit user choice**.

### WS11 — Final Integration / Release Hardening · S/M · 4–5 d · **FUTURE**

**Purpose.** Validate the whole; make the extension submittable.
**Deliverables.** re-run WS8 gates over WS9/WS10 surfaces · icon set · 5 screenshots · listing copy · permission justifications · privacy policy · explicit CSP · final permission audit · **version bump to 1.0.0** · pre-submission checklist · clean-clone packaged build.
**Dependencies.** WS8, WS9, WS10.
**Exit.** Clean-clone build loads and passes smoke · axe-core clean on WS9/WS10 surfaces · every WS0–WS10 exit criterion still green · every permission justified in writing.
**Note.** v0.1.x preview borrows icons/packaging from here early; **1.0.0 remains WS11's exit**, unchanged.

## 13. Dependency Graph `LOCKED`

```
WS0 Foundation
 ├──────────────┬──────────────┬──────────────┐
 ▼              ▼              ▼              │
WS1 Domain    WS2 Design    WS4 Storage       │
 │              │              │              │ (WS11 icon/screenshot design
 ▼              │              │              │  can start any time)
WS3 Capture     │              │              │
 └──────┬───────┴──────────────┘              │
        ▼                                     │
   WS5 Shared App + UI + DevTools ◀── THE GATE│
        │                                     │
   ┌────┴────┐                                │
   ▼         ▼                                │
 WS6       WS7                                │
   └────┬────┘                                │
        ▼                                     │
   WS8 Validation                             │
        ▼                                     │
   WS9 Recording                              │
        ▼                                     │
   WS10 Assertions                            │
        ▼                                     │
   WS11 Release ◀──────────────────────────────┘
```

## 14. Phase-by-Phase Implementation Plan

| Phase         | Content                                                      | Status                               |
| ------------- | ------------------------------------------------------------ | ------------------------------------ |
| **Gate S1**   | Truth                                                        | `CURRENT` — partially done in mirror |
| **Gate S2**   | Playwright fidelity                                          | `PROPOSED`                           |
| **Gate S3**   | Visibility (WS6.1 subset)                                    | `PROPOSED`                           |
| **v0.1.x**    | Developer Preview                                            | `DEFERRED` until gate complete       |
| **WS1–WS8**   | Trustworthy Core (WS6+WS7 = internal milestone, **not 1.0**) | `LOCKED` order                       |
| **WS9–WS11**  | Recording, assertions, 1.0                                   | `DEFERRED` / `FUTURE`                |
| **Phase A–F** | Long-term evolution (§18–§22)                                | `FUTURE`                             |

## 15. Validation Strategy `LOCKED`

`pnpm verify` = build → typecheck → lint → test → format:check, mirrored exactly by CI on **Ubuntu + Windows**. Build must precede typecheck (codegen resolves locator-engine through generated `dist/`). Budgets: content script ≤60 KB · panel chunks ≤20 KB · pick <100 ms @5k nodes, <250 ms @20k · ≤1 whole-document traversal per pick · ≤60 probe calls · snapshot <25 KB / >50 KB anomaly.

## 16. Test Strategy `LOCKED`

**Principle: tests exist to prevent specific, identified failures. No coverage-percentage targets.**

Unit (locator-engine · happy-dom fixtures) · golden files (~98 = 7 languages × ~14 chain shapes) · fixture-driven selector-engine tests whose key invariant is _every generated selector actually matches the intended element_ · extension integration (storage round-trip, migration, message contract incl. `NO_HANDLER`, snapshot budget, `ScopeHandle` exclusion, recording limits at 39/40/99/100) · **9 E2E scenarios** with the extension loaded · CI benchmarks.

**Test-first rule `LOCKED`:** fail first → minimal fix → targeted test passes → full suite → build → typecheck → lint → format → package validation. Never weaken a test to make it pass.

## 17. Release Strategy `CURRENT`

`Developer Preview v0.1.x` → `v1.0.0` (WS11) → `v1.1+`. **Publishing paused.** No store action of any kind. GitHub profile/publishing work is a separate, later track. Repository visibility (public vs private) remains an **open decision** (§25).

---

## 18. Future Recording Architecture `FUTURE` — WS9

**The architectural commitment: recording consumes the shared verified locator engine. There is never a second locator implementation.**

```
Record → capture action → SAME DomProbe → SAME LocatorResolver → verified LocatorChain
       → verdict + rationale codes → ElementFactsLite → RecordedWorkflow → codegen ×5 languages
```

`RecordedTarget` stores the **verified chain, not a rendered string**, so a recording made today can be re-rendered in any language tomorrow, or regenerated with a different strategy. That property is the moat: Playwright CRX records with Playwright's locators and no opinion; Guru would record with _ranked, verified, explained_ locators.

## 19. Future Framework-Aware Generation Architecture `FUTURE` — Phase C/D

**Principle `LOCKED` for this direction: generate changes _into_ an existing project. Never invent a framework.**

```
Existing repo → deterministic structural analysis → FrameworkProfile
             → (optional) AI refinement of ambiguous conventions
             → generation proposal → REVIEW CHANGES → APPLY
```

**Explicitly NOT wanted:** giant framework generators · uncontrolled scaffolding · mandatory AI · token-heavy per-action generation · automatic repository rewriting · blindly creating Cucumber/POM/config/CI · architecture Guru invents without evidence.

**Preferred output shape:**

```
MODIFIED  pages/LoginPage.ts     + username locator, + password locator, + login()
MODIFIED  tests/Login.spec.ts    + successful login test
```

…with files, methods, imports, dependencies and config changes all shown **before** anything is written. **Review → Apply, never silent modification.** This is a reliability principle, not a UX preference.

## 20. FrameworkProfile Concept `FUTURE`

Derived by inspecting `package.json`, `playwright.config.ts`, `tsconfig.json`, folder structure, existing Page Objects, fixtures, test patterns, imports, naming and locator/assertion conventions.

```
FrameworkProfile
  framework:            Playwright Test
  language:             TypeScript
  architecture:         Page Object Model
  testDir:              tests/
  pageDir:              pages/
  fixtureDir:           fixtures/
  pageNaming:           *Page.ts
  testNaming:           *.spec.ts
  locatorConvention:    Playwright locators as class properties
  assertionStyle:       expect(...)
  authStrategy:         storageState
  projectConventions:   …
```

**"Learn My Framework"** analyses locally and reports what it found (e.g. _12 Page Objects, 8 fixtures, 34 tests_) before saving a profile. Future recordings generate _into_ that profile.

## 21. Optional AI Architecture `FUTURE`

**AI is optional and must never be required for the core locator product.**

| AI is appropriate when                                | AI must NOT be used for                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| repository structure is messy                         | per-locator generation                                                    |
| conventions are implicit                              | any runtime dependency of basic locator output                            |
| naming is inconsistent                                | anything that would send page content off-device without explicit consent |
| semantic interpretation of project patterns is needed | replacing deterministic analysis that works                               |

Privacy must remain explicit and opt-in at every step. The local-first, zero-network property of the core product is a **verified competitive asset** and must not be traded.

## 22. Cucumber — Future Position `FUTURE`

**Not in v0.1.x. Not in the current roadmap.** If ever supported, it becomes _one more generation target inside the framework-aware layer_ (`features/*.feature` + `step-definitions/*.steps.ts` + `pages/*Page.ts`), never a separate subsystem. Do not let this expand current scope.

## 23. Privacy / Security Principles `LOCKED`

**Verified today:** zero network calls (no `fetch`/`XHR`/`WebSocket`/`sendBeacon` in source or bundle) · `chrome.storage.local` only — **no `storage.sync`**, so nothing reaches Google · clipboard `writeText` only, never read · no analytics, telemetry, remote code or third-party services · no cookies/history/bookmarks/identity/downloads access.

**Preserved as hard constraints:** no network · no remote code · no `innerHTML`/`eval` of remote content · MV3 default CSP · React-escaped rendering of page-derived strings. Future: sender validation (WS3) · closed shadow-root overlay (WS3) · picks to `storage.session` (WS4) · password/card/file redaction in recording (WS9) · explicit CSP (WS11).

---

## 24. Risks

| #    | Risk                                                         | P·I          | Mitigation                                                                                  |
| ---- | ------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------- |
| R-1  | Ranking change alters every output                           | Med·High     | Land the conformance corpus (if authorised) **before** the change so the diff is reviewable |
| R-2  | Generated locators subtly wrong                              | Med·**Crit** | Goldens reviewed against docs; fixture invariant; verify-before-display                     |
| R-3  | Storage migration loses the user's code buffer               | Low·**Crit** | Write v2 before deleting v1; idempotent; failure leaves v1 intact                           |
| R-4  | Recording unreliable after WS9                               | High·High    | Activation handshake + heartbeat; ship flagged; degraded state, never a lie                 |
| R-5  | WS5 regresses the UI                                         | Med·High     | Strangler, leaf-first, visually neutral, per-step revert                                    |
| R-6  | Scope creep — Phase 1 never ends                             | **High**·Med | Fixed exits; §26 deferral list is binding; new ideas go to the roadmap, not the sprint      |
| R-7  | Framework-aware generation becomes an uncontrolled generator | Med·High     | Review→Apply; FrameworkProfile from evidence; never invent architecture                     |
| R-8  | AI becomes a runtime dependency                              | Med·High     | §21 boundary is binding                                                                     |
| R-9  | Microsoft ships locator intelligence officially              | Low·**Crit** | Hedge is speed + opinion; Microsoft ships neutral tools                                     |
| R-10 | Claude cannot verify host git state                          | **High**·Med | §4 rule: never assert host state                                                            |
| R-11 | v0.1.x ships too small to impress                            | Med·Med      | Accept. Stage 3 surfaces three strong features already built                                |

## 25. Unknowns `UNKNOWN`

1. Host git state — HEAD, branch, remote sync, clean tree (Claude cannot verify)
2. The UI screenshots referenced in blueprint §38-D1, never attached — 5 UX decisions remain provisional
3. Whether real users exist with a populated `pg_code_buffer` (changes WS4 migration from _nice_ to _critical_)
4. `playwrightguru.com` hosting status — the privacy-policy URL blocker
5. Repository visibility decision — public vs private
6. Icon decision — no assets exist; none adopted
7. Playwright CRX user count (listing observed at both ~10k and ~40k)
8. Interview/showcase timing, which governs the publish-vs-polish trade-off

## 26. Deferred Items `DEFERRED`

E1 (WS3 — needs `facts.ts` wired) · E4 live path (WS3) · E7, E9 (WS1) · E8 (WS1 — needs a new `LocatorKind`) · E3/`EVAL_SCRIPT` (WS5) · O(n²) rewrite (WS3) · sender validation (WS3) · `LiveDomProbe`, text index (WS3) · tab-scoped storage, Storage V2 (WS4) · application-layer extraction (WS5) · UI redesign (WS2/WS5) · Recommended card full scope (WS6) · verified selector engine (WS7) · shadow DOM (Phase 2) · full cross-origin iframe architecture (WS3) · recording (WS9) · assertions (WS10) · 1.0 hardening (WS11) · Page Objects (Phase 3) · GitHub Actions `@v5` upgrade · branch protection.

## 27. Explicit LOCKED Decisions

D1–D12 and R1–R5 in full, plus: `DomProbe` is the only DOM window · exactly **one** `LocatorResolver` · generate-and-verify at capture · `PickSnapshot` compact (<25 KB target, >50 KB anomaly) · rationale codes not prose · one-way dependency direction · **WS0–WS11 ordering** · recording is WS9 · assertions are WS10 and explicit-only · limits 40/100 from one constant · privacy local-first · **no reliability claim without evidence** · **framework generation must not become an uncontrolled architecture generator** · **Playwright-only scope**.

## 28. Explicit NOT AUTHORIZED

| Item                                                             | Note                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Playwright conformance corpus                                    | High-value WS1 extension — **awaiting authorisation**      |
| Any implementation this turn                                     | Documentation/planning only                                |
| Placing the mirror's P0-1 into the repository                    | Ready, **not authorised**                                  |
| Committing / pushing / branching / resetting / rebasing          | —                                                          |
| Publishing, store listing, screenshots, distribution, submission | Paused                                                     |
| Implementing E5, E2, N-1, N-2, ranking changes, E8               | Named in the plan, not authorised                          |
| Recording, assertions, framework generation, AI, Cucumber        | Deferred / future                                          |
| Changing the blueprint                                           | Requires explicit reopening                                |
| Reformatting `Panel.tsx`                                         | Documented divergence; correcting it silently is forbidden |

## 29. Decision Log

| #     | Decision / Contradiction                                                                                                                                    | Resolution                                                                                                                                                                                      | Class      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| DL-1  | Blueprint: E6 password → no role. Playwright source: → `textbox`                                                                                            | **E6 INVALIDATED.** Blueprint §6.7 is wrong on this row. Recorded, not silently fixed                                                                                                           | `LOCKED`   |
| DL-2  | Blueprint acceptance: `Panel.tsx` no line >120 chars. Reality: 74 such lines                                                                                | **Divergence stands, documented.** Quarantined in `.prettierignore`; each entry removed by the workstream that rewrites the file                                                                | `LOCKED`   |
| DL-3  | Closure report reads as more progress than users receive                                                                                                    | Qualifier added: WS0 contracts are wired to **zero** production paths                                                                                                                           | `LOCKED`   |
| DL-4  | "`RECORDING_LIMITS` is the single source" — true; the legacy recorder bypasses it (`content.ts:173` hard-codes 600 ms vs the constant's 500; no append cap) | Both true. The guarantee is narrower than it reads. WS9 closes it                                                                                                                               | `CURRENT`  |
| DL-5  | E4 "fixed" in `resolver.ts`; still present in `content.ts` — the code that runs                                                                             | E4 counts as **still present for users**. Fix belongs to WS3                                                                                                                                    | `DEFERRED` |
| DL-6  | Blueprint WS11 says bump to 1.0.0; we plan a 0.1.x preview                                                                                                  | Not a contradiction — the preview is an agreed addition; **1.0.0 remains WS11's exit**                                                                                                          | `LOCKED`   |
| DL-7  | Guru ranks `testId` last; Playwright's generator ranks it first; Playwright's _docs_ prefer role                                                            | **Unresolved by design.** Ranking policy is a WS1 decision. Audit recommends: rank as the generator does, surface the role alternative as "user-facing", explain the tension                    | `PROPOSED` |
| DL-8  | Claude earlier asserted recording was implemented                                                                                                           | **Wrong.** Repository authoritative: no `START_RECORDING` case. Recorded so the error is not repeated                                                                                           | `LOCKED`   |
| DL-9  | Where should roadmap docs live?                                                                                                                             | The Claude Project already holds all prior reports. Roadmap joins it as the primary system; repo-ready copies delivered for optional `docs/roadmap/` placement. **No duplicate system created** | `CURRENT`  |
| DL-10 | Playwright CRX user count reported as both ~10k and ~40k                                                                                                    | Unresolved; recorded as `UNKNOWN` rather than picked                                                                                                                                            | `UNKNOWN`  |

## 30. Progress / Status Dashboard

| Milestone                       | Status                                                                                                                             | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 Discovery               | ✅ COMPLETE                                                                                                                        | 26-section report                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Phase 1 Blueprint               | ✅ COMPLETE / LOCKED                                                                                                               | 40 sections, 5 corrections, 8 contradictions resolved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **WS0**                         | ✅ **CLOSED / LOCKED**                                                                                                             | 3 commits · 54/54 · CI green both OS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Product audit                   | ✅ COMPLETE                                                                                                                        | 28 sections; F-1 and F-2 found                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Pre-v0.1.0 Gate S1 (Truth)**  | ✅ implemented in mirror                                                                                                           | Stage 1 (see PROGRESS milestone history) — **not placed** (host git user-verified only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Gate S2 (Fidelity)              | ✅ implemented in mirror                                                                                                           | Stage 2 + conformance corpus (Playwright 1.62.1) — **not placed**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Gate S3 (Visibility)            | 🟡 partial in mirror                                                                                                               | DL-21 Recommended card surfaced on both surfaces; chaining/`nth`/`frameLocator` still WS6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| v0.1.x preview                  | ⏸ PAUSED                                                                                                                           | store draft exists, untouched                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| WS1                             | ✅ **CLOSED** (DL-42)                                                                                                              | all 5 exit criteria met; failing-first gate closed by demonstrated regression protection (Path B). Exit criteria in mirror; host git placement user-verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| WS2                             | ✅ **COMPLETE**                                                                                                                    | items 1–9 all landed: tokens (DL-43) + typography/contrast (DL-44) + shared primitives (DL-45) + accessible Tabs (DL-46) + dev-only showcase (DL-47) + component consolidation/main-bar Tabs (DL-48) + hex→token migration, bounded scope (DL-49) + final UI polish/theme/a11y verification (DL-50) + final validation/WS2 exit review (DL-51)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| WS3                             | 🟡 **PARTIALLY COMPLETE** (DL-52, DL-53)                                                                                           | content-script split, `LiveDomProbe`, `all_frames`, E4 fix, sender validation all landed and verified (847/33 tests); snapshot byte-budget exit criterion now directly tested (DL-53); standalone IIFE probe build DEFERRED (undeterminable consumer); bundle 1.98 kB (0.71%) over ceiling, disclosed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| WS4                             | ✅ **CLOSED / COMPLETE** (DL-66)                                                                                                   | Storage V2 built and consumers rewired: one namespaced, versioned (`pg:v2:`), validated gateway; `local` for the global workspace and language preference, `session` for tab-scoped picker state and last pick; verify-before-retire v1→v2 migration with bounded quarantine that never copies user content; real `tabs.onRemoved` cleanup plus an orphan sweep; Clear data. `content.ts` persists through the existing RuntimeMessage seam so the gateway stays out of `content.js` (+296 B only). **All five exit criteria met** — criterion 4 at unit/structural evidence, real-browser multi-tab **deferred**. 1,126 tests / 47 files. Bundle 308,473 B, 29,713 B (10.66%) over ceiling — measured, disclosed, **not optimised**. Quota-cap and debounce-interval numbers await an owner decision. Previously: Discovery traced the whole storage path: `StorageGateway` has zero implementations and zero consumers; six flat global keys with no namespace/version/validation/tab-scope/quota/debounce; `tabs.onRemoved` logs only; no `onInstalled`, so no migration; the DevTools panel never persists its buffer. **All five exit criteria RED** (F-9 open). No dependency needed; provable at UNIT + STRUCTURAL level, real-browser behaviour deferred. **Five owner decisions block implementation** (O1–O5). **Next implementation workstream**, because WS9 depends on its persistence/workspace foundation (D2). Not started; runs its own discovery → implementation → owner decision → validation → closure cycle. Canonical ordering unchanged — execution pointer only                                                              |
| WS5                             | ✅ COMPLETE (DL-68) — implemented at the owner-approved scope                                                                      | DevTools consolidation in mirror (DL-28…DL-31); `ClipboardPort` adapter + DevTools `network.onNavigated` invalidation landed (DL-54); `PickSource`/`CommandBus` adapters and the `SidePanel.tsx`/`Panel.tsx` leaf-first extraction remain outstanding, now precisely bounded (DL-54) rather than vaguely so; DL-67's discovery gate then measured the real state (`SidePanel.tsx` **905** lines, `Panel.tsx` **470**, no `src/hooks/`, no `src/services/`, 3 of 4 ports unimplemented), re-measured the panel divergence symbol by symbol (8 identical symbols, 7 real divergences incl. `.dblclick()` missing from DevTools and the two surfaces resolving different tabs), quantified the extraction risk as **16 test files / 220 `it()` blocks asserting on panel source text**, and raised **O1–O8** for owner decision — no source was changed; **DL-68 then implemented it**: `SidePanel.tsx` 905 → **98**, `Panel.tsx` 470 → **89**, shared `src/ui/panel/**` + `src/hooks/**` + `src/services/**`, the first `PickSource`/`TabContext` adapters, DevTools joined the one global workspace and the inspected-tab binding, all seven divergences resolved (plus four newly found, D-h…D-k), **all 16 source-text guard files converted to follow the composition**, exit 5 measured at byte level, 1,214 tests / 51 files, bundle −15,760 B — real-Chrome regression not claimed                                                                                                                                                                                                                                                               |
| WS6                             | 🟡 PARTIALLY DELIVERED (DL-21, DL-54, DL-55)                                                                                       | DL-21 recommendation surfacing shipped; audited clean against every other exit criterion and locked by new tests (DL-54); WS6.1 card hierarchy stays local per DL-45/DL-48 precedent (not a gap); the chain/nth/frameLocator exit-criterion wording was corrected (DL-55) rather than left stale — WS6 is now scored against determinism/valid-strategy/frame-semantics/stable-output/no-fabrication/UI-surfacing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| WS6.2.1 (verify-path isolation) | ✅ **CLOSED — NO SAFE MEANINGFUL REDUCTION FOUND** (DL-58)                                                                         | a controlled build experiment (fully reverted, confirmed identical by `diff`) proved `resolveStep` was already bundled into `content.js` before WS6.2 existed, via the pre-existing Pick path; the true irreducible marginal cost is 6,759 B, almost entirely the parser itself. No code changed, no reduction available without cutting genuine functionality or expanding scope. The remaining overage is owner-level release-budget debt, **not** an unexplored optimization                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| WS6.2 (Verification V2)         | 🟡 PARTIAL — BUNDLE STILL OVER CEILING (DL-56, DL-57, DL-58)                                                                       | parser (`parser.ts`, hand-rolled, no `eval`/`new Function`/dynamic import, security-guard tested) + `verifier.ts` six-state classifier reusing `LocatorResolver` + `VerifyLocatorPanel` (mounted in both panels' existing Verify Selector card) all landed; 938 tests / 40 files, R2/R3/R5 unchanged; DL-57 bundle reduction gate investigated the build graph, tried `sideEffects: false` (Δ 0 B, reverted), removed 8 dead diagnostic strings (Δ −325 B, retained); DL-58 proved by controlled build experiment that `resolver.ts` was already bundled for the pre-existing Pick feature (`capture.ts` calls `resolveStep` since WS3) — no "broad resolver" to isolate, true irreducible WS6.2 marginal cost is 6,759 B (mostly the parser); no code changed — zero functional change throughout; bundle still 293,353 B, 14,593 B (5.24%) over the locked 278,760 B ceiling — disclosed, owner bundle-policy decision open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| WS7 (CSS/XPath truth)           | ✅ **CLOSED / COMPLETE** (DL-60)                                                                                                   | accepted scope: raw `VERIFY_SELECTOR` unified with WS6.2's `classifyVerification` six-state model; owner-decided exit bar met. Original §12 spec (new `selector-engine` package, verified per-candidate generation, `css-xpath.ts` deletion) is DEFERRED / FUTURE DIRECTION, not outstanding WS7 debt; 952 tests / 41 files; bundle 294,425 B, 15,665 B (5.62%) over ceiling — disclosed, separate owner-level release-budget debt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| WS8                             | ✅ **CLOSED / COMPLETE** (DL-62)                                                                                                   | Closed at the owner-authorised, re-baselined scope: keyboard/focus (native controls; ring retuned and asserted ≥3:1 per theme, plus a forced-colors outline), the 9-state error matrix (title/cause/action through one shared `ErrorNotice`), reduced motion, live regions, structural accessibility guards, and the budgets the repo actually defines — all pinned by tests. **axe-core DEFERRED** (no DOM/browser test environment exists under R3; it was **not** run and structural guards are not equivalent to it); **`§20.6` SUPERSEDED** — the section does not exist; real-site/manual smoke validation remains owner-side release validation; toast system DEFERRED. 1,037 tests / 44 files. Bundle 298,842 B — 20,082 B (7.20%) over ceiling, **separate disclosed owner-level release-budget debt, not resolved here**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| WS9                             | 🟡 **PARTIAL — SLICES 1–4, 5A, 5B, 5C, EXPORT (CLIPBOARD) AND CODE WORKSPACE DONE (DL-72…75, DL-77…81); DOWNLOAD BLOCKED (DL-80)** | **Recording can be captured, rendered, truthfully displayed, durably owned, truthfully read back, exported to the clipboard and now REVIEWED — and it remains unreachable: `RECORDING_ENABLED` is `false` and the runtime fails closed on it.** Slice 1 engine · 2 lifecycle · 3 runtime wiring · 4 renderers · 5A fail-closed live consumer · 5B durable owner · 5C durable reader and the LIVE greater-than DURABLE greater-than UNKNOWN precedence · Export the clipboard boundary. **Code workspace DONE (DL-81):** a READ-ONLY review surface whose code is byte-identical to `renderSpecFile` across all seven languages, built on the existing durable reader, the existing `CopyButton`/`ClipboardPort`, the existing bound tab and the existing panel language — no second reader, renderer, language table, storage descriptor or tab lookup. Review-only is architecture, not scope: a recorded `LocatorChain` is a verified artifact, so editing it would owe an answer to 'is an edited locator still verified?' that only forbidden verification could give. Four honest states (`unavailable`, `empty`, `ready`, `error`), none derived from the lifecycle. Generated code is rendered as TEXT — a hostile `<img onerror>` value is proven to survive un-escaped in the model while every HTML-injection API is guarded out. **WS5's `CodeWorkspace` locator buffer is a different thing and was not touched** — the collision DL-76 warned about, handled explicitly. Tests 1,795 / 64, goldens 127/127, bundle 319,841 B (Δ +656; **content.js Δ 0**; 14.74 % over ceiling). **Real Chromium: NOT RUN · Manual regression: NOT RUN** |
| WS9 (discovery record)          | 🔒 discovery complete (DL-63)                                                                                                      | recording UI still disabled by flag; **no implementation started, no source changed**. Discovery established the contract and found: architecture is compatible (no new engine needed — `resolveStep` already reachable in `content.js`; `ElementFactsLite` exists), 3 of 5 exit criteria implementable, but 2 blocked — the **E2E kill-the-content-script proof** (no extension E2E infrastructure exists) and **"100 stops with preserved state"** (needs WS4's versioned/tab-scoped storage; **WS4 is NOT STARTED**). The legacy recorder is unreachable dead code that stores raw attrs, not verified chains (§18), still carries DL-4's 600 ms-vs-500 ms contradiction, and does not exclude `password`. **Three owner decisions required before implementation**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| WS10                            | 🔒 DEFERRED / NOT STARTED                                                                                                          | recording UI disabled by flag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| WS11                            | 🔮 FUTURE                                                                                                                          | 1.0.0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Phases A–F                      | 🔮 FUTURE                                                                                                                          | recording → project awareness → framework-aware generation → optional AI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## 31. Future Milestone Roadmap

| Milestone            | After   | Meaning                                                                                     |
| -------------------- | ------- | ------------------------------------------------------------------------------------------- |
| **Recoverable**      | WS0     | ✅ the work can no longer be lost                                                           |
| **Honest**           | Gate S1 | nothing in the UI is a lie                                                                  |
| **Faithful**         | Gate S2 | Guru agrees with Playwright, provably                                                       |
| **Visible**          | Gate S3 | the built-but-hidden features reach the user                                                |
| **Preview**          | v0.1.x  | a small tool that tells the truth                                                           |
| **Provable**         | WS1     | the domain is correct and stays correct                                                     |
| **Fast**             | WS3     | the tool stops freezing real pages                                                          |
| **Unified**          | WS5     | one product, two surfaces                                                                   |
| **Trustworthy Core** | WS6+WS7 | nothing shown is unverified — **internal gate, not a public 1.0**                           |
| **Complete**         | WS10    | every advertised feature is real                                                            |
| **Shippable**        | WS11    | 1.0.0                                                                                       |
| **Phase A–F**        | beyond  | recording → project awareness → framework-aware generation → optional AI → advanced targets |

## 32. Recommended Next Action

**WS1 is CLOSED. WS2 — Design System / Shared UI Primitives is COMPLETE (items 1–9 all landed: tokens DL-43, typography + contrast DL-44, shared primitives DL-45, accessible Tabs DL-46, dev-only showcase DL-47, component consolidation + main strategy bar → Tabs DL-48, hex → semantic token migration in bounded scope DL-49, final UI polish / theme / accessibility verification DL-50, final validation / WS2 exit review DL-51).**

WS1's five sub-items and its exit review are all complete (DL-38…DL-42):

1. ~~happy-dom fixture harness~~ ✅ landed (`test/fixtures/dom.ts`)
2. ~~`FixtureDomProbe`~~ ✅ landed (`test/fakes/FixtureDomProbe.ts`; DL-38)
3. ~~codegen goldens~~ ✅ landed (`packages/codegen/test/`; 98 + 29 supplementary — DL-39)
4. ~~R4 structural guard~~ ✅ landed (`test/r4-structural-guard.test.ts` — DL-40)
5. ~~WS1 exit review~~ ✅ **all 5 exit criteria met**; failing-first gate closed by Path B demonstrated regression protection (DL-41 → DL-42)

**WS2 is COMPLETE**: items 1–9 all landed (tokens DL-43, typography + contrast DL-44, shared primitives DL-45, accessible Tabs DL-46, dev-only showcase DL-47, component consolidation + main strategy bar → Tabs DL-48, hex → semantic token migration in bounded scope DL-49, final UI polish / theme / accessibility verification DL-50, and final validation / WS2 exit review DL-51 — which fixed the DL-49 dual-role tab-text-contrast conflict, formally resolved the "zero hex" exit-criterion-wording question as a permanent scope-down, and put the XPath-pill contrast gap and the cosmetic-dark-theme limitation permanently on record). WS2's own exit review has been conducted; the next step is authorisation for a subsequent workstream. Ordering is unchanged;
**WS3 is PARTIALLY COMPLETE** (DL-52, DL-53 — snapshot byte-budget exit criterion now directly tested; IIFE deferred, bundle disclosed over ceiling). **A WS5+WS6 closure pass (DL-54)** landed the `ClipboardPort` adapter and DevTools navigation invalidation, and audited the rest of both workstreams' exit criteria — closing what was safely closeable and reporting the remainder precisely. **A subsequent owner-decision gate (DL-55)** resolved the three items DL-54 flagged for a project-owner decision, as documentation/contract corrections rather than new implementation: `PickSource`'s contract is now typed against `StoredPick` (see §5 status box above), resolving the type conflict — `TabPickSource`/`DevtoolsPickSource` remain unimplemented, now correctly described as unstarted work rather than a blocked contract; the leaf-first `SidePanel.tsx`/`Panel.tsx` extraction remains untouched, documented honestly as having no real-Chromium/e2e regression-test infrastructure available anywhere in this repo (not merely "high risk"); and WS6's chain/nth/frameLocator exit line is reworded (see §6 status box above) rather than left stale. WS5 stays PARTIAL, WS6 PARTIALLY DELIVERED. **WS6.2 Verification V2 (DL-56)** subsequently implemented the parser, `verifier.ts`, and `VerifyLocatorPanel` in full — every functional, test, and architecture requirement met (938 tests / 40 files) — but disclosed a significant bundle-size consequence (293,678 B, now 14,918 B/5.35% over the locked 278,760 B ceiling); WS6.2 status was **PARTIAL — FOLLOW-UP REQUIRED**, pending an owner bundle-policy decision, not missing functionality. **A subsequent bundle reduction gate (DL-57)** investigated the actual build/dependency graph before making any change — confirmed tree-shaking already excluded every unrelated module from `content.js`, confirmed the panel UI was not duplicated, confirmed imports were already correctly type-only — and applied the two changes that investigation justified: `sideEffects: false` (measured Δ 0 B, reverted, since tree-shaking was already optimal) and removing 8 dead `ParseError.detail` diagnostic strings never read by any consumer (Δ −325 B, retained, zero functional change). Bundle is now 293,353 B, 14,593 B/5.24% over the locked 278,760 B ceiling (down from 14,918 B/5.35%); WS6.2 status is now **PARTIAL — BUNDLE STILL OVER CEILING**. **A subsequent dependency-isolation gate (DL-58)** investigated, by a controlled build experiment rather than inference, whether the WS6.2 verification path's resolver dependency graph could be isolated from `content.ts` for a further reduction: `capture.ts`'s pre-existing Pick hot path already calls `resolveStep` on every click, so `resolver.ts`'s core logic was already bundled into `content.js` before WS6.2 existed — only the thin `resolveChain` wrapper is genuinely new. Temporarily removing WS6.2's `content.ts` wiring (fully reverted afterward, confirmed identical via `diff`) measured the true irreducible marginal cost at 6,759 B, almost entirely the parser itself. There is no "broad resolver" left to isolate; no code was changed. Bundle remains 293,353 B, 14,593 B/5.24% over ceiling; WS6.2 status remains **PARTIAL — BUNDLE STILL OVER CEILING**, now confirmed by direct experiment to be a genuine architectural/budget decision rather than an unexplored optimization opportunity.

Still-open inputs from the project owner (unchanged, and independent of WS1 test work):

1. **Host git state** — `git status --short`, `git log --oneline -5`, `git branch -vv`, `git remote -v` (so placement can be recorded honestly)
2. **Icon decision** — the only hard asset blocker for v0.1.x
3. **Conformance corpus** — authorise or decline the WS1 corpus extension (§28)

**Do not restart Stage 1, and do not begin the remaining WS1 implementation items until authorised.**
WS0–WS11 ordering is unchanged; no workstream is marked complete on a partial milestone.
