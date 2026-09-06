# WS9 — Final Release Gate

**Date:** 2026-09-05 · **Decision:** DL-90

> # WS9 NOT RELEASE READY
>
> **Not because of a code defect. Every technical gate this audit could execute passed.**
> **Four owner-supplied release inputs are missing, and the repository's own `RELEASE-GATES.md` already names them as v0.1.x blockers.**

**WS9 remains FEATURE-PARTIAL. `RELEASE READY` and `FEATURE COMPLETE` are separate concepts and neither is claimed.**

---

## 1. Environment and repository location — a correction

The gate was right to challenge the previous "not a git repository" claim.

| Question                                    | Answer                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pwd`                                       | `/home/claude/pg` (Linux container)                                                                                |
| git installed here?                         | **Yes** — `/usr/bin/git`, 2.43.0                                                                                   |
| Is this working tree a git worktree?        | **No.** `git rev-parse` fails; an upward walk to `/` finds no `.git`                                               |
| Is the owner's repository a git repository? | **YES.** `E:\Codes\playwrightguru\.git` exists and was inspected through the device bridge                         |
| HEAD                                        | `ref: refs/heads/main`                                                                                             |
| `refs/heads/main`                           | **`8a4b5942f6a0e1182e04f00eaa9adf1b91943677`**                                                                     |
| Last commit subject                         | _"docs(roadmap): add master roadmap, decision log and progress tracking"_ — documentation only                     |
| Working-tree status                         | **Not verifiable** — no shell on the device in this session (`device_bash` is not available), only file read/write |

**The previous gate's phrasing was too broad and is corrected here: the CONTAINER tree is not a git worktree; the owner's repository is.** No commit was created and none is claimed.

### The container and the owner's repository have diverged — this matters for release

| Evidence                           | Finding                                            |
| ---------------------------------- | -------------------------------------------------- |
| `E:\…\packages\extension\` listing | **no `wxt.e2e.config.ts`**                         |
| `E:\…\package.json` scripts        | **no `build:e2e`**                                 |
| newest backup zip on `E:\`         | `ws9-extension-e2e-harness-2026-09-05.zip` (DL-86) |

**The owner's authoritative working tree is at the DL-86 state. It does not contain Decision A (DL-88) or Decision E (DL-89).** And the last _commit_ is older still — a docs-only commit from 2026-08-30, so WS4–WS9 are uncommitted even there.

**Consequence:** a package built from `E:\Codes\playwrightguru` today would **not** be the artifact audited in this report. Mirroring is an **OWNER ACTION** (§17), and the audited package is delivered to that folder so the owner has the exact bytes.

### A `.gitignore` hazard I introduced at DL-88, now corrected

DL-88 stated _"this repository had no `.gitignore` at all"_ and created one containing only `.output-e2e`. **That was wrong.** The owner's repository has a **1,799-byte `.gitignore` dated before this session**, covering `node_modules/`, `dist/`, `.output/`, `.wxt/`, `*.tsbuildinfo`, coverage, `.env*`, `*.pem`, `*.key`, `*.p12`, `secrets.json`, logs, editor files, `*.zip` and `*.crx`.

Had the DL-88 file reached the owner's repository it would have **replaced** that with a near-empty one — un-ignoring `node_modules/`, `.output/` and **secret patterns**. The real rules are now restored verbatim with `.output-e2e/` appended, and the DL-88 guard was corrected to assert both the addition **and** the rules that were nearly lost. **Owner decision F is withdrawn** — it rested on a false premise.

---

## 2. Backups

| Purpose                   | Path                                                                |
| ------------------------- | ------------------------------------------------------------------- |
| DL-88 post-change         | `/home/claude/ws9-decision-a-e2e-closure-2026-09-05.zip`            |
| Decision E pre-change     | `/home/claude/ws9-decision-e-PRE-CHANGE-2026-09-05.zip`             |
| Decision E post-change    | `/home/claude/ws9-decision-e-truthfulness-2026-09-05.zip`           |
| **This gate, PRE-CHANGE** | **`/home/claude/ws9-final-release-gate-PRE-CHANGE-2026-09-05.zip`** |
| **This gate, final**      | **`/home/claude/ws9-final-release-gate-2026-09-05.zip`**            |

The tree at the start of this gate was verified **identical** to the Decision E post-change backup (`diff -rq`, no differences). No prior backup was overwritten.

---

## 3. Production / E2E separation — behavioural, not by byte size

| Check                                                                                                                                                                                                      | Result                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `.output` and `.output-e2e` deleted and rebuilt clean                                                                                                                                                      | ✅                                                                          |
| Production manifest `name`                                                                                                                                                                                 | `Playwright Guru`                                                           |
| E2E manifest `name`                                                                                                                                                                                        | `Playwright Guru — E2E RECORDING BUILD`                                     |
| Manifest keys differing                                                                                                                                                                                    | **exactly one: `name`**                                                     |
| Permissions, both artifacts                                                                                                                                                                                | identical — `activeTab`, `storage`, `scripting`, `sidePanel` + `<all_urls>` |
| Production artifact contains `recording-enabled` / `wxt.e2e` / `output-e2e` / `E2E RECORDING BUILD` / `node:test` / `launchPersistentContext` / `mkdtemp` / `pg-e2e-profile` / `harness.mjs` / `127.0.0.1` | **0 files each**                                                            |
| **`START_RECORDING` in the production artifact**                                                                                                                                                           | **`{"ok":false,"error":"recording-disabled"}`**                             |
| lifecycle after a refused start                                                                                                                                                                            | `inactive`                                                                  |
| observation / workflow rows written by a refused start                                                                                                                                                     | **none**                                                                    |
| E2E build reachable from `build`, `verify`, `zip`, `package`                                                                                                                                               | **no** — guarded and mutation-tested (WS9-DA-6)                             |

**Production recording is fail-closed, measured in the shipped artifact, in real Chromium.**

---

## 4. Real Chromium — PRODUCTION artifact smoke test

Automated, against `.output/chrome-mv3`. **Not manual.**

| #   | Check                                          | Result                                             |
| --- | ---------------------------------------------- | -------------------------------------------------- |
| 1   | extension loads (runtime-derived id)           | ✅                                                 |
| 2   | service worker running                         | ✅                                                 |
| 3   | content script answers                         | ✅ `inactive`                                      |
| 4   | Side Panel loads                               | ✅ HTTP 200, title `Playwright Guru`               |
| 5   | **core locator workflow** — pick → real engine | ✅ chain `role`, 2 candidates, `tagName: button`   |
| 6   | locator verification                           | ✅ see §5                                          |
| 7   | generated Playwright code                      | ✅ `getByRole('button', { name: 'Save' })`         |
| 8   | copy affordance present                        | ✅ (clipboard write not automatable headless)      |
| 9   | reload                                         | ✅ content script re-injects, answers in **38 ms** |
| 10  | tab switch                                     | ✅ second tab answers                              |
| 11  | production recording OFF                       | ✅                                                 |
| 12  | `START_RECORDING` fails closed                 | ✅ `recording-disabled`                            |
| 13  | no recording banner, no Rec button             | ✅                                                 |
| 14  | permissions                                    | ✅ unchanged                                       |
| 15  | console errors after reload                    | ✅ **none**                                        |

**No fabricated `.nth(0)`. No raw `page.locator('button')` fallback.**

---

## 5. CSS / XPath truth, in the shipped artifact

| Selector                                | Type       | Result                                                                      |
| --------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| `#save`                                 | css        | `ok=true count=1 visible=1`                                                 |
| `button`                                | css        | `ok=true count=1 visible=1`                                                 |
| `body *`                                | css        | `ok=true count=4 visible=4`                                                 |
| `#nope`                                 | css        | `ok=true count=0 visible=0` — zero is an answer, not an error               |
| `###`                                   | css        | `ok=false` · `INVALID_SELECTOR` · count `-1` sentinel, not a fabricated 0   |
| `//button`                              | xpath      | `ok=true count=1 visible=1`                                                 |
| `//*`                                   | xpath      | `ok=true count=9 visible=6` — **total and visible correctly distinguished** |
| `//nope`                                | xpath      | `ok=true count=0 visible=0`                                                 |
| `//[`                                   | xpath      | `ok=false` · `INVALID_XPATH`                                                |
| `getByRole('button', { name: 'Save' })` | expression | `verified`, matchCount 1, visibleMatchCount 1, real chain                   |

**WS7's contract holds in the artifact that would be uploaded.**

---

## 6. Recording data safety — runtime proof

A local probe page with a `type="password"` field and an `autocomplete="cc-number"` field. **The values typed were deliberate non-secrets** (`NOT-A-REAL-PASSWORD-0000`, and the industry test card number). No real password, key, token, card or user data was used.

```
steps recorded : 4
  - fill   on u    value="ordinary-visible-text"
  - fill   on p    value=null        ← password
  - fill   on c    value=null        ← payment
  - click  on go   value=null
PASSWORD placeholder in storage  : ABSENT
card-like test number in storage : ABSENT
observation contains it          : ABSENT
panel / workspace shows it       : ABSENT
```

And the generated code does **not** invent a substitute value:

```js
await page.getByRole('textbox', { name: 'User' }).fill('ordinary-visible-text');
// fill: value withheld (password) — supply it yourself
// fill: value withheld (payment) — supply it yourself
await page.getByRole('button', { name: 'Go' }).click();
```

**The step is preserved, the value is withheld, the reason is named, and nothing is fabricated.** Sensitivity classification is broader than `type=password` — `autocomplete: cc-number` is caught too.

---

## 7. §9 Dispatch / re-injection matrix — production artifact

| Case                              | Result                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------- |
| A. injectable http page           | live ok · `inactive`                                                         |
| B. after normal reload            | live ok · `inactive` (**38 ms**)                                             |
| C. content-script replacement     | `dispatchToTab` re-injects on `Receiving end does not exist`, then retries   |
| D. `about:blank` (non-injectable) | unreachable; **re-injection REFUSED** — `Cannot access contents of the page` |
| E. non-injectable page            | same class as D                                                              |
| F. tab close                      | unreachable, as expected                                                     |
| G. tab switch                     | second tab answers `inactive`                                                |
| H. SPA `history.pushState`        | live ok · `inactive`                                                         |

**The stale-durable window is confined to pages the extension cannot inject into.** On any injectable page a dead content script is replaced within one poll and live evidence wins.

---

## 8. §10 Decision E regression

|                                              | RELOAD                       | DEATH (`about:blank`)                          |
| -------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| live authority after                         | **ok · `inactive` (+38 ms)** | gone (+25 ms)                                  |
| durable row                                  | still `active`               | still `active`                                 |
| **actionable "perform actions" instruction** | **absent**                   | **absent**                                     |
| **green blinking recording indicator**       | **absent**                   | **absent**                                     |
| after `heartbeatTimeoutMs`                   | n/a                          | `The recorder stopped responding` (+15,022 ms) |

**Decision E holds and normal reload is not broken.** (In the harness the panel is durable-fed — `UNTRUSTED_SENDER`, owner decision B — so the reload row's live recovery is measured at the authority, which is the release-critical fact.)

---

## 9. Owner decisions G and H — classified

**G — the picker lock-out while unconfirmed. NON-BLOCKING.**
Today `recordButtonModel(...).live` stays `true` for an unconfirmed `active`, so **Inspect stays disabled** — the _conservative_ state. It cannot select a wrong tab (the panel is bound to `panel.pick.tabId`), cannot create a false recording claim (Decision E withdrew the claim and the colour), cannot lose actions (nothing is recording), and does not conflict with LIVE > DURABLE. The only cost is that Inspect may be unavailable for up to one heartbeat timeout on a non-injectable page. **Unlocking it would be the riskier change** — it could arm the picker during a transient failure while a recording is genuinely live. **Not implemented; not a release blocker.**

**H — the untyped `ok:false` from dispatch/re-injection. NON-BLOCKING ARCHITECTURAL DEBT.**
`dispatchToTab` distinguishes "the content script is missing" (re-inject and retry) from "this page cannot host one" and reports both as `{ok:false, error:<string>}` with no `code`. After Decision E the consequence is bounded: the panel makes no actionable claim, keeps Inspect locked, and shows an honest "unconfirmed" line until expiry. A typed code would shorten the **view** window as well as the claim — a change to the message contract and to DL-79's inputs. **Not implemented, per the gate's own instruction. Owner decision.**

---

## 10. WS9 inventory

| #   | Item                                    | Status                    | Evidence                               | Release impact              | Required before store? |
| --- | --------------------------------------- | ------------------------- | -------------------------------------- | --------------------------- | ---------------------- |
| 1   | Action count                            | IMPLEMENTED               | DL-84; "1 action recorded" observed    | none (recording off)        | no                     |
| 2   | Refusal feedback                        | IMPLEMENTED               | DL-84; typed 5-member taxonomy         | none                        | no                     |
| 3   | Durable refusal observation             | IMPLEMENTED               | DL-84 additive fields, schema 1        | none                        | no                     |
| 4   | Export clipboard                        | IMPLEMENTED               | DL-80; workspace renders real code     | none                        | no                     |
| 5   | Structured code workspace               | IMPLEMENTED               | DL-81; observed rendering              | none                        | no                     |
| 6   | V1 code-path retirement                 | IMPLEMENTED               | DL-82                                  | none                        | no                     |
| 7   | Navigation semantics                    | IMPLEMENTED               | DL-83; §7 matrix                       | none                        | no                     |
| 8   | SPA semantics                           | IMPLEMENTED               | DL-83; §7 case H                       | none                        | no                     |
| 9   | Tab semantics                           | IMPLEMENTED               | DL-83; §7 cases F/G                    | none                        | no                     |
| 10  | Language preference persistence         | IMPLEMENTED               | DL-85 `PW_LANG` + legacy map           | none                        | no                     |
| 11  | 40-action warning                       | IMPLEMENTED               | `recordingLimitState`, unit-tested     | none                        | no                     |
| 12  | 100-action hard stop                    | IMPLEMENTED               | `shouldStopRecording`, unit-tested     | none                        | no                     |
| 13  | **Password exclusion**                  | **IMPLEMENTED**           | **§6 runtime proof**                   | **privacy-critical, PASS**  | **yes — met**          |
| 14  | Workflow size limit                     | IMPLEMENTED               | `maxWorkflowBytes` 512,000             | none                        | no                     |
| 15  | Content-script death E2E                | IMPLEMENTED               | DL-86/88/89; 15/15                     | none                        | no                     |
| 16  | Recording-enabled E2E proof             | IMPLEMENTED               | DL-88 isolated artifact                | none                        | no                     |
| 17  | **Production recording flag**           | **IMPLEMENTED — `false`** | **§3 behavioural**                     | **safety-critical, PASS**   | **yes — met**          |
| 18  | iframe recording                        | DEFERRED                  | refused as UNRECORDABLE (DL-83)        | none — recording is off     | no                     |
| 19  | `frameLocator`                          | DEFERRED                  | honest refusal, no fake representation | none                        | no                     |
| 20  | Full-page reload resumption             | DEFERRED                  | reload correctly ends the session      | none                        | no                     |
| 21  | Browser-restart recovery                | DEFERRED                  | `area: session` by design (DL-79)      | none                        | no                     |
| 22  | V1 stored-data migration                | DEFERRED                  | DL-82 — data preserved, untouched      | none — nothing reads it     | no                     |
| 23  | Download                                | DEFERRED                  | clipboard export works                 | none — no permission needed | no                     |
| 24  | Refusal visibility after recorder death | DEFERRED                  | tally frozen, never fabricated         | none                        | no                     |
| 25  | Per-reason refusal histogram            | DEFERRED                  | last-reason shown                      | none                        | no                     |
| 26  | `limit-reached` reachability            | DEFERRED                  | unreachable while recording is off     | none                        | no                     |
| 27  | **Decision E**                          | **RESOLVED (DL-89)**      | §8                                     | truthfulness, PASS          | yes — met              |
| 28  | **Manual regression**                   | **NOT RUN**               | Gate 1.10 rows outstanding             | **repo's own blocker**      | **YES — OUTSTANDING**  |
| 29  | axe                                     | **BLOCKED**               | not a dependency; not installed        | Gate re-baselined at DL-62  | no                     |
| 30  | CI E2E                                  | **BLOCKED**               | no browser in `ci.yml`                 | not a declared release gate | no                     |

**Every deferred item is non-blocking for the same structural reason: `RECORDING_ENABLED = false`, so no recording feature is reachable by a user in the shipped artifact.** They are future capability, not broken behaviour.

---

## 11. Release-blocker decision table

| Area                     | Status                          | Evidence                                          | Release Blocker        |
| ------------------------ | ------------------------------- | ------------------------------------------------- | ---------------------- |
| Decision E               | RESOLVED                        | DL-89; §8 regression                              | No                     |
| Production recording OFF | PASS                            | §3 behavioural, real Chromium                     | No                     |
| Core locator engine      | PASS                            | §4 pick through the real engine                   | No                     |
| Locator truth            | PASS                            | no `nth(0)`, no raw-tag fallback                  | No                     |
| CSS/XPath truth          | PASS                            | §5, all ten cases                                 | No                     |
| Recording lifecycle      | PASS                            | §7, §8                                            | No                     |
| Storage                  | PASS                            | WS4 fail-closed; refused start writes nothing     | No                     |
| Privacy                  | PASS                            | §6 runtime; no network in artifact                | No                     |
| Security                 | PASS                            | no `eval`†, no `new Function`, no `innerHTML`‡    | No                     |
| Permissions              | PASS                            | unchanged; none added since approval              | No                     |
| Manifest                 | PASS                            | MV3, valid, `minimum_chrome_version: 114`         | No                     |
| Side Panel               | PASS                            | §4                                                | No                     |
| DevTools                 | PASS                            | panel builds; fixed-script `inspectedWindow.eval` | No                     |
| Export                   | PASS                            | §6 — no secret, no fabrication                    | No                     |
| Workspace                | PASS                            | §6                                                | No                     |
| Navigation               | PASS                            | §7                                                | No                     |
| Tab semantics            | PASS                            | §7 F/G                                            | No                     |
| Reload                   | PASS                            | §7 B, §8                                          | No                     |
| Content-script death     | PASS                            | §7 D, §8                                          | No                     |
| Production E2E           | PASS                            | 15/15 real Chromium                               | No                     |
| **Manual Chrome**        | **NOT RUN**                     | Gate 1.10 rows outstanding                        | **YES — owner action** |
| Accessibility            | BLOCKED (axe) / structural PASS | DL-62 re-baseline                                 | No                     |
| CI                       | BLOCKED                         | no browser environment                            | No                     |
| Bundle                   | DISCLOSED                       | 316,751 B; over the historical ceiling            | No                     |
| Package integrity        | PASS                            | §12 — 16 files, zero leaks                        | No                     |
| **Web Store listing**    | **MISSING**                     | no icons, no screenshots, no copy                 | **YES — owner action** |
| **Privacy policy**       | **MISSING**                     | required for locally-handled user data            | **YES — owner action** |
| Version                  | OWNER DECISION                  | `0.1.0`, consistent everywhere                    | No                     |

† the one `eval(` in the artifact is `chrome.devtools.inspectedWindow.eval(TAG_SCRIPT, …)` — the DevTools API, not JavaScript `eval`, called with a **constant** script that sets one attribute on `$0`. ‡ the five `innerHTML` hits are React DOM's own internals; our source contains none.

---

## 12. Package integrity

```
path     packages/extension/.output/release/playwright-guru-0.1.0-chrome.zip
size     101,632 bytes · 16 files
zip sha256      f08a77a7b5ea7484a45500a8b86e8eadcd95a65381bf2d441f735eb07446b879
content sha256  eb95bd35167cdf98313b21f5d75346bbd024022414dbccff4d962921bd998528
```

The **zip** hash is not byte-stable across rebuilds — ZIP embeds mtimes — so a **content** hash (sorted per-file sha256 of the unpacked artifact) is given alongside it. That is the value to compare.

Contents: 1 `manifest.json`, 4 HTML, 10 JS, 1 CSS. **No** `.ts`, `.map`, `node_modules`, nested `chrome-mv3/`, `.wxt/`, `.tsbuildinfo` or `.env` — asserted by `scripts/validate-package.mjs`, which exits non-zero on any of them.

Scanned for `recording-enabled`, `E2E RECORDING BUILD`, `output-e2e`, `node:test`, `launchPersistentContext`, `mkdtemp`, `wxt.e2e`, `harness`, `127.0.0.1`, `/home/claude`, `E:\Codes`, `sk-` → **0 hits each**. `password` appears twice: the content script's **sensitivity classifier** (the safety feature) and React's input-type table. **No secret values.**

**`.output-e2e` (321,096 B) is never packaged** — the validator hard-codes `.output/chrome-mv3`.

---

## 13. Validation

| Command             | Result                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm build`        | **PASS** — 316,751 B, clean rebuild                                                              |
| `pnpm typecheck`    | **PASS** — 0 errors                                                                              |
| `pnpm lint`         | **PASS** — 0 errors; 3 pre-existing warnings (unused `eslint-disable`)                           |
| `pnpm test`         | **PASS** — **1,974 tests / 70 files**                                                            |
| goldens             | **PASS** — **127 / 127**                                                                         |
| `pnpm format:check` | **1 file** — `ws2-item9-report.md`, the known permanent exception, **not edited to force green** |
| `pnpm build:e2e`    | **PASS** — 321,096 B in `.output-e2e`                                                            |
| `pnpm test:e2e`     | **PASS — 15 / 15**                                                                               |
| `pnpm package`      | **PASS** — structure valid; icons warning stands                                                 |

**This is not "all green" and is not described as such.**

---

## 14. Bundle

| File                         | Bytes       |
| ---------------------------- | ----------- |
| `chunks/client-*.js` (React) | 142,932     |
| `chunks/tokens-*.js`         | 91,183      |
| `content-scripts/content.js` | 48,591      |
| `background.js`              | 11,874      |
| `chunks/sidepanel-*.js`      | 11,237      |
| `assets/tokens-*.css`        | 4,756       |
| everything else              | 6,178       |
| **total**                    | **316,751** |

Δ **0** from the Decision E baseline; **no production source changed in this gate**. It stands 37,991 B (13.63 %) above the historical 278,760 B ceiling — **disclosed, unchanged, and not a release problem**: the packaged zip is 101,632 B, well within Chrome's limits, and the roadmap has carried this overage as owner-level budget debt since DL-56. **No optimisation was attempted**, per §15.

---

## 15. Why the verdict is NOT RELEASE READY

The blockers are not defects. They are **release inputs only the owner can supply**, and the repository's own `RELEASE-GATES.md` already lists three of them as v0.1.x blockers.

1. **Icons — absent entirely.** No `icons`, no `action.default_icon`, no PNG anywhere. Gate 1.6 records _"icons still blocked"_; the packager prints _"NONE — release input still outstanding"_ on every run. The Chrome Web Store requires a **128×128 store icon** to publish, and the extension would otherwise ship with Chrome's puzzle-piece mark. **I cannot create artwork, and inventing one is not a technical decision.**

2. **Privacy policy — none exists.** Current policy requires one for any extension that handles user data _"even when data is processed or stored locally on a user's device"_. Playwright Guru stores picks and code buffers in `chrome.storage`. Gate 4 requires _"privacy policy hosted at a real URL"_. **§37 forbids inventing one, and I have not.**

3. **Store listing assets — none exist.** At least one 1280×800 screenshot, a 440×280 small promo tile, a detailed description, and a primary category. Gate 1.7 (_"Store copy claims nothing the smoke matrix has not shown"_) is unchecked, and the README has no store copy.

4. **Manual Chrome validation — not run.** Gate 1.10 records the Side-Panel rows as executed (24-screenshot capture, 2026-08-30) and the **DevTools / Verify / privacy / language rows as NOT EXECUTED**. Gate 1.11's clean-**clone** load also still requires the owner. Everything in this report is **automated** browser evidence; none of it is manual validation and none is presented as such.

**And `RELEASE-GATES.md` Gate 4 states plainly: "Publishing is PAUSED until explicitly resumed."** Nothing in this gate resumes it.

### Documentation staleness found, not silently fixed

`RELEASE-GATES.md` Gate 3 lists 3.1 (one recommendation) and 3.3 (rationale codes) as ⬜ unchecked, but `src/ui/panel/RecommendedCard.tsx` and `src/ui/copy/recommendation.ts` implement both. Gate 3 is explicitly _"not a hard blocker"_, so this does not change the verdict — it is **reported as stale, and re-verifying every Gate 3 row is left to the owner** rather than ticked off by me.

---

## 16. Deferred, non-blocking — and what each would take

| Item                                               | Why it is not a blocker                                      | Future work                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| iframe recording · `frameLocator`                  | recording is off; frame targets are _refused_, never faked   | a frame-aware chain representation + an owner decision on `frameLocator` semantics |
| full-page reload resumption                        | reload correctly ends the session; nothing claims otherwise  | durable session hand-off across injection                                          |
| browser-restart recovery                           | `area: session` is an authorised boundary (DL-79)            | a scope change plus a retention decision                                           |
| V1 stored-data migration                           | the data is preserved and read by nothing (DL-82)            | an owner-authorised, honest conversion contract                                    |
| Download                                           | clipboard export works; Download would need a new permission | a `downloads` permission decision                                                  |
| refusal histogram · refusal visibility after death | last-reason is shown; nothing is fabricated                  | a UI decision                                                                      |
| `limit-reached` reachability                       | unreachable while recording is off                           | reachable only once recording ships                                                |
| axe-core                                           | Gate re-baselined at DL-62 to structural evidence            | one ad-hoc install + harness work (owner decision D)                               |
| CI E2E                                             | not a declared release gate                                  | a browser environment in `ci.yml` (owner decision C)                               |

---

## 17. Owner actions

**Blocking publication**

1. **Icons** — 16/32/48/128 for the manifest and a 128×128 store icon.
2. **Privacy policy** at a real, hosted URL, plus the dashboard Privacy Practices tab (data-use disclosures, limited-use certification, permission justifications for `<all_urls>`, `activeTab`, `scripting`, `storage`, `sidePanel`, and the single-purpose statement).
3. **Listing assets** — ≥1 screenshot at 1280×800, a 440×280 small promo tile, detailed description, primary category, language.
4. **Manual Chrome validation** — the outstanding Gate 1.10 rows (DevTools, Verify, privacy, language) and Gate 1.11's clean-clone load.
5. **Mirror the audited tree to `E:\Codes\playwrightguru`** and commit. The owner's tree is at DL-86 and its last commit is docs-only from 2026-08-30, so a package built there today would not be this one.

**Decisions**

6. **Version** — `0.1.0` is valid and internally consistent. Whether to publish as `0.1.0` or bump is the owner's call; **no version was changed**.
7. **(B)** side-panel container automation · **(C)** CI browser environment · **(D)** axe-core · **(G)** picker lock-out while unconfirmed · **(H)** typed "cannot host a content script" ack code.
8. **(F) is WITHDRAWN** — see §1; it rested on a false premise.
9. **Name review** — "Playwright Guru" is descriptive use of an open-source framework name. Store review sometimes queries third-party names. Worth a reviewer note; **no change made**.

---

## 18. HARD STOP

WS10 and WS11 were not started. No deferred WS9 item was implemented. No bundle optimisation, no unrelated cleanup, no architectural change. **Nothing was submitted to the Chrome Web Store, and no submission is claimed.**
