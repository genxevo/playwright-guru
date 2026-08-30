# Playwright Guru — Master Roadmap

**Status:** AUTHORITATIVE · single source of truth
**Created:** 27 August 2026 · **Supersedes:** nothing — it *indexes* the locked blueprint, it does not replace it
**Locked base:** `claude/phase-1-blueprint.md` (Phase 1 Blueprint, FINAL, LOCKED)

> **Reading rule.** Where this document and the locked blueprint disagree, **the blueprint wins** and the disagreement is a defect in this document. Where this document records evidence that *contradicts* the blueprint, it is recorded in the Decision Log (§29) and flagged — never silently resolved.

**Classification legend used throughout:**
`LOCKED` · `CURRENT` · `PROPOSED` · `DEFERRED` · `FUTURE` · `UNKNOWN` · `NOT AUTHORIZED`

---

## 1. Executive Summary

Playwright Guru is a Chrome extension that turns *"I found an element"* into *"I have a Playwright locator I can trust."* WS0 is closed and locked; the architecture, boundary rules, CI and contracts exist and are proven. **WS1 has not started.**

Three findings define the current moment:

1. **WS0 delivered contracts, not connections.** Every WS0 module — probe, resolver, facts, snapshot, rationale, ports, adapters, recording limits, copy map — is imported by **zero production paths**. Architecture improved; user-facing reliability did not. `LOCKED` (fact)
2. **Guru's locator ranking is inverted against Playwright's own generator.** Guru ranks `testId` last; `selectorGenerator.ts` scores it first. A product positioned as *Playwright-native* currently disagrees with Playwright and does not know it. `CURRENT` (defect)
3. **The product's biggest features are invisible.** Ancestor-scoped chaining, `.nth()` handling and `frameLocator()` are built, tested, and never shown to the user.

The plan is therefore: **a narrow Pre-v0.1.0 Reliability Gate (truth → fidelity → visibility), then WS1–WS11 unchanged**, then a long-term evolution into recording and framework-aware generation that reuse the *same* locator intelligence.

**Recommended next action:** authorise Stage 1 of the Reliability Gate (§11). Nothing else.

---

## 2. Product Vision `LOCKED`

```
INSPECT → UNDERSTAND → GENERATE → VERIFY → BUILD
```

> **Playwright Guru never shows the user something it cannot justify.**

Three load-bearing words, each mapped to an architectural commitment:

| Word | Commitment | Home |
|---|---|---|
| **reliable** | the recommendation is the one the engine can *prove* is best | `LocatorResolver` + Recommended card (WS3, WS6) |
| **verified** | nothing displays a signal it did not measure | `DomProbe` + verdict model (WS1, WS3, WS7) |
| **flow** | the output is a workflow, not a string | workspace + recording + assertions (WS9, WS10) |

## 3. Product Principles `LOCKED`

Deterministic where possible · locally processed · privacy-first · Playwright-faithful · evidence-based · explainable · maintainable · no fabricated reliability · no silent failures · no unnecessary AI dependency.

**Scope, explicit:** the product is **Playwright-only**. Selenium, Cypress, WebdriverIO and Robot Framework are studied competitively and **never built**. Differentiation is *Playwright-native + opinionated + provably correct + locally processed*.

---

## 4. Current Repository State

| Item | Value | Verified by |
|---|---|---|
| Rollback point | `bb928eac8547a1ad1b0cc119c41673e0553adece` | user-reported, **immutable** |
| WS0 commits | `6457f7c` → `2cabc8a` → `68604e2` | user-reported |
| HEAD | `68604e2fe1c0bb32db2b93aa66eb1e734f296974` | **user-reported — NOT independently verified** |
| `origin/main` | expected `= HEAD` | **user-reported** |
| Working tree | `?? docs/` (untracked `privacy-policy.html`); root `playwright-guru-v0.1.0.zip` (gitignored) | Claude, via bridge listing |
| File-content spot check | `package.json`, `README.md`, `wxt.config.ts`, `extension/package.json`, `docs/privacy-policy.html` **byte-identical** to mirror | Claude, via bridge staging |
| Icons | **none anywhere** — `packages/extension/public/` does not exist | Claude |
| `docs/roadmap/` | **does not exist** | Claude |

> **Git safety rule `LOCKED`.** Claude cannot run git against the host. Claude must never assert HEAD, branch, remote sync, or a clean tree. User-supplied `git status --short` / `git log --oneline -5` / `git branch -vv` / `git remote -v` is the only authoritative host state.

**Repository facts vs mirror facts are separated everywhere in this document.** The mirror is `/home/claude/pg` inside Claude's container; nothing in it exists on the user's machine until explicitly placed.

## 5. WS0 Closure `LOCKED`

26 new · 9 modified · 0 deleted · **+44 / −29** · 54/54 tests · local Windows PASS · CI Ubuntu + Windows PASS (run `32149336770`) · branch-protection prerequisite now satisfied.

**Documented divergences — must remain documented, never silently corrected:**

| # | Divergence | Note |
|---|---|---|
| D-A | `Panel.tsx` **not** reformatted; quarantined in `.prettierignore`. 74 lines >120 chars, incl. the 3,891-char line | The blueprint's "no line >120 chars" criterion is **not literally satisfied** |
| D-B | Test files renamed/relocated; coverage is a **superset** | — |
| D-C | `FakePickSource` deferred to WS5, where it first has a consumer | — |
| D-D | `eslint.config.js` → `.mjs` for ESM | naming only |
| D-1 | `DomProbe.countByLabel` added (APPROVED) | interface completion |
| D-2 | 16 pre-existing type errors fixed (APPROVED) | required for the typecheck gate |

**Node 20 clarification `LOCKED`:** the GitHub Actions deprecation concerns the **action runtime** (`actions/checkout@v4` etc. → `@v5`), *not* the project's `node-version: 20`. **Do not change the project's Node version because of that annotation.**

**The critical qualifier:** WS0 improved architecture, contracts and tests. It did **not** materially improve user-facing reliability, because none of it is wired to a production path. This distinction stays visible.

---

## 6. Current Reliability State `CURRENT`

From the audit: **7 GREEN · 9 YELLOW · 8 RED · 1 NOT WIRED.**

**GREEN:** Playwright locator output · five-language codegen · popup · code buffer/copy/undo · bundle size · manifest permissions · **privacy behaviour** (verified: zero network calls, `storage.local` only — no `storage.sync`, clipboard write-only, no analytics/telemetry/remote code).

**RED:** recording was dead while reporting success · CSS badges fabricated · XPath badges fabricated · DevTools `EVAL_SCRIPT` is a separate implementation · O(n²) match counting · background synthesised success · cross-origin iframe behaviour guessed · shadow DOM unhandled.

**NOT WIRED:** every WS0 contract module.

## 7. All Known Findings `CURRENT`

| ID | Finding | Severity | Owner |
|---|---|---|---|
| F-1 | **Ranking inverted vs Playwright's generator** | 🔴 highest | WS1 |
| F-2 | **~138 `v.push` sites in `css-xpath.ts` carry literal `reliability` labels never derived from a match count** | 🔴 | WS7 (honesty fix now) |
| F-3 | Recording dead + synthetic success = visible lie | 🔴 | fixed in mirror |
| F-4 | Two match-count semantics in one panel (candidates = visible; verify = all) | 🟠 | WS6.2 |
| F-5 | DevTools `EVAL_SCRIPT` disagrees with `content.ts` on accessible name (E3) | 🟠 | WS5 |
| E2 | `getByLabel` counted with `===`; Playwright uses case-insensitive substring | 🟠 | WS1/WS3 |
| E5 | `date/time/month/week` missing from textbox; `select[multiple]`/`size>1` mis-roled | 🟠 | WS1 |
| N-1 | `input[type=file]` → Playwright **button**; Guru **textbox** | 🟠 **new** | WS1 |
| N-2 | `text/email/tel/url` + `list`→`<datalist>` → Playwright **combobox**; Guru **textbox** | 🟡 **new** | WS1 |
| E1 | `innerText` truncated to 100 chars *before* generation | 🟠 | WS3 |
| E4 | `CSS.escape` inside quoted attribute values on the live path | 🟡 | WS3 |
| E7 | `computeAccessibleName` falls through to `innerText` for arbitrary elements | 🟡 | WS1 |
| E8 | fallback emits `getByText('div')` — no raw-locator `LocatorKind` exists | 🟡 | WS1 |
| E9 | `buildLocatorChain` calls `pickBestUnique` twice | 🟢 | WS1 |
| F-6 | O(n²) full-document text scan per candidate | 🟠 | WS3 |
| F-7 | No error boundary — render throw = white screen | 🟠 | WS5 |
| F-8 | Zero unit tests for `accessibility.ts` / `scorer.ts` / `engine.ts` | 🔴 | WS1 |
| F-9 | Global (not tab-scoped) picker state | 🟡 | WS4 |
| F-10 | Cross-origin iframes guessed; shadow DOM unhandled | 🟡 | WS3 / Phase 2 |
| F-11 | No sender validation on message listeners | 🟡 | WS3 |
| F-12 | Ancestor-scoped chain, `.nth()`, `frameLocator()` **built, tested, invisible** | 🟠 opportunity | WS6.1 |

## 8. Corrected / Invalidated Findings `LOCKED`

### E6 — INVALIDATED BY EVIDENCE

The blueprint claimed `input[type=password]` must return no implicit role because *"getByRole('textbox') will not find it."* Verified against `playwright-core@1.62.1`, `packages/injected/src/selectorGenerator.ts`:

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

| | Locator Labs | Playwright CRX | Official Playwright Extension |
|---|---|---|---|
| Rating / users | 4.9★ · ~10k | 5.0★ (17) · ~10k *(listing observed elsewhere as 40k — **UNKNOWN**, treat as ~10k+)* | 4.9★ (13) · ~90k |
| Owns | locator-quality **education** across 5 frameworks | running **real Playwright** in-browser via `chrome.debugger` | **session/auth transport** to CLI/MCP/agents |
| Ranking | BEST / GOOD / OK | none — silent | none |
| Rationale | yes, failure-mode based | none | none |
| Live validation | count + highlight + **step between matches** | Playwright's own | n/a |
| Weakness | framework-agnostic ⇒ Playwright-*compatible*, not native; cannot prove its advice | no opinion, no ranking, no rationale; `chrome.debugger` banner | generates no locators at all |

> **Strategic hypothesis (not asserted market fact):** *"Nobody we have studied currently combines Playwright-native locator intelligence, verification, ranking, rationale, and framework-aware generation into one coherent product."* — `PROPOSED`, to be revisited as the market changes.

## 10. Current v0.1.x Strategy `CURRENT`

Ship a **Developer Preview** that is honest, Playwright-faithful, and shows what it already has. Not feature-complete. Not 1.0.

**Publishing is PAUSED.** No store listing work, no screenshots, no privacy declarations, no distribution settings, no submission. The draft item exists and stays untouched.

---

## 11. Pre-v0.1.0 Reliability Gate `CURRENT`

**Not a workstream. Not WS12.** A sequencing decision that pulls selected items *forward from existing workstreams*. Every item maps to an existing WS owner.

### Stage 1 — TRUTH
*Goal: nothing in the UI is a lie.*

| Task | Owner WS | Status |
|---|---|---|
| Place P0-1A — `RECORDING_ENABLED=false`, Record button + banner gated | WS9 rollback flag | ✅ mirror · ⏸ not placed |
| Place P0-1B — remove both `?? { ok: true }`; `normalizeAck()` → `NO_HANDLER` | WS3 (§12.3 Layer 1) | ✅ mirror · ⏸ not placed |
| Relabel CSS/XPath honestly — *"Syntax reference — not verified against the page"*; drop the badge | WS7 (honesty subset) | ⬜ |
| Unify counts — visible-first with total | WS6.2 | ⬜ |
| Error boundaries on both panel roots | WS5 | ⬜ |
| Icons (16/32/48/128) + `minimum_chrome_version: '114'` | WS11 | ⛔ blocked — icon decision |
| Honest store copy (prepared, not published) | WS11 | ⬜ |
| Privacy regression test over the built bundle | WS8 | ⬜ |
| Packaging validation from `packages/extension/.output/chrome-mv3` | WS11 | 🟡 structure validated in mirror |
| Manual smoke matrix (8 journeys + 6 negatives) | WS8 | ⛔ requires the user |
| Clean-clone validation | WS11 | ⬜ |

> **On F-2, explicitly:** relabelling is an *honesty* fix, not a solution. The real fix is WS7's evidence-based generation. **Do not recolour the badges and declare the problem solved.**

### Stage 2 — PLAYWRIGHT FIDELITY
*Goal: Guru agrees with Playwright wherever it claims Playwright behaviour.*

| Task | Owner WS |
|---|---|
| Unit tests for `accessibility.ts` **(first)** | WS1 |
| Unit tests for `scorer.ts` | WS1 |
| Unit tests for `engine.ts` | WS1 |
| E5 — role-selector gaps + listbox/combobox | WS1 |
| E2 — label matching on the **live path** (`content.ts`), not only the unused helper | WS1/WS3 |
| N-1 `file` → button | WS1 |
| N-2 datalist → combobox | WS1 |
| **Ranking policy decision** + tests pinning it | WS1 |
| Playwright conformance corpus | WS1 — `NOT AUTHORIZED` |

### Stage 3 — VISIBILITY
*Goal: expose what is already built.*

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

### WS1 — Domain / Contract Tests · L · 6–8 d · **NOT STARTED**
**Purpose.** Make the domain provably correct; land the contracts everything depends on.
**Inputs.** WS0. **Dependencies.** WS0 (tests need CI and lint to mean anything).
**Deliverables.** happy-dom fixture harness · `FixtureDomProbe` · unit tests for `accessibility`/`scorer`/`engine` · ~98 codegen golden files · **failing tests first for E1–E9, then the fixes** · `probe`/`resolver`/`rationale`/`facts`/`snapshot` types + guards · R4 structural guard · `renderAction`/`renderAssertion` signatures.
**Architectural reason.** *The most valuable days in the project — every later workstream is faster and safer because of this one.*
**Out of scope.** Any extension code · any UI · `LiveDomProbe` · selector generation.
**Validation.** §22.1 + §22.2 suites green; goldens reviewed line by line against the Playwright docs per language.
**Exit.** ≥200 assertions · every E-fix has a test that failed before it · R4 guard passes · copy map exhaustive, zero orphans · `packages/*` contain zero `document`/`window`/`chrome`.
**Known issues.** E6 invalidated (§8) · N-1/N-2 added · ranking policy must be decided here · conformance corpus `NOT AUTHORIZED`.

### WS2 — Design System / Shared UI Primitives · M · 4–5 d · **NOT STARTED**
**Purpose.** Tokens and accessible primitives **before** any component is extracted, so extraction happens once.
**Deliverables.** `tokens.css` from the existing palette · contrast + font-size fixes (9px → 12px base, 11px min) · dark theme tokens · ~15 primitives incl. **`Tabs` with the full ARIA pattern** · `?showcase=1` dev route.
**Dependencies.** WS0. **Out of scope.** Product components · wiring into panels · behaviour changes.
**Exit.** Zero hardcoded hex outside `tokens.css` in `ui/` · every token pair ≥4.5:1 · `Tabs` passes ARIA keyboard tests · bundle impact <5 KB.

### WS3 — Capture / Performance / Live DomProbe · L · 7–9 d · **NOT STARTED**
**Purpose.** Rebuild the content script as a fact-capture host implementing `DomProbe`; eliminate the O(n²) scan; enable frames; harden the picker; enforce the snapshot budget.
**Deliverables.** split `content.ts` into `runtime/capture`, `runtime/probe`, `runtime/picker` · normalized text index · lazy memoised visibility · `LiveDomProbe` + per-pick memo cache · `ElementContext` with all §17.6 caps · snapshot size guard + degradation ladder · `all_frames: true` + frame identification · overlay into a **closed shadow root** · rAF-throttled highlight · standalone IIFE probe build · background: one typed router, **sender validation**, **no synthetic `{ok:true}`**, validated `executeScript` target · CI benchmarks.
**Dependencies.** WS0, WS1. **Out of scope.** Recording · assertions · selector generation · UI · storage v2.
**Exit.** ≤1 whole-document traversal per pick · every fixture snapshot <25 KB, `<body>` worst case <50 KB · iframe picking works · sender validation rejects foreign senders · background never returns success for an unhandled message · content bundle ≤60 KB · no side-panel regression.
**Note.** Stage-1's P0-1B is a pre-landed subset of this workstream's "no synthetic success" deliverable.

### WS4 — Session Storage (Storage V2: Session & Persistent State) · M · 4–5 d · **NOT STARTED**
**Purpose.** Versioned, validated, tab-scoped storage with a lossless v1 upgrade.
**Deliverables.** `StorageGateway` with runtime validation · namespace + `local`/`session` split · tab-scoped keys · idempotent, failure-safe migration on `onInstalled` · `tabs.onRemoved` cleanup + orphan sweep · quota caps + debounced writes · "Clear data".
**Dependencies.** WS0 (independent of WS1/WS2). **Out of scope.** History/favourites UI · settings UI · recording *usage*.
**Exit.** A v1 install upgrades with **zero loss of `pg_code_buffer`** · migration is idempotent · failure leaves v1 intact · two tabs keep independent picker state · corrupted storage degrades to empty.
**Future relationship.** Natural home for the `testIdAttribute` preference (§15 of the audit, U9).

### WS5 — Shared Application Layer + UI Extraction (incl. DevTools) · L · 11–13 d · **NOT STARTED · THE GATE**
**Purpose.** One implementation of the product, consumed by both surfaces.
**Deliverables.** ports (`PickSource`, `CommandBus`, `ClipboardPort`, `TabContext`) · **both** adapters · 8 hooks · services · leaf-first component extraction · `SidePanel.tsx` 696 → ~120 lines · `Panel.tsx` → ~80 lines · **`EVAL_SCRIPT` deleted** · `network.onNavigated` invalidation · DevTools theme sync · runtime validation of eval results · delete `element-scorer.ts` + dead code · **error boundaries** · clipboard with fallback and failure UI.
**Dependencies.** WS2, WS3, WS4. **Out of scope.** New features · visual redesign — **must be visually neutral** · recording · assertions.
**Exit.** `SidePanel.tsx` ≤150 lines · `Panel.tsx` ≤100 · `EVAL_SCRIPT` gone · zero `chrome.*` in `ui/` · **both surfaces produce byte-identical snapshots for identical input** · every pre-existing feature verified by manual regression.
**Risk.** Highest-risk workstream — touches everything, proves nothing. Strangler pattern, leaf-first, revertible per step.

### WS6 — Recommended Locator (incl. WS6.2 Verification V2) · M+L · 8–10 d · **NOT STARTED**
**WS6.1.** `RecommendedLocatorCard` · rationale copy layer · `VerdictBadge` · Primary/Secondary/Educational hierarchy · scoping / `nth` / frame explanations · verdicts replace scores · debug mode for raw scores · N/A rows migrated to rationale codes.
**WS6.2.** Syntax detection · Playwright subset parser (recursive descent, **no eval**) · reuse `LocatorResolver` · **visible-vs-total reporting** · typed `ParseError` with caret position · `VerifyLocatorPanel`.
**Dependencies.** WS5. **Out of scope.** CSS/XPath generation · recording · assertions · full Playwright grammar · expression editing.
**Exit.** Chain renders with `frameLocator`/`nth` where applicable · every rationale code has copy · no raw score outside debug mode · **`pick.chain` is finally read** · all supported forms verify · zero `eval`/`new Function`.
**Note.** Stage 3 of the gate is a WS6.1 subset landed early.

### WS7 — CSS / XPath Selector Engine · L · 7–9 d · **NOT STARTED** · completes the Trustworthy Core
**Purpose.** Make generated CSS/XPath *true*, and separate it from reference material.
**Deliverables.** new `selector-engine` package · context-aware **verified** generation · dynamic-id + utility-class heuristics · correct escaping + XPath `concat()` quoting · Generated/Reference UI split · reference data migrated with `whenToUse`/`caution` · `GeneratedSelector` vs `ReferenceExample` types making badge misuse **structurally impossible**.
**Dependencies.** WS1, WS3, WS5. **Out of scope.** Shadow-DOM selectors · selector editing.
**Exit.** **For every fixture, every generated selector actually matches the intended element** · reference examples carry no badge or count · `css-xpath.ts` deleted · probe budget ≤60 · snapshot budget respected.
**Note.** This is the real fix for F-2. Stage 1 only tells the truth in the meantime.

### WS8 — Polish / a11y / Security / Performance Validation · M · 4–5 d · **NOT STARTED**
**Purpose.** Validate and harden everything through WS7 before feature work resumes.
**Deliverables.** ARIA audit · focus management · live regions · reduced motion · full error-state matrix · toast system · empty/loading/error states · dark-mode polish · keyboard shortcut docs · copy review · **security review checkpoint** · **performance validation on real sites**.
**Dependencies.** WS5, WS6, WS7.
**Exit.** axe-core zero critical/serious in both panels in both themes · every interactive element keyboard-reachable with a visible focus ring · every error has title, cause, action · §20.6 budgets hold on 3+ real sites.
**Known issue.** WS9/WS10 land *after* this pass — mitigated by (a) mandatory WS2 primitive composition and (b) WS11 re-running these gates.

### WS9 — Recording · L · 8–10 d · **DEFERRED**
**Purpose.** Recording that is real, structured, honest, privacy-safe.
**Deliverables.** `runtime/recorder` with the noise filter and coalescing · `RecordedWorkflow` with **verified `LocatorChain`s** + `ElementFactsLite` · **activation handshake + heartbeat** · navigation/SPA/frame/tab handling · **limits from the single constant** · **password/card/file redaction** · `renderAction` + `renderSpecFile` · structured code workspace + v1 raw-line migration · export menu.
**Dependencies.** WS3, WS4, WS5, WS7. **Out of scope.** Assertions (WS10) · DevTools recording · step editing.
**Exit.** **An E2E test that kills the content script proves the RECORDING banner cannot appear** · 40 does not interrupt · 100 stops with preserved state · passwords never captured · workflow ≤500 KB at 100 actions.
**Current status.** Recording UI is **intentionally disabled** (`RECORDING_ENABLED=false`) until this workstream makes it real. WS9 turns it on by flipping one constant.

### WS10 — Guided Assertion Capture · M · 3–4 d · **DEFERRED**
**Purpose.** Explicit assertion authoring against verifiable facts. **No inference (D8).**
**Deliverables.** assertion mode in the picker · derivation of assertions *valid for that element* · `AssertionPicker` · `Assertion` model · `renderAssertion` in all four renderers · assertions as `CodeItem`s and `RecordedAction`s.
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

| Phase | Content | Status |
|---|---|---|
| **Gate S1** | Truth | `CURRENT` — partially done in mirror |
| **Gate S2** | Playwright fidelity | `PROPOSED` |
| **Gate S3** | Visibility (WS6.1 subset) | `PROPOSED` |
| **v0.1.x** | Developer Preview | `DEFERRED` until gate complete |
| **WS1–WS8** | Trustworthy Core (WS6+WS7 = internal milestone, **not 1.0**) | `LOCKED` order |
| **WS9–WS11** | Recording, assertions, 1.0 | `DEFERRED` / `FUTURE` |
| **Phase A–F** | Long-term evolution (§18–§22) | `FUTURE` |

## 15. Validation Strategy `LOCKED`

`pnpm verify` = build → typecheck → lint → test → format:check, mirrored exactly by CI on **Ubuntu + Windows**. Build must precede typecheck (codegen resolves locator-engine through generated `dist/`). Budgets: content script ≤60 KB · panel chunks ≤20 KB · pick <100 ms @5k nodes, <250 ms @20k · ≤1 whole-document traversal per pick · ≤60 probe calls · snapshot <25 KB / >50 KB anomaly.

## 16. Test Strategy `LOCKED`

**Principle: tests exist to prevent specific, identified failures. No coverage-percentage targets.**

Unit (locator-engine · happy-dom fixtures) · golden files (~98 = 7 languages × ~14 chain shapes) · fixture-driven selector-engine tests whose key invariant is *every generated selector actually matches the intended element* · extension integration (storage round-trip, migration, message contract incl. `NO_HANDLER`, snapshot budget, `ScopeHandle` exclusion, recording limits at 39/40/99/100) · **9 E2E scenarios** with the extension loaded · CI benchmarks.

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

`RecordedTarget` stores the **verified chain, not a rendered string**, so a recording made today can be re-rendered in any language tomorrow, or regenerated with a different strategy. That property is the moat: Playwright CRX records with Playwright's locators and no opinion; Guru would record with *ranked, verified, explained* locators.

## 19. Future Framework-Aware Generation Architecture `FUTURE` — Phase C/D

**Principle `LOCKED` for this direction: generate changes *into* an existing project. Never invent a framework.**

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

**"Learn My Framework"** analyses locally and reports what it found (e.g. *12 Page Objects, 8 fixtures, 34 tests*) before saving a profile. Future recordings generate *into* that profile.

## 21. Optional AI Architecture `FUTURE`

**AI is optional and must never be required for the core locator product.**

| AI is appropriate when | AI must NOT be used for |
|---|---|
| repository structure is messy | per-locator generation |
| conventions are implicit | any runtime dependency of basic locator output |
| naming is inconsistent | anything that would send page content off-device without explicit consent |
| semantic interpretation of project patterns is needed | replacing deterministic analysis that works |

Privacy must remain explicit and opt-in at every step. The local-first, zero-network property of the core product is a **verified competitive asset** and must not be traded.

## 22. Cucumber — Future Position `FUTURE`

**Not in v0.1.x. Not in the current roadmap.** If ever supported, it becomes *one more generation target inside the framework-aware layer* (`features/*.feature` + `step-definitions/*.steps.ts` + `pages/*Page.ts`), never a separate subsystem. Do not let this expand current scope.

## 23. Privacy / Security Principles `LOCKED`

**Verified today:** zero network calls (no `fetch`/`XHR`/`WebSocket`/`sendBeacon` in source or bundle) · `chrome.storage.local` only — **no `storage.sync`**, so nothing reaches Google · clipboard `writeText` only, never read · no analytics, telemetry, remote code or third-party services · no cookies/history/bookmarks/identity/downloads access.

**Preserved as hard constraints:** no network · no remote code · no `innerHTML`/`eval` of remote content · MV3 default CSP · React-escaped rendering of page-derived strings. Future: sender validation (WS3) · closed shadow-root overlay (WS3) · picks to `storage.session` (WS4) · password/card/file redaction in recording (WS9) · explicit CSP (WS11).

---

## 24. Risks

| # | Risk | P·I | Mitigation |
|---|---|---|---|
| R-1 | Ranking change alters every output | Med·High | Land the conformance corpus (if authorised) **before** the change so the diff is reviewable |
| R-2 | Generated locators subtly wrong | Med·**Crit** | Goldens reviewed against docs; fixture invariant; verify-before-display |
| R-3 | Storage migration loses the user's code buffer | Low·**Crit** | Write v2 before deleting v1; idempotent; failure leaves v1 intact |
| R-4 | Recording unreliable after WS9 | High·High | Activation handshake + heartbeat; ship flagged; degraded state, never a lie |
| R-5 | WS5 regresses the UI | Med·High | Strangler, leaf-first, visually neutral, per-step revert |
| R-6 | Scope creep — Phase 1 never ends | **High**·Med | Fixed exits; §26 deferral list is binding; new ideas go to the roadmap, not the sprint |
| R-7 | Framework-aware generation becomes an uncontrolled generator | Med·High | Review→Apply; FrameworkProfile from evidence; never invent architecture |
| R-8 | AI becomes a runtime dependency | Med·High | §21 boundary is binding |
| R-9 | Microsoft ships locator intelligence officially | Low·**Crit** | Hedge is speed + opinion; Microsoft ships neutral tools |
| R-10 | Claude cannot verify host git state | **High**·Med | §4 rule: never assert host state |
| R-11 | v0.1.x ships too small to impress | Med·Med | Accept. Stage 3 surfaces three strong features already built |

## 25. Unknowns `UNKNOWN`

1. Host git state — HEAD, branch, remote sync, clean tree (Claude cannot verify)
2. The UI screenshots referenced in blueprint §38-D1, never attached — 5 UX decisions remain provisional
3. Whether real users exist with a populated `pg_code_buffer` (changes WS4 migration from *nice* to *critical*)
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

| Item | Note |
|---|---|
| Playwright conformance corpus | High-value WS1 extension — **awaiting authorisation** |
| Any implementation this turn | Documentation/planning only |
| Placing the mirror's P0-1 into the repository | Ready, **not authorised** |
| Committing / pushing / branching / resetting / rebasing | — |
| Publishing, store listing, screenshots, distribution, submission | Paused |
| Implementing E5, E2, N-1, N-2, ranking changes, E8 | Named in the plan, not authorised |
| Recording, assertions, framework generation, AI, Cucumber | Deferred / future |
| Changing the blueprint | Requires explicit reopening |
| Reformatting `Panel.tsx` | Documented divergence; correcting it silently is forbidden |

## 29. Decision Log

| # | Decision / Contradiction | Resolution | Class |
|---|---|---|---|
| DL-1 | Blueprint: E6 password → no role. Playwright source: → `textbox` | **E6 INVALIDATED.** Blueprint §6.7 is wrong on this row. Recorded, not silently fixed | `LOCKED` |
| DL-2 | Blueprint acceptance: `Panel.tsx` no line >120 chars. Reality: 74 such lines | **Divergence stands, documented.** Quarantined in `.prettierignore`; each entry removed by the workstream that rewrites the file | `LOCKED` |
| DL-3 | Closure report reads as more progress than users receive | Qualifier added: WS0 contracts are wired to **zero** production paths | `LOCKED` |
| DL-4 | "`RECORDING_LIMITS` is the single source" — true; the legacy recorder bypasses it (`content.ts:173` hard-codes 600 ms vs the constant's 500; no append cap) | Both true. The guarantee is narrower than it reads. WS9 closes it | `CURRENT` |
| DL-5 | E4 "fixed" in `resolver.ts`; still present in `content.ts` — the code that runs | E4 counts as **still present for users**. Fix belongs to WS3 | `DEFERRED` |
| DL-6 | Blueprint WS11 says bump to 1.0.0; we plan a 0.1.x preview | Not a contradiction — the preview is an agreed addition; **1.0.0 remains WS11's exit** | `LOCKED` |
| DL-7 | Guru ranks `testId` last; Playwright's generator ranks it first; Playwright's *docs* prefer role | **Unresolved by design.** Ranking policy is a WS1 decision. Audit recommends: rank as the generator does, surface the role alternative as "user-facing", explain the tension | `PROPOSED` |
| DL-8 | Claude earlier asserted recording was implemented | **Wrong.** Repository authoritative: no `START_RECORDING` case. Recorded so the error is not repeated | `LOCKED` |
| DL-9 | Where should roadmap docs live? | The Claude Project already holds all prior reports. Roadmap joins it as the primary system; repo-ready copies delivered for optional `docs/roadmap/` placement. **No duplicate system created** | `CURRENT` |
| DL-10 | Playwright CRX user count reported as both ~10k and ~40k | Unresolved; recorded as `UNKNOWN` rather than picked | `UNKNOWN` |

## 30. Progress / Status Dashboard

| Milestone | Status | Detail |
|---|---|---|
| Phase 0 Discovery | ✅ COMPLETE | 26-section report |
| Phase 1 Blueprint | ✅ COMPLETE / LOCKED | 40 sections, 5 corrections, 8 contradictions resolved |
| **WS0** | ✅ **CLOSED / LOCKED** | 3 commits · 54/54 · CI green both OS |
| Product audit | ✅ COMPLETE | 28 sections; F-1 and F-2 found |
| **Pre-v0.1.0 Gate S1** | 🟡 **PARTIAL** | P0-1A + P0-1B in mirror (61/61) — **not placed** |
| Gate S2 | ⬜ NOT STARTED | awaiting authorisation |
| Gate S3 | ⬜ NOT STARTED | awaiting authorisation |
| v0.1.x preview | ⏸ PAUSED | store draft exists, untouched |
| WS1 | ⬜ NOT STARTED | — |
| WS2–WS8 | ⬜ NOT STARTED | — |
| WS9–WS10 | 🔒 DEFERRED | recording UI disabled by flag |
| WS11 | 🔮 FUTURE | 1.0.0 |
| Phases A–F | 🔮 FUTURE | recording → project awareness → framework-aware generation → optional AI |

## 31. Future Milestone Roadmap

| Milestone | After | Meaning |
|---|---|---|
| **Recoverable** | WS0 | ✅ the work can no longer be lost |
| **Honest** | Gate S1 | nothing in the UI is a lie |
| **Faithful** | Gate S2 | Guru agrees with Playwright, provably |
| **Visible** | Gate S3 | the built-but-hidden features reach the user |
| **Preview** | v0.1.x | a small tool that tells the truth |
| **Provable** | WS1 | the domain is correct and stays correct |
| **Fast** | WS3 | the tool stops freezing real pages |
| **Unified** | WS5 | one product, two surfaces |
| **Trustworthy Core** | WS6+WS7 | nothing shown is unverified — **internal gate, not a public 1.0** |
| **Complete** | WS10 | every advertised feature is real |
| **Shippable** | WS11 | 1.0.0 |
| **Phase A–F** | beyond | recording → project awareness → framework-aware generation → optional AI → advanced targets |

## 32. Recommended Next Action

**Authorise Stage 1 of the Pre-v0.1.0 Reliability Gate — nothing else.**

Concretely, the first authorised step should be placing the mirror's P0-1 (already validated at 61/61) into the repository, because it removes a live user-facing lie and is the smallest possible change that improves user-facing honesty.

Before that, or alongside it, three inputs are needed from the project owner:

1. **Host git state** — `git status --short`, `git log --oneline -5`, `git branch -vv`, `git remote -v`
2. **Icon decision** — the only hard blocker in Stage 1
3. **Conformance corpus** — authorise or decline the WS1 extension (§28)

**Do not begin implementation until Stage 1 is explicitly authorised.**
