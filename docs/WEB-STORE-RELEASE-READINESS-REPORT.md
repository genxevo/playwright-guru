# Web Store Release Readiness

**Date:** 2026-09-05 · **Decision:** DL-90 · Companion to `WS9-FINAL-RELEASE-GATE-REPORT.md`

> ## NOT WEB STORE RELEASE READY
>
> The **artifact** is sound: every technical gate that could be executed passed, in a real Chromium, against the exact package that would be uploaded. What is missing is **four owner-supplied release inputs** — icons, a privacy policy, listing assets, and manual validation — three of which the repository's own `RELEASE-GATES.md` already lists as v0.1.x blockers.

---

## Production Artifact

|                |                                                                       |
| -------------- | --------------------------------------------------------------------- |
| Built from     | `packages/extension/.output/chrome-mv3` (clean rebuild)               |
| Package        | `packages/extension/.output/release/playwright-guru-0.1.0-chrome.zip` |
| Size           | **101,632 bytes**, 16 files                                           |
| Unpacked       | 316,751 bytes                                                         |
| zip sha256     | `f08a77a7b5ea7484a45500a8b86e8eadcd95a65381bf2d441f735eb07446b879`    |
| content sha256 | `eb95bd35167cdf98313b21f5d75346bbd024022414dbccff4d962921bd998528`    |
| Built          | 2026-09-05                                                            |

The **content** hash is the stable one — ZIP embeds mtimes, so the archive hash changes on every rebuild while the contents do not.

**This package has not been uploaded anywhere.**

---

## Version

`0.1.0`, consistent across `packages/extension/package.json`, the WXT config and the generated manifest. Valid for a first submission. **Not changed** — a bump is an owner decision.

---

## Manifest

```json
{
  "manifest_version": 3,
  "name": "Playwright Guru",
  "description": "Click any element on a page and get idiomatic Playwright, CSS, and XPath locators instantly.",
  "version": "0.1.0",
  "minimum_chrome_version": "114",
  "permissions": ["activeTab", "storage", "scripting", "sidePanel"],
  "host_permissions": ["<all_urls>"],
  "side_panel": { "default_path": "sidepanel.html" },
  "background": { "service_worker": "background.js" },
  "action": { "default_title": "Playwright Guru", "default_popup": "popup.html" },
  "devtools_page": "devtools.html",
  "content_scripts": [
    { "matches": ["<all_urls>"], "all_frames": true, "js": ["content-scripts/content.js"] }
  ]
}
```

Valid MV3. Name 15 chars (limit 75), description 91 chars (limit 132). `minimum_chrome_version: 114` is correct — `chrome.sidePanel` landed there. **`icons` and `action.default_icon` are ABSENT.**

---

## Permissions

| Permission          | Why                                                      | Changed? |
| ------------------- | -------------------------------------------------------- | -------- |
| `activeTab`         | act on the tab the user is inspecting                    | no       |
| `storage`           | picks, code buffer, language preference                  | no       |
| `scripting`         | `executeScript` re-injection fallback in `dispatchToTab` | no       |
| `sidePanel`         | the entire UI                                            | no       |
| `<all_urls>` (host) | first Inspect click on a pre-existing tab                | no       |

**Identical to the previously approved set. Nothing was added — not for E2E, recording, Download, CI, iframes or convenience.** DL-86 explicitly refused to add `tabs` when it would have made a test easier, and that decision still stands. Asserted from inside the running browser on **both** artifacts.

Each still needs a dashboard justification at submission — an owner action.

---

## Privacy

**In the artifact:** zero `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`. No analytics, no telemetry, no remote logging. Nothing leaves the machine.

**At runtime**, measured with deliberate non-secret values:

| Field                      | Captured?                       |
| -------------------------- | ------------------------------- |
| ordinary text input        | yes — `"ordinary-visible-text"` |
| `type="password"`          | **no — `value: null`**          |
| `autocomplete="cc-number"` | **no — `value: null`**          |

The placeholder and the test card number were **absent from** the durable workflow, the observation record, and everything the panel renders. Generated code names the omission instead of inventing a value:

```js
// fill: value withheld (password) — supply it yourself
// fill: value withheld (payment) — supply it yourself
```

**Not compliant yet, for one reason:** current Chrome Web Store policy requires a privacy policy for any extension that handles user data _"even when data is processed or stored locally"_. Playwright Guru stores picks and code buffers in `chrome.storage`. **No privacy policy exists, and none was invented.**

---

## Security

| Check                                  | Result                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| JavaScript `eval`                      | **none**                                                                                                   |
| `new Function`                         | **none**                                                                                                   |
| `innerHTML` written by our code        | **none** — the 5 artifact hits are React DOM internals                                                     |
| `chrome.devtools.inspectedWindow.eval` | present, **constant** script (`TAG_SCRIPT`) that sets one attribute on `$0`; no interpolation of user data |
| remote code                            | none — everything is bundled                                                                               |
| secrets in the package                 | none                                                                                                       |
| host paths / developer paths           | none                                                                                                       |

---

## Locator Engine

One `LocatorResolver`, `DomProbe` as the boundary, verified chains only. Measured in the shipped artifact: a real pick produced a `role` chain with 2 candidates; **no `.nth(0)` fallback, no `page.locator('button')` raw-tag fallback**. Ambiguity is reported, never silently resolved. Frame targets are refused as unrecordable rather than represented falsely.

**CSS/XPath truth**, all ten cases: unique → `count=1 visible=1`; multiple → real totals with visible distinguished (`//*` → 9 total, 6 visible); zero → `count=0` as an _answer_; invalid → `ok=false` with a typed `INVALID_SELECTOR` / `INVALID_XPATH` code and a `-1` sentinel rather than a fabricated `0`.

---

## Recording Safety

**`RECORDING_ENABLED = false` in production**, and the artifact proves it rather than the source asserting it:

```
manifest.name   : Playwright Guru
START_RECORDING : {"ok":false,"error":"recording-disabled"}
lifecycle       : inactive
storage written : none
Side Panel      : no RECORDING banner, no Rec button
```

The recording-enabled build is a **separate artifact** (`.output-e2e`, manifest name `Playwright Guru — E2E RECORDING BUILD`) produced only by an explicit `pnpm build:e2e`, reachable from no build, verify, zip or package script, and it never enters the release path. The two manifests differ in **exactly one key** — `name`; the permission sets are identical.

Decision E (DL-89) is in effect: the panel makes no actionable recording claim it has not confirmed with the live authority, and withdraws the green indicator with the sentence.

---

## Storage

WS4 namespacing (`pg:v2:…`), schema envelope, hand-written validators, fail-closed reads, refused writes, tab-scoped session cleanup. Measured: a **refused** `START_RECORDING` writes **no** observation and **no** workflow row — a rejected request leaves no trace that could later look like a state change. Durable recording state cannot survive a browser restart (`area: 'session'`) and cannot outlive its heartbeat (expiry re-derived on every read).

---

## Accessibility

**axe: NOT RUN / BLOCKED** — `axe-core` is not a dependency and is not installed. **No axe PASS is claimed.**

Structural accessibility was re-baselined as the release bar by owner decision at DL-62 and is in place: accessible names on icon-only controls, `aria-pressed` / `aria-busy` on the record control, a polite `role="status"` live region, a focus ring retuned to clear 3:1 against every surface token per theme, reduced-motion support, and a 9-state error matrix each with a title, cause and action.

---

## Automated Tests

|                     |                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------- |
| Vitest              | **1,974 / 70 files**                                                                  |
| Goldens             | **127 / 127**                                                                         |
| E2E (real Chromium) | **15 / 15**                                                                           |
| Build               | PASS                                                                                  |
| Typecheck           | 0 errors                                                                              |
| Lint                | 0 errors, 3 pre-existing warnings                                                     |
| `format:check`      | **1** — `ws2-item9-report.md`, the known permanent exception, deliberately not edited |

---

## Real Browser

**Automated E2E: PASS.** 15/15 against both artifacts, plus a production smoke run covering extension load, service worker, content script, Side Panel, the core locator workflow, verification, generated code, reload, tab switch, SPA navigation, tab close, `about:blank`, recording fail-closed and console errors (**none**).

**Manual Chrome: NOT RUN.** Everything above is automated. `RELEASE-GATES.md` Gate 1.10 records the Side-Panel rows as executed by a 24-screenshot capture on 2026-08-30 and the **DevTools / Verify / privacy / language rows as NOT EXECUTED**; Gate 1.11's clean-clone load also still needs the owner.

**CI: BLOCKED.** `.github/workflows/ci.yml` installs no browser; the E2E suite is local-only.

---

## Bundle

316,751 B unpacked · **101,632 B packaged**. Δ 0 from the Decision E baseline — no production source changed in this gate. React accounts for 142,932 B of it. The figure stands 37,991 B (13.63 %) above the historical 278,760 B ceiling, carried as disclosed owner-level budget debt since DL-56. **Not a release problem** and **no optimisation was attempted**.

---

## Package Integrity

16 files: 1 manifest, 4 HTML, 10 JS, 1 CSS. No TypeScript, no source maps, no `node_modules`, no nested `chrome-mv3/`, no `.wxt/`, no `.tsbuildinfo`, no `.env` — enforced by `scripts/validate-package.mjs`, which exits non-zero on any of them.

Scanned for `recording-enabled`, `E2E RECORDING BUILD`, `output-e2e`, `node:test`, `launchPersistentContext`, `mkdtemp`, `wxt.e2e`, `harness`, `127.0.0.1`, `/home/claude`, `E:\Codes`, `sk-` → **zero hits each**. The only `password` occurrences are the content script's **sensitivity classifier** and React's input-type table.

---

## Web Store Requirements

Checked against current official documentation (September 2026).

| Requirement                                    | Status                                                       |
| ---------------------------------------------- | ------------------------------------------------------------ |
| Valid MV3 package                              | ✅                                                           |
| Version                                        | ✅ `0.1.0`                                                   |
| Extension name                                 | ✅ 15/75 chars                                               |
| Detailed description                           | ❌ **OWNER ACTION** — none written                           |
| **128×128 store icon**                         | ❌ **OWNER ACTION** — no icon anywhere                       |
| **≥1 screenshot, 1280×800**                    | ❌ **OWNER ACTION**                                          |
| 440×280 small promo tile                       | ❌ **OWNER ACTION**                                          |
| Marquee tile (1400×560)                        | optional                                                     |
| Primary category                               | ❌ **OWNER ACTION**                                          |
| Language                                       | ❌ **OWNER ACTION**                                          |
| **Privacy policy URL**                         | ❌ **OWNER ACTION** — required for locally-handled user data |
| Privacy Practices / data-use disclosures       | ❌ **OWNER ACTION**                                          |
| Limited-use certification                      | ❌ **OWNER ACTION**                                          |
| Permission justifications (incl. `<all_urls>`) | ❌ **OWNER ACTION**                                          |
| Single-purpose statement                       | ❌ **OWNER ACTION**                                          |
| Support / contact                              | ❌ **OWNER ACTION**                                          |
| Developer account                              | ❌ **OWNER ACTION** — cannot be verified from here           |

**No URL, category, description or asset was invented.**

---

## Release Blockers

1. **Icons — absent entirely.** Blocks publication (128×128 store icon required); Gate 1.6 already records it.
2. **Privacy policy — none.** Required by current policy for locally-handled user data; Gate 4 requires it hosted at a real URL.
3. **Store listing assets — none.** Screenshot, promo tile, description, category, language.
4. **Manual Chrome validation — not run.** Gate 1.10 rows outstanding; Gate 1.11 clean-clone load outstanding.

**None is a code defect. All four are owner-supplied inputs.**

And `RELEASE-GATES.md` Gate 4 states: **"Publishing is PAUSED until explicitly resumed."** Nothing here resumes it.

---

## Deferred Work

iframe recording · `frameLocator` · full-page reload resumption · browser-restart recovery · V1 stored-data migration · Download · refusal histogram · refusal visibility after recorder death · `limit-reached` reachability · axe-core · CI browser environment.

**All non-blocking for one structural reason: `RECORDING_ENABLED = false`, so no recording feature is reachable by a user in the shipped artifact.** Each is future capability, not broken behaviour. WS10 and WS11 are not started.

---

## Owner Actions

1. Icons — 16/32/48/128 plus the 128×128 store icon.
2. Privacy policy at a real URL + the dashboard Privacy Practices tab.
3. Listing assets — screenshot, promo tile, description, category, language.
4. Manual Chrome validation — the outstanding Gate 1.10 / 1.11 rows.
5. **Mirror this tree to `E:\Codes\playwrightguru` and commit** — that repository is at the DL-86 state and its last commit (`8a4b594`, 2026-08-30) is docs-only, so a package built there today would not be this one.
6. Version decision — publish as `0.1.0` or bump.
7. Open decisions **(B)** side-panel automation · **(C)** CI · **(D)** axe-core · **(G)** picker lock-out · **(H)** typed dispatch ack code. **(F) is withdrawn** — the repository does have a `.gitignore`.
8. Reviewer note on the name "Playwright Guru" (descriptive use of a third-party framework name).

---

## Final Verdict

> # NOT WEB STORE RELEASE READY

**The package is built, audited, hash-recorded and technically sound. Publication is blocked on four owner-supplied inputs, not on the code.**

**Nothing was submitted to the Chrome Web Store, and no submission is claimed.**
