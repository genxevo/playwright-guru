# WS6.3 — DISCOVERY REPORT

**2026-09-03 · DL-69 · DISCOVERY ONLY — NO IMPLEMENTATION PERFORMED**

No source file was created, modified or deleted. No test was added or changed. No dependency was
installed. No refactor, no bundle work, no UI change. Two defects and one broken baseline were found;
**none was fixed** — they are documented here, as this gate requires.

---

## 1. Executive Verdict

**STALE / REQUIRES ROADMAP CORRECTION.**

**`WS6.3` does not exist.** It appears nowhere in `MASTER-ROADMAP.md`. Every occurrence of the string
in this repository — five files, nine occurrences — is a **negative disclaimer** ("WS6.3 was not
started"), and every one of them was written by the WS5 gates on 2026-09-03, which took the label from
their own prompt's exclusion list. It was never a specification; it entered the documents as a thing
that had _not_ been done, and has no definition to implement.

This is the same shape as WS8's `§20.6`: an identifier that exists only in prompts and in
"not started" lines, never in a requirement. That was resolved by an explicit owner re-scope, and the
same is needed here.

The roadmap's §WS6 defines exactly three things: **WS6.1**, **WS6.2**, and the **WS6.2.1** gate. There
is no fourth.

**However, this gate is not empty.** Tracing the verification architecture surfaced **two genuine,
previously-unrecorded honesty defects** in the WS6.2 verification path, both of which report a
confident answer to a question the resolver did not actually ask. They are the strongest available
candidates for what a "WS6.3" should mean, and they are put to the owner rather than assumed (D2, D3).

A third finding is more urgent than either: **the repository baseline is currently red.** `pnpm lint`
fails on two errors introduced by the previous gate, and DL-68 and the WS5 report both state
"lint PASS". That claim is wrong. It is corrected here and **not fixed here** (D1).

---

## 2. Repository Drift

| Item                                                                    | Finding                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch / working tree / commits                                         | **No git repository exists** (`fatal: not a git repository`), as in every gate since DL-64. The modification-time method was used instead.                                                                                                                                                                               |
| Source drift since DL-68                                                | **NONE.** No `.ts/.tsx/.json/.css/.html/.mjs` file under `packages/` is newer than the DL-68 record.                                                                                                                                                                                                                     |
| `pnpm-lock.yaml`                                                        | Untouched since 2026-08-30 — independently confirms **WS5 added no dependency**.                                                                                                                                                                                                                                         |
| `package.json`, `tsconfig.json`, `vitest.workspace.ts`, `wxt.config.ts` | Untouched since 2026-08-18 / 08-30.                                                                                                                                                                                                                                                                                      |
| `eslint.config.mjs`                                                     | Modified 2026-09-03 18:41 — WS5's deliberate R1 **widening** to `src/hooks/**` and `src/services/**` (DL-68). Expected.                                                                                                                                                                                                  |
| **Documentation drift**                                                 | **DL-68 and `ws5-implementation-2026-09-03.md` §10 both record "Lint **PASS**". Lint does not pass.** See §2.1.                                                                                                                                                                                                          |
| Roadmap drift                                                           | `MASTER-ROADMAP.md` §WS6 still reads **"PARTIALLY DELIVERED"** and WS6.2 **"PARTIAL — BUNDLE STILL OVER CEILING"**, quoting **293,353 B / 14,593 B / 5.24%**. The bundle is now **292,713 B / 13,953 B / 5.01%** (WS5 reduced it). The §WS6 numbers are **STALE**, though the _status_ is unchanged. Not corrected here. |

### 2.1 The broken baseline (introduced by DL-68, reported not fixed)

```
packages/extension/test/ws5-parity.test.ts
  44:5  error  Assigning innerHTML is forbidden. Render through React (which escapes)
               or build nodes explicitly   no-restricted-syntax
  72:5  error  Assigning innerHTML is forbidden ...
✖ 2 problems (2 errors, 0 warnings)
```

The guard (`eslint.config.mjs:100-107`) is one of the blueprint's security rules — "no remote code, no
string-built code, no unescaped HTML injection". It is **correct**, and `ws5-parity.test.ts` violates
it. The repository already provides the sanctioned alternative, `test/helpers/dom-fixture.ts`'s
`setBody(html)`, which every other happy-dom test uses; the new file did not.

**Why DL-68 claimed otherwise:** the WS5 gate's final `pnpm verify` output was filtered through a grep
that matched `Test Files|Tests |^\[warn\]|Done` — a pattern that does not match eslint's error lines.
The non-zero exit was attributed to the known permanent `ws2-item9-report.md` format exception. That
was an error in the WS5 closure, and this entry corrects it rather than restating it.

DL-68 is not rewritten (append-only; DL-64's "do not rewrite history" rule stands). The correction is
recorded in DL-69.

---

## 3. Baseline (measured this run)

| Measure                      | Value                                                             |
| ---------------------------- | ----------------------------------------------------------------- |
| Tests                        | **1,214 passed / 51 files**                                       |
| Build                        | **PASS**                                                          |
| Typecheck                    | **PASS** (all three projects)                                     |
| Lint                         | **FAIL — 2 errors** (§2.1)                                        |
| Format                       | clean except the permanent, untouched `ws2-item9-report.md`       |
| **Total bundle**             | **292,713 B**                                                     |
| `content-scripts/content.js` | **32,049 B** (WS3 ceiling 61,440 B — inside it)                   |
| `background.js`              | 9,746 B                                                           |
| side-panel chunk             | 7,801 B                                                           |
| devtools-panel chunk         | 1,386 B · devtools loader 268 B                                   |
| shared `tokens` chunk        | 89,251 B · `client` chunk 142,932 B · `browser` 130 B             |
| `assets/tokens.css`          | 4,756 B · HTML pages 3,301 B · manifest 603 B · popup chunk 421 B |
| Locked ceiling               | 278,760 B                                                         |
| **Delta**                    | **13,953 B over — 5.01%**                                         |

---

## 4. Exact WS6.3 Roadmap Definition

**There is none.** Faithfully, what §WS6 of `MASTER-ROADMAP.md` (line 413 ff.) contains is:

> **WS6.1.** `RecommendedLocatorCard` · rationale copy layer · `VerdictBadge` ·
> Primary/Secondary/Educational hierarchy · scoping / `nth` / frame explanations · verdicts replace
> scores · debug mode for raw scores · N/A rows migrated to rationale codes.

> **WS6.2.** Syntax detection · Playwright subset parser (recursive descent, **no eval**) · reuse
> `LocatorResolver` · **visible-vs-total reporting** · typed `ParseError` with caret position ·
> `VerifyLocatorPanel`. … `.filter(...)`/`page.frameLocator(...)` deliberately rejected as
> `UNSUPPORTED_METHOD` (the resolver doesn't read those AST fields — parsing them would fabricate
> verification), `.nth(n)` supported (the resolver does implement it). Status: **PARTIAL — BUNDLE
> STILL OVER CEILING**.

And **WS6.2.1**, which is a _gate_ (DL-58), not a deliverable.

The nine `WS6.3` strings in the repository, in full context:

| File                                                   | What it says                               |
| ------------------------------------------------------ | ------------------------------------------ |
| `ws5-discovery-implementation-gate-2026-09-03.md` ×2   | "WS6.3, WS9 and WS10 were not started"     |
| `ProgressDocument/ws5-implementation-2026-09-03.md` ×1 | "WS6.3, WS9 and WS10 were not started"     |
| `ProgressDocument/CURRENT-STATE.md` ×2                 | same, inside the DL-67/DL-68 Updated lines |
| `ProgressDocument/PROGRESS.md` ×4                      | same, inside the DL-67/DL-68 entries       |
| `ProgressDocument/DECISION-LOG.md` ×2                  | same, inside DL-67 and DL-68               |

**Every one is mine, all dated 2026-09-03, and all negative.** No document anywhere states what WS6.3
_is_. Its current meaning is therefore: **undefined**.

---

## 5. Requirement Matrix

Because no WS6.3 requirement exists, this matrix evaluates the four things a reader could reasonably
mean by the label, plus the two defects discovery actually found.

| WS6.3 requirement                                           | Roadmap wording                                                                                      | Current implementation                                                                                                                                       | Evidence                                                                        | Status                                                                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| _(the label itself)_                                        | **absent**                                                                                           | —                                                                                                                                                            | 9 negative mentions, 0 definitions                                              | **D — STALE**                                                                                                                              |
| WS6.1 card + rationale layer                                | "`RecommendedLocatorCard` · rationale copy layer"                                                    | `src/ui/panel/RecommendedCard.tsx` + `ui/copy/rationale.ts`, shared by both surfaces since WS5                                                               | DL-21/DL-32/DL-33; `recommendation-ui.test.ts`, `recommendation-parity.test.ts` | **B — ALREADY IMPLEMENTED** (under a different name)                                                                                       |
| WS6.1 `VerdictBadge`                                        | named deliverable                                                                                    | No component by that name; the verdict tone renders inline in `RecommendedCard` via `VERDICT_TONE`                                                           | grep: 0 hits for `VerdictBadge`                                                 | **C — SUPERSEDED** (DL-45/DL-48/DL-54 examined and locked the card local; WS5 measured it identical and shared it)                         |
| WS6.1 Primary/Secondary/Educational hierarchy               | named deliverable                                                                                    | **Does not exist**                                                                                                                                           | grep: 0 hits                                                                    | **A — STILL VALID, NOT STARTED**                                                                                                           |
| WS6.1 "debug mode for raw scores"                           | named deliverable                                                                                    | Does not exist — **and the WS6 Exit criterion explicitly requires "no raw score ever leaks to the UI ✅ (no raw score anywhere; **no debug mode exists**)"** | §WS6 Exit, verbatim                                                             | **D — STALE / SELF-CONTRADICTORY.** The Deliverables line asks for it; the Exit line counts its absence as a pass. Recorded, not resolved. |
| WS6.1 N/A rows → rationale codes                            | named deliverable                                                                                    | `ui/copy/na-reason.ts` + `naReasonFor()`, both surfaces                                                                                                      | `panel-truthfulness.test.ts`                                                    | **B — ALREADY IMPLEMENTED**                                                                                                                |
| WS6.1 / F-12 "scoping · `nth` · frame explanations"         | "Ancestor-scoped chain, `.nth()`, `frameLocator()` **built, tested, invisible**" (F-12, owner WS6.1) | Built in the engine; **not surfaced in the UI**                                                                                                              | F-12 row, still open                                                            | **A — STILL VALID, NOT STARTED**                                                                                                           |
| WS6.2 rejected syntax (`filter`, `frameLocator`, `locator`) | "deliberately rejected … parsing them would fabricate verification"                                  | Rejected at parse with `UNSUPPORTED_METHOD` — **verified live this run**                                                                                     | §7                                                                              | **C — SUPERSEDED by an explicit decision.** Not a gap.                                                                                     |
| WS6.2 bundle overage                                        | "PARTIAL — BUNDLE STILL OVER CEILING"                                                                | 13,953 B / 5.01% over                                                                                                                                        | §3                                                                              | **E — DEFERRED** (owner budget policy; WS6.2.1 closed it as irreducible; reopening is forbidden by this gate)                              |
| **V-1 — chained expressions are resolved unscoped**         | _not a roadmap item; found this run_                                                                 | `resolveChain` measures every step against the whole document and reports the terminal step's count                                                          | §6.1, and WS0's own pinned test                                                 | **G — AMBIGUOUS / OWNER DECISION (D2)**                                                                                                    |
| **V-2 — regex `name` option silently dropped**              | _not a roadmap item; found this run_                                                                 | `resolveStep` discards a regex `name` and counts the role unconstrained                                                                                      | §6.2, measured live                                                             | **G — AMBIGUOUS / OWNER DECISION (D3)**                                                                                                    |

---

## 6. Current Architecture (traced, not assumed)

```
VerifySelectorCard  (src/ui/panel/VerifySelectorCard.tsx)
  └── VerifyLocatorPanel (src/ui/VerifyLocatorPanel.tsx)
        └── useVerify.verifyExpression            src/hooks/useVerify.ts
              └── services/verification.ts        verifyLocatorExpression(send, expr, tabId)
                    └── src/browser/runtime.ts    sendRuntimeMessage  → browser.runtime.sendMessage
                          └── entrypoints/background.ts
                                · isFromExtensionUI(sender)  — rejects sender.tab
                                · dispatchToTab(message.targetTabId, message)
                                · normalizeAck  (absent response ≠ success)
                                · injection fallback + 300 ms retry
                                      └── entrypoints/content.ts  'VERIFY_LOCATOR_EXPRESSION'
                                            · new LiveDomProbe(document)        ← the ONE probe
                                            · verifyLocatorExpression(expr, probe)
                                                  └── parseLocatorExpression()   ← the ONE parser
                                                        → LocatorChain            ← the ONE AST
                                                  └── resolveChain(chain, probe)  ← the ONE resolver
                                                        └── resolveStep() per step
                                                  └── classifyVerification()      ← six states
                                            · ack.verification → back up the same seam
```

Answers to the seventeen architecture questions:

1. **One resolver** — `packages/locator-engine/src/resolver.ts`. Callers: `verifier.ts:116`,
   `fact-model.ts:80`, `capture.ts:56/78/119`, `fact-model.ts:215`, plus tests. No second resolver.
2. **One DomProbe** — the `DomProbe` port; the only implementation is
   `src/runtime/probe.ts::LiveDomProbe` (plus `FakeDomProbe`/`FixtureDomProbe` in tests).
3. **One AST** — `LocatorChain` / `LocatorStep` in `types.ts`. No second AST.
4. **One parser** — `parseLocatorExpression`. No second parser.
5. **Verification uses the same resolver as capture** — yes: `capture.ts` calls `resolveStep`,
   `verifier.ts` calls `resolveChain`, which calls `resolveStep`.
6. **Same page state** — yes: `content.ts` builds a fresh `LiveDomProbe(document)` per request, in the
   same content script, `all_frames: true`.
7. **Unsupported constructs rejected honestly** — yes (measured, §7).
8. **Ambiguous classified correctly** — yes; `classifyVerification` never collapses >1 to verified
   (`verifier.test.ts`).
9. **Invalid ≠ not-found** — yes; a parse failure returns `status:'invalid'` with the `ParseError`,
   without ever attempting a resolve.
10. **Detached / unverifiable distinguished** — yes; negative `visibleMatchCount` is always
    `unverifiable`, and probe errors map through `statusForProbeError`.
11. **Frame constructs rejected, not fabricated** — yes, at parse (`frameLocator` →
    `UNSUPPORTED_METHOD@5`).
12. **`.nth()` bounded and honest** — yes; out of range → `visibleMatchCount: 0`, verdict `no-match`.
13. **`.filter()` unsupported** — yes.
14. **String-only path bypassing the AST?** — **No.** `VERIFY_SELECTOR` calls `probe.countCss` /
    `countXPath` directly, but that is the _raw CSS/XPath_ feature (WS7), a different product surface
    with its own classification. It never claims to verify a Playwright expression.
15. **Duplicate locator parsing?** No.
16. **Duplicate locator matching?** No.
17. **Duplicate visibility predicate?** No — `isElementVisible` is the single rule (WS7 removed the
    third one).

### 6.1 FINDING V-1 — chained expressions are resolved UNSCOPED

`resolver.ts:209-246`. `resolveChain` iterates the steps and calls `resolveStep(step, probe)` —
**with no `opts`**, therefore with no scope. Each step is measured independently against the whole
document, and the chain's result is the **terminal step's** document-wide count.

The parser does produce multi-step chains — measured live this run:

```
"page.getByRole('list').getByText('Save')"   →  OK steps=2
```

So `page.getByRole('list').getByText('Save')` is reported as the count of `getByText('Save')`
**anywhere on the page**. If "Save" appears once inside the list and twice outside, the panel says
_ambiguous, 3 matches_ where Playwright resolves 1. If it appears once outside the list and never
inside, the panel says **verified, 1 match** where Playwright resolves **0** — a false green.

**This is known, and it is pinned.** `packages/locator-engine/test/contracts.test.ts:170-183` asserts
the current behaviour and says so in its own comment:

> "Each step is measured independently against the whole document, so the sequence is NOT a narrowing
> curve … **Scoped resolution arrives in WS3.**"
> "…the chain result is the terminal step's own count, which for a multi-step chain may exceed the true
> scoped count. **Asserted explicitly so this limitation cannot be forgotten or silently 'fixed' by a
> later change that does not actually implement scoping.**"

**WS3 delivered the capability but never wired it here.** `ProbeOpts.scope` and `ScopeHandle` exist
(`probe.ts:100-110`), every `DomProbe` method accepts `opts`, and `capture.ts:78` already uses
`resolveStep(step, probe, { scope: scopeHandle })` for ancestor-scoped candidates. `resolveChain` is
the one place that does not.

WS6.2 then built expression verification on top of `resolveChain` — inheriting the gap for every
chained expression a user types. WS6.2's own doc says accepting syntax the resolver cannot verify
"would fabricate verification"; that test was applied at the **method** level, not to chaining.

**Not fixed here.** See D2.

### 6.2 FINDING V-2 — a regex `name` option is silently dropped

`resolver.ts:146-149`:

```ts
case 'role': {
  const name = step.options?.name;
  const nameValue = name && name.type === 'string' ? name.value : undefined;
  return fromProbeCount(probe.countByRole(value, nameValue, opts), 'role');
}
```

When `name` is a **regex**, `nameValue` becomes `undefined` and the probe is asked for the role with
**no name filter at all**. Measured live this run, against an instrumented probe:

```
page.getByRole('button', { name: 'Save' })   probe=[role:button:name=Save]        visible=7  ambiguous
page.getByRole('button', { name: /Sav/ })    probe=[role:button:name=undefined]   visible=7  ambiguous
```

Both expressions produce the identical probe call and the identical verdict, although the second one
constrains the result. On a page with seven buttons and one matching `/Sav/`, the panel reports
**"ambiguous — 7 matches"** for a locator Playwright resolves to **1**.

The resolver _does_ guard the regex case for the selector value (`resolver.ts:138-141` returns
`UNSUPPORTED_STEP` for a regex matcher on a non-role kind) and the parser rejects a regex _role_
(`getByRole(/butto/)` → `INVALID_ARGUMENT`, measured). **Only the regex `name` option slips through.**

**It is undocumented and untested.** No comment in `resolver.ts` or `verifier.ts` mentions it, no
roadmap line mentions it, and `parser.test.ts`/`verifier.test.ts` contain no case for it — while
§WS6.2's contract advertises `name` and regex literals as supported.

Severity note, stated precisely: V-1 can produce a **false green**; V-2 as measured produces a **false
ambiguous / false count**. Neither is a crash, and both are silent.

**Not fixed here.** See D3.

### 6.3 Minor observations (recorded, not fixed, not owner decisions)

- **`FRAME_UNSUPPORTED` is declared but never raised.** It is a member of `ResolveErrorCode`
  (`resolver.ts:39`) and named in a `verifier.ts:98` comment; no code path produces it. Dead union
  member — harmless, but it makes the union describe a capability that does not exist.
- **`chain.frameSelector` is ignored by `resolveChain`.** This is **correct, not a defect**: the
  content script runs inside the frame (`all_frames: true`), so `document` already _is_ the frame's
  document; `frameSelector` is a code-generation concern for the consumer.
- **`.nth(1.5)` reports `UNTERMINATED_CALL`**, not `INVALID_ARGUMENT`. The expression is rejected —
  correct outcome — but the code is misleading copy. Cosmetic.
- **One dynamic `import()` exists** — `entrypoints/sidepanel/main.tsx:20`, the dev-only `?showcase=1`
  route (WS2 item 5). Not a WS6 concern; noted so §13's "no dynamic import" claim stays honest.

---

## 7. Existing Implementation Coverage

| Area                                                                                      | Status                                                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Parser (7 factories, options, strings, regex literals, escapes, chaining, trailing `nth`) | **ALREADY DONE**                                                                |
| Rejection of `filter` / `frameLocator` / `locator`                                        | **ALREADY DONE** — measured                                                     |
| Six-state classification                                                                  | **ALREADY DONE**                                                                |
| `VerifyLocatorPanel`, shared across both surfaces                                         | **ALREADY DONE** (WS5 unified it)                                               |
| Message seam, sender validation, injection fallback, `normalizeAck`                       | **ALREADY DONE**                                                                |
| Security: no `eval` / `new Function` in the parser                                        | **ALREADY DONE**, guarded                                                       |
| Recommendation card + rationale copy + N/A codes                                          | **ALREADY DONE**                                                                |
| Chained-expression scoping                                                                | **PARTIAL / MISSING** — capability exists, `resolveChain` does not use it (V-1) |
| Regex `name` option                                                                       | **MISSING / SILENTLY WRONG** (V-2)                                              |
| WS6.1 Primary/Secondary/Educational hierarchy                                             | **MISSING**                                                                     |
| WS6.1 F-12 "surface scoping / nth / frame explanations"                                   | **MISSING**                                                                     |
| WS6.1 `VerdictBadge` as a component                                                       | **SUPERSEDED** (DL-45/48/54)                                                    |
| WS6.1 "debug mode for raw scores"                                                         | **STALE — contradicted by WS6's own Exit criterion**                            |
| Bundle overage                                                                            | **DEFERRED** (owner policy)                                                     |
| Real-browser evidence                                                                     | **BLOCKED / absent** — none exists                                              |
| Baseline lint                                                                             | **RED** (§2.1)                                                                  |

---

## 8. Failure-First Analysis

Behaviour measured live this run except where marked _(read)_.

| #     | Case                                      | Current behaviour                                                                                                                                                                                                                                                     | Honest?                                                         |
| ----- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1     | empty expression                          | `EMPTY_EXPRESSION@0` → `invalid`                                                                                                                                                                                                                                      | ✅                                                              |
| 2     | malformed syntax                          | typed `ParseError` with caret position → `invalid`                                                                                                                                                                                                                    | ✅                                                              |
| 3     | unterminated string                       | `UNTERMINATED_STRING@15`                                                                                                                                                                                                                                              | ✅                                                              |
| 4     | invalid option value                      | `INVALID_ARGUMENT`                                                                                                                                                                                                                                                    | ✅                                                              |
| 5     | unknown option                            | `UNKNOWN_OPTION@27`                                                                                                                                                                                                                                                   | ✅                                                              |
| 6     | unsupported method                        | `UNSUPPORTED_METHOD` → `unsupported`, never `not-found`                                                                                                                                                                                                               | ✅                                                              |
| 7     | `page.frameLocator(...)`                  | `UNSUPPORTED_METHOD@5`                                                                                                                                                                                                                                                | ✅                                                              |
| 8     | `.filter({...})`                          | `UNSUPPORTED_METHOD@25`                                                                                                                                                                                                                                               | ✅                                                              |
| 9     | invalid regex `/a(/`                      | **parses**; then `UNSUPPORTED_STEP` → `unsupported` on non-role kinds                                                                                                                                                                                                 | ⚠️ imprecise (reported "unsupported", not "invalid") — cosmetic |
| 10    | zero matches                              | `not-found`                                                                                                                                                                                                                                                           | ✅                                                              |
| 11    | one match                                 | `verified`                                                                                                                                                                                                                                                            | ✅                                                              |
| 12    | multiple matches                          | `ambiguous`, never narrowed                                                                                                                                                                                                                                           | ✅                                                              |
| 13    | detached element                          | negative count → `unverifiable` _(read)_                                                                                                                                                                                                                              | ✅                                                              |
| 14–15 | DOM mutation / stale element              | fresh probe per request; the result is a point-in-time answer and is **not** re-validated                                                                                                                                                                             | ⚠️ see #33                                                      |
| 16    | hidden element                            | visible-vs-total both reported                                                                                                                                                                                                                                        | ✅                                                              |
| 17–18 | iframe / cross-frame                      | content script runs in every frame; `frameLocator` syntax rejected                                                                                                                                                                                                    | ✅                                                              |
| 19    | `nth` out of range                        | `nth(999999)` parses; resolve → `visible=0`, `no-match`                                                                                                                                                                                                               | ✅                                                              |
| 20    | negative `nth`                            | `INVALID_ARGUMENT@29`                                                                                                                                                                                                                                                 | ✅                                                              |
| 21    | large `nth`                               | as #19                                                                                                                                                                                                                                                                | ✅                                                              |
| 22    | **chained locator**                       | **terminal step measured document-wide**                                                                                                                                                                                                                              | ❌ **V-1**                                                      |
| 23    | **ambiguous chained locator**             | same — count can be higher _or lower_ than the true scoped count                                                                                                                                                                                                      | ❌ **V-1**                                                      |
| 24    | resolver error                            | typed `ResolveError` → `unsupported` / `unverifiable`                                                                                                                                                                                                                 | ✅                                                              |
| 25    | probe unavailable                         | `PROBE_ERROR` → `unverifiable`                                                                                                                                                                                                                                        | ✅                                                              |
| 26    | malformed message                         | `KNOWN_MESSAGE_TYPES` gate → ignored _(read)_                                                                                                                                                                                                                         | ✅                                                              |
| 27    | wrong sender                              | `isFromExtensionUI` rejects any `sender.tab` → `UNTRUSTED_SENDER`                                                                                                                                                                                                     | ✅                                                              |
| 28    | missing tab                               | `NO_ACTIVE_TAB` matrix state (WS8)                                                                                                                                                                                                                                    | ✅                                                              |
| 29–30 | missing / failed content-script injection | `executeScript` fallback + 300 ms retry, then a specific message; `chrome://` explained                                                                                                                                                                               | ✅                                                              |
| 31    | storage failure                           | **not applicable** — verification persists nothing (§11)                                                                                                                                                                                                              | ✅                                                              |
| 32    | UI rendering failure                      | `ErrorBoundary` on both roots                                                                                                                                                                                                                                         | ✅                                                              |
| 33    | result becoming stale                     | **No staleness model exists.** A verification result stays on screen until the user edits the input; a DOM change does not invalidate it. Not a defect _per se_ — but the panel does not distinguish "verified just now" from "verified before you changed the page". | ⚠️ **UNSPECIFIED** — candidate scope, see D4                    |
| —     | **regex `name` option**                   | **constraint silently dropped**                                                                                                                                                                                                                                       | ❌ **V-2**                                                      |

---

## 9. Test Strategy

**Existing coverage** (locator-engine: 239 `it()` across 12 files; extension: 51 files / 1,214 total):
`parser.test.ts` 42 · `accessibility.test.ts` 32 · `contracts.test.ts` 25 (resolver) ·
`recommendation.test.ts` 24 · `fixture-dom-probe.test.ts` 22 · `engine.test.ts` 20 ·
`ranking.test.ts` 17 · `scorer.test.ts` 16 · `conformance.test.ts` 13 · `matching.test.ts` 12 ·
**`verifier.test.ts` 12** · `r4-structural-guard.test.ts` 4. Extension side adds
`verify-locator-panel.test.ts` (18), `verify-selector-status.test.ts` (14), `privacy.test.ts` (11),
`honesty.test.ts` (18) and the WS5 composition guards.

**Missing coverage — the gaps that let V-1 and V-2 exist:**

- No test resolves a **multi-step chain against a probe that would answer differently when scoped**.
  `contracts.test.ts` pins the _unscoped_ behaviour deliberately, so the suite is currently green
  _because of_ the defect, not in spite of it.
- **No test anywhere passes a regex `name` option through `resolveStep`.** `parser.test.ts` proves the
  regex is _parsed_; nothing proves it is _honoured_.
- No test asserts that a `LocatorStep` option the resolver cannot honour is reported as
  `unsupported` rather than silently ignored — the general rule behind both defects.

**Proposed failure-first tests** (to be written _before_ any fix, and to fail for the right reason):

| ID  | Test                                                                                                                                                                  | Proves                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| T1  | A probe returning 1 for a scoped query and 5 unscoped; `getByRole('list').getByText('X')` must not report 5                                                           | V-1 cannot pass                   |
| T2  | A chain whose terminal step matches 1 document-wide but 0 within scope must NOT be `verified`                                                                         | the false-green case specifically |
| T3  | `resolveStep` with `{ name: regex }` must not call the probe with `name=undefined`                                                                                    | V-2 cannot pass                   |
| T4  | Any option the resolver cannot honour must yield `UNSUPPORTED_STEP`, never a silently weaker query                                                                    | the general rule                  |
| T5  | `contracts.test.ts:170`'s pinned unscoped assertion must be **replaced, not deleted**, with a scoped assertion carrying the same "cannot be silently changed" comment | the WS0 guard's intent survives   |
| T6  | Structural: every `resolveStep` call site inside `resolveChain` passes a scope                                                                                        | no regression back to unscoped    |

**Guards that must not be weakened:** `r4-structural-guard`, `honesty`, `privacy`,
`recommendation-parity`, `verify-selector-status`, and WS5's composition guards. None needs to change
for either defect.

---

## 10. Real-Browser Evidence

| Level                        | What exists                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Proven in a real browser** | **NOTHING.** No `@playwright/test`, no Puppeteer, no Selenium, no WebdriverIO, no Chromium launcher, no extension-loading fixture, no DevTools automation, no E2E script. Verified against `package.json` ×4 and every script name.                                                                                                                |
| **Structurally proven**      | One resolver / one AST / one probe / one parser; rejection of unsupported methods; message seam and sender validation; `src/ui` free of browser APIs                                                                                                                                                                                               |
| **Unit proven**              | Parser (42), resolver contracts (25), verifier classification (12), matching, ranking, scoring, accessibility, codegen goldens (127)                                                                                                                                                                                                               |
| **happy-dom proven**         | Capture, DOM read, fact model, picker, probe, Tabs, showcase, and WS5's render/parity suites — **happy-dom is not Chromium**                                                                                                                                                                                                                       |
| **UNPROVEN**                 | Every real-Chrome behaviour: DevTools panel lifecycle, real `storage.onChanged`, real quota, real multi-tab, real iframe/cross-origin resolution, real visibility/layout, real accessibility tree, and **whether V-1/V-2 manifest as described in an actual page** — they are proven from the code and from an instrumented probe, not from Chrome |

---

## 11. Bundle Risk (no optimisation performed)

Nothing here is implemented, so the figures are _expected impact_ only.

| Candidate scope                  | Expected reach                                                                                                                                                                                                                                                               | Risk                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **V-1 scoped chaining**          | Touches `resolver.ts` only — already 100% reachable from `content.js` via `capture.ts` (DL-58 proved `resolveStep` was bundled before WS6.2). Threading `opts` through `resolveChain` adds **statements, not modules**.                                                      | **LOW** — tens of bytes in `content.js`; no new module becomes reachable                                                        |
| **V-2 regex `name`**             | Needs a `DomProbe` capability the port does not have (regex accessible-name matching), or an honest `UNSUPPORTED_STEP`. The **refusal** costs ~nothing. **Implementing** regex matching would add a matcher to `probe.ts` and `LiveDomProbe` — both already in `content.js`. | **LOW–MEDIUM** — refusal ≈ 0 B; implementation is a real (small) addition to the content hot path                               |
| WS6.1 hierarchy / F-12 surfacing | UI only — lands in the **shared** `tokens` chunk (89,251 B), not `content.js`                                                                                                                                                                                                | **LOW** for content; grows the shared chunk                                                                                     |
| Staleness model (D4)             | Would add state to the panel and possibly a `MutationObserver` in the content script                                                                                                                                                                                         | **MEDIUM** — a page-lifetime observer on the content hot path is the one candidate here that could move `content.js` materially |

`content.js` is 32,049 B against WS3's 61,440 B ceiling — **inside it**, with headroom. The
whole-extension overage (13,953 B / 5.01%) is the standing owner budget question and is **not** in
scope.

---

## 12. Dependency Matrix

| WS      | Status vs WS6.3                                                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WS0     | **READY** — ports, AST, guards all in place. Note: WS0's own pinned test is what documents V-1.                                                                             |
| WS1     | **READY** — fixture harness and goldens available                                                                                                                           |
| WS2     | **READY** — token/primitive system stable                                                                                                                                   |
| WS3     | **PARTIAL — and directly implicated.** WS3 delivered `ScopeHandle`/`ProbeOpts.scope`; `resolveChain` never adopted it. V-1 is WS3-shaped debt surfacing in WS6.2's feature. |
| WS4     | **NOT NEEDED** — verification persists nothing                                                                                                                              |
| WS5     | **READY** — shared UI, one seam, composition guards. Its `ws5-parity.test.ts` is the current lint failure.                                                                  |
| WS6.1   | **PARTIAL** — card/rationale/N-A done; hierarchy and F-12 surfacing not started; "debug mode" stale                                                                         |
| WS6.2   | **READY** — functionally complete; V-1/V-2 are gaps _inside_ its accepted scope                                                                                             |
| WS6.2.1 | **CLOSED / NOT NEEDED** — must not be reopened                                                                                                                              |
| WS7     | **READY** — raw CSS/XPath truth is separate and unaffected                                                                                                                  |
| WS8     | **READY** — the error matrix already has the states any new outcome would need                                                                                              |
| WS9     | **NOT STARTED, NOT NEEDED.** Neither candidate touches recording. `RECORDING_ENABLED` remains `false`.                                                                      |
| WS10    | **NOT STARTED, NOT NEEDED**                                                                                                                                                 |

Neither V-1 nor V-2 turns into recording, assertions, framework awareness, export redesign,
selector-engine redesign, or browser infrastructure.

---

## 13. Owner Decisions

### OWNER DECISION D1 — the red baseline

**Question.** `pnpm lint` currently fails (2 errors, §2.1), introduced by DL-68, whose report claims
"lint PASS". How is this handled?

**Current evidence.** `ws5-parity.test.ts:44,72` assign `document.body.innerHTML`; the guard is a
blueprint security rule; `test/helpers/dom-fixture.ts::setBody` is the sanctioned alternative already
used by every other happy-dom test. Build, typecheck and 1,214 tests pass.

**Option A — fix it first, as a one-line-per-site correction under its own micro-gate.**
_Advantages:_ restores a green baseline before any new work; the change is mechanical (swap two
assignments for the existing helper); the guard stays untouched.
_Risks:_ none material; it is a test-only change.

**Option B — fold it into whatever WS6.3 becomes.**
_Advantages:_ one gate instead of two.
_Risks:_ WS6.3 has no definition yet, so the fix could sit red indefinitely; and every subsequent gate
inherits a baseline where "lint PASS" cannot be claimed.

**Recommended: A.** A gate should not begin on a red baseline, and a false "PASS" in a closure report
is the kind of thing this project's whole method exists to prevent. **This gate did not fix it**
because fixing was explicitly forbidden here.

**What changes:** whether the next gate can state a green baseline.

---

### OWNER DECISION D2 — V-1, unscoped chained verification

**Question.** `resolveChain` measures every step against the whole document and reports the terminal
step's count, so a chained expression can be reported _verified_ when Playwright would find zero.
What should happen?

**Current evidence.** §6.1. The capability to fix it exists (`ProbeOpts.scope`, used by `capture.ts`).
WS0's `contracts.test.ts:170` pins the current behaviour and names WS3 as its owner — WS3 closed
without wiring it.

**Option A — implement scoped chain resolution.** Thread a scope handle from each resolved step into
the next, exactly as `capture.ts` already does for ancestor scoping.
_Advantages:_ removes a false-green; makes the parser's advertised chaining support real; small,
contained, in the one resolver; low bundle risk.
_Risks:_ requires a probe capability to turn "the elements matched by step N" into a `ScopeHandle` for
step N+1 — `scopeOf()` exists but resolves an _existing_ handle; a **new** probe method may be needed,
which is a `DomProbe` port change (WS0 contract). Replaces a deliberately pinned WS0 test (T5).

**Option B — reject multi-step chains as `unsupported`.** Keep one honest answer: the parser accepts
the syntax, the verifier refuses to grade it.
_Advantages:_ zero fabrication, tiny change, no port change, no bundle movement; consistent with how
`filter`/`frameLocator` are already handled.
_Risks:_ removes a currently-advertised WS6.2 capability; users pasting real chained Playwright code
get "unsupported" where they previously got a (sometimes wrong) number. A visible product regression
in exchange for honesty.

**Option C — report chained results as `unverifiable` with the per-step counts disclosed.**
_Advantages:_ keeps the information, drops the claim.
_Risks:_ a third presentation state to explain; arguably the worst of both.

**Recommended: A, with B as the fallback if the probe change proves larger than it looks.**
_Reason:_ the project's rule is "unsupported means unsupported" — but chaining is _already advertised
and already parsed_, and the capability to do it correctly already exists and is already used
elsewhere in the same file's neighbourhood. Refusing it (B) is honest but pays a product cost to avoid
work that WS3 was supposed to have done. **A owner-visible sequencing note:** if A is chosen and the
probe change turns out to be non-trivial, the correct move is to stop and re-gate, not to ship a
partial scoping.

**What changes:** whether `resolveChain` gains a scope parameter and whether `DomProbe` gains a
method; whether `contracts.test.ts:170` is replaced or kept.

---

### OWNER DECISION D3 — V-2, the dropped regex `name`

**Question.** `getByRole('button', { name: /Sav/ })` is verified as if the name constraint were
absent. What should happen?

**Current evidence.** §6.2, measured against an instrumented probe. Undocumented, untested, and
contradicted by WS6.2's own "regex literals supported" contract.

**Option A — refuse it honestly.** Return `UNSUPPORTED_STEP` when any option carries a matcher the
resolver cannot evaluate, exactly as `resolver.ts:138` already does for regex selector values.
_Advantages:_ one line of the same shape as the existing guard; zero bundle cost; removes the
fabrication immediately; consistent with `filter`/`frameLocator`.
_Risks:_ a regex name is a common Playwright idiom; users lose a verification they _appeared_ to have
(though what they had was wrong).

**Option B — implement regex accessible-name matching in the probe.**
_Advantages:_ the verification the user actually asked for.
_Risks:_ a new `DomProbe` capability on the content hot path; regex execution against
accessible names is a new evaluation surface; the accessible-name computation is already the most
expensive part of the probe. Bundle and performance both move.

**Recommended: A now, B only as separately-scoped future work.**
_Reason:_ A converts a silent wrong answer into an honest refusal at essentially zero cost and zero
risk, which is precisely the WS6.2 doctrine already applied to `filter`. B is a real feature, and
features go through their own gate.

**What changes:** one branch in `resolveStep`; the parser's advertised-capability wording in §WS6.2;
whether a probe capability is added.

---

### OWNER DECISION D4 — what "WS6.3" is to mean (the scope question)

**Question.** `WS6.3` has no definition. What does the label denote from now on?

**Current evidence.** §4. Nine negative mentions, zero specifications. Candidate contents identified
by this gate: **(i)** V-1 + V-2 (verification honesty); **(ii)** WS6.1's genuinely-unstarted items —
the Primary/Secondary/Educational hierarchy and F-12's "surface scoping / nth / frame explanations";
**(iii)** a verification staleness model (§8 #33), currently unspecified anywhere; **(iv)** nothing —
retire the label.

**Option A — WS6.3 := verification-honesty repair (V-1 + V-2).**
_Advantages:_ both defects are real, measured, small, contained in the one resolver, and squarely in
WS6's subject; closes a false-green; no new product surface.
_Risks:_ leaves WS6.1's unstarted items unaddressed under a WS6 heading that will then read
"complete-ish" again.

**Option B — WS6.3 := WS6.1 completion (hierarchy + F-12 surfacing).**
_Advantages:_ discharges named roadmap deliverables and F-12's standing "built, tested, invisible"
opportunity.
_Risks:_ it is UI work in a workstream just closed for UI churn (WS5), and it leaves two live
fabrication defects in place — the opposite of this project's stated priorities.

**Option C — retire the label; file V-1/V-2 as a WS6.2 defect gate and the rest as WS6.1 debt.**
_Advantages:_ the documents stop carrying a phantom identifier; each item lands under a heading that
actually defines it.
_Risks:_ requires touching MASTER-ROADMAP §WS6 status wording (currently stale anyway, §2).

**Recommended: C, with the V-1/V-2 gate authorised first.**
_Reason:_ inventing a definition for a label that entered the documents by accident would repeat the
`§20.6` mistake rather than learn from it. The work is real; the number is not. Filing the defects
against WS6.2 — where they live — and the UI items against WS6.1 — where the roadmap already puts
them — keeps every requirement attached to a document that defines it.

**What changes:** the roadmap's §WS6 wording, the identifier used by the next gate, and which of
V-1/V-2/WS6.1 is authorised first.

---

### Not raised as decisions

The `.nth(1.5)` error code, the dead `FRAME_UNSUPPORTED` union member, the invalid-regex-reported-as-
unsupported nuance, and §WS6's stale bundle numbers are all recorded in §6.3 / §2 and are **cosmetic
or documentation-only**. They do not materially affect architecture, scope, safety or testing, so no
owner decision is manufactured for them.

---

## 14. Recommended Implementation Plan

**This is not authorisation.** Written for the recommended path (D1 → D2-A → D3-A).

| Stage                          | Content                                                                                                                                          | Files                                                                             | Tests      | Risk                                                                   | Rollback                                 | Acceptance                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| **A — prerequisite**           | Restore the green baseline (D1)                                                                                                                  | `test/ws5-parity.test.ts`                                                         | none new   | none                                                                   | revert the file                          | `pnpm lint` exits 0                              |
| **B — failure-first**          | Write T1–T4, T6; confirm each fails for the intended reason                                                                                      | `packages/locator-engine/test/resolver-scoping.test.ts` (new), `verifier.test.ts` | T1–T4, T6  | none                                                                   | delete the new file                      | every new test RED, for the right reason         |
| **C — V-2 refusal**            | `resolveStep` returns `UNSUPPORTED_STEP` for an unhonourable option                                                                              | `src/resolver.ts`                                                                 | T3, T4     | LOW                                                                    | one branch                               | T3/T4 green; `unsupported`, never a weaker query |
| **D — V-1 scoping**            | Thread scope through `resolveChain`; add the probe capability only if genuinely required                                                         | `src/resolver.ts`, possibly `src/probe.ts` + `runtime/probe.ts`                   | T1, T2, T6 | **MEDIUM — the port change is the risk; stop and re-gate if it grows** | revert resolver; port change is additive | T1/T2 green; chained counts are scoped           |
| **E — pinned-test transition** | Replace `contracts.test.ts:170`'s unscoped assertion with the scoped one, keeping its "cannot be silently changed" comment                       | `test/contracts.test.ts`                                                          | T5         | LOW — **must be replaced, never deleted**                              | revert                                   | the WS0 guard still guards, at the new truth     |
| **F — runtime integration**    | **None required.** `content.ts` already calls `verifyLocatorExpression`; no message, storage or UI change. Stated explicitly so no one adds one. | —                                                                                 | —          | —                                                                      | —                                        | no new seam exists                               |
| **G — security / privacy**     | Re-run `privacy.test.ts` + the parser security guard; confirm no `eval`/`new Function`/dynamic import and no new page-derived retention          | —                                                                                 | existing   | LOW                                                                    | —                                        | 11/11 privacy, guards green                      |
| **H — bundle + docs**          | Measure; record DL-70 + a report; update §WS6 wording per D4                                                                                     | `ProgressDocument/*`                                                              | —          | none                                                                   | —                                        | delta disclosed, numbers corrected               |

**Stage F is explicitly unnecessary** — both fixes live entirely inside the resolver, behind an
interface both surfaces already consume.

---

## 15. Acceptance Criteria

| ID     | Requirement                                                                                                            | Evidence                 | Current                        | Implementation needed | Test     | Browser evidence required?          | Risk               |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------ | --------------------- | -------- | ----------------------------------- | ------------------ |
| **E1** | `pnpm lint` exits 0                                                                                                    | command exit code        | **FAIL**                       | D1                    | —        | No                                  | none               |
| **E2** | A chained expression is never reported `verified` when its terminal step matches only outside the earlier steps' scope | unit, instrumented probe | **FAILS** (V-1)                | D2                    | T1, T2   | **No** — provable from the resolver | MEDIUM             |
| **E3** | Every `resolveStep` call inside `resolveChain` carries a scope                                                         | structural               | absent                         | D2                    | T6       | No                                  | LOW                |
| **E4** | An option the resolver cannot honour yields `UNSUPPORTED_STEP`, never a silently weaker probe query                    | unit                     | **FAILS** (V-2)                | D3                    | T3, T4   | No                                  | LOW                |
| **E5** | WS0's pinned chain-resolution guard still guards, at whichever truth is chosen                                         | test review              | pinned at the old truth        | D2                    | T5       | No                                  | LOW                |
| **E6** | No new `eval` / `new Function` / dynamic import; privacy 11/11                                                         | existing guards          | green                          | none                  | existing | No                                  | none               |
| **E7** | `content.js` stays inside WS3's 61,440 B ceiling; whole-bundle delta disclosed                                         | measurement              | 32,049 B                       | none                  | —        | No                                  | LOW                |
| **E8** | §WS6 roadmap wording matches measured reality (status + bundle numbers)                                                | doc review               | **stale**                      | D4                    | —        | No                                  | none               |
| **E9** | Real-Chrome behaviour of V-1/V-2                                                                                       | —                        | **UNPROVEN and not claimable** | —                     | —        | **Yes — unavailable**               | stated, not chased |

---

## 16. Regression Matrix

| Area              | Current behaviour                                                                       | WS6.3 risk                                    | Existing test                        | New test needed     | Browser evidence |
| ----------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------ | ------------------- | ---------------- |
| Resolver          | one resolver; `resolveChain` unscoped                                                   | **HIGH** — the change lands here              | `contracts.test.ts` (25)             | T1, T2, T5, T6      | No               |
| Parser            | 7 factories, options, regex, chaining, `nth`; rejects `filter`/`frameLocator`/`locator` | **LOW** — no parser change proposed           | `parser.test.ts` (42)                | none                | No               |
| Verifier          | six states; never collapses                                                             | **LOW** — inherits resolver truth             | `verifier.test.ts` (12)              | T3 assertions       | No               |
| Capture           | `resolveStep` + already-scoped ancestor path                                            | **MEDIUM** — shares the resolver              | `runtime-capture.test.ts`            | regression only     | happy-dom only   |
| Pick              | `capturePick`, one builder                                                              | LOW                                           | `ws5-parity.test.ts`                 | none                | happy-dom only   |
| DomProbe          | one live impl; `scope`/`visibleOnly` opts                                               | **MEDIUM** — a port addition is the main risk | `fixture-dom-probe.test.ts` (22)     | if the port changes | No               |
| CSS               | `VERIFY_SELECTOR` via `countCss`                                                        | none                                          | `verify-selector-status.test.ts`     | none                | No               |
| XPath             | via `countXPath`                                                                        | none                                          | same                                 | none                | No               |
| Frames            | rejected at parse; `FRAME_UNSUPPORTED` never raised                                     | LOW                                           | `devtools-architecture`              | none                | **unproven**     |
| `nth`             | bounded; out-of-range → `no-match`                                                      | LOW                                           | `contracts`, `verifier`              | keep                | No               |
| UI                | shared `VerifyLocatorPanel`; WS8 matrix has the states                                  | **LOW — no UI change proposed**               | `verify-locator-panel.test.ts` (18)  | none                | happy-dom only   |
| Runtime messaging | one seam, `normalizeAck`, sender validation                                             | **none — no contract change**                 | `preview-gate`, `storage-consumers`  | none                | No               |
| Storage           | **not used by verification**                                                            | none                                          | —                                    | none                | No               |
| Security          | no `eval`/`new Function`; parser guard                                                  | LOW                                           | `privacy.test.ts` (11), parser guard | none                | No               |
| Privacy           | no raw page content retained by verification                                            | LOW                                           | `privacy.test.ts`                    | none                | No               |
| Bundle            | 292,713 B; content 32,049 B                                                             | LOW–MEDIUM                                    | `budgets.test.ts` (5)                | none                | No               |

---

## 17. Rollback Plan

No commit is created (no git repository exists). The safest boundary:

- **Pre-change marker:** the current `ProgressDocument/DECISION-LOG.md` mtime, as every gate since
  DL-64 has used. Anything newer under `packages/` is that gate's work.
- **Backup:** `ws6-3-discovery-gate-2026-09-03.zip` (this gate) is the restore point for the
  documentation; the last implementation backup is `ws5-implementation-2026-09-03.zip` (109 files),
  which contains the full pre-WS6.3 source and test state.
- **Likely to change:** `packages/locator-engine/src/resolver.ts` (certain), `src/probe.ts` +
  `packages/extension/src/runtime/probe.ts` (only if D2-A needs a port method),
  `packages/extension/test/ws5-parity.test.ts` (D1).
- **Tests likely to change:** `contracts.test.ts` (one assertion replaced, not deleted),
  `verifier.test.ts` (additions), one new resolver-scoping file.
- **Build artifacts:** `.output/chrome-mv3` is regenerated by `pnpm build`; no manual restore needed.
- **Expected bundle movement:** tens of bytes in `content.js` for D2/D3 refusal; a probe method would
  add more. Ceiling unchanged.
- **To restore:** re-extract the WS5 backup over `packages/`, rebuild, and re-run `pnpm verify`. The
  documentation rolls back by restoring the four `ProgressDocument` files from the same archive.

---

## 18. Files Likely to Change

**Existing files likely to modify**

- `packages/locator-engine/src/resolver.ts` — D2 and D3 both land here
- `packages/locator-engine/src/probe.ts` + `packages/extension/src/runtime/probe.ts` — **only if** D2-A
  requires a new scope-producing method
- `packages/extension/test/ws5-parity.test.ts` — D1
- `ProgressDocument/MASTER-ROADMAP.md` — §WS6 status + stale bundle numbers (D4)

**New files likely to add**

- `packages/locator-engine/test/resolver-scoping.test.ts`
- `ProgressDocument/ws6-x-implementation-2026-XX-XX.md`

**Tests likely to add / change**

- add: T1, T2, T3, T4, T6 · change: `contracts.test.ts` (T5, replace-not-delete),
  `verifier.test.ts` (additions)

**Documentation likely to change**

- `DECISION-LOG.md` (DL-70), `MASTER-ROADMAP.md`, `CURRENT-STATE.md`, `PROGRESS.md`

**None of these was touched in this run.**

---

## 19. Scope Protection

Confirmed for this gate:

- **WS9 not started** — `RECORDING_ENABLED` is still `false`; no recording code was read into scope
- **WS10 not started**
- **No selector-engine redesign** — §12's deferred spec remains deferred (DL-60)
- **No new resolver** — one `resolveStep`/`resolveChain`, verified by call-site enumeration
- **No new AST** — one `LocatorChain`/`LocatorStep`
- **No CommandBus** — DL-54 stands; no second message bus proposed
- **No real-browser infrastructure** — nothing installed, nothing proposed without separate authorisation
- **No bundle optimisation** — measured only; WS6.2.1 not reopened
- **No framework expansion** — Playwright only
- **No additional UI extraction** — WS5's line-count targets untouched
- **No guard weakened, no test deleted, no source file modified**

---

## 20. Final Gate

**DISCOVERY BLOCKED — OWNER DECISION REQUIRED**

WS6.3 has no definition to implement (D4), and the repository baseline is currently red (D1). Two
genuine verification-honesty defects were found and measured (D2, D3). Nothing was fixed; nothing was
authorised.
