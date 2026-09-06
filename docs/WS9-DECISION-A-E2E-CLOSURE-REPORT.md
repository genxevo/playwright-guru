# WS9 — Decision A: Test-Only Recording-Enabled Build · Implementation + E2E Closure

**Date:** 2026-09-05 · **Decision:** DL-88 · **Verdict:** **IMPLEMENTED — the WS9 E2E exit criterion is proven in its SUFFICIENT form**

**Production `RECORDING_ENABLED` is still `false`. Zero production source files changed. Production bundle Δ 0.**

---

> ## ⚠ CORRECTION — see DL-89 (WS9 Owner Decision E)
>
> **Two claims below are corrected by the Decision E investigation. The original
> text is left standing rather than edited away, per this project's rule that
> contradictions are recorded and never silently resolved.**
>
> **1. §6 says the real Side Panel "displays the RECORDING banner". It did — but
> the banner was fed by the DURABLE record, not by live evidence.** The harness
> hosts the Side Panel as an ordinary TAB, so `sender.tab` is set and the
> background's `isFromExtensionUI` rejects every live query from it as
> `UNTRUSTED_SENDER`. Proven behaviourally at DL-89: with the recorder provably
> alive, removing the durable row made the banner vanish. E2E-A4 and E2E-A5
> therefore exercised the durable path only, and **the confirmed banner line was
> never observed being produced by live evidence in a browser.** E2E-A4 now
> asserts the `UNTRUSTED_SENDER` rejection so the limitation is a measured fact
> in the suite rather than a footnote here.
>
> **2. §6's claim that "E2E-05 is no longer blocked in substance" is withdrawn.**
> `page.bringToFront()` does rebind the panel to the fixture tab, but a panel
> that cannot reach the live authority is not a panel bound in the sense E2E-05
> means. Owner decision B stands and is now measured: `chrome.sidePanel.open()`
> fails with _"may only be called in response to a user gesture"_, and the
> container never surfaces as a Playwright page.
>
> **What is NOT corrected:** the substitution, the fail-loud gates, the artifact
> identity, the permission parity, the byte-identical production bundle, E2E-A2's
> proof that the runtime half is enabled, E2E-A3's real RecordedStep and E2E-A6's
> production/E2E contrast all stand exactly as reported. A control run at DL-89
> also confirms E2E-A5 did **not** pass for the wrong reason: without a kill the
> banner survives 25,000 ms, because the recorder's heartbeat keeps refreshing
> the row.
>
> **The residual finding this report raised as OWNER DECISION E is now resolved
> — see `WS9-DECISION-E-TRUTHFULNESS-REPORT.md` and DL-89.**

---

## 1. What was asked, and what the answer is

DL-87 proved a test-only recording-enabled build feasible and stopped for authorization. The owner authorized it. This slice implemented it and used it to close the criterion:

> _"An E2E test that kills the content script proves the RECORDING banner cannot appear."_

DL-86 recorded that criterion as `PASS (necessary, NOT sufficient)`, and said so in the assertion's own failure message. The reason was exact: **proving a banner cannot appear is only meaningful if it can.** Against the shipped artifact `RECORDING_ENABLED` is `false`, the runtime refuses `start()`, and the banner is unreachable — so its absence after a kill is not evidence about the kill.

**It is now proven in both halves, in real Chromium, against real built artifacts.**

| Half           | Suite                           | Artifact                  | Claim                                                       |
| -------------- | ------------------------------- | ------------------------- | ----------------------------------------------------------- |
| **Necessary**  | `ws9-fail-closed.e2e.mjs`       | `.output` (shipped)       | after the kill, no RECORDING banner is present              |
| **Sufficient** | `ws9-recording-enabled.e2e.mjs` | `.output-e2e` (test-only) | the banner **is** observed for a real recording, then stops |

Neither closes the criterion alone. Both files say so, in their own headers.

---

## 2. The file-change audit the gate asked for

**PRODUCTION SOURCE FILES CHANGED: NONE.**
**PRODUCTION CONFIG FILES CHANGED: NONE.**

This is not asserted from memory. Every file under `src/`, `entrypoints/` and `utils/` in all three packages, plus `wxt.config.ts`, was diffed against the last backup (`ws9-extension-e2e-harness-2026-09-05.zip`, the DL-86 tree):

```
diff -rq  packages/extension/src         → identical
diff -rq  packages/extension/entrypoints → identical
diff -rq  packages/locator-engine/src    → identical
diff -rq  packages/codegen/src           → identical
diff -q   packages/extension/wxt.config.ts → identical
```

Three production files (`src/config/recording.ts`, `src/recording/persistence.ts`, `src/runtime/recording.ts`) **do** appear in the modification-time drift sweep. They were **mutation-tested and restored** — §8 explains why that was necessary — and the diff above is the evidence that the restoration was byte-exact. Reporting a clean sweep while three files carried a newer mtime would have been the easier claim and the false one.

### What was added

| File                                                                    | Kind      | Purpose                                           |
| ----------------------------------------------------------------------- | --------- | ------------------------------------------------- |
| `packages/extension/wxt.e2e.config.ts`                                  | new       | the E2E-only build                                |
| `packages/extension/test/e2e/recording-enabled.config.ts`               | new       | the substituted module                            |
| `packages/extension/test/e2e/ws9-recording-enabled.e2e.mjs`             | new       | the sufficient proof (6 tests)                    |
| `packages/extension/test/ws9-decision-a-e2e-build.test.ts`              | new       | 25 browser-free guards                            |
| `packages/extension/test/e2e/harness.mjs`                               | extended  | `launchExtension({ artifactDir })`, limits reader |
| `packages/extension/test/e2e/ws9-fail-closed.e2e.mjs`                   | corrected | E2E-09's stale caveat                             |
| `package.json` ×2, `.prettierignore`, `eslint.config.mjs`, `.gitignore` | wiring    | `build:e2e`, ignores                              |

---

## 3. The artifact, and the three things that differ

`wxt.e2e.config.ts` **inherits `wxt.config.ts` wholesale** rather than restating it. That is deliberate: a config that re-declared the manifest would drift from the product silently, and the E2E artifact would stop being evidence about the extension we ship. It differs in exactly three ways:

1. `outDir` is `.output-e2e` — never `.output`. Neither build can overwrite the other.
2. the manifest `name` is `Playwright Guru — E2E RECORDING BUILD`, so the artifact **announces itself from inside a running browser**. DL-87 found that byte size cannot distinguish the two artifacts (`!0` vs `!1`), so identity had to be behavioural.
3. one module is substituted at resolution time.

**Measured, from the two loaded manifests:**

```
differing manifest keys: ["name"]
permissions      identical: ["activeTab","storage","scripting","sidePanel"]
host_permissions identical: ["<all_urls>"]
```

**The E2E build bought its capability with a module substitution, not with a capability grant.** DL-86 refused to add the `tabs` permission when an assertion would have been easier with it; the same rule applied here, and E2E-A1 and E2E-A6 assert the permission set on both artifacts from inside the browser.

### The substitute is a substitute, not a fork

`test/e2e/recording-enabled.config.ts` declares **one thing** —

```ts
export const RECORDING_ENABLED = true;
```

— and **re-exports** `RECORDING_LIMITS`, `recordingLimitState` and `shouldStopRecording` from the production module. It contains no function, no arrow, no class, no branch.

That matters beyond tidiness. `src/config/recording.ts` states its own contract at the top — _"No other module may define, hard-code or duplicate these numbers"_ — and a WS0 test enforces it. A substitute that copied `warnAt: 40` and `hardStop: 100` would put the E2E artifact under limits the product does not have the moment either number changed, and every count this suite asserts would be measuring a different extension.

---

## 4. Why the substitution is keyed on the resolved path

DL-87's feasibility experiment keyed on the import **specifier**, and produced a **half-enabled artifact**. Two spellings reach the recording config:

| Specifier                      | Importers                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `'../config/recording'`        | 6 modules under `src/`, **including `runtime/recording.ts`, which owns the gate** |
| `'../../src/config/recording'` | the 3 sidepanel components                                                        |

The alias matched the second and missed the first: the UI rendered a Record button over a runtime that still refused to start. That artifact was worse than useless — it looked enabled and behaved disabled, and a suite run against it would have "proved" a banner no recorder backed.

The key is now `this.resolve(source, importer)` compared against the **resolved absolute path**. Every specifier that lands on the production module is substituted by construction, whatever it is spelled like.

**E2E-A2 is the behavioural refutation.** The banner alone cannot tell the two artifacts apart — it renders from the UI half. `START_RECORDING` can, because its gate lives in `runtime/recording.ts`, which imports by the _other_ specifier. `ok: true` there is proof the substitution was keyed correctly.

---

## 5. Fail loud — measured, not asserted

The gate's requirement was verbatim: _"The E2E build MUST FAIL if the recording module substitution does not fire… Do not merely log a warning. Do not continue."_

Three independent gates, and **all three were deliberately fault-injected**:

| Fault injected                                                           | Gate that fired           | Result                                                        |
| ------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------- |
| plugin dropped from the vite config → substitution never fires           | `build:done` counter      | **build failed, output directory removed, 0 artifact files**  |
| `resolveId` neutered → production module still reaches the graph         | `buildEnd` importer check | **build failed, trespassers named by path, 0 artifact files** |
| production line no longer says `export const RECORDING_ENABLED = false;` | config load-time read     | **build failed before anything was built**                    |

A fourth measurement: **WXT cleans `outDir` before every build**, verified by building successfully (16 files), then failing a rebuild, and finding 0 files. So a failed E2E build cannot leave a stale-but-plausible artifact for a later `test:e2e` to trust.

### A red test that failed for the wrong reason

The first fault injection renamed the production config path. The build failed — via the **load-time** guard's `ENOENT`, before the substitution counter was ever consulted. That proves the wrong thing. It was replaced with a fault that leaves the production file readable and neuters the plugin, which is the actual "substitution never fires" case. _A red test that fails for the wrong reason teaches the wrong lesson_ (recorded first in DL-83).

---

## 6. The closure proof

Six new tests, one browser each for the first five, real Chromium, real built artifacts.

| ID         | Claim                                                                             | Result   |
| ---------- | --------------------------------------------------------------------------------- | -------- |
| **E2E-A1** | the loaded artifact identifies itself, and holds no extra permission              | **PASS** |
| **E2E-A2** | `START_RECORDING` **accepted**; lifecycle really becomes `active`                 | **PASS** |
| **E2E-A3** | a real click becomes a real `RecordedStep` through the real engine                | **PASS** |
| **E2E-A4** | **the real Side Panel displays the RECORDING banner**                             | **PASS** |
| **E2E-A5** | **the kill stops the banner, and it never returns**                               | **PASS** |
| **E2E-A6** | production vs E2E, same message, same page, opposite answers, measured in one run | **PASS** |

**E2E-A3, in full.** A Playwright click on the fixture's `#save` button produced, in the extension's own `chrome.storage.session`, a workflow of exactly one step:

```
kind: 'click'
locator.chain.steps: [ { kind: 'role', selectorValue: 'button', options: { name: 'Save' } } ]
locator.verdict: 'excellent'   locator.visibleMatchCount: 1
facts.attributes.tagName: 'button'
observation.refusedCount: undefined   ← admitted, not refused
```

Nothing dispatched a synthetic event, called the recorder directly, or wrote a step by hand.

**E2E-A4, in full.** The real Side Panel document rendered:

```
●RECORDING — perform actions on the page
1 action recorded
await page.getByRole('button', { name: 'Save' }).click();
```

The banner is backed by content, and the count is DL-84's truthful one: one action performed, one recorded, none refused.

**E2E-05 is no longer blocked in substance.** DL-86 recorded that the panel-as-a-tab binds `activeTabContext` to its own tab. `page.bringToFront()` fires the real `chrome.tabs.onActivated`, the panel rebinds to the fixture tab through the product's own mechanism, and the assertions above are made against that binding. Chrome's side-panel **container** remains undrivable by Playwright; the panel **document**, bound to the intended target tab, is now exercised.

**E2E-A5, the closure.** The fixture tab is navigated to `about:blank`, which `<all_urls>` does not match, so the content-script context is destroyed while the tab survives. Nothing calls `stop()`, dispatches a synthetic `STOP_RECORDING`, clears storage or touches an internal API. The live authority becomes unreachable with the exact `Receiving end does not exist`. The banner then stops claiming RECORDING and reports `The recorder stopped responding — nothing is being captured`, and is polled for a further three heartbeats to confirm it never returns.

And, at the moment it stops: **the durable row still literally reads `lifecycle: 'active'`.** That is the sharpest available form of DL-79's rule, and it is only testable in an artifact where the banner can render at all.

---

## 7. Residual finding — OWNER DECISION E

**Making the banner observable for the first time exposed a pre-existing truthfulness gap, and it is reported rather than fixed.**

For up to `heartbeatTimeoutMs` — 15,000 ms, **measured at 15,129 ms** — after the content script dies, the panel **continues to display `RECORDING — perform actions on the page`**. Anything the user does in that window is silently not captured.

The transitions, measured:

```
kill at +0 ms      banner: RECORDING
      +15,129 ms   banner: The recorder stopped responding — nothing is being captured
      +27,000 ms   banner: unchanged (never returns)
```

**This is the architecture behaving exactly as authorised.** DL-79 set `LIVE CONTENT AUTHORITY > DURABLE OBSERVATION > UNKNOWN`, and durable evidence is consulted precisely when the live authority said nothing at all — which is this case. DL-73's clock-derived expiry is its only bound, and it is what eventually ends the claim.

**It is nonetheless a window in which the product says it is recording and is not.** Three things make it narrow: only a context destroyed and _not_ recreated reaches it (a normal reload re-injects the content script, which then answers `inactive` and live evidence wins immediately); it is bounded; and it resolves to an honest message rather than silence.

Narrowing it — for example, refusing to let durable evidence alone produce `active` — would change DL-79. **That is a new owner decision and was not made inside this slice.** It is raised as **OWNER DECISION E**.

It is also worth stating plainly: this gap existed before this slice and was invisible only because `RECORDING_ENABLED` was `false`. A real E2E harness against a genuinely enabled artifact is exactly the instrument that finds this class of thing, which is the argument for having built it.

---

## 8. The guards, and the nine mutations

`test/ws9-decision-a-e2e-build.test.ts` adds **25 assertions that need no browser** and run in the ordinary vitest pass at R3's `environment: 'node'`. The E2E suite needs a real Chromium and an ad-hoc playwright install, and CI has neither (DL-86, still open) — so this file is the half of the protection that is always on.

Guards alone prove nothing until they are shown to fail. **Nine mutations were injected; every one was caught by the intended guard:**

| Mutation                                                       | Caught by                                         |
| -------------------------------------------------------------- | ------------------------------------------------- |
| production flag flipped to `true`                              | WS9-DA-1                                          |
| production flag made environment-dependent (`import.meta.env`) | WS9-DA-1                                          |
| substitution keyed on the specifier again (DL-87's bug)        | WS9-DA-3                                          |
| fail-loud throw downgraded to `console.warn`                   | WS9-DA-4                                          |
| a limit duplicated into the substitute                         | WS9-DA-5                                          |
| `build:e2e` wired into the release `build` script              | WS9-DA-6                                          |
| artifact name changed in the config but not the harness        | WS9-DA-8                                          |
| a shipped module importing the test-only substitute            | WS9-DA-2                                          |
| the clock-derived expiry removed from `observedLifecycle`      | **E2E-A5** (timed out waiting for the stale line) |

The last one is why three production files carry a newer mtime: proving E2E-A5 can fail required breaking the property it tests, rebuilding the E2E artifact and watching it go red. All were restored byte-exactly (§2).

**One guard was found to pass for the wrong reason.** WS9-DA-4's first form asserted only that `throw new Error(` appeared _somewhere_ in the config; when the fail-loud throw was replaced by `console.warn`, it stayed green, because an unrelated throw kept it satisfied. It was rebound to its own message. A guard that passes for a reason unrelated to its claim is not a guard.

**Two guards failed on first run for reasons that were mine, not the code's**, and both were corrected rather than relaxed: one matched `test(source)` inside the config's _load-time_ block, where `source` meant "file contents" rather than "import specifier" (the config's variable was renamed to `productionSource`, removing a genuine ambiguity); the other looked for a literal `'.output/chrome-mv3'` in a validator that builds its path with `join(EXT_ROOT, '.output', 'chrome-mv3')`.

**A third failure was real and is the reason WS9-DA-9 exists.** E2E-09's message still read _"impossible without a test-only build (owner decision A)"_. That decision has been made and the proof exists, so the sentence had become false. **A stale honest caveat becomes a dishonest one.** Both E2E-09 and the file header were corrected, and a guard now pins the correction.

---

## 9. Isolation — the E2E build cannot be shipped by accident

| Route            | Reaches `.output-e2e`? | Evidence                                                |
| ---------------- | ---------------------- | ------------------------------------------------------- |
| `pnpm build`     | no                     | runs `wxt build`; the E2E config needs an explicit `-c` |
| `pnpm verify`    | no                     | build · typecheck · lint · test · format:check          |
| `pnpm zip`       | no                     | `outDir` from `wxt.config.ts`                           |
| `pnpm package`   | no                     | `validate-package.mjs` targets `.output` only           |
| `pnpm build:e2e` | **yes** — explicitly   | the only route, and it is not a dependency of anything  |
| `pnpm clean`     | removes it             | the one script allowed to name it                       |

Guarded by WS9-DA-6, mutation-tested. The E2E artifact directory is also ignored by prettier, ESLint and `.gitignore` — `.output` does not match `.output-e2e`, so each needed its own entry, and without them a green `verify` would have depended on whether someone had recently run `build:e2e`.

**Bundle hygiene, both directions:**

- production artifact: no `recording-enabled`, no `.output-e2e`, no `E2E RECORDING BUILD` — and byte-identical at 316,565 B.
- E2E artifact: no `launchPersistentContext`, no `harness`, no `node:test`, no `mkdtemp`. (`playwright` appears in 3 files in **both** artifacts — it is the product's own generated `@playwright/test` code, and the count is unchanged.)

---

## 10. Validation

Each command run alone, from the repository root.

| Command             | Result                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`        | **PASS** — 316,565 B, **byte-identical to the DL-87 baseline (md5-verified, Δ 0)**                                                                                            |
| `pnpm build:e2e`    | **PASS** — 320,807 B in `.output-e2e`                                                                                                                                         |
| `pnpm typecheck`    | **PASS** — 0 errors                                                                                                                                                           |
| `pnpm lint`         | **PASS** — 0 errors; **3 pre-existing warnings** (unused `eslint-disable` directives in `src/recording/export.ts` and `test/ws9-export.test.ts`), unchanged from the baseline |
| `pnpm test`         | **PASS** — **1,950 tests / 69 files** (was 1,925 / 68; +25 guards)                                                                                                            |
| `pnpm format:check` | **1 file** — `ws2-item9-report.md`, the known permanent exception. **This is not "all green" and is not described as such.**                                                  |
| `pnpm test:e2e`     | **PASS — 15/15** (9 preserved + 6 new), real Chromium, both artifacts                                                                                                         |

**Bundle:** production Δ 0. The E2E artifact is 320,807 B — 4,242 B larger, entirely in the sidepanel chunk (11,051 → 15,262 B), because the recording UI is no longer tree-shaken out. That number describes a build that is never shipped and is recorded only so nobody mistakes it for a production regression. The production overage against the 278,760 B ceiling is unchanged at **37,805 B / 13.56 %**.

**Permissions:** UNCHANGED, and now asserted in-browser on **both** artifacts.

**Real Chromium:** **PASS**, 15/15.
**Manual regression:** **NOT RUN.** A procedure the owner can follow is in §12.
**axe:** **BLOCKED** — `axe-core` is still neither a dependency nor present (DL-86, owner decision D).
**CI:** **BLOCKED** — `.github/workflows/ci.yml` installs no browser and has no extension environment. The E2E suite remains **local-only** (DL-86, owner decision C).

---

## 11. What this does NOT close

WS9 is **not** finished. Untouched and still deferred: iframe recording · full-page reload resumption · browser-restart recovery · V1 stored-data migration · Download · refusal visibility after recorder death · per-reason histogram · `limit-reached` reachability. **WS10 / WS11 are NOT started.**

`RECORDING_ENABLED` in production is **`false`**, and shipping recording remains a separate owner decision that this slice neither made nor prepared.

### Owner decisions outstanding

- **(B)** Side-panel **container** automation — Playwright cannot drive Chrome's side-panel host UI. The panel _document_, bound to the intended tab, is now exercised.
- **(C)** a CI browser/extension environment for the E2E suite.
- **(D)** `axe-core` as an ad-hoc or dev dependency.
- **(E) NEW** — the `heartbeatTimeoutMs` window in §7: whether durable evidence alone may produce `active`.
- **(F) NEW, minor** — this repository still has no general `.gitignore`. One was created for `.output-e2e` alone; `node_modules`, `.output`, `.wxt` and `coverage` are ignored today only by `.prettierignore` and the ESLint config. Giving them their first VCS ignore rules is a repository-wide decision and was left to the owner rather than closed quietly as a side effect of a test build.

---

## 12. How to run it

```
npm i -g playwright     # ad-hoc, per DL-20 — never a repository dependency
pnpm build              # → .output/chrome-mv3      (shipped, recording OFF)
pnpm build:e2e          # → .output-e2e/chrome-mv3  (test-only, recording ON)
pnpm test:e2e           # 15/15
```

Each suite refuses to run against a missing artifact and names the build command it needs, and the harness refuses to continue without a service worker — so a green result cannot be obtained from a browser that never loaded an extension, nor from the wrong one.

**Manual regression (NOT RUN):** load `packages/extension/.output/chrome-mv3` unpacked, open any http page, open the Side Panel, confirm **no Record control is offered**; then load `packages/extension/.output-e2e/chrome-mv3` instead, confirm the extension is named **Playwright Guru — E2E RECORDING BUILD**, press Record, click something, see the banner and the count, then navigate the tab to `about:blank` and confirm the banner reports that the recorder stopped responding.

---

**HARD STOP.** No further roadmap work was performed.
