# WS6.2 — TRUST-CORRECTION REPORT

**2026-09-04 · DL-70 · PARTIAL — OWNER DECISION REQUIRED**

## 1. Executive Verdict

**PARTIAL — OWNER DECISION REQUIRED.**

Two of the three authorised corrections landed and are proven. The third, **D2 (V-1, scoped chain
resolution), hit the stop condition the gate itself defined** and was deliberately **not implemented**:

> "If a DomProbe contract modification is genuinely unavoidable: STOP BEFORE IMPLEMENTING THAT PART
> and report the exact reason as an owner decision. Do not silently expand the architecture."

It is unavoidable, and §5 proves why rather than asserting it. Because V-1 is still document-wide, this
gate cannot claim COMPLETE — the gate's own failure conditions say so, and rejecting all chains instead
(the other way to make V-1 "go away") is listed as a failure condition too. So the verdict is PARTIAL,
by the rules as written.

| Item                                 | Result                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **D1** — red validation baseline     | ✅ **DONE.** `pnpm lint` exits 0, verified unfiltered                                                                         |
| **D2** — V-1 scoped chain resolution | ⛔ **STOPPED AT THE DEFINED BOUNDARY.** Requires a `DomProbe` port change (§5). Not implemented, not faked, not worked around |
| **D3** — V-2 regex `name`            | ✅ **DONE.** Now an explicit `UNSUPPORTED_STEP` → `unsupported`; the probe is never asked the broader question                |
| **D4** — retire WS6.3                | ✅ **DONE.** Documented as accidental; no WS6.3 section created                                                               |
| **New: V-3**                         | 📋 **DISCOVERED, DOCUMENTED, NOT FIXED** — six more silently-ignored options (§6.1)                                           |

## 2. WS6.3 Disposition

**WS6.3 is NOT a roadmap workstream.** `MASTER-ROADMAP.md` §WS6 defines WS6.1, WS6.2 and the WS6.2.1
gate, and nothing else. The label entered the documents only through scope-protection text in earlier
gates ("WS6.3 not started"), which took it from a prompt's exclusion list.

**No WS6.3 section was created.** The retirement is now stated in `MASTER-ROADMAP.md` §WS6,
`CURRENT-STATE.md` and `PROGRESS.md`. The two defects are filed against **WS6.2**, where they live; the
outstanding UI items stay with **WS6.1**, where the roadmap already puts them. Historical documents
that mention the label are left as written — DL-64's "do not rewrite history" rule stands — and the
2026-09-03 discovery report keeps its filename as the artifact of record.

## 3. Baseline

| Measure                    | Before (verified this run)         | After                          |
| -------------------------- | ---------------------------------- | ------------------------------ |
| Tests                      | 1,214 / 51 files                   | **1,229 / 52 files** (+15, +1) |
| Build                      | PASS                               | **PASS**                       |
| Typecheck                  | PASS                               | **PASS**                       |
| **Lint**                   | **FAIL — 2 errors**                | **PASS (exit 0)**              |
| Format                     | clean except `ws2-item9-report.md` | same, unchanged                |
| Total bundle               | 292,713 B                          | **292,801 B**                  |
| `content.js`               | 32,049 B                           | **32,137 B**                   |
| `background.js`            | 9,746 B                            | 9,746 B                        |
| side-panel chunk           | 7,801 B                            | 7,801 B                        |
| devtools-panel chunk       | 1,386 B                            | 1,386 B                        |
| shared `tokens` / `client` | 89,251 / 142,932 B                 | unchanged                      |

Drift check: no git repository exists (`fatal: not a git repository`), so the established
modification-time method was used — **no source drift since DL-69**, and `pnpm-lock.yaml` is untouched
since 2026-08-30, so **no dependency was added by this gate or the previous one**.

## 4. D1 Result — the lint defect

**Defect.** `packages/extension/test/ws5-parity.test.ts` assigned `document.body.innerHTML` at lines 44
and 72. The repository forbids that assignment everywhere, tests included — it is one of the
blueprint's security rules ("no remote code, no string-built code, no unescaped HTML injection",
`eslint.config.mjs:100-107`). DL-68 reported "Lint PASS" because its `pnpm verify` output was read
through a grep that did not match eslint's error lines, and the non-zero exit was misattributed to the
known permanent format exception.

**Before**

```
packages/extension/test/ws5-parity.test.ts
  44:5  error  Assigning innerHTML is forbidden ...   no-restricted-syntax
  72:5  error  Assigning innerHTML is forbidden ...   no-restricted-syntax
✖ 2 problems (2 errors, 0 warnings)
```

**Correction.** Both call sites now use `test/helpers/dom-fixture.ts`'s `setBody()` — the repository's
existing sanctioned helper, already used by every other happy-dom test, which builds the fixture via
`document.write` for precisely this reason. Only the fixture setup changed. **No assertion was
touched, no guard weakened, no guard deleted, no unrelated test altered.**

**After**

```
$ pnpm lint
> eslint .
(no output)
exit 0
```

Verified by running `pnpm lint` on its own and reading its exit code directly, not through a filter —
the specific mistake that produced the false claim is not repeated. The six parity tests still pass and
still prove what they proved.

## 5. V-1 Result — STOPPED, and why

**Root cause.** `resolver.ts::resolveChain` iterates a chain calling `resolveStep(step, probe)` with no
`opts`, therefore with no scope. Every step is measured independently against the whole document and
the chain reports the **terminal** step's document-wide count, so
`page.getByRole('list').getByText('Save')` can read _verified, 1 match_ where Playwright resolves **0**.

**Why the fix requires a port change — traced, not assumed.**

| Fact                                                                             | Evidence                                                                                                                           |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| The scope mechanism exists                                                       | `ProbeOpts.scope?: ScopeHandle` (`probe.ts:105-110`)                                                                               |
| A scope can be minted from an **Element**                                        | `LiveDomProbe.scopeFor(el: Element)` (`runtime/probe.ts:65`)                                                                       |
| …but `scopeFor` is **not on the `DomProbe` port**                                | `probe.ts:113-139` — the port has `countCss`, `countXPath`, `countByText`, `countByRole`, `countByLabel`, `scopeOf`. No `scopeFor` |
| …and neither fake implements it                                                  | `FakeDomProbe`, `FixtureDomProbe` implement `scopeOf` only                                                                         |
| `capture.ts` can call it only because it is typed against the **concrete class** | `capture.ts:40,113` declare `probe: LiveDomProbe`, not `DomProbe`                                                                  |
| `scopeOf` cannot mint a scope                                                    | it _validates_ an existing handle (`scopeOf(handle) → handle \| null`)                                                             |
| The probe never returns elements or handles                                      | `ProbeCount = { total, visible, error? }` — counts only                                                                            |
| The resolver must never see an Element                                           | R2/R3: the engine asks the DOM through the port and never touches one                                                              |

So there is **no path** from "the elements step N matched" to "a scope for step N+1" using today's
contract. The three ways to proceed were each checked:

1. **Add a capability to `DomProbe`** — the only technically correct route, and by definition a port
   change. **Stopped here, as instructed.**
2. **Type `resolveChain` against `LiveDomProbe`** — rejected: it would invert the dependency and put a
   live DOM inside the engine, breaking R2/R3.
3. **Reject all multi-step chains as unsupported** — rejected: the gate lists this as a failure
   condition without explicit owner authorisation.

**Nothing was changed.** `resolveChain` is byte-identical to its pre-gate state. No partial scoping was
shipped, and no test was added that pins the wrong behaviour as correct — WS0's
`contracts.test.ts:170` already pins it, with its own comment naming WS3 as the owner and warning that
it must not be "silently 'fixed' by a later change that does not actually implement scoping". That
warning is still doing its job, which is why no duplicate was added.

### OWNER DECISION REQUIRED — the `DomProbe` port change

**Question.** Scoped chain resolution needs the port to expose a way to derive a scope from a step's
matches. Which shape?

- **Option A — `scopeFor` on the port**, returning handles for a query's matches (e.g.
  `scopesFor(query): ScopeHandle[]`). _Advantage:_ general, mirrors what `LiveDomProbe` already does
  internally. _Risk:_ the widest change; both fakes must implement it; multi-match parents raise an
  ambiguity policy question the gate forbids inventing.
- **Option B — a scoped count in one call**, e.g. `countWithin(parentQuery, childQuery)`. _Advantage:_
  no handle leaves the probe; the port stays count-only, preserving its current character. _Risk:_
  encodes chaining into the port; awkward beyond two steps.
- **Option C — `resolveStep` returns an opaque scope alongside its counts**, by extending
  `ProbeCount`. _Advantage:_ smallest call-site change in `resolveChain`. _Risk:_ every probe method's
  return type changes, and `ScopeHandle` is documented as runtime-only and must never be serialised —
  putting it in `ProbeCount` widens the surface a WS0 structural guard already protects.

**No recommendation is offered as a decision** — each choice sets a different multi-match ambiguity
policy, and the gate is explicit that the existing resolver contract must not be extended with an
invented one. What is clear is that **Option C touches the serialisation guard** and so carries the
most collateral risk.

## 6. V-2 Result — regex `name` is now honestly unsupported

**Root cause.** `resolveStep`'s role branch read the name option as

```ts
const nameValue = name && name.type === 'string' ? name.value : undefined;
```

A **regex** name therefore became `undefined`, and the probe was asked for the role with no name
filter at all. Measured before the fix against an instrumented probe, these produced the _identical_
probe call and the _identical_ verdict:

```
page.getByRole('button', { name: 'Save' })   → role:button name=Save        → 9 → ambiguous
page.getByRole('button', { name: /Sav/ })    → role:button name=undefined   → 9 → ambiguous
```

**Why that was dishonest, precisely.** It was not a missing feature reported as missing. The resolver
silently substituted a _broader question_ — "how many buttons are there?" — and presented the answer as
the verification of a _narrower_ locator. The user reads "ambiguous, 9 matches" about an expression
Playwright resolves to one element, and nothing in the UI says the constraint was dropped. A count
obtained by discarding a constraint is not evidence about the locator that carried it.

**Correction.** One guard in `resolveStep`, placed beside the regex guard that has been there since
WS0:

```ts
const nameOption = step.options?.name;
if (nameOption && nameOption.type !== 'string') {
  return unresolved({
    code: 'UNSUPPORTED_STEP',
    detail: `regex name matcher on kind=${step.kind}`,
  });
}
```

- Uses the **existing** `UNSUPPORTED_STEP` code and the **existing** six-state mapping — the verifier
  already turns `UNSUPPORTED_STEP` into `unsupported`. **No new verification state was invented.**
- The parser was **not** modified: the AST already distinguishes `{type:'string'}` from
  `{type:'regex'}`, which was all the information the guard needed.
- Regex name **matching** is not implemented, not approximated, not stringified, and no broader
  locator is verified in its place.

**Tests** — `packages/locator-engine/test/resolver-options.test.ts` (15 tests, new). Written first;
**7 failed against the old implementation for exactly the intended reason**, including one that
asserted the defect by name and reported `[ 'role:button:name=undefined' ]`. Coverage: the refusal, the
error detail, that counts are `-1` rather than a number that could read as evidence, the `unsupported`
classification (explicitly _not_ `not-found` and _not_ `verified`), regex-with-flags, and the
narrowness of the refusal — string names, `exact`, every non-role kind, the pre-existing regex
selector-value rule, and a hand-built step all behave exactly as before.

### 6.1 V-3 — DISCOVERED, DOCUMENTED, NOT FIXED

Investigating the option contract for D3 surfaced **six more instances of the same defect class**. The
parser accepts eight options (`parser.ts:254-261`); the resolver reads exactly **two** (`exact` and
`name`). The other six are parsed into the AST and then ignored. Measured against an instrumented
probe:

| Expression                                 | Parsed options    | Probe actually asked           | Reported |
| ------------------------------------------ | ----------------- | ------------------------------ | -------- |
| `getByRole('checkbox', { checked: true })` | `{checked:true}`  | `role:checkbox name=undefined` | 9        |
| `getByRole('button', { disabled: true })`  | `{disabled:true}` | `role:button name=undefined`   | 9        |
| `getByRole('heading', { level: 2 })`       | `{level:2}`       | `role:heading name=undefined`  | 9        |
| `getByRole('tab', { selected: true })`     | `{selected:true}` | `role:tab name=undefined`      | 9        |
| `getByRole('button', { pressed: true })`   | `{pressed:true}`  | `role:button name=undefined`   | 9        |
| `getByRole('button', { expanded: true })`  | `{expanded:true}` | `role:button name=undefined`   | 9        |

Every one drops its constraint and reports the unconstrained count — the same fabrication V-2 was, six
more times. **It was not fixed**, because the gate authorises D3 as the regex-`name` case specifically
and instructs that anything else discovered be documented rather than auto-fixed. Fixing it is a
one-line extension of the same guard, but it changes the product's answer for six more expressions and
that is an owner's call, not mine.

## 7. Architecture Integrity

| Invariant                                                | Status | Evidence                                                                                                                                    |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **ONE resolver**                                         | ✅     | `resolveStep`/`resolveChain` in `resolver.ts`; callers enumerated: `verifier.ts:116`, `fact-model.ts:80,215`, `capture.ts:56,78,119`, tests |
| **ONE AST**                                              | ✅     | `LocatorChain`/`LocatorStep` in `types.ts`; the parser was not modified                                                                     |
| **ONE DomProbe boundary**                                | ✅     | port unchanged — **that is precisely why D2 stopped**                                                                                       |
| **NO CommandBus**                                        | ✅     | none introduced; DL-54 stands                                                                                                               |
| No second parser / matching engine / verification engine | ✅     | nothing added                                                                                                                               |

## 8. Regression Results

| Suite                                               | Result                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| locator-engine (13 files)                           | **326 passed** (311 before, +15 new)                                   |
| codegen                                             | goldens unchanged                                                      |
| extension (52 files total incl. above)              | all green                                                              |
| **Whole repository**                                | **1,229 passed / 52 files**                                            |
| `parser.test.ts` (42)                               | unchanged, green — the parser was not touched                          |
| `contracts.test.ts` (25)                            | unchanged, green — including the WS0 chain-resolution pin              |
| `verifier.test.ts` (12)                             | unchanged, green                                                       |
| `ws5-parity.test.ts` (6)                            | green after the D1 fixture change; assertions untouched                |
| R2 `architecture`                                   | 7/7                                                                    |
| R3                                                  | intact — `environment: 'node'` in all three vitest projects, unchanged |
| R5 `devtools-architecture` / `verify-locator-panel` | 18/18 and 18/18                                                        |
| Privacy                                             | 11/11                                                                  |

**No test was deleted, weakened, inverted or converted to an existence-only check.**

## 9. Security / Privacy

Privacy suite 11/11 (source and built-bundle layers). No `eval`, no `new Function`, no dynamic import
added; no network, no telemetry, no arbitrary execution, no unsafe HTML. **The D1 correction moved a
test _toward_ the security guard rather than away from it** — an `innerHTML` assignment became the
sanctioned `document.write` fixture helper. No dependency was added (`pnpm-lock.yaml` untouched).

The V-2 guard **reduces** what reaches the DOM: an expression that previously produced a probe query
now produces none.

## 10. Real-Browser Evidence

**NOT AVAILABLE.** Verified again this run against all four `package.json` files: no `@playwright/test`,
no Puppeteer, no Selenium, no WebdriverIO, no Chromium launcher, no extension-loading fixture, no
DevTools automation, no E2E script.

Everything claimed here is **unit + structural evidence**: deterministic tests against an instrumented
`DomProbe` implementation, plus source-level guards. happy-dom is used per-file and **is not Chromium**.
The V-2 correction is proven at the resolver and verifier level; that Chrome behaves as described on a
real page is **not proven and is not claimed**.

## 11. Bundle

| Measure               | Before           | After                | Delta              |
| --------------------- | ---------------- | -------------------- | ------------------ |
| **Total**             | 292,713 B        | **292,801 B**        | **+88 B (+0.03%)** |
| `content.js`          | 32,049 B         | **32,137 B**         | **+88 B**          |
| `background.js`       | 9,746 B          | 9,746 B              | 0                  |
| side-panel chunk      | 7,801 B          | 7,801 B              | 0                  |
| devtools-panel chunk  | 1,386 B          | 1,386 B              | 0                  |
| shared `tokens` chunk | 89,251 B         | 89,251 B             | 0                  |
| Ceiling               | 278,760 B        | 278,760 B            | unchanged          |
| **Overage**           | 13,953 B / 5.01% | **14,041 B / 5.04%** | +88 B              |

The entire +88 B is the V-2 guard, which lives in `resolver.ts` and is therefore reachable from
`content.js` — where the resolver has been bundled since WS3, as DL-58 established. **No optimisation
was performed and none is claimed.** The ceiling was not changed; the overage remains standing
owner-level budget debt, and WS6.2.1 was not reopened.

## 12. Documentation

- `ProgressDocument/DECISION-LOG.md` — **DL-70**
- `ProgressDocument/MASTER-ROADMAP.md` — §WS6: WS6.3 retired, V-2 corrected, V-1 stopped, V-3 recorded
- `ProgressDocument/CURRENT-STATE.md` — execution pointer, baseline, bundle
- `ProgressDocument/PROGRESS.md` — Updated line + milestone row
- `ProgressDocument/ws6-2-trust-correction-2026-09-04.md` — this report

## 13. Remaining Debt

1. **V-1 — unscoped chain resolution.** Still present, still capable of a false green. Blocked on the
   `DomProbe` port decision (§5). WS0's `contracts.test.ts:170` continues to pin it.
2. **V-3 — six silently-ignored state options** (§6.1). Same class as V-2, not authorised here.
3. **Bundle overage** — 14,041 B / 5.04% over the locked ceiling. Owner budget policy; unchanged.
4. **No real-browser evidence** for anything in this repository.
5. **WS6.1's genuinely unstarted items** — the Primary/Secondary/Educational hierarchy and F-12's
   "built, tested, invisible" surfacing — plus the self-contradictory "debug mode for raw scores"
   deliverable (asked for in WS6.1, counted as a pass by its absence in WS6's Exit criterion).
6. **`FRAME_UNSUPPORTED` is declared but never raised**; `.nth(1.5)` reports `UNTERMINATED_CALL`;
   an invalid regex on a non-role kind reports `unsupported` rather than `invalid`. Cosmetic.

Nothing here is manufactured work — every item is either a measured defect or a pre-existing recorded
gap.

## 14. Scope Protection

- **WS6.3 not created** — retired as accidental; no section, no workstream, no numbering
- **WS9 not started** — `RECORDING_ENABLED` remains `false`
- **WS10 not started**
- **WS7 unchanged** — no CSS/XPath verification, status mapping or presentation touched
- **WS6.2.1 not reopened** — no resolver splitting, no isolation experiment
- **No resolver split · no second AST · no second DomProbe · no CommandBus**
- **No browser infrastructure** — nothing installed
- **No bundle optimisation** — measured only
- **No UI extraction, no redesign** — no panel, `VerifyLocatorPanel`, SidePanel or DevTools file touched
- **No dependency change** — lockfile untouched
- `.locator()`, `.filter()`, `page.frameLocator()` remain rejected; `.nth()` semantics unchanged
- No guard weakened, no test deleted, no source-text guard altered

## 15. Final Gate

# WS6.2 TRUST-CORRECTION PARTIAL — OWNER DECISION REQUIRED

D1 and D3 are complete and proven. **D2 stopped at the boundary the gate defined**, because scoped
chain resolution cannot be implemented without changing the `DomProbe` contract — and the decision on
how to change it is the owner's, not mine.
