/**
 * WS9 CLOSURE GATE — the real-extension fail-closed proof.
 * ============================================================================
 * THE CRITERION, VERBATIM FROM THE ROADMAP:
 *
 *   "An E2E test that kills the content script proves the RECORDING banner
 *    cannot appear."
 *
 * ═══ WHAT THIS FILE PROVES, AND WHAT IT CANNOT ═══
 *
 * It proves, in a real Chromium running the real built extension: that the
 * extension loads with a real service worker; that the real content script runs
 * on a real http fixture page and answers the real `QUERY_RECORDING_STATE`;
 * that killing the content-script execution context by a REAL browser
 * navigation makes that same query fail to deliver — the precise condition
 * `normalizeAck` converts into `NO_HANDLER` and `observedView` collapses to
 * `unknown`; that a durable observation claiming `active`, written into the
 * extension's OWN `chrome.storage.session`, cannot make the live authority say
 * `active`; and that `START_RECORDING` fails closed on the product flag inside
 * the real browser rather than merely being hidden in the UI.
 *
 * IT CANNOT PROVE THE BANNER TRANSITION FROM ACTIVE TO NOT-ACTIVE, AND IT NO
 * LONGER HAS TO. That needs a recording that is genuinely ACTIVE first, and
 * `RECORDING_ENABLED` is `false` in the production build — the runtime refuses
 * `start()` with `recording-disabled`, which test E2E-06 below MEASURES rather
 * than assumes.
 *
 * WS9 Decision A (DL-88) supplied the other half WITHOUT touching that
 * constant: `wxt.e2e.config.ts` builds a separate `.output-e2e` artifact in
 * which one module — `src/config/recording.ts` — is substituted at resolution
 * time, and `test/e2e/ws9-recording-enabled.e2e.mjs` runs the ACTIVE-side proof
 * against it. Production keeps a literal `export const RECORDING_ENABLED =
 * false;` with nothing to override, no environment read, no toggle and no test
 * hook, and E2E-A6 over there measures the two artifacts side by side in one
 * run so that this suite's `recording-disabled` result stays a fact about the
 * shipped build rather than an assumption about it.
 *
 * So THIS file remains the NECESSARY half and is written as such: E2E-09
 * asserts the banner's absence in the SHIPPED artifact and says in its own
 * message that absence alone is not the criterion. Read the two suites
 * together — neither closes the criterion on its own.
 *
 * ═══ WHAT "KILL THE CONTENT SCRIPT" MEANS HERE ═══
 *
 * The fixture tab is navigated to `about:blank`. The manifest matches
 * `<all_urls>`, which `about:blank` is not, so the content-script execution
 * context is destroyed and not recreated while the TAB ITSELF REMAINS — which
 * is the case the architecture must survive. Nothing calls `stop()`, nothing
 * dispatches a synthetic STOP_RECORDING, nothing clears storage by hand and
 * nothing touches an internal runtime API.
 *
 * RUN IT:  pnpm build && pnpm --filter @playwright-guru/extension test:e2e
 * REQUIRES: an ad-hoc `npm i -g playwright` (DL-20 keeps it out of the repo).
 */

import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import {
  EXTENSION_DIR,
  fixtureTabId,
  launchExtension,
  queryTab,
  startFixtureServer,
  until,
} from './harness.mjs';

describe('WS9 closure gate — real extension, real Chromium', { concurrency: 1 }, () => {
  let ext;
  let fixture;
  let page;
  let tabId;

  before(async () => {
    assert.ok(
      existsSync(`${EXTENSION_DIR}/manifest.json`),
      `No built extension at ${EXTENSION_DIR}. Run \`pnpm build\` first.`,
    );
    fixture = await startFixtureServer();
    ext = await launchExtension();
    page = await ext.context.newPage();
    await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
    tabId = await until(() => fixtureTabId(ext.worker), { what: 'the fixture tab to exist' });
  });

  after(async () => {
    await ext?.close();
    await fixture?.close();
  });

  // ── E2E-01/02 — the extension is genuinely loaded ────────────────────────

  it('E2E-01/02 — the real extension is installed and its service worker is running', async () => {
    assert.match(ext.extensionId, /^[a-p]{32}$/, 'a real, runtime-derived extension id');
    const manifest = await ext.worker.evaluate(() => chrome.runtime.getManifest());
    assert.equal(manifest.name, 'Playwright Guru');
    assert.equal(manifest.manifest_version, 3);
    // The permission set is asserted here, in the REAL loaded manifest, so this
    // harness can never quietly acquire one to make itself easier to write.
    assert.deepEqual(manifest.permissions, ['activeTab', 'storage', 'scripting', 'sidePanel']);
  });

  // ── E2E-03 — the real content script is alive ────────────────────────────

  it('E2E-03 — the real content script answers the real lifecycle query', async () => {
    const result = await queryTab(ext.worker, tabId, { type: 'QUERY_RECORDING_STATE' });
    assert.equal(
      result.delivered,
      true,
      'the content script must be reachable before it is killed',
    );
    assert.equal(result.ack.ok, true);
    // `inactive` is the honest answer from a runtime that holds no session. It
    // is ALSO the evidence that a real runtime is there at all: an absent
    // content script cannot produce a successful ack.
    assert.equal(result.ack.lifecycle, 'inactive');
  });

  // ── E2E-04/05 — the real Side Panel document ─────────────────────────────

  it('E2E-04 — the real Side Panel document loads from the extension origin', async () => {
    const panel = await ext.context.newPage();
    const response = await panel.goto(`chrome-extension://${ext.extensionId}/sidepanel.html`);
    assert.equal(response.status(), 200);
    assert.equal(await panel.title(), 'Playwright Guru');
    // It is the real React app, not a stub: the panel's own empty state renders.
    await panel.waitForSelector('text=Ready to inspect', { timeout: 10_000 });
    await panel.close();
  });

  // ── E2E-06 — the flag is a RUNTIME gate, measured in a real browser ──────

  it('E2E-06 — START_RECORDING fails closed on the product flag (BLOCKS an active recording)', async () => {
    // DL-74's claim — "hiding the Record button is not a security boundary; a
    // message can still reach a content script, so the runtime refuses" — has
    // never been verified in a browser until now. This is that verification,
    // and it is simultaneously the reason the full banner transition cannot be
    // proven here: there is no way to reach ACTIVE without changing production.
    const result = await queryTab(ext.worker, tabId, { type: 'START_RECORDING' });
    assert.equal(result.delivered, true);
    assert.equal(result.ack.ok, false, 'the runtime must refuse while the flag is off');
    assert.equal(result.ack.error, 'recording-disabled');

    const after = await queryTab(ext.worker, tabId, { type: 'QUERY_RECORDING_STATE' });
    assert.equal(
      after.ack.lifecycle,
      'inactive',
      'a refused start leaves no session behind — not even `starting`',
    );
  });

  // ── E2E-07 — the content script is really killed ─────────────────────────

  it('E2E-07 — a real navigation destroys the content-script context while the tab survives', async () => {
    await page.goto('about:blank', { waitUntil: 'domcontentloaded' });

    const dead = await until(
      async () => {
        const r = await queryTab(ext.worker, tabId, { type: 'QUERY_RECORDING_STATE' });
        return r.delivered === false ? r : null;
      },
      { what: 'the content script to become unreachable' },
    );

    assert.equal(dead.delivered, false);
    assert.match(
      dead.error,
      /Receiving end does not exist|Could not establish connection/,
      'the exact error `dispatchToTab` catches and `normalizeAck` turns into NO_HANDLER',
    );

    // The TAB is still there. This is content-script death, not tab closure.
    //
    // Its `url` is deliberately NOT read: the manifest holds `activeTab` and not
    // `tabs`, so Chrome withholds `Tab.url` for a tab that is not currently
    // activeTab-granted — a first attempt asserted on it and got `undefined`.
    // That is the permission model working correctly, and this harness will not
    // acquire the `tabs` permission to make an assertion easier to write. The
    // tab's continued EXISTENCE is the claim, and that is what is asserted.
    const stillOpen = await ext.worker.evaluate(async (id) => {
      const tab = await chrome.tabs.get(id);
      return { id: tab.id, exists: true };
    }, tabId);
    assert.deepEqual(stillOpen, { id: tabId, exists: true });
  });

  // ── E2E-08 — a dead content script never yields a live ACTIVE ────────────

  it('E2E-08 — the dead content script cannot produce any successful lifecycle answer', async () => {
    for (const type of ['QUERY_RECORDING_STATE', 'START_RECORDING', 'STOP_RECORDING']) {
      const r = await queryTab(ext.worker, tabId, { type });
      assert.equal(r.delivered, false, `${type} must not be answered by a dead content script`);
      assert.equal(r.ack, undefined, `${type} must yield no ack at all`);
    }
  });

  // ── E2E-10 — durable state cannot fabricate an active recording ──────────

  it('E2E-10 — a durable observation claiming ACTIVE does not make the live authority active', async () => {
    // Written through the extension's OWN `chrome.storage.session`, in the real
    // service worker, using WS4's real key shape — not a mocked gateway. The
    // point is adversarial: plant the most dangerous possible stale row and
    // show the live authority still refuses to say `active`.
    const key = `pg:v2:tab:${tabId}:recording-observation`;
    const now = await ext.worker.evaluate(() => Date.now());
    await ext.worker.evaluate(
      async ([k, record]) => chrome.storage.session.set({ [k]: { v: 2, data: record } }),
      [
        key,
        {
          schemaVersion: 1,
          sessionId: 'planted-by-e2e',
          lifecycle: 'active',
          startedAt: now,
          lastHeartbeatAt: now,
        },
      ],
    );

    const stored = await ext.worker.evaluate(
      async (k) => (await chrome.storage.session.get(k))[k],
      key,
    );
    assert.equal(stored.data.lifecycle, 'active', 'the adversarial row really is in storage');

    const live = await queryTab(ext.worker, tabId, { type: 'QUERY_RECORDING_STATE' });
    assert.equal(live.delivered, false, 'the live authority is gone');
    assert.equal(
      live.ack,
      undefined,
      'and no stored row can turn an undelivered query into a successful `active`',
    );

    await ext.worker.evaluate(async (k) => chrome.storage.session.remove(k), key);
  });

  // ── E2E-09 — the banner, and an honest statement of what that proves ─────

  it('E2E-09 — the shipped Side Panel shows no RECORDING banner (necessary half of the criterion)', async () => {
    const panel = await ext.context.newPage();
    await panel.goto(`chrome-extension://${ext.extensionId}/sidepanel.html`);
    await panel.waitForSelector('text=Ready to inspect', { timeout: 10_000 });

    const banner = await panel.getByText(/RECORDING/).count();
    assert.equal(
      banner,
      0,
      'no RECORDING banner is present in the SHIPPED artifact. On its own this is ' +
        'necessary and not sufficient — with RECORDING_ENABLED=false the banner can ' +
        'never render, so its absence is not evidence about the kill. The SUFFICIENT ' +
        'half now exists and is supplied by ws9-recording-enabled.e2e.mjs, which ' +
        'observes the banner for a real recording in the E2E-only artifact and then ' +
        'kills the content script. Read the two together.',
    );
    await panel.close();
  });

  // ── E2E-13 — the shipped build really is flag-off ────────────────────────

  it('E2E-13 — the shipped bundle contains a recording runtime that refuses to start', async () => {
    // Not a source-text check — those exist in vitest. This asserts the BUILT
    // artifact behaves as gated, which is the only place a build-time mistake
    // (a stray override, a bad define) would surface.
    const again = await ext.context.newPage();
    await again.goto(fixture.url, { waitUntil: 'domcontentloaded' });

    // Wait for the content script to be REACHABLE rather than sleeping: a first
    // attempt asserted immediately and got no ack at all, because injection had
    // not finished. Polling on delivery is deterministic and asserts the
    // precondition instead of hoping for it.
    const freshTab = await until(
      async () => {
        const active = await ext.worker.evaluate(async () => {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          return tab?.id ?? null;
        });
        if (active === null) return null;
        const probe = await queryTab(ext.worker, active, { type: 'QUERY_RECORDING_STATE' });
        return probe.delivered ? active : null;
      },
      { what: 'a fresh fixture tab whose content script is reachable' },
    );

    const start = await queryTab(ext.worker, freshTab, { type: 'START_RECORDING' });
    assert.equal(start.delivered, true);
    assert.equal(start.ack.ok, false);
    assert.equal(start.ack.error, 'recording-disabled');
    await again.close();
  });
});
