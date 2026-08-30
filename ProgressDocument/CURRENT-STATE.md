# Playwright Guru — Current State

**Updated:** 27 August 2026 · **Authority:** `MASTER-ROADMAP.md` · this file is the fast-read snapshot.

## Checkpoint

| | |
|---|---|
| Rollback point (immutable) | `bb928eac8547a1ad1b0cc119c41673e0553adece` |
| WS0 commits | `6457f7c` → `2cabc8a` → `68604e2` |
| Expected HEAD | `68604e2fe1c0bb32db2b93aa66eb1e734f296974` |
| WS0 | **CLOSED / LOCKED** — 54/54, CI green on Ubuntu + Windows (run `32149336770`) |
| WS1 | **NOT STARTED** |
| Publishing | **PAUSED** — store draft exists, untouched |

## Verification boundary — read this before trusting any state claim

**Claude cannot run git against the host.** HEAD, branch, remote sync and tree cleanliness above are
**user-reported**, not independently verified. Only user-supplied `git status --short`,
`git log --oneline -5`, `git branch -vv`, `git remote -v` is authoritative.

**What Claude *did* verify via the device bridge (read-only):**

- `package.json`, `README.md`, `wxt.config.ts`, `packages/extension/package.json`,
  `docs/privacy-policy.html` are **byte-identical** to the container mirror
- `docs/` contains **only** `privacy-policy.html` (untracked ⇒ the tree is **not** clean)
- `playwright-guru-v0.1.0.zip` sits at the repo root (gitignored)
- `packages/extension/public/` **does not exist** ⇒ no icons anywhere
- `docs/roadmap/` **does not exist**

## Repository facts vs mirror facts

| | Repository (user's machine) | Mirror (Claude's container) |
|---|---|---|
| P0-1A `RECORDING_ENABLED` | ❌ absent | ✅ present |
| P0-1B `normalizeAck` | ❌ absent | ✅ present |
| `preview-gate.test.ts` | ❌ absent | ✅ present |
| Test count | 54 | **61** |
| Verify gate | last green at `68604e2` | ✅ exit 0 |

**The mirror's P0-1 work is PROPOSED / READY-TO-PLACE. It is not committed, not placed, not published.**

## Reliability snapshot

**7 GREEN · 9 YELLOW · 8 RED · 1 NOT WIRED**

- **GREEN:** Playwright locator output · 5-language codegen · popup · code buffer/copy/undo ·
  bundle size · manifest permissions · **privacy behaviour** (zero network, `storage.local` only,
  clipboard write-only, no telemetry)
- **RED:** recording was dead while reporting success (fixed in mirror) · CSS badges fabricated ·
  XPath badges fabricated · DevTools `EVAL_SCRIPT` diverges · O(n²) match counting · background
  synthesised success (fixed in mirror) · cross-origin iframes guessed · shadow DOM unhandled
- **NOT WIRED:** every WS0 contract module — probe, resolver, facts, snapshot, rationale, ports,
  adapters, recording limits, copy map. **WS0 improved architecture, not user-facing reliability.**

## The two findings that drive the plan

1. **F-1 — ranking inverted.** Guru ranks `testId` **last**; Playwright's `selectorGenerator.ts`
   scores it **first**. A *Playwright-native* product currently disagrees with Playwright.
2. **F-2 — ~138 fabricated reliability labels** in `css-xpath.ts`, never derived from a match count.

## Open blockers

| Blocker | Needed from |
|---|---|
| Host git state | project owner |
| Icon decision (no assets exist) | project owner |
| Conformance corpus authorisation | project owner |
| Manual smoke matrix execution | project owner |
| Load-unpacked validation | project owner |
