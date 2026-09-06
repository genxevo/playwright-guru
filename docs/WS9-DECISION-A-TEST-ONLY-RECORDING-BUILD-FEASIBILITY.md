# WS9 Decision A — Test-Only Recording-Enabled Build · Feasibility Gate

**Date:** 2026-09-05 · **Decision:** DL-87 · **Verdict:** **FEASIBLE — OWNER AUTHORIZATION REQUIRED**
**WS9 remains PARTIAL / IN PROGRESS · Production `RECORDING_ENABLED` remains `false`**
**No implementation was performed. No production source file was changed.**

---

## 1. Scope

Answer one question, by experiment rather than theory:

> _"Can Playwright Guru create an isolated E2E-only extension artifact in which recording is enabled, while the normal production artifact remains unconditionally fail-closed with `RECORDING_ENABLED=false`, without creating a second production behaviour path or weakening the rollback guarantee?"_

**Answer: yes — and it was demonstrated end to end in a real browser.** A disposable experiment produced both artifacts and proved they behave differently; the experiment was then deleted and the tree restored.

---

## 2. Source-of-truth documents inspected

`ProgressDocument/MASTER-ROADMAP.md` · `CURRENT-STATE.md` · `PROGRESS.md` · `DECISION-LOG.md` (86 entries; DL-87 is next) · `docs/WS9-EXTENSION-E2E-HARNESS-REPORT.md` (DL-86) · `docs/WS9-FINALIZATION-EXIT-REPORT.md` (DL-85) · `docs/WS9-NAVIGATION-SPA-FRAME-TAB-REPORT.md` (DL-83) · `docs/WS9-RECORDING-ACTION-COUNT-REFUSAL-REPORT.md` (DL-84) · plus `wxt.config.ts`, both `package.json` files, the E2E harness and every guard referencing the flag.

## 3. Current production architecture

MV3. Permissions `activeTab`, `storage`, `scripting`, `sidePanel`; host `<all_urls>`. Build: **wxt 0.20.0** over vite. Output `.output/chrome-mv3`. Packaging (`scripts/validate-package.mjs`) hard-codes `.output/chrome-mv3`.

## 4. Current `RECORDING_ENABLED` definition

```ts
// src/config/recording.ts:47
export const RECORDING_ENABLED = false;
```

**Six value call sites**, in four files — everything else is prose:

| File                                                  | Use                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| `src/runtime/recording.ts:171`                        | `options.enabled ?? RECORDING_ENABLED` — **the runtime gate** |
| `entrypoints/sidepanel/RecordingControl.tsx:333, 398` | two early returns                                             |
| `entrypoints/sidepanel/ExportControl.tsx:139, 177`    | two early returns                                             |
| `entrypoints/sidepanel/RecordingWorkspace.tsx:112`    | one early return                                              |

**Two different import specifiers reach the same module** — and this turned out to matter enormously (§9):

- `'../config/recording'` — 6 files under `src/`, including the runtime that owns the gate
- `'../../src/config/recording'` — the 3 side-panel components

**12 test files** reference the flag.

**Bundle representation:** the panel early-returns are constant-folded away entirely; only the runtime gate survives, in `content.js`.

## 5. Current build architecture

`wxt build`, driven by `wxt.config.ts`, which already exposes a `vite: () => ({...})` hook. **The local wxt 0.20.0 CLI supports `-c, --config <file>`** and an `outDir` option. There is no existing `define`, no env-var handling, and no test-only build anywhere in the repository.

## 6. Current E2E architecture

DL-86's harness: `packages/extension/test/e2e/`, `node --test`, ad-hoc playwright (DL-20), `launchPersistentContext` + `--load-extension`, Chrome's new headless via `channel: 'chromium'`. **9/9 passing.**

## 7. Baseline failure

```
PRODUCTION : START={"ok":false,"error":"recording-disabled"}  STATE={"lifecycle":"inactive"}
```

The active-recording path is genuinely unreachable in the shipped artifact — measured, not assumed.

---

## 8. Candidate approaches investigated

### Candidate A — Class 1: environment-dependent production constant

`const RECORDING_ENABLED = process.env.X === 'true'`
**Result: UNSAFE — rejected without experiment.** It changes the guarantee from _"disabled unless the source changes"_ to _"disabled unless the environment says otherwise"_. Those are materially different contracts (§12).

### Candidate B — Class 3: reach ACTIVE without changing the flag

**Result: NOT POSSIBLE.** `createRecordingRuntime` does have an `enabled` injection seam, but it is only reachable by constructing the runtime directly — which unit tests do and the _built extension_ cannot. From the browser, `START_RECORDING` reaches `content.ts`'s runtime, which defaults to the constant. No existing test mode, dev artifact or authorized seam exists. Pretending the flag is `true` would not count.

### Candidate C — Class 2, naive: separate config + vite `resolve.alias` on the specifier string

**Result: UNSAFE — and this is the most valuable finding of the gate.**

The experiment built successfully and _looked_ right: the sidepanel chunk grew 11,051 → 15,270 B. But the browser said:

```
E2E-BUILD : START={"ok":false,"error":"recording-disabled"}
```

**The alias matched only one of the two specifiers.** `find: /^.*\/src\/config\/recording$/` matched `'../../src/config/recording'` (the panel components) but **not** `'../config/recording'` (the runtime). The result was a **half-enabled artifact: recording UI on, recording runtime still off** — precisely the "second behaviour path" hazard, produced accidentally in the first attempt.

### Candidate D — Class 2, robust: separate config + `resolveId` plugin keyed on the **resolved absolute path**

**Result: SAFE — PROVEN IN A REAL BROWSER.**

```
PRODUCTION : START={"ok":false,"error":"recording-disabled"}  STATE={"lifecycle":"inactive"}
E2E-BUILD  : START={"ok":true,"sessionId":"mto6j0ii.6k7lzf917i9"}  STATE={"lifecycle":"active"}
E2E-BUILD  : RECORDED_STEPS=1
E2E-BUILD  : AFTER_KILL delivered=false ack=undefined
```

That is the entire missing proof: a genuinely **ACTIVE** recording with a real session id; a real click admitted by the real trust boundary into the real durable workflow (`RECORDED_STEPS=1`, read from the extension's own `chrome.storage.session`); the content script killed by a real navigation; and the live authority gone.

---

## 9. Rejected approaches

Candidate A (Class 1) · Candidate C (string alias) · NODE_ENV switching · runtime globals · storage/URL/query flags · test-only message bypass · debug UI switch · manifest permission changes · any production-reachable `enableRecordingForTest()`.

**Candidate C is rejected on evidence, not on principle** — it silently produced a half-enabled build.

## 10. Feasible approach

Candidate D only.

---

## 11. Production safety analysis

| Question                                                                    | Answer                                                                                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can a production user accidentally enable recording?                        | **No** — nothing at runtime reads any flag; the constant is compiled in.                                                                                         |
| Can a developer accidentally build a recording-enabled production artifact? | **No** — it requires `-c <e2e config>` **and** the substitute module to exist. `pnpm build` reads `wxt.config.ts`, which has no plugin, no alias and no env var. |
| Can an environment variable affect production recording?                    | **No** — none is read, before or after.                                                                                                                          |
| Can a URL / storage / message enable recording?                             | **No** — unchanged.                                                                                                                                              |
| Can a test hook be reached from production?                                 | **No hook exists.** The substitution is a build-time module swap, not an API.                                                                                    |
| Can the E2E artifact be packaged as production?                             | **No** — `validate-package.mjs` hard-codes `.output/chrome-mv3`; the E2E artifact lives in a different directory **and names itself** "Playwright Guru (E2E)".   |
| Can E2E-only dependencies enter the production bundle?                      | **No** — the substitute module is a copy of the real config with one literal changed; no dependency is involved.                                                 |
| Does the production rollback constant become ambiguous?                     | **No** — see §12.                                                                                                                                                |

## 12. Rollback analysis — the decisive section

The current contract is:

> **Production recording is disabled unless the production source explicitly changes.**

Candidate D **preserves this exactly.** `src/config/recording.ts` still reads `export const RECORDING_ENABLED = false;`, nothing reads an environment variable, and the production build has no substitution mechanism at all. The E2E artifact is not "production with a switch flipped" — it is **a different artifact, built from a different config, that compiles a different module**.

The unacceptable semantic — _"production recording is disabled unless the build environment says otherwise"_ — is **not** introduced, because the production config contains no mechanism that any environment could trigger.

## 13. Bundle analysis

**Production bundle after this gate: 316,565 B — Δ 0** against DL-86.

| File            | Bytes  |
| --------------- | ------ |
| `content.js`    | 48,591 |
| `background.js` | 11,874 |
| sidepanel chunk | 11,051 |
| devtools-panel  | 1,386  |
| tokens chunk    | 91,183 |

**A finding for the implementation slice: byte size cannot distinguish the two artifacts.** The E2E `content.js` was **byte-identical** to production at 48,591 B, because minified `!0` and `!1` are the same length. Only the sidepanel chunk grew (the un-folded UI). **Verification of which artifact is which must be behavioural**, never size- or grep-based.

## 14. Dependency analysis

**Zero new dependencies.** No axe, no test framework, no build plugin package — the `resolveId` hook is ~10 lines of inline config. Playwright remains ad-hoc per DL-20.

## 15. Permission analysis

**UNCHANGED.** The experiment's generated manifest differed from production in **exactly two fields** — `name` and `description`. `permissions`, `host_permissions`, `side_panel`, `background`, `action`, `devtools_page` and `content_scripts` were byte-identical.

## 16. Guard analysis

**Zero guard changes required — the strongest result in this gate.**

Because production source does not change, every guard that pins the flag continues to pass unmodified:

| Guard class  | Example                                                          | Effect                                        |
| ------------ | ---------------------------------------------------------------- | --------------------------------------------- |
| unit         | `preview-gate.test.ts` — `expect(RECORDING_ENABLED).toBe(false)` | unchanged                                     |
| source-text  | every-component-early-returns count (`preview-gate`)             | unchanged                                     |
| architecture | `ws9-*` suites, 12 files referencing the flag                    | unchanged                                     |
| bundle/E2E   | `E2E-13` — the shipped artifact refuses to start                 | unchanged, and now the _contrast_ case exists |

## 17. Security / privacy analysis

**PASS.** No new permission, no new dependency, no network, no telemetry, no production-reachable hook, no runtime configurability. The E2E artifact self-identifies by name. One caution recorded: the repository currently has **no `.gitignore` at all**, so if git is ever initialised, `.output-e2e` must be ignored alongside `.output`.

## 18. E2E implications

With Candidate D authorized, the currently-BLOCKED matrix rows become reachable:

|                                      | Today                    | With Candidate D                                                       |
| ------------------------------------ | ------------------------ | ---------------------------------------------------------------------- |
| E2E-06 recording lifecycle exercised | BLOCKED                  | **PASS** (proven: `lifecycle: 'active'`, `RECORDED_STEPS=1`)           |
| E2E-08 stale live state              | PASS (from inactive)     | **PASS from a genuinely ACTIVE recording**                             |
| E2E-09 no false banner               | necessary-not-sufficient | **SUFFICIENT** — the banner can appear, then must not survive the kill |
| E2E-05 panel bound to target tab     | BLOCKED                  | still BLOCKED — separate decision (side-panel container)               |

**E2E-09 is the WS9 exit criterion.** Candidate D is the only demonstrated route to it.

## 19. CI implications

**UNCHANGED and still BLOCKED.** `.github/workflows/ci.yml` installs no browser. Candidate D would be CI-compatible in principle (one extra build command) but needs the browser environment decision (DL-86 owner decision C). Not addressed here.

---

## 20. Owner decision

### OWNER DECISION A

**Question:** Should Playwright Guru authorize a dedicated E2E-only recording-enabled extension artifact for real-browser validation?

**Option 1 — Authorize Candidate D (separate config + resolved-path module substitution).**
_Advantages:_ zero production source changes; zero guard changes; zero new dependencies; permissions identical; rollback semantics preserved verbatim; **proven working end to end**; unblocks the WS9 exit criterion, which nothing else does.
_Risks:_ a second build path exists and must be maintained; a future refactor that moves `src/config/recording.ts` would silently break the substitution — mitigated by making the E2E build **fail loudly** if the plugin never fires; and the half-enabled hazard of §8-C is real if anyone re-implements it as a string alias.

**Option 2 — Decline; leave WS9 permanently PARTIAL on this criterion.**
_Advantages:_ exactly one build path; nothing to maintain or misuse.
_Risks:_ the WS9 exit criterion can never be satisfied; E2E-09 stays necessary-not-sufficient forever; the roadmap carries a criterion the architecture has decided not to meet, which should then be rewritten rather than left open.

**Recommendation:** **Option 1**, with three conditions: (a) the substitution must key on the **resolved absolute path**, never a specifier string; (b) the E2E build must **fail loudly** if the substitution does not fire, so a half-enabled artifact is impossible; (c) which artifact is which must be verified **behaviourally**, never by byte size.

**Production impact:** none. **WS9 impact:** unblocks the exit criterion; WS9 could then close if E2E-09 passes in its sufficient form.

## 21. Recommendation

As above — and note the honest alternative: if the owner declines, the _roadmap wording_ should change, because an exit criterion that the architecture has chosen not to make satisfiable is not a criterion, it is a permanent block.

## 22. Exact next implementation slice, if approved

1. `packages/extension/wxt.e2e.config.ts` — new, test-only: `outDir: '.output-e2e'`, distinct `name`, and a `resolveId` plugin keyed on `resolve(root, 'src/config/recording.ts')` that **throws** if it never fires.
2. `packages/extension/test/e2e/recording-enabled.config.ts` — the substitute module (a copy of the real config with the one literal `true`), living under `test/` so it can never be reached by production resolution.
3. `package.json` — `build:e2e` script; `test:e2e` gains a step that builds it.
4. `test/e2e/harness.mjs` — accept an artifact directory; **assert behaviourally** that the E2E artifact starts a recording and the production one refuses.
5. A new E2E case closing **E2E-09 in its sufficient form**: start a real recording, record a real click, kill the content script, observe the real Side Panel, assert the banner does not survive.
6. Add `.output-e2e` to `.gitignore` — **or create one**, since the repository has none.

**No production source file appears in that list.**

## 23. WS10

**NOT STARTED.** No assertion recording, model, UI, export or persistence was touched.

---

**HARD STOP.**
