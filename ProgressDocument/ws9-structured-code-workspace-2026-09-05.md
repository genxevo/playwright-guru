# WS9 — STRUCTURED CODE WORKSPACE

**2026-09-05 · DL-81 · Owner-authorised implementation gate.**
**`RECORDING_ENABLED` is still `false`. WS9 is still PARTIAL and is NOT complete.**

## 1. Verdict

**IMPLEMENTED** as a read-only review surface.

## 2. Owner Decision

**Authorised and built:** the smallest honest surface that lets a user _review_ a stored
`RecordedWorkflow` as generated Playwright code, in the language the panel is already set to, with
the existing copy control and honest empty/unavailable/error states.

**Intentionally excluded, by rule:** editing of any kind, locator editing, selector-strategy choice,
assertions, action count, reordering/insertion/deletion, workspace persistence, download, migration,
navigation/SPA/frame/tab semantics, cross-tab recording, browser-restart recovery, legacy deletion,
a code-editor dependency, and any change to `RECORDING_ENABLED`.

## 3. Discovery

| Seam                             | Finding                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `renderSpecFile`                 | Exists, pure, seven targets (DL-75). **Reused; no second renderer**                                                               |
| `readDurableWorkflow`            | Exists (DL-80), read-only, fails closed four ways. **Reused; no `readWorkspaceWorkflow`**                                         |
| `validateWorkflow`               | Exists (DL-78). **Reused; no duplicate validator**                                                                                |
| `panel.pick.tabId`               | Authoritative bound tab (DL-79). **Reused; no second active-tab query**                                                           |
| `CopyButton` → `clipboardPort`   | Exists in `ui/primitives.tsx`, already `ClipboardPort`-based with typed failure. **Reused**                                       |
| `panel.lang`                     | The in-memory language export already uses. **Reused; no second language model**                                                  |
| `ElementHtml`                    | The house pattern for a collapsible, text-rendered code region. **Followed**                                                      |
| **`ui/panel/CodeWorkspace.tsx`** | **A DIFFERENT THING** — see §3.1                                                                                                  |
| `PanelFrame`'s `banner` slot     | Documented as "the Side Panel's recording strip (WS9, flag-gated)". **Mounted there — PanelFrame unchanged, DevTools unaffected** |

### 3.1 The naming collision, handled rather than inherited

WS5 already ships a component called `CodeWorkspace`. It is **the user's locator code buffer** —
lines they append from picks, with Undo, Clear and per-line Remove, persisted in `CODE_BUFFER`.
DL-76 warned explicitly against confusing it with export/recording work.

This slice therefore adds **`RecordingWorkspace`**, does not touch, import or extend
`CodeWorkspace`, and adds no storage descriptor. Two guards pin it: the WS5 component still names
neither `renderSpecFile` nor `RecordedWorkflow`, and the WS4 descriptor set is exactly the existing
six.

## 4. Architecture

```
                 SidePanel  (panel.pick.tabId, panel.lang)
                      │  injected: bound tab + read-only gateway
                      ▼
          readDurableWorkflow            src/services/recording-workflow.ts  (DL-80, reused)
                      │  read-only · fails closed
                      ▼
              RecordedWorkflow           (the EXISTING model, unchanged)
                      │
                      ▼
          buildWorkspaceView             src/recording/workspace.ts — PURE
                      │  validateWorkflow (reused) → renderSpecFile (reused)
                      ▼
               WorkspaceView             { state, language, code, hasWorkflow }
                      │
                      ▼
          RecordingWorkspace             read-only <pre><code>, collapsed by default
                      │
                      └──▶ CopyButton ──▶ ClipboardPort ──▶ BrowserClipboardAdapter
```

The dependency direction is unchanged and one-way: DOM → DomProbe → LocatorResolver → verified
`LocatorChain` → `RecordedWorkflow` → `renderSpecFile` → workspace. **Never** workspace → resolver,
workspace → DOM, workspace → selector synthesis, workspace → a second renderer.

## 5. Review-First Boundary

| Claim                | How it is proven                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No editing           | `textarea`, `contentEditable`, `Monaco`, `CodeMirror` and `onChange={` are each forbidden by name                                                                      |
| No locator editing   | no locator field, no `selector strategy`, no `onReorder`/`onDelete`/`onInsert`                                                                                         |
| No assertions        | `assert` forbidden in the surface                                                                                                                                      |
| No action count      | no `actionCount`, no `steps.length`, and no `/\d+ actions?/` anywhere in the surface                                                                                   |
| No workflow mutation | the workflow is byte-identical after projecting it in all seven languages; `.sort(`, `.splice(`, `.reverse(`, `.push(`, `.shift(` forbidden                            |
| No persistence       | the descriptor set is asserted to be exactly the existing six; `CODE_BUFFER`, `code-buffer`, `useCodeWorkspace` and `CodeWorkspace` are all forbidden in the new files |

**Why this is architecture rather than scope.** A recorded `LocatorChain` is a _verified_ artifact,
measured once at capture against a live DOM by the one probe and the one resolver. Allowing an edit
creates a question — "is an edited locator still verified?" — whose only honest answers require
re-running the verification this layer is forbidden to run. So the workspace shows, and copies.

## 6. What Changed

**Production: created 2 · modified 2 · deleted 0.** (No git repository; the documented
modification-time drift sweep is the inventory method. No unrelated file changed.)

| File                                           | Change                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `src/recording/workspace.ts`                   | **NEW** — the pure projection and its four states                      |
| `entrypoints/sidepanel/RecordingWorkspace.tsx` | **NEW** — `useRecordingWorkspace` + the read-only review component     |
| `entrypoints/sidepanel/SidePanel.tsx`          | Wires the bound tab, the gateway and the language; renders the surface |
| `src/ui/primitives.tsx`                        | `CopyButton` gains an **optional** `label` for an accessible name (§9) |

**Tests: created 1 · modified 1.** `test/ws9-code-workspace.test.ts` (new, 70) ·
`test/preview-gate.test.ts` (one guard **widened**, §10).

**Documentation:** `DECISION-LOG.md` (DL-81) · `MASTER-ROADMAP.md` · `CURRENT-STATE.md` ·
`PROGRESS.md` · this report.

## 7. Tests

**Failure-first, verified as such.** The suite failed on `Cannot find module
'../src/recording/workspace'` before a single production line existed.

| Suite          | Before    | After     | Δ       |
| -------------- | --------- | --------- | ------- |
| locator-engine | 383       | 383       | 0       |
| codegen        | 127       | 127       | 0       |
| extension      | 1,215     | 1,285     | **+70** |
| **Total**      | **1,725** | **1,795** | **+70** |
| Files          | 63        | 64        | +1      |

**WS1 codegen goldens 127/127 — unchanged and untouched. No golden was modified.**

The W1–W40 / F1–F50 matrix is covered, behaviourally where behaviour exists: per-language
byte-equality against `renderSpecFile`; the durable reader against a real gateway with a fake area;
a zero-write assertion across repeated reads; nine malformed/untrustworthy inputs; and a hostile
`<img src=x onerror=alert(1)>` value driven end-to-end.

## 8. Build / Typecheck / Lint / Format

Each command run **alone**, exit code read individually.

| Command             | Exit  | Detail                                                         |
| ------------------- | ----- | -------------------------------------------------------------- |
| `pnpm -r test`      | **0** | 1,795 / 64 files                                               |
| `pnpm -r build`     | **0** | Σ 319,841 B                                                    |
| `pnpm typecheck`    | **0** | —                                                              |
| `pnpm lint`         | **0** | no errors, no warnings                                         |
| `pnpm format:check` | **1** | **only** `ws2-item9-report.md` — the known permanent exception |

**Verification is NOT all green**, and is not described as such.

## 9. Security / Privacy

- **A withheld password never reaches the screen.** Asserted across all seven languages; the
  renderer's `value withheld (password)` comment is what appears instead.
- **A smuggled secret is refused**, and the refusal itself contains no secret.
- **The session id appears in neither the code nor the view object.**
- **The view carries nothing else either** — no facts, ancestors, attributes, verdicts or step
  counts.
- **Nothing logs**: neither new file contains a `console.` call.
- **No network, no telemetry, no new permission, no new dependency.**
- **No HTML injection surface**: `innerHTML`, `dangerouslySetInnerHTML`, `insertAdjacentHTML`,
  `eval`, `new Function` and `document.write` are all forbidden by name, and generated code is a
  React text child inside `<pre><code>`.
- **Playwright-only**: Selenium, Cypress, WebdriverIO, Puppeteer and Robot Framework are forbidden
  by name in both files.

**Accessibility.** The code region carries an `aria-label` naming the language, is focusable so long
code can be scrolled from the keyboard, and holds no nested interactive control. State is announced
through an always-mounted `role="status" aria-live="polite"` region rather than by colour. The copy
control gained a real accessible name — see §10.

## 10. Architecture Guards

**New**, scoped precisely to the two new modules (and to the WS5 file only to prove it is untouched):
no resolver/probe/verifier/scorer import · no `generateLocatorCode`, `page.locator(` or `getBy*`
synthesis · `renderSpecFile` is used · no storage write · no raw storage API · no active-tab query ·
no lifecycle or session mutation · no heartbeat · no start/stop · no download · no logging · no
network · no `eval`/`new Function` · no HTML injection · no editable surface · no locator editing ·
no action-count UI · no second language model · `CopyButton`/`ClipboardPort` is the copy seam ·
`readDurableWorkflow` is the reader · the bound tab is the panel's · the descriptor set is unchanged
· WS5's `CodeWorkspace` is untouched.

**Widened, none weakened.** `preview-gate.test.ts` already required the
`if (!RECORDING_ENABLED) return null;` early return for every component in `RecordingControl.tsx`
and, since DL-80, `ExportControl.tsx`. The review surface is a **third** recording affordance: with
the flag off no recording can exist, so it would render a permanently empty "Recorded test" section
— the dead affordance DL-76 refused to ship. Rather than repeat the check a third time by hand, the
rule now iterates a list of recording-surface files. The claim is identical and now applies to more
code.

**One additive primitive change, explained.** `CopyButton`'s visible content is `📋`, so a screen
reader announced "📋" or nothing — the same defect WS8 fixed for the other icon-only buttons. It
gained an **optional** `label`; every existing call site is unchanged, and a caller that supplies
one also gets the copy outcome announced through that name instead of by colour.

## 11. Bundle

| Artifact         | Before    | After     | Δ        |
| ---------------- | --------- | --------- | -------- |
| **Total**        | 319,185 B | 319,841 B | **+656** |
| sidepanel chunk  | 15,059 B  | 15,614 B  | +555     |
| shared `tokens`  | 90,738 B  | 90,839 B  | +101     |
| **`content.js`** | 48,073 B  | 48,073 B  | **0**    |
| `background.js`  | 11,449 B  | 11,449 B  | **0**    |
| shared `client`  | 142,932 B | 142,932 B | **0**    |
| devtools panel   | 1,386 B   | 1,386 B   | **0**    |

Per-artifact deltas sum to exactly the total.

**`content.js` Δ 0 B is the measured proof of §41's requirement** — no workspace symbol reaches the
content script.

**The delta is small for a measured reason.** DL-80's export slice was the renderer's **first**
consumer and already paid its +5,240 B; the workspace reuses that reachability and pays only for its
own projection and component.

**A second measurement worth recording:** the review UI's own strings — "Recorded test", "No
recording stored for this page yet." — appear in **no shipped bundle at all**. With
`RECORDING_ENABLED` false the component's early return is constant-folded and its markup eliminated.
What ships is the hook and the pure projection. The hook still performs one fail-closed read per
tab/language change while the flag is off — exactly as `useExport` does; it writes nothing and
returns `unavailable`, and consistency with the existing shape was preferred over a special case.

**Ceiling 278,760 B — over by 41,081 B (14.74 %).** Disclosed, not chased. No speculative
refactoring, no module split, no duplication to lower the number.

## 12. Real Chromium

**NOT RUN.** No Side Panel was opened, no code was really displayed, no clipboard was really
written, no service worker restarted. There is no real-browser harness in this repository and none
was built.

## 13. Manual Regression

**NOT RUN.** It is not inferred from unit tests.

## 14. Deferred

Download export · action count · v1 raw-line migration · navigation / SPA semantics · frame / tab
semantics · cross-tab recording · browser-restart recovery · legacy-recorder and legacy-renderer
deletion · real-browser infrastructure · language-preference persistence · **flipping
`RECORDING_ENABLED`**.

## 15. Known Debt

- `storage-migration.test.ts`'s `'42'` timestamp assertion (DL-77) — green on every run here.
- The `stripComments` helper hazard (DL-78).
- The bundle overage, 41,081 B / 14.74 %.
- **The `PW_LANG` / `TargetLanguage` mismatch (DL-80):** the validator accepts `python`/`csharp`
  while the selector offers `python_sync`/`csharp_async`, so choosing Python or C# writes a value the
  validator rejects and the preference is silently dropped. The workspace is unaffected — it uses the
  same in-memory `panel.lang` export already uses — and the persistence mismatch remains deferred, as
  this gate required.
- **No new debt was discovered.**

## 16. Documentation

**DL-81**, class `CURRENT`; no history rewritten. `MASTER-ROADMAP.md` (workspace block + status
row) · `CURRENT-STATE.md` · `PROGRESS.md` · this report. **WS9 remains PARTIAL / IN PROGRESS.**

## 17. Backup

`ws9-structured-code-workspace-2026-09-05.zip` — full source tree excluding `node_modules`,
`.output`, `dist`, `.wxt` — delivered to `E:\Codes\playwrightguru`.

## 18. Remaining WS9 Work

Download export · v1 raw-line migration · truthful action count · navigation / SPA semantics ·
frame / tab semantics · cross-tab recording · browser-restart decision and recovery ·
legacy-recorder deletion · legacy-renderer deletion · real-browser infrastructure · final recording
validation · `RECORDING_ENABLED` flip.

## 19. HARD STOP

**No further roadmap work was performed.** Download, migration, the action count, navigation, SPA,
frames, tabs, cross-tab recording, browser-restart recovery, legacy deletion, WS10 assertions and
WS11 release were not begun, and `RECORDING_ENABLED` was not changed.
