# WS9 — Real Extension E2E Harness / Closure Gate

**Date:** 2026-09-05 · **Decision:** DL-86 · **Verdict:** **PARTIAL**
**WS9 remains PARTIAL / IN PROGRESS · `RECORDING_ENABLED` remains `false`**

---

## 1. Scope

Build the extension-level E2E harness DL-85 named as the only route to closing WS9, and use it to prove the blocked exit criterion:

> _"An E2E test that kills the content script proves the RECORDING banner cannot appear."_

**Result: the harness exists and passes 9/9 against the real extension. The gate is still not closed** — the ACTIVE half of the criterion is blocked on an owner decision, not on missing infrastructure.

---

## 2. Baseline failure

Before writing anything, the exact scenario was probed against the untouched tree:

```
headless-default:            CONTEXT=ok  SERVICE_WORKER=NO   EXT_ID=null
headless-chromium-channel:   CONTEXT=ok  SERVICE_WORKER=yes  EXT_ID=edeadgjlicafpmgkombdcengfjbgidha
                             SIDEPANEL_NAV=ok status 200     SIDEPANEL_TITLE=Playwright Guru
```

| Question                                                | Baseline answer                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Existing extension E2E?                                 | **None.** No `e2e/` dir, no persistent context, no `--load-extension` anywhere.             |
| Playwright installed?                                   | Ambient only — **not** in any `package.json` (DL-20).                                       |
| Chromium available?                                     | Yes.                                                                                        |
| Does the built extension load?                          | **Only under Chrome's new headless.** The default headless shell loads no extension at all. |
| Can the content script be terminated deterministically? | Yes — `about:blank` is not matched by `<all_urls>`.                                         |

---

## 3. Root cause of the original blocker

The repository had two Chromium scripts (`refresh-*-golden.mjs`) that launch a real browser but **load no extension** — they record Playwright's own semantics. Nothing existed that put the built artifact into a browser. And MV3's service worker does not exist in Playwright's default headless shell, so a naive attempt would have produced a context with no extension and asserted against nothing.

---

## 4. Harness architecture

```
node --test
  └─ test/e2e/harness.mjs
       ├─ loadPlaywright()      ad-hoc resolve: local root, then `npm root -g`
       ├─ startFixtureServer()  local http://127.0.0.1, no external network
       └─ launchExtension()     launchPersistentContext(mkdtemp profile, {
                                  channel: 'chromium',      ← new headless
                                  args: --load-extension=<built artifact>
                                })  → THROWS if no service worker
  └─ test/e2e/ws9-fail-closed.e2e.mjs   the scenario
```

- **No new dependency.** Playwright stays ad-hoc per DL-20; the runner is Node's own test runner. `package.json` gains **one script and zero dependencies**.
- **No hard-coded path.** A first draft embedded this container's `node_modules` path and was corrected — a literal path works exactly once, on the machine it was written on.
- **Isolated.** Fresh `mkdtemp` profile per run, removed on teardown. The developer's Chrome profile is never touched.

---

## 5. Real extension loading proof

`E2E-01/02` asserts, **from inside the running browser**: a runtime-derived extension id matching `/^[a-p]{32}$/`, `chrome.runtime.getManifest().name === 'Playwright Guru'`, `manifest_version === 3`, and the permission set exactly `['activeTab','storage','scripting','sidePanel']`.

That last assertion is deliberate: **this harness can never quietly acquire a permission to make itself easier to write.**

## 6. Real Side Panel proof

`E2E-04` navigates to `chrome-extension://<runtime id>/sidepanel.html`, gets HTTP 200, title `Playwright Guru`, and waits for the actual React empty state (`Ready to inspect`) — the real application, not a stub.

**Limitation, reported not papered over:** this is the Side Panel **document**, not Chrome's side-panel **container**, which Playwright cannot target. Hosted as an ordinary tab, `activeTabContext` binds to the panel's own tab, so **E2E-05 (panel bound to the intended target tab) is BLOCKED**, not claimed.

## 7. Real content-script proof

`E2E-03`: `chrome.tabs.sendMessage(tabId, {type:'QUERY_RECORDING_STATE'})`, evaluated **in the extension's own service worker**, returns `{ok:true, lifecycle:'inactive'}`. An absent content script cannot produce a successful ack, so this is evidence of a real runtime, not an inference from "the page loaded".

## 8. Content-script termination mechanism

**The fixture tab is navigated to `about:blank`.** The manifest matches `<all_urls>`, which `about:blank` is not, so the content-script execution context is destroyed and not recreated **while the tab itself survives** — the case the architecture must withstand.

Nothing calls `stop()`, dispatches a synthetic `STOP_RECORDING`, clears storage by hand, or touches an internal runtime API.

`E2E-07` asserts the error is exactly `Receiving end does not exist` / `Could not establish connection` — the precise condition `dispatchToTab` catches and `normalizeAck` converts into `NO_HANDLER`, which `observedView` collapses to `unknown`.

## 9. Fail-closed assertion

`E2E-08`: after the kill, **all three** recording messages are undelivered and produce **no ack at all**.

`E2E-10`: a durable observation claiming `lifecycle: 'active'`, planted adversarially into the extension's **own** `chrome.storage.session` at WS4's real key shape, cannot turn an undelivered query into a successful `active`. The row is verified present, then removed.

`E2E-06` / `E2E-13`: **DL-74's claim verified in Chromium for the first time** — `START_RECORDING` returns `{ok:false, error:'recording-disabled'}` and leaves no session behind, not even `starting`. Asserted twice, the second time against a freshly opened tab, so it is a property of the **shipped build**.

---

## 10. Test matrix

|        | Claim                                                   | Result                                                         |
| ------ | ------------------------------------------------------- | -------------------------------------------------------------- |
| E2E-01 | Extension loads in persistent Chromium                  | **PASS**                                                       |
| E2E-02 | Real service worker present                             | **PASS**                                                       |
| E2E-03 | Real content script on the fixture page                 | **PASS**                                                       |
| E2E-04 | Real Side Panel document reachable                      | **PASS**                                                       |
| E2E-05 | Panel bound to the intended target tab                  | **BLOCKED** — Playwright cannot drive the side-panel container |
| E2E-06 | Recording state exercised through the real architecture | **BLOCKED** — flag off; the refusal itself is proven           |
| E2E-07 | Content-script context really terminated                | **PASS**                                                       |
| E2E-08 | Stale live state cannot keep recording active           | **PASS**                                                       |
| E2E-09 | No false active banner                                  | **PASS (necessary, NOT sufficient)**                           |
| E2E-10 | Durable state cannot fabricate active                   | **PASS**                                                       |
| E2E-11 | Isolated from the normal Chrome profile                 | **PASS**                                                       |
| E2E-12 | No test dependency in the extension bundle              | **PASS** — byte-identical, grep-verified                       |
| E2E-13 | Production `RECORDING_ENABLED` remains false            | **PASS** — asserted in the built artifact                      |
| E2E-14 | No manifest permission changes                          | **PASS** — asserted in-browser                                 |
| E2E-15 | No production runtime architecture changes              | **PASS** — zero production files modified                      |

### Why E2E-09 is not the criterion

Proving a banner _cannot_ appear is only meaningful if it _could_. With `RECORDING_ENABLED = false` it never can, so absence proves nothing on its own. **The test says so in its own failure message**, naming the flag and the owner decision, so the suite cannot be misread as closure.

### Two of my own tests failed for the wrong reason

1. `E2E-07` asserted the surviving tab's `url` and got `undefined` — with `activeTab` and not `tabs`, Chrome withholds `Tab.url` for a tab that is not activeTab-granted. That is the permission model working. **The harness refused to add the `tabs` permission** and asserts the tab's continued _existence_ instead.
2. `E2E-13` asserted immediately after opening a page and got no ack, because injection had not finished. It now **polls until the content script is reachable**. No fixed sleeps exist anywhere in the suite.

---

## 11. Axe result

**BLOCKED.** `axe-core` is neither a repository dependency nor present in the environment. Adding it is a new-dependency decision of the same class DL-20 settled for playwright. Injecting an ad-hoc copy via `addScriptTag` is possible, but building that plumbing for a tool that is not there would be speculative. **Unblock:** one ad-hoc install plus a small addition to this same harness.

## 12. Bundle impact

**316,565 B → 316,565 B — byte-identical.**

| File            | Before | After  |
| --------------- | ------ | ------ |
| `content.js`    | 48,591 | 48,591 |
| `background.js` | 11,874 | 11,874 |
| sidepanel chunk | 11,051 | 11,051 |
| devtools-panel  | 1,386  | 1,386  |
| tokens chunk    | 91,183 | 91,183 |

A grep of the built output for `playwright/index`, `launchPersistentContext` and the harness profile prefix returns **nothing**. Overage unchanged at 37,805 B / 13.56 % against the untouched 278,760 B ceiling.

## 13. Permission impact

**UNCHANGED** — `activeTab`, `storage`, `scripting`, `sidePanel`, host `<all_urls>`. Now asserted from inside the running browser, not only from source text.

## 14. Security / privacy result

**PASS.** Fresh disposable profile per run; local `127.0.0.1` fixture with no external network; **no password field in the fixture**, so this harness can never become the place a secret fixture is introduced; the one planted storage row is removed by the test that planted it; no session id is read or rendered; no `eval`, no `new Function`, no `innerHTML`.

## 15. Production `RECORDING_ENABLED`

**`false`**, and now proven so in the built artifact rather than only in source: `START_RECORDING` against the shipped bundle returns `recording-disabled`.

## 16. Real Chromium result

**PASS** — 9/9, real Chromium, real extension.

## 17. Manual regression result

**NOT RUN.** A manual procedure the owner can follow: load `packages/extension/.output/chrome-mv3` unpacked, open any http page, open the Side Panel, confirm no Record control is offered (flag off), then navigate the tab to `about:blank` and confirm the panel reports no recording.

## 18. CI result

**BLOCKED.** `.github/workflows/ci.yml` runs build, typecheck, lint, test and format:check; it installs no browser and has no extension environment. Redesigning CI was out of scope. The suite is **local-only** and documented as such.

---

## 19. Remaining WS9 deferrals

Unchanged: iframe recording · full-page reload resumption · browser-restart recovery · V1 stored-data migration · Download · refusal visibility after recorder death · per-reason histogram · `limit-reached` reachability.

## 20. Owner decisions required

**(A) A TEST-ONLY RECORDING-ENABLED BUILD — the only route to closing WS9.** The criterion's ACTIVE half is unreachable while the flag is off. `RECORDING_ENABLED` is a literal `export const RECORDING_ENABLED = false` with nothing to override; a test-only build would require making it build-environment-dependent, turning the product's documented rollback mechanism into a second behaviour path in the one module whose purpose is to be provably closed. Several guards currently pin the constant. **Not implemented.**

**(B) Side-panel container automation** — Playwright cannot drive Chrome's side-panel host UI, so tab-binding through the real container is unprovable with this tooling.

**(C) CI browser/extension environment** for the E2E suite.

**(D) `axe-core`** as an ad-hoc or dev dependency.

## 21. Final verdict

**PARTIAL.**

The harness is real, passes 9/9, and moved the blocker from _"no infrastructure exists"_ to _"one authorization is missing"_. Several architectural claims — the runtime flag gate, the permission set, durable-state anti-fabrication, the content-script death signal — are now verified in a real browser for the first time.

**WS9 is NOT closed. `RECORDING_ENABLED` remains `false`.**

### How to run it

```
npm i -g playwright        # ad-hoc, per DL-20 — never a repo dependency
pnpm build
pnpm test:e2e
```

The suite refuses to run against a missing build and refuses to continue without a service worker, so a green result cannot be obtained from a browser that never loaded the extension.

---

**HARD STOP.** No further roadmap work was performed.
