# WS8 DISCOVERY

**Authoritative purpose** (`MASTER-ROADMAP.md` §12, WS8): _"Validate and harden everything through WS7
before feature work resumes."_ Deliverables: ARIA audit · focus management · live regions · reduced motion ·
full error-state matrix · toast system · empty/loading/error states · dark-mode polish · keyboard shortcut
docs · copy review · security review checkpoint · performance validation on real sites.

**Authoritative exit criteria**, verbatim: _"axe-core zero critical/serious in both panels in both themes ·
every interactive element keyboard-reachable with a visible focus ring · every error has title, cause,
action · §20.6 budgets hold on 3+ real sites."_

**Discovery found two of those four criteria unmeetable as written — defects in the roadmap, not the code.**

1. **`§20.6` does not exist.** §20 is "FrameworkProfile Concept `FUTURE`"; it has no numbered subsections
   and no budgets. The string `20.6` occurs exactly once in the entire repository — inside WS8's own Exit
   line. No time-based performance budget is defined anywhere in the authoritative documents. The only
   budgets that exist are `SNAPSHOT_BUDGET` (25 KB/50 KB plus collection caps) and WS3's
   `content.js ≤ 60 kB`.
2. **axe-core is unreachable at the evidence level the criterion implies.** `axe-core` is absent from every
   `package.json` and from `pnpm-lock.yaml`. All three vitest projects run `environment: 'node'` as a
   deliberate architectural guard (R3, stated in `vitest.workspace.ts`), and no React render harness exists
   anywhere — `verify-locator-panel.test.ts` opens by saying the panel tests are structural source-scan
   guards, not render tests. Satisfying the criterion would require either a happy-dom render harness
   (fixture-level output that is **not** Chromium truth) or a real-browser harness (new test infrastructure
   this gate had no authorisation to invent).

Also found stale: the Stage-1 row _"Privacy regression test over the built bundle · WS8 · ⬜"_ —
`privacy.test.ts` has carried a `describe('privacy contract — built bundle')` layer reading
`.output/chrome-mv3` for some time. The row, not the work, was outstanding.

**Existing implementation, per capability:** native-control interaction **DONE** (unguarded until now) ·
focus ring **PARTIAL** (wired at DL-50, values never retuned, measured below the WCAG bar) · live regions
**PARTIAL** (`VerifyLocatorPanel` and `ErrorBoundary` only; neither panel's status bar) · reduced motion
**MISSING** · error-state matrix **MISSING** · toast system **MISSING** · built-bundle privacy test
**DONE** · manual smoke matrix **BLOCKED** (only the user can run it) · dark-mode polish **DEFERRED**
(DL-51: the dark theme is functionally cosmetic) · keyboard shortcut docs **N/A** (the manifest declares no
`commands`).

**Readiness: BLOCKED → owner decisions taken → implemented.** Following the DL-59/DL-60 precedent for a
roadmap contradiction, the gate stopped before implementation rather than guessing, and put four questions
to the project owner. Decisions: E1 → structural a11y guards, no axe, labelled honestly, axe deferred as
named follow-up; E4 → re-scope to the budgets that genuinely exist, real-site validation to the manual
smoke matrix and WS11; implement E2 + E3 + reduced motion now; defer the toast system.

# IMPLEMENTATION

**Files changed** (7 changed, 4 new):

| File                                    | Change                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/ui/tokens.css`                     | Focus ring retuned to solid `#1d4ed8` / `#93c5fd`; new `forced-colors` and `prefers-reduced-motion` blocks |
| `src/ui/copy/errors.ts` **(new)**       | The error-state matrix: 9 codes × {title, cause, action}, exhaustive `Record`                              |
| `src/ui/primitives.tsx`                 | New shared `ErrorNotice` — takes a code, never caller prose                                                |
| `entrypoints/sidepanel/SidePanel.tsx`   | `statusError` code state, live-region status bar, matrix rendering, 2 `aria-label`s                        |
| `entrypoints/devtools-panel/Panel.tsx`  | `evalErrorCode` state, live-region status bar, matrix rendering, 2 `aria-label`s                           |
| `src/ui/ErrorBoundary.tsx`              | Comment only — records why it is deliberately NOT wired to the matrix (see below)                          |
| `test/tokens.test.ts`                   | Focus-ring guard strengthened from "non-degenerate" to the measured 3:1 bar; motion/forced-colors tests    |
| `test/a11y-structure.test.ts` **(new)** | 22 structural a11y guards — the owner-approved stand-in for axe                                            |
| `test/error-states.test.ts` **(new)**   | 55 matrix, WS7-boundary and panel-wiring assertions                                                        |
| `test/budgets.test.ts` **(new)**        | 5 assertions pinning the budgets that genuinely exist                                                      |

**Architecture used — existing primitives only.** No new engine, AST, resolver, DOM abstraction or
CommandBus. `ErrorNotice` lives in the WS2 primitives module both panels already load, so it lands once in
the shared chunk rather than per panel. The matrix re-decides nothing: `errorStateForVerifyStatus` maps the
three "could not measure" states WS7 already classified, and a test (comments stripped first) proves the
module never imports `classifyVerification`.

**Design decisions worth recording:**

- **The ring failed because of opacity.** A 55%/60%-alpha ring composites toward whatever sits behind it,
  so on a light tint almost nothing remained. Measured against every background token: **1.98:1 light,
  1.74:1 dark** — under WCAG 1.4.11's 3:1. Now solid: `#1d4ed8` (worst case 4.63:1) and `#93c5fd` (worst
  case 3.93:1), asserted per token per theme.
- **Forced-colors mode needed its own rule.** `box-shadow` does not paint there, so without a
  system-keyword outline the ring is invisible to precisely the users who most depend on it.
- **Reduced motion is one stylesheet block, not a component sweep.** Both panels animate through _inline_
  styles, which only `!important` in a stylesheet can override — so one rule covers every current and
  future inline animation. The recording pulse settles at opacity 1: the state stays visible, the motion
  stops.
- **Four icon-only buttons had no accessible name** (both Verify `▶`, both code-buffer `✕`). The new guard
  caught the fourth after three had been fixed by hand — which is the argument for the guard.
- **Reverted deliberately:** wiring `ErrorBoundary` to the matrix. `honesty.test.ts` pins that the boundary
  imports react and nothing else, and that guard is right — a boundary importing a copy module could fail
  to render for the same reason it was invoked. The two now carry the same words independently, with a
  drift test. **No guard was weakened to make this gate pass.**

**Tests added: +85 (82 new + 3 net in `tokens.test.ts`).**

# VALIDATION

- **Tests: 1,037 passed / 44 files** (baseline measured from the repository at the start of this gate:
  952 / 41).
- **Build:** PASS. **Typecheck:** PASS (all three packages). **Lint** (`eslint .`): PASS.
- **Format:** clean except the single pre-existing, permanently-accepted `ws2-item9-report.md` exception.
  One additional warning appeared and was cleared: `ws7-owner-decision-closure-report.md` had never been
  run through prettier (it was written after the WS7 gate's final verify). Formatting it changed only
  italic markers and table padding — confirmed by a whitespace-normalised diff.
- **Security:** privacy guards 11/11 unchanged; no `eval`, `new Function`, dynamic import, or unsafe HTML
  introduced; no network call added.
- **R2 / R3 / R5:** re-run explicitly and unchanged — `architecture.test.ts` 7/7,
  `devtools-architecture.test.ts` 18/18, `verify-locator-panel.test.ts` 18/18.

Zero unexplained regressions. Three failures appeared mid-implementation and all three were the existing
guards doing their job: two rejected the `ErrorBoundary` coupling (reverted), one flagged the focus-ring
token shape (that test was strengthened, not weakened, to the numeric bar it had explicitly deferred).

# BUNDLE

| Measure        | Pre-WS8          | Post-WS8             | Δ                        |
| -------------- | ---------------- | -------------------- | ------------------------ |
| Total          | 294,425 B        | **298,842 B**        | **+4,417 B**             |
| `content.js`   | 31,753 B         | **31,753 B**         | **0 B — byte-identical** |
| Locked ceiling | 278,760 B        | 278,760 B            | unchanged                |
| Overage        | 15,665 B (5.62%) | **20,082 B (7.20%)** | +4,417 B                 |

The increase is the error-matrix copy and `ErrorNotice` in the shared panel chunk, the new panel branches,
and the two `tokens.css` blocks. **`content.js` is byte-identical**, so nothing landed in the
content-script hot path.

**Status: increased, disclosed, not chased — and it raises the existing owner decision.** This gate was
explicitly forbidden from becoming a bundle-optimization workstream; no functionality was removed, no
ceiling changed, no tree-shake hack attempted. The toast system was deferred partly for this reason. The
overage remains owner-level release-budget debt, now larger.

# DECISION LOG

- **DL-61** (next available number, confirmed dynamically — DL-60 was the prior latest).
- Title: **WS8 DISCOVERY / IMPLEMENTATION GATE — polish, a11y, error states; two exit criteria re-scoped by
  owner decision.**
- Class: `CURRENT`.

# DOCUMENTATION

- `ProgressDocument/DECISION-LOG.md` — DL-61 added in full 5-column format, inserted before DL-60 per the
  log's convention; no historical entry rewritten or renumbered.
- `ProgressDocument/MASTER-ROADMAP.md` — WS8 §12 header → PARTIAL — FOLLOW-UP REQUIRED, with a per-criterion
  status table (the original Purpose/Deliverables/Exit text kept verbatim above it); §30 dashboard WS8 row;
  executive summary; the stale Stage-1 privacy row corrected. WS7 left CLOSED / COMPLETE (DL-60) and the
  deferred selector-engine proposal untouched.
- `ProgressDocument/CURRENT-STATE.md` — new WS8 checkpoint row, `Updated:` line rewritten. WS0–WS7 rows
  unchanged.
- `ProgressDocument/PROGRESS.md` — `Updated:` line, CURRENT MILESTONE clause, new milestone-history row, and
  a full WS8 narrative section. Historical milestones preserved.

All four reformatted with prettier and verified content-identical by a whitespace-normalised diff (only
table-separator padding changed).

# DEFERRED / FOLLOW-UP

1. **axe-core validation at a real evidence level** — requires an infrastructure decision (happy-dom render
   harness vs real-browser harness). Deliberately not taken unilaterally.
2. **Manual smoke matrix** (8 journeys + 6 negatives) — only the project owner can execute it in a browser.
   Side-Panel rows already PASS from the 2026-08-30 capture; DevTools/Verify/privacy rows remain.
3. **Toast system** — deferred by owner decision; no exit criterion depends on it.
4. **Bundle overage** — now 20,082 B (7.20%) over the locked ceiling. Unchanged in kind, larger in size;
   still an owner decision.
5. **`§20.6`** — the dangling reference is recorded as a roadmap defect. If real-site performance budgets
   are wanted, they must first be written.

Not debt, and not relabelled as such: E2, E3, live regions and reduced motion are complete and pinned by
tests.

# ROADMAP POSITION

| WS    | Status (WS0–WS7 verbatim from the authoritative docs, not inferred)                                         |
| ----- | ----------------------------------------------------------------------------------------------------------- |
| WS0   | **CLOSED / LOCKED** — 54/54, CI green on Ubuntu + Windows                                                   |
| WS1   | **CLOSED** (DL-42) — all 5 exit criteria met                                                                |
| WS2   | **COMPLETE** (DL-43…DL-51) — items 1–9 landed, exit review conducted                                        |
| WS3   | **PARTIALLY COMPLETE** (DL-52, DL-53) — IIFE probe build deferred; bundle 0.71% over at the time, disclosed |
| WS4   | **NOT STARTED**                                                                                             |
| WS5   | **PARTIAL** (DL-34, DL-54, DL-55) — `PickSource`/leaf-first extraction still not implemented                |
| WS6   | **PARTIALLY DELIVERED** (DL-21, DL-54, DL-55)                                                               |
| WS6.2 | **PARTIAL — BUNDLE STILL OVER CEILING** (DL-56, DL-57, DL-58)                                               |
| WS7   | **CLOSED / COMPLETE** (DL-60) — larger selector-engine spec remains DEFERRED / FUTURE DIRECTION             |
| WS8   | **PARTIAL — FOLLOW-UP REQUIRED** (DL-61) — E2 + E3 met and pinned; E1 and E4 re-scoped by owner decision    |
| WS9   | **DEFERRED** — not started, not scaffolded, not designed                                                    |

# BACKUP / DELIVERY

- Backup: `ws8-polish-a11y-error-states-2026-09-03.zip`, project naming convention
  (`ws<N>-<description>-<date>.zip`).
- Changed/new files delivered: 11 source and test files + 4 documents + this report + the re-formatted WS7
  closure report.
- Destination: `E:\Codes\playwrightguru` (docs into `ProgressDocument\`, source into its mirrored path,
  report and zip at the repo root).
- Rejected: 0.

# FINAL STATUS

**WS8 PARTIAL — FOLLOW-UP REQUIRED.**

Every criterion the owner authorised this gate to close is closed and pinned by tests. Two remain open by
**explicit owner decision, not by omission**: axe-core validation at a real evidence level, and the
user-executed manual smoke matrix.

WS8 gate complete.
No WS9 implementation was started.
