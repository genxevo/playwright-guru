# WS9 — SLICE 5: EXPORT MENU — **BLOCKED**

**2026-09-05 · DL-76 · Discovery only. Zero production files created, modified or deleted.**

## 1. Verdict

**BLOCKED — owner decision required.**

The export layer has no way to obtain a `RecordedWorkflow`, and cannot be given one inside this slice's
boundary. Building an export menu today would produce a control permanently stuck in its empty state,
because `RECORDING_ENABLED = false` means no workflow can exist at all.

Per §36's Definition of Done, the condition **"current RecordedWorkflow can reach export without new
persistence"** cannot be ticked. No production code was written. The repository is byte-identical to its
state at the end of DL-75.

## 2. Authoritative Boundary

§14 of the WS9 discovery gate does sequence this slice: _"`renderAction`/`renderSpecFile`, **the export
menu** and the structured workspace follow"_, and the renderers landed at DL-75. **The slice is
authorised; it is the prerequisite that is missing**, which is a different thing from an unauthorised
slice and is why this is BLOCKED rather than out of scope.

## 3. Discovery

Answering the questions §3 required, by measurement:

| #   | Question                                     | Finding                                                                                     |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A   | Where is the workflow held?                  | Only in `runtime/recording.ts`'s content-side session closure                               |
| B   | Is it available to SidePanel/DevTools/other? | **No.** `rt.workflow()` has **zero callers** outside its own module and tests               |
| C   | Existing export/download abstraction?        | **None.** Zero hits for `download`, `Blob`, `URL.createObjectURL`, `chrome.downloads`       |
| D   | Existing clipboard abstraction?              | **Yes** — `ClipboardPort`, `clipboardPort`, `useCopyAll`. Would have been reused            |
| E   | Authoritative export owner?                  | Only `RecordingControl` (SidePanel) touches recording, and it returns `null` while gated    |
| F   | How is `TargetLanguage` represented?         | 7 values; `PwLang = TargetLanguage` — one language set                                      |
| G   | Does `renderSpecFile` accept all languages?  | **Yes** — all 7, proven in DL-75                                                            |
| H   | `renderSpecFile` behaviours                  | empty → `''`; redacted/refused → language-correct comment in place; order preserved exactly |
| I   | **Is persistence required for access?**      | **See §3.1 — the answer is subtler than "yes"**                                             |
| J   | Existing code buffer to not confuse?         | **Yes** — WS4's `code-buffer` is WS5's _workspace_ buffer, explicitly out of scope here     |
| K   | Legacy path still live?                      | **Yes, and it is a trap** — see below                                                       |
| L   | Existing menu/action surface?                | None suitable; `RecordingControl` is flag-gated and its state is permanently empty          |

**The four independent proofs that the workflow is unreachable:**

1. **One holder.** `RecordedWorkflow` appears only in `src/recording/**` (the model) and
   `src/runtime/recording.ts`, where it lives inside a module closure.
2. **No consumer.** `rt.workflow()` has **zero callers** in `src/` or `entrypoints/`.
3. **No message.** The `RuntimeMessage` union has nine members and **not one** carries workflow data;
   `RuntimeMessageAck` carries only `sessionId` and counts.
4. **No storage slot.** WS4 defines exactly four descriptors — `code-buffer`, `pw-lang`,
   `picker-active`, `last-pick`. None is a recording workflow.

**The legacy path is a trap, not a shortcut.** `RecordingControl` holds `recordedActions`, but
`setRecordedActions` is called exactly twice and **both calls pass `[]`** — so the flag-gated Copy button
copies `generateTestCode([], lang)`, which returns `''`. It is also the OLD raw-attribute
`RecordedAction`, rendered through the legacy `attrsToLocatorCode` that fabricates
`page.locator('<tagName>')` — the exact path DL-75 forbade the verified renderer from using. Building
export on it would resurrect a fabrication this workstream just removed.

### 3.1 The blocker chain — and why "persistence" is the wrong single word

```
export needs a RecordedWorkflow
  → the only holder is a LIVE content-side session
    → a session exists only if rt.start() succeeds
      → start() FAILS CLOSED on RECORDING_ENABLED = false      [DL-74 made the flag a runtime gate]
        → the flag cannot honestly flip until:
            • the recording UI reads lifecycle state, not a local boolean, and
            • the controller-side liveness marker has a consumer outliving the content script
```

So the missing prerequisite is not only durable storage — it is that **a workflow cannot come into
existence at all** while the flag is off. Persistence would additionally be required for a workflow to
survive the content script (navigation, reload, tab discard), which is why the roadmap sequences it
alongside this work.

**The obvious workaround was considered and rejected.** A `GET_RECORDING_WORKFLOW` message would be an
in-memory handoff rather than persistence, and the workflow is `structuredClone`-safe (proven in slices
3–4), so it would cross the seam cleanly. It was not implemented because (a) it is **new plumbing**, not
the "already-existing approved state seam" §15 permits, and (b) it would not help: with the flag off,
`rt.workflow()` returns `null` in production. It would add a message type and a dead menu while changing
nothing a user can observe.

## 4. Implemented

**Nothing.** No production file was created, modified or deleted. The modification-time drift sweep is
empty. (`git` is unavailable in this repository, as in every prior slice, so the documented sweep is the
inventory method.)

Documentation was updated to record the finding, which is the established behaviour for a blocked gate
(DL-63 and DL-69 set the precedent).

## 5. Export Architecture

Not built. The intended flow remains, for whoever takes it up after the owner decision:

```
RecordedWorkflow  →  renderSpecFile(workflow, lang)  →  export action  →  copy (ClipboardPort) / download
```

`renderSpecFile` already exists and is complete (DL-75). Only the **first arrow** — getting a workflow
into a UI context — is missing, and it is the one this slice may not build.

## 6. Trust Boundary

Untouched, and deliberately so. Nothing in this gate resolved a locator, queried a DOM, ranked a
selector, inspected `nth`/`verdict`/`visibleMatchCount`, or reinterpreted trust. The admission rule
remains in `runtime/recording.ts`; the renderer remains a pure projection; WS6.2's and WS7's guarantees
are unaffected.

## 7. Privacy / Security

No new code, so no new surface. Validation confirms the existing guarantees still hold: privacy 11/11,
honesty 18/18, and the WS9 slice 1–4 suites all green, including the throwing-getter tests that prove
sensitive values are never read.

Notably, **not** doing this slice avoided a privacy hazard: the only currently-reachable "export" path is
the legacy one, whose fabricated `page.locator('<tagName>')` output would have looked like a working
locator while being unverified.

## 8. Accessibility

Not applicable — no controls were added. Had the slice proceeded, WS2/WS8 conventions and the existing
shared primitives would have been used.

## 9. Tests

No test file was added, because there was no production surface to test failure-first against, and
writing tests for an unbuilt, unauthorised design would invert the discipline.

**Baseline = final, unchanged:**

| Suite          | Result                                             |
| -------------- | -------------------------------------------------- |
| `pnpm -r test` | **1,449 / 1,449 passed, 59 files**                 |
| locator-engine | 383                                                |
| codegen        | 127 — including **127/127 WS1 goldens, untouched** |
| extension      | 939                                                |

## 10. Build / Typecheck / Lint / Format

Run anyway, each command alone with its own exit code, to prove the tree is clean and untouched.

| Command             | Exit | Detail                                                         |
| ------------------- | ---- | -------------------------------------------------------------- |
| `pnpm -r test`      | 0    | 1,449 / 59 files                                               |
| `pnpm -r build`     | 0    | Σ 308,201 B                                                    |
| `pnpm typecheck`    | 0    | —                                                              |
| `pnpm lint`         | 0    | no errors, no warnings                                         |
| `pnpm format:check` | 1    | **only** `ws2-item9-report.md` — the known permanent exception |

## 11. Bundle

| Artifact        | Baseline  | Final     | Delta   |
| --------------- | --------- | --------- | ------- |
| Total           | 308,201 B | 308,201 B | **0 B** |
| `content.js`    | 47,537 B  | 47,537 B  | 0 B     |
| `background.js` | 9,746 B   | 9,746 B   | 0 B     |
| sidepanel chunk | 7,801 B   | 7,801 B   | 0 B     |
| devtools panel  | 1,386 B   | 1,386 B   | 0 B     |
| shared `client` | 142,932 B | 142,932 B | 0 B     |
| shared `tokens` | 89,251 B  | 89,251 B  | 0 B     |

**Ceiling 278,760 B — over by 29,441 B (10.56 %), unchanged.** That is the cost DL-75 accepted
temporarily; it was neither chased nor grown, and no optimisation was attempted.

## 12. Real Browser

**Real Chromium: NOT RUN.** No browser behaviour was introduced, so none could be verified. No manual,
DevTools or production verification was performed or is claimed.

## 13. Files Changed

**Production source: created 0 · modified 0 · deleted 0.** Drift sweep empty.

Documentation only: `DECISION-LOG.md` (DL-76 added) · `MASTER-ROADMAP.md` (WS9 header, a slice-5 block,
the §30 row) · `CURRENT-STATE.md` · `PROGRESS.md` · this report.

## 14. Documentation

Decision log entry **DL-76**, class `CURRENT — REQUIRES OWNER DECISION`. No historical entry was
rewritten. WS9 is **not** marked complete anywhere, and slice 5 is not recorded as delivered.

## 15. Backup

`ws9-slice5-export-menu-2026-09-05.zip` — full source tree excluding `node_modules`, `.output`, `dist`,
`.wxt` — delivered to `E:\Codes\playwrightguru`.

## 16. Remaining WS9 Work

**Export menu (this slice — blocked)** · structured code workspace · workspace v1 raw-line migration ·
persistence · recording UI · controller-side liveness marker · navigation / SPA / frame / tab handling ·
legacy-recorder deletion · legacy-renderer deletion · `RECORDING_ENABLED` flag flip.

**Debt carried forward, unchanged:** the accepted bundle overage · `snapshot.ts`'s stale
`RecommendedLocator.stepCounts` doc comment (DL-72) · `storage-migration.test.ts`'s ~6.9 % flake ·
WS6.1's unstarted items and self-contradiction · WS3's deferred IIFE build and CI benchmarks · no
real-browser infrastructure anywhere.

## 17. Next Authorized Step

**An owner decision on the three options below.** No recommendation is offered, and nothing was changed
to pre-empt the choice.

**(a) Re-sequence.** Build the recording UI and the controller-side liveness marker first — the two items
that gate the flag — then return to export. This is the order §14's own dependencies imply, and it is the
only option in which export ends up usable rather than merely present.

**(b) Authorise workflow persistence as its own slice.** A fifth WS4 descriptor for the recorded
workflow. Export then has a source that survives the content script, and the liveness marker gains its
consumer at the same time. This unblocks two items at once, at the cost of opening a storage-schema
decision the roadmap currently sequences later.

**(c) Authorise a narrower export slice, explicitly scoped as a pure unwired projection layer** —
filename/MIME/content decisions plus the `ClipboardPort` seam, no menu, no UI — accepting that it ships
unreachable exactly as slices 1–4 did. Noted honestly: the argument that justified those slices is
**weaker** here, because their remaining half was more domain logic, whereas export's remaining half is
UI, and an unwired export layer would sit unused until option (a) or (b) happens anyway.
