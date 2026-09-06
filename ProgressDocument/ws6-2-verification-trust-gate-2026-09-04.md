# WS6.2 — VERIFICATION TRUST GATE (D2 + V-3)

**2026-09-04 · DL-71 · COMPLETE**

## 1. Executive Verdict

**COMPLETE.**

Both corrections this gate authorised landed, and both are proven by tests that failed first against
the old implementation for exactly the intended reason.

The gate stated its own standard: _"A smaller implementation that honestly says: unsupported /
ambiguous / not-found / unverifiable is better than a larger implementation that produces a misleading
'verified' result."_ That is the shape of what was built. **D2** makes a chained locator report
`not-found`, `ambiguous` or `unsupported` where it previously reported a confident `verified` for a
question nobody asked. **V-3** makes six option keys report `unsupported` instead of quietly measuring
something broader. Neither adds a capability; both remove a lie.

| Item                                       | Result                                                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **D2** — V-1 scoped chain resolution       | ✅ **DONE.** One optional field on `ProbeCount`; no port method added, none removed, no signature changed. Owner policy verbatim |
| **V-3** — six ignored options              | ✅ **DONE.** Explicitly `unsupported` via the existing machinery. No new status, no new error code, no approximation             |
| **D3** — regex `name` (DL-70)              | ✅ **PRESERVED**, asserted explicitly rather than assumed                                                                        |
| **D1 / D4** (DL-70)                        | ✅ **UNCHANGED**, still green                                                                                                    |
| Incidental: flaky `storage-migration` test | 📋 **RECORDED, NOT FIXED** — pre-existing, unrelated, outside this gate's mandate (§11)                                          |

## 2. Baseline

| Measure      | Before (DL-70, verified)           | After                             |
| ------------ | ---------------------------------- | --------------------------------- |
| Tests        | 1,229 / 52 files                   | **1,294 / 54 files** (+65, +2)    |
| Test         | PASS                               | **PASS (exit 0)**                 |
| Build        | PASS                               | **PASS (exit 0)**                 |
| Typecheck    | PASS                               | **PASS (exit 0)**                 |
| Lint         | PASS                               | **PASS (exit 0)**                 |
| Format       | clean except `ws2-item9-report.md` | same, unchanged                   |
| Total bundle | 292,801 B                          | **293,814 B** (+1,013 B, +0.35 %) |
| `content.js` | 32,137 B                           | **33,150 B** (+1,013 B)           |

Each gate was run **alone**, and its **exit code read individually** — the DL-68 lesson, where a
filtered `pnpm verify` grep matched no eslint error line and produced a false "Lint PASS".

## 3. D2 — The Defect

`resolveChain` iterated the steps calling `resolveStep(step, probe)` with **no `opts`, therefore no
scope**. Every step was measured independently against the whole document, and the chain reported the
**terminal** step's document-wide count. So

```
page.getByRole('list').getByText('Save')
```

was answered with _"how many 'Save' are on the page"_, not _"how many 'Save' are inside that list"_.

Measured on the live path (`test/runtime-probe.test.ts`), on this document:

```
<ul role="list"><li>Cancel</li></ul>
<div><button>Save</button></div>
```

the panel reported **verified, 1 match** for an expression Playwright resolves to **zero**. A
confidently wrong green is the worst result this product can produce, and it is what this gate exists
to remove.

## 4. D2 — Why It Was Blocked, and What Unblocked It

DL-70 stopped at the gate's own stop condition because scoped chaining needs the probe to hand back a
reference to the element a step matched, and **no port member returned one**: `scopeOf` only validates
an existing handle, `ProbeCount` carried counts alone, and `scopeFor` / `scopeHandleFor` live only on
the concrete implementations. That analysis stands and was not overturned.

What resolved it is **not a new decision**. `ResolveResult.stepCounts`' own WS0 doc comment already
specified the contract:

> "True scoped resolution — where each step narrows the search root for the next — **requires the probe
> to return scope handles for matched elements** … The field and its shape do not change then; only the
> meaning of the numbers becomes cumulative."

The sanctioned shape was written down at the beginning of the project and simply never built. This gate
built it. Nothing was designed that WS0 had not already named.

## 5. The Chosen `DomProbe` Contract

One optional field:

```ts
export interface ProbeCount {
  total: number;
  visible: number;
  scope?: ScopeHandle; // present ONLY when visible === 1
  error?: ProbeError;
}
```

**No method was added. No method was removed. No signature changed.** The port keeps its five locator
queries and its one scope-lifecycle member, so the cohesion rule stated in `probe.ts`'s own doc comment
— _"a new **query** method that does not map to a locator strategy is a design smell"_ — is untouched.
This is a richer answer to a question already asked, not a new question.

### Why it is safe

1. **The handle exists only for a unique match.** `measuredCount(total, visible, scope?)` attaches the
   scope only when `visible === 1`, in one place, so no implementation can hand the resolver "one of
   the matches" — the situation in which choosing a parent would be a guess.
2. **`ScopeHandle` is unchanged.** Still `{ __brand, id }`, still opaque, still runtime-only. No DOM
   Element is serialised, and none enters a message, snapshot, AST or stored pick. `snapshot.ts`'s
   `containsScopeHandle` guard covers the new field structurally, and the D2 suite re-asserts it.
3. **The resolver never returns one.** `resolveStep` produces a scope so `resolveChain` can thread it;
   `resolveChain` does **not** put it on the result it returns. No consumer can receive one.
4. **It is optional.** A probe that cannot mint simply omits it, and the resolver then **refuses**
   rather than widening — see §6. Absence costs honesty in one direction only: an `unsupported`
   answer, never a fabricated `verified`.

## 6. The Ambiguity Policy (owner-mandated, implemented verbatim)

For every **non-terminal** step:

| Parent resolves to | Result                                                    |
| ------------------ | --------------------------------------------------------- |
| **0 matches**      | **not-found** — the child is never evaluated              |
| **exactly 1**      | the child is resolved **only within that parent's scope** |
| **more than 1**    | **ambiguous** — the child is never evaluated              |

No first-match. No `.nth(0)`. No arbitrary parent. No document-wide fallback.

Two further exits were needed for cases the policy implies but does not name, and both were resolved in
the direction of less confidence:

- **A unique parent for which the probe returned no scope** → `UNSUPPORTED_STEP` → `unsupported`. The
  only alternative to refusing is querying the child document-wide, which is precisely the defect.
- **An unmeasured parent** (`visible < 0` without an error) → stays `unknown`. An unmeasured count is
  not a measured zero and must not become one.

Every exit from an unresolvable parent is `not-found` / `ambiguous` / `unsupported` / `unknown`. **None
is `verified`.**

`.nth()` is unchanged in meaning and now selects from the **scoped** terminal set, which is what it
always claimed to do. `stepCounts` becomes cumulative exactly as WS0 said it would, with its shape
unchanged and its doc comment rewritten to match; a step never evaluated contributes no entry, so
`stepCounts.length` tells a caller how far the chain got.

## 7. D2 — Tests (failure-first, in that order)

`packages/locator-engine/test/resolver-chain-scope.test.ts` — **16 assertions**, written before the
implementation and confirmed failing: **7 failed / 9 passed**, including

```
D2 · a child that exists only OUTSIDE the parent is not-found
  → and the six-state verifier reports not-found, never verified
    AssertionError: expected 'verified' to be 'not-found'
```

which is the false green, live.

Semantic cases run against `FixtureDomProbe` over real parsed happy-dom HTML — the strongest oracle
this repository has. Call-shape cases run against keyed fakes so the exact probe calls can be asserted:
that an ambiguous parent produces **exactly one** probe call, that the child scope arrives through
`ProbeOpts`, and that a single-step chain is never given a scope.

`packages/extension/test/runtime-probe.test.ts` — **8 new assertions** proving the same thing on the
**live** implementation: `LiveDomProbe` mints a handle iff `visible === 1`, offers the same handle for
the same element twice, mints from `countByRole` and `countByLabel` as well as `countCss`, and — end to
end through `verifyLocatorExpression` — reports `not-found` for the child-outside-parent document,
`verified` when the child is inside, and `ambiguous` when the parent is.

## 8. V-3 — Policy and Implementation

`parser.ts` accepts eight option keys on a role step; `resolveStep` read two. The other six were
parsed, stored on the step, and never looked at, so

```
page.getByRole('checkbox', { checked: true })
```

was measured as `page.getByRole('checkbox')`. Both failure directions were real: _"ambiguous — 6
matches"_ for a locator Playwright resolves to one, and — worse — _"verified — 1 match"_ for a single
**unticked** box where Playwright resolves to zero.

**Policy: explicitly unsupported, using the existing machinery.** `UNSUPPORTED_STEP` (still four codes,
unchanged) → the existing `unsupported` status.

- **No new verification status.** The six states are unchanged, and a test enumerates the statuses these
  expressions can produce and asserts every one is among the existing six.
- **No new error code.** A test reads `ResolveErrorCode` from source and asserts it still declares four.
- **Not implemented, not approximated.** ARIA state matching requires per-element accessibility-tree
  work no port method exposes. `unsupported` is the honest answer, not a placeholder for one.
- **Presence disqualifies, not truthiness.** `{ checked: false }` selects the boxes that are **not**
  ticked — a real filter, a different set from "every checkbox" — so a `false` may no more be dropped
  than a `true`. Asserted for `checked`, `disabled` and `level: 1`.
- **Every unsupported option present is named** in the error detail, not merely the first.
- **Step-level**, so it applies to a hand-built step and at any position in a chain. When a later step
  carries one, the parent is legitimately measured and the child is never asked.

**Refused at the resolver, not the parser**, deliberately: refusing at the parser would report
`invalid`, a **syntax** claim, and these expressions are valid Playwright. The truthful statement is
"this verifier cannot evaluate that", which is what `unsupported` means.

`packages/locator-engine/test/resolver-state-options.test.ts` — **41 assertions**, written first:
**33 failed / 8 passed** against the old implementation, the 8 being the narrowness guards that were
already correct.

## 9. D3 Preservation — Asserted, Not Assumed

| Expression                                           | Behaviour                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `getByRole('button', { name: 'Save' })`              | resolves; probe called `role:button:name=Save`; `excellent`  |
| `getByRole('button', { name: /Save/ })`              | `unsupported`, detail matches `/regex/i`; probe never called |
| `getByText('Save', { exact: true })`                 | resolves as `text:Save:exact`                                |
| `getByLabel('Email', { exact: true })`               | resolves as `label:Email:exact`                              |
| `getByRole('button', { name: 'Save', exact: true })` | resolves as `role:button:name=Save`                          |
| `getByRole('button')`                                | unchanged unconstrained role query                           |
| every non-role kind with a string value              | resolves, exactly one probe call each                        |

## 10. Validation

Each command run alone; exit code read individually.

| Gate                | Exit | Detail                                                                  |
| ------------------- | ---- | ----------------------------------------------------------------------- |
| `pnpm -r test`      | 0    | locator-engine 383 · codegen 127 · extension 784 = **1,294 / 54 files** |
| `pnpm -r build`     | 0    | Σ 293,814 B                                                             |
| `pnpm typecheck`    | 0    | —                                                                       |
| `pnpm lint`         | 0    | no errors, no warnings                                                  |
| `pnpm format:check` | 1    | **only** `ws2-item9-report.md`, the permanent accepted exception        |

**Guard suites, all green:** R2 `architecture` 7/7 · R5 `devtools-architecture` 18/18 and
`verify-locator-panel` 18/18 · `privacy` 11/11 · `honesty` 18/18 · `match-counts` 17/17 ·
`contracts` 33/33 · `r4-structural-guard` 16/16.

**R1** holds — `wxt/browser` appears only in `src/browser/**` and `entrypoints/**`.
**R3** holds — all three vitest projects still declare `environment: 'node'`.
**R5** holds — `src/ui/**` imports nothing from `browser/`, `runtime/` or `entrypoints/`.

**Two source-text guards were updated, neither weakened.** `honesty.test.ts` ("collects elements once
and filters them") and `match-counts.test.ts` ("total === visible for role") pinned the literal
`measuredCount(...)` call text, which changed shape when the third argument arrived. Both were
rewritten to pin the same claims at least as tightly — the total still from the single collection, the
visible still from filtering that same list, both role figures still `matched.length` — each with a
comment recording why the shape moved. No assertion was dropped or loosened.

**Drift sweep** (modification-time; this repository has no git): exactly **10** changed files —
3 source (`locator-engine/src/probe.ts`, `locator-engine/src/resolver.ts`,
`extension/src/runtime/probe.ts`), 2 test fakes (`FakeDomProbe`, `FixtureDomProbe`), 2 new test files,
3 updated test files. No file deleted. No dependency, lockfile or build-config change.

## 11. Incidental Finding — Recorded, Not Fixed

`packages/extension/test/storage-migration.test.ts` → _"the quarantine record carries NO raw user
content"_ is **flaky, and pre-existing**. The record written by `src/storage/migration.ts` contains
`at: Date.now()`, and the assertion is `expect(record).not.toContain('42')`. A 13-digit millisecond
timestamp contains the substring `42` about **6.9 %** of the time (measured over 100,000 synthetic
timestamps), so the test fails at roughly that rate. It failed once during this gate's validation and
then passed **12/12** on re-run.

**The product is correct; the test is wrong.** It is unrelated to D2 and V-3, predates this gate, and
fixing it is outside the mandate — so it is recorded here and in DL-71 for an owner decision rather
than fixed. It is named explicitly because a flaky test in a validation run is itself a trust problem,
and leaving it undisclosed would undercut the point of this gate.

## 12. Security and Architecture

- No `eval`, `new Function`, or dynamic code execution anywhere.
- The `no-restricted-syntax` rule forbidding `innerHTML` / `outerHTML` assignment and
  `insertAdjacentHTML` is **untouched**, and lint exits 0 against it.
- **No DOM Element is serialised**, and none is placed in a message, snapshot, AST or stored pick. The
  new field carries an opaque `{ __brand, id }`, and `resolveChain` never returns it.
- Still exactly **one** locator resolver and **one** `DomProbe` boundary. No second AST, no
  `CommandBus`, no UI extraction, no bundle optimisation, no real-Chromium infrastructure, no WS6.3, no
  new dependency.

## 13. Real-Browser Limitation

**All evidence in this report is happy-dom and hand-built fakes.**

happy-dom is not Chromium. It has no layout engine, so `getBoundingClientRect()` is a zero box and
`visible === total` throughout — real visibility filtering is not exercised. It has no
`document.evaluate`, so XPath is exercised only on its honest `UNSUPPORTED` path.

**No real-Chrome manual regression was performed, and none is claimed.**

What is proven: the resolver no longer asks the document-wide question, refuses rather than widens when
it cannot narrow, and reports `unsupported` for options it cannot evaluate. What is **not** proven:
Chrome's visibility semantics and accessibility-tree behaviour under these same locators.
