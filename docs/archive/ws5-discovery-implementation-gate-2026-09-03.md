# WS5 — Shared Application Layer + UI Extraction · DISCOVERY GATE

**2026-09-03 · DL-67 · DISCOVERY ONLY — NO WS5 IMPLEMENTATION WAS PERFORMED**

This gate ran in discovery mode. No production source file was created, modified or deleted; no
dependency was added; no guard was weakened; WS6.3, WS9 and WS10 were not started; the bundle was not
optimised. Every number below was measured in this run, not carried forward.

## 1. Drift and baseline

No git repository exists here, so the DL-64/DL-65/DL-66 modification-time method was used again:
`find packages -newer ProgressDocument/DECISION-LOG.md` over all `.ts/.tsx/.json/.css/.html/.mjs`
outside `node_modules`, `.output` and `.wxt` returns **empty**. Nothing has changed since DL-66 was
recorded. **WS4 is not reopened and no WS4 regression was found.**

| Measure              | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| Tests                | **1,126 passed / 47 files** (`pnpm verify`)                 |
| Build                | PASS · typecheck PASS · lint PASS                           |
| Format               | clean except the permanent, untouched `ws2-item9-report.md` |
| Bundle total         | **308,473 B**                                               |
| `content.js`         | 32,049 B (WS3 ceiling 61,440 B — inside it)                 |
| `background.js`      | 9,468 B                                                     |
| devtools-panel chunk | 25,136 B · devtools loader 179 B                            |
| sidepanel chunk      | 36,726 B · tokens chunk 52,781 B · client chunk 142,932 B   |
| Locked ceiling       | 278,760 B → **29,713 B (10.66%) over, disclosed**           |

R2 `architecture` 7/7 · R3 `environment: 'node'` in all three vitest projects · R5
`devtools-architecture` 18/18 and `verify-locator-panel` 18/18 · privacy 11/11.

## 2. Architecture as it actually is

```
entrypoints/devtools/main.ts        17 lines · panels.create() only
entrypoints/devtools-panel/
  index.html · main.tsx             React root + ErrorBoundary + tokens.css
  Panel.tsx                        470 lines · all UI, all state, all wiring
entrypoints/sidepanel/
  index.html · main.tsx             React root + ErrorBoundary + tokens.css
  SidePanel.tsx                    905 lines · all UI, all state, all wiring
src/application/ports/             PickSource · CommandBus · ClipboardPort · TabContext · index
src/application/adapters/          ClipboardAdapter.ts · index.ts        ← ONE adapter
src/browser/storage.ts             StorageGateway wiring (WS4, DL-66)
src/ui/                            ErrorBoundary · VerifyLocatorPanel · primitives · tokens.css
                                   strategy-meta · match-badge · actions · verify-selector-status
                                   copy/{errors,na-reason,rationale,recommendation,verification}
src/runtime/                       capture · dom-read · fact-model · picker · probe
src/storage/                       gateway · migration · state          (WS4)
src/hooks/                         DOES NOT EXIST
src/services/                      DOES NOT EXIST
```

Both panels are **flat entrypoint components**. Everything WS5 calls a hook, a service or a leaf
component is still an inline `useState`, an inline `useCallback` or an inline `function` in the same
file as the markup it feeds. The shared layer that does exist is real but narrow: `src/ui/*` (copy,
primitives, tokens, badges) and `src/runtime/capture.ts`.

## 3. Deliverable matrix

| #   | WS5 deliverable                        | Reality                                                                                                                                                                                                                                                                                        | Verdict          |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | Port `PickSource`                      | Declared; **0 implementations, 0 consumers**; pinned by `pick-source-contract.test.ts` (2)                                                                                                                                                                                                     | 🔴 NOT STARTED   |
| 2   | Port `CommandBus`                      | Declared; 0 implementations. DL-54 found it redundant with the working `RuntimeMessage`/`normalizeAck` seam                                                                                                                                                                                    | 🟡 LOCKED-OUT    |
| 3   | Port `ClipboardPort`                   | Implemented (DL-54), consumed by both panels                                                                                                                                                                                                                                                   | 🟢 DONE          |
| 4   | Port `TabContext`                      | Declared; 0 implementations. Both surfaces resolve tabs inline, **differently** (§5)                                                                                                                                                                                                           | 🔴 NOT STARTED   |
| 5   | Both `PickSource` adapters             | Neither exists                                                                                                                                                                                                                                                                                 | 🔴 NOT STARTED   |
| 6   | 8 hooks                                | `src/hooks/` does not exist                                                                                                                                                                                                                                                                    | 🔴 NOT STARTED   |
| 7   | Services layer                         | `src/services/` does not exist                                                                                                                                                                                                                                                                 | 🔴 NOT STARTED   |
| 8   | Leaf-first component extraction        | Not begun; components are inline in both entrypoints                                                                                                                                                                                                                                           | 🔴 NOT STARTED   |
| 9   | `SidePanel.tsx` 696 → ~120 lines       | **905 lines** — 209 ABOVE the roadmap's own 696 baseline                                                                                                                                                                                                                                       | 🔴 REGRESSED     |
| 10  | `Panel.tsx` → ~80 lines                | **470 lines**                                                                                                                                                                                                                                                                                  | 🔴 NOT STARTED   |
| 11  | `EVAL_SCRIPT` deleted                  | Gone. Only `TAG_SCRIPT` remains — a `setAttribute` on `$0`, no role inference, no visibility rule, no counting                                                                                                                                                                                 | 🟢 DONE          |
| 12  | `network.onNavigated` invalidation     | Landed (DL-54); handler clears the pick rather than re-evaluating a stale `$0`                                                                                                                                                                                                                 | 🟢 DONE          |
| 13  | DevTools theme sync                    | Not attempted. `chrome.devtools.panels.themeName` is nowhere in the repo, and the roadmap's own note ("unverifiable without a real Chrome DevTools session") is still true                                                                                                                     | ⬜ NOT ATTEMPTED |
| 14  | Runtime validation of eval results     | **Partial.** `TAG_SCRIPT`'s boolean return is truthiness-checked and `normalizeAck` is applied, but `ack.pick` is accepted by presence — no schema validation. WS4 introduced exactly this kind of validator (`StateDescriptor.validate`) for storage; the eval/message path has no equivalent | 🟡 PARTIAL       |
| 15  | Delete `element-scorer.ts` + dead code | Audited — never existed under that name                                                                                                                                                                                                                                                        | 🟢 DONE (n/a)    |
| 16  | Error boundaries on both roots         | Both `main.tsx` wrap in `<ErrorBoundary surface="…">`, guarded by `honesty.test.ts`                                                                                                                                                                                                            | 🟢 DONE          |
| 17  | Clipboard with fallback and failure UI | `clipboardPort.writeText` with typed failure in both panels                                                                                                                                                                                                                                    | 🟢 DONE          |

## 4. Exit-criteria classification

| #   | Exit criterion                                                     | Measured                                                                                                                                                                                                                                                                                                                                                         | Class                                                        |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | `SidePanel.tsx` ≤ 150 lines                                        | **905**                                                                                                                                                                                                                                                                                                                                                          | 🔴 RED                                                       |
| 2   | `Panel.tsx` ≤ 100 lines                                            | **470**                                                                                                                                                                                                                                                                                                                                                          | 🔴 RED                                                       |
| 3   | `EVAL_SCRIPT` gone                                                 | Gone; 18 structural guards hold it gone                                                                                                                                                                                                                                                                                                                          | 🟢 GREEN                                                     |
| 4   | Zero `chrome.*` in `ui/`                                           | `grep -rn "chrome\.\|wxt/browser" src/ui/` → **no matches**                                                                                                                                                                                                                                                                                                      | 🟢 GREEN                                                     |
| 5   | Both surfaces produce byte-identical snapshots for identical input | **Structurally satisfied**: `src/runtime/capture.ts::capturePick` is the single builder for both the picker path and `PICK_DEVTOOLS_TARGET`, and `devtools-architecture.test.ts` pins "builds the DevTools pick with the SAME function as the picker". **No byte-level comparison test exists** — identity follows from the shared code path, it is not measured | 🟡 GREEN at structural evidence; byte-level assertion absent |
| 6   | Every pre-existing feature verified by manual regression           | No manual regression record exists; no real-Chrome harness exists                                                                                                                                                                                                                                                                                                | 🔵 BLOCKED — owner-side                                      |

## 5. Measured divergence between the two surfaces

Phase 0 claimed "~500 duplicated lines, already diverged in seven ways". That claim was re-measured
here symbol by symbol, comparing whitespace-normalised, comment-stripped declarations.

**Shared symbols that are genuinely identical** (safe to extract mechanically):

| Symbol             | SidePanel | Panel | Verdict       |
| ------------------ | --------- | ----- | ------------- |
| `MainTab`          | ✔         | ✔     | **IDENTICAL** |
| `PwLang`           | ✔         | ✔     | **IDENTICAL** |
| `ActionOption`     | ✔         | ✔     | **IDENTICAL** |
| `LANGS`            | ✔         | ✔     | **IDENTICAL** |
| `NO_ACTION`        | ✔         | ✔     | **IDENTICAL** |
| `getDefaultAction` | ✔         | ✔     | **IDENTICAL** |
| `LocatorRow`       | ✔         | ✔     | **IDENTICAL** |
| `XPathRow`         | ✔         | ✔     | **IDENTICAL** |

**Divergences found — seven, all real:**

| #   | Divergence                                                                                                                                                                                                                              | Kind            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| D-a | `ALL_GETBY_KINDS.naReason` differs for **6 of 7** kinds. Side Panel: "No `<label>` found — add `<label for="...">` or wrap element in `<label>`." DevTools: "No `<label>` associated." Same element, less actionable answer in DevTools | Product copy    |
| D-b | **`.dblclick()` is entirely absent from the DevTools panel.** `getContextualActions` offers it in three Side-Panel branches (12 source occurrences) and **zero** in DevTools                                                            | **Capability**  |
| D-c | Action `hint` copy truncated in DevTools ("Clicks" vs "Clicks the element"; "Selects option" vs "Selects a dropdown option — replace `''` with value")                                                                                  | Product copy    |
| D-d | `CSSRow` accepts a pre-computed `variant.code` in the Side Panel; the DevTools copy has no such branch                                                                                                                                  | Behaviour       |
| D-e | Code buffer: Side Panel persists through the WS4 gateway with failure surfacing; **DevTools is in-memory only** and loses the workspace when DevTools closes                                                                            | **Persistence** |
| D-f | Tab resolution: Side Panel `browser.tabs.query({active:true,currentWindow:true})`; DevTools `chrome.devtools.inspectedWindow.tabId`. **These are not the same tab** when DevTools is undocked or the user switches tabs                 | **Correctness** |
| D-g | Messaging: Side Panel uses `browser.runtime.sendMessage` (`wxt/browser`); DevTools uses raw `chrome.runtime.sendMessage` (3 sites)                                                                                                      | Consistency     |

`RecommendedCard` differs **only** by prop order and one local variable name — no behavioural
divergence. DL-45/DL-48/DL-54 kept it local deliberately; this gate did not reopen that.

`chrome.*` usage in `Panel.tsx` (11 sites): `inspectedWindow.eval` ×1, `inspectedWindow.tabId` ×3,
`network.onNavigated` add/remove, `panels.elements.onSelectionChanged` add/remove,
`runtime.sendMessage` ×3. None is inside `src/ui/`, so exit criterion 4 is unaffected — but the last
three are the seam divergence D-g.

## 6. Lifecycle findings

- `entrypoints/devtools/main.ts` calls `browser.devtools.panels.create` once and does nothing else.
  The returned panel object is discarded — **`onShown` / `onHidden` are not used anywhere.**
- The panel page therefore mounts once per DevTools session and never re-hydrates on becoming
  visible. Today that is harmless because all its state is in-memory. **It stops being harmless the
  moment the DevTools buffer is persisted** (D-e / O1).
- `Panel.tsx` subscribes to `panels.elements.onSelectionChanged` and `network.onNavigated` and
  unsubscribes on unmount; both are guarded.
- Whether `storage.session` is reachable from a DevTools panel page, when the panel page is created,
  and whether it survives a DevTools dock/undock **cannot be established in this repository** — there
  is no real-Chrome harness. Chrome's documented behaviour is not evidence and is not asserted here.

## 7. Error model, accessibility, security

**Error model.** Both panels already consume WS8's matrix through the shared `ErrorNotice`. The
Side Panel raises `CONTENT_SCRIPT_UNREACHABLE`, `NO_ACTIVE_TAB`, `PICKER_FAILED`,
`STORAGE_WRITE_FAILED`; DevTools raises `CONTENT_SCRIPT_UNREACHABLE`, `DEVTOOLS_EVALUATE_FAILED`,
`ELEMENT_READ_FAILED`. The split is **surface-appropriate, not a divergence** — DevTools has no
picker and no storage writes today. If O1 gives DevTools a persisted buffer it must also gain
`STORAGE_WRITE_FAILED`, or a failed DevTools write would vanish exactly as Side-Panel writes did
before WS4.

**Accessibility.** Both panels have a mounted `role="status" aria-live="polite"` region (Side Panel
2, DevTools 1) and accessible names on icon-only buttons (Side Panel 3 `aria-label`, DevTools 2).
`a11y-structure.test.ts` scans both panels through a path list. axe-core is **still not run and not
claimed** — R3 keeps the extension project on `environment: 'node'`, and DL-62 already recorded that
deferral.

**Security / privacy.** The only remaining eval is `TAG_SCRIPT`: a `setAttribute` on `$0` returning a
boolean, containing no locator intelligence, pinned by `devtools-architecture.test.ts`. No `new
Function`, no dynamic import, no network, no telemetry, no `storage.sync` in either panel. Privacy
suite 11/11 at both the source and built-bundle layers. **WS5 extraction changes none of this, and
must not**: any extracted component that reached for `chrome.*` would break exit criterion 4, and any
that imported `wxt/browser` outside `src/browser/**` or `entrypoints/**` would trip R1 — the same
guard that relocated WS4's adapter mid-implementation.

## 8. Test-infrastructure reality check — the central WS5 risk

**Sixteen test files read the two panels' source text**, containing 220 `it()` blocks in total:

| Guard style                                                                                  | Files                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Path-**list** driven (`PANELS` / `RENDERED_UI`) — extension means adding paths               | `a11y-structure` · `hex-token-migration` · `honesty` · `panel-truthfulness` · `primitives` · `recommendation-ui` · `verify-selector-status` (7) |
| Per-file constants (`SIDE_PANEL` / `DEVTOOLS_PANEL` / `PANEL`) — each assertion needs review | `clipboard-wiring` · `devtools-architecture` · `error-states` · `recommendation-parity` · `storage-consumers` · `verify-locator-panel` (6)      |
| Inline single-file reads                                                                     | `match-counts` · `preview-gate` · `tokens` (3)                                                                                                  |

Every one of these asserts on **the text of a file**. Moving a component out of `SidePanel.tsx` moves
the text those guards search for. The failure mode is not a red test — it is a guard that still
passes while no longer guarding anything, because the string it was looking for is now in a file it
does not read. **This, not "high risk" in the abstract, is what makes WS5 the gate.**

**A capability DL-54/DL-55 did not weigh.** Those entries recorded "no real-Chromium/e2e regression
infrastructure" — still true. But this repository **does** have a working, established
component-render pattern: per-file `// @vitest-environment happy-dom` plus `react-dom/client` and
`act`, already used by `test/tabs.test.ts` (21 tests) and `test/showcase.test.ts` (4), with
`happy-dom` a declared devDependency and R3 untouched (the override is per file, not project-wide).
That is a genuine, in-repo way to prove that an extracted leaf renders identically for identical
props. **It is not Chromium and is not offered as Chromium evidence** — but it is the difference
between extracting blind and extracting with a net, and it was available and unused when the
extraction was last deferred.

## 9. Failure-first plan (tests to write BEFORE any extraction)

| ID  | Failure to make impossible                                                              | Provable how                                                                                 |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| F1  | An extracted leaf renders different DOM than the inline original for identical props    | happy-dom render, per-file                                                                   |
| F2  | A source-text guard keeps passing after its target text moved to another file           | Structural: assert each guard's path list covers every file that can now contain the pattern |
| F3  | A divergence is "unified" by silently changing one surface's product behaviour          | Pin D-a…D-d as they are, then change only under an owner decision                            |
| F4  | `.dblclick()` silently appears in, or disappears from, either surface                   | Structural + render                                                                          |
| F5  | DevTools writes the shared global `CODE_BUFFER` and clobbers the Side Panel's workspace | Unit, against the WS4 fake backend                                                           |
| F6  | DevTools binds tab-scoped state to the **active** tab instead of the **inspected** tab  | Structural + unit                                                                            |
| F7  | Picking in DevTools silently changes what the Side Panel displays (`LAST_PICK` write)   | Unit                                                                                         |
| F8  | A `watch()` callback overwrites an in-flight local edit, or desynchronises the undo ref | Unit                                                                                         |
| F9  | A failed DevTools buffer write vanishes without an error state                          | Unit + structural                                                                            |
| F10 | An extracted component imports `wxt/browser` outside the permitted directories          | R1 lint (already exists)                                                                     |
| F11 | An extracted component carries `chrome.*` into `src/ui/`                                | Structural (exit criterion 4)                                                                |
| F12 | Extraction duplicates shared code into both panel chunks instead of sharing it          | Built-bundle size comparison                                                                 |
| F13 | The DevTools panel misses a storage change that arrived while it was hidden             | **NOT PROVABLE HERE** — real Chrome                                                          |
| F14 | Visual neutrality across a real page                                                    | **NOT PROVABLE HERE** — real Chrome                                                          |

F13 and F14 are named so they are not mistaken for covered.

## 10. Owner decisions required

**O1 — DevTools code-workspace ownership (D1).** WS4 O2 made `pg_code_buffer` a GLOBAL "one user
workspace" and explicitly left "DevTools code-buffer persistence … WS5 scope". Three options:
(a) DevTools joins the same global buffer — one workspace, both surfaces, live-synced by `watch()`;
(b) DevTools gets its own descriptor — two independent workspaces; (c) DevTools stays in-memory.
This is a product question, not a technical one, and it decides F5/F8/F9.

**O2 — Tab association (D2).** If DevTools reads any tab-scoped WS4 state it must key on
`chrome.devtools.inspectedWindow.tabId`, **never** the active tab (D-f). Separately: should the
DevTools `$0` pick be written to that tab's `LAST_PICK`? Doing so makes a DevTools selection change
what the Side Panel shows. The roadmap does not define this. **Not decided here.**

**O3 — Panel lifecycle (D3).** `onShown`/`onHidden` are unused. If O1 is (a) or (b), does the panel
re-hydrate on `onShown`, rely solely on `watch()`, or both? Note F13 is unprovable in this repo.

**O4 — Divergence resolution (D4).** Each of D-a…D-d must be resolved _before_ the corresponding
symbol can be shared, and every resolution changes one surface's behaviour. Recommended default:
adopt the Side Panel's fuller copy and its `.dblclick()` action for both, because the shorter
DevTools strings look like drift rather than a decision — but **this is a product call and is not
being made here.**

**O5 — Concurrency (D5).** With a shared global buffer, both surfaces write the same key with
independent undo refs. Last-write-wins is what WS4's gateway does today. Is that accepted, or is a
merge/lock semantics required? WS4 explicitly forbade inventing product numbers; the same restraint
applies here.

**O6 — Message seam (D6).** DL-54 locked `CommandBus` as redundant and this gate does not reopen it.
The remaining question is narrow: should `Panel.tsx` switch its three `chrome.runtime.sendMessage`
calls to `browser.runtime.sendMessage` for one seam across both surfaces (R1 permits it in
`entrypoints/**`), or is the split accepted?

**O7 — Is `≤150` / `≤100` still the exit bar?** `SidePanel.tsx` is **905 lines**, not the 696 the
roadmap's deliverable line assumes — WS4, WS6.2, WS7 and WS8 all added to it legitimately. Reaching
≤150 is a ~6× reduction across a file that 16 text-reading test files depend on. The bar is either
re-affirmed as-is, re-based on the real 905, or replaced with a staged target. This is the same class
of question WS8 raised about `§20.6`, and it is put to the owner rather than quietly softened.

**O8 — Manual regression (exit criterion 6).** No harness exists and none may be added (WS4 O4 still
stands: no `@playwright/test`, Puppeteer, Selenium, `jsdom` or Chromium infrastructure). Either the
owner performs the manual regression and records it, or the criterion is re-scoped to the
structural/happy-dom evidence level, explicitly, the way DL-62 re-scoped WS8's.

## 11. Recommended bounded implementation sequence

Proposed only. **Not authorised, not started.**

| Stage | Content                                                                                                                                                       | Needs           | Risk    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------- |
| A     | Extract the **8 verified-identical symbols** (§5) into a shared module. Mechanical; the extraction test can assert the moved text equals what both files held | none            | Lowest  |
| B     | Add happy-dom render tests for the leaves being extracted, **before** extracting them; extend every path-list guard (F2)                                      | none            | Low     |
| C     | Resolve D-a…D-d per O4, one at a time, each with its own pinned test                                                                                          | **O4**          | Medium  |
| D     | DevTools persistence + tab binding                                                                                                                            | **O1,O2,O3,O5** | Medium  |
| E     | Seam unification                                                                                                                                              | **O6**          | Low     |
| F     | Hooks / services layer and the line-count target                                                                                                              | **O7**          | Highest |

Stage A alone removes roughly 100 lines from `SidePanel.tsx` and 80 from `Panel.tsx` at zero
behavioural risk. It does **not** reach ≤150/≤100 and is not presented as doing so.

## 12. What this gate did not do

No production source file was touched. No dependency added. No guard weakened. No divergence
resolved. WS4 was not reopened (and no WS4 regression was found). The bundle overage was not chased.
WS6.3, WS9 and WS10 were not started. `RECORDING_ENABLED` remains `false`. No real-browser evidence
is claimed anywhere in this report.

**WS5 STATUS: PARTIAL — DISCOVERY COMPLETE, IMPLEMENTATION NOT AUTHORISED.**
