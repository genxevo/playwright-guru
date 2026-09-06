/**
 * WS9 CLOSURE GATE — THE SUFFICIENT PROOF (Decision A).
 * ============================================================================
 * THE CRITERION, VERBATIM FROM THE ROADMAP:
 *
 *   "An E2E test that kills the content script proves the RECORDING banner
 *    cannot appear."
 *
 * ═══ WHY THIS FILE EXISTS AND `ws9-fail-closed.e2e.mjs` WAS NOT ENOUGH ═══
 *
 * That suite proves the criterion's NECESSARY half against the artifact we
 * ship: kill the content script, and no RECORDING banner is present. DL-86
 * recorded honestly that this is NOT SUFFICIENT, and said so in the assertion's
 * own failure message. With `RECORDING_ENABLED = false` the banner can never
 * render at all, so its absence after a kill is not evidence about the kill.
 * Proving a thing cannot appear is only meaningful if it can.
 *
 * This suite supplies the missing half. It runs against `.output-e2e`, an
 * artifact that is the production build with EXACTLY ONE MODULE substituted —
 * `src/config/recording.ts` → `test/e2e/recording-enabled.config.ts` — so
 * `RECORDING_ENABLED` is `true` and a recording can genuinely reach ACTIVE.
 * The chain it establishes is:
 *
 *      a recording claim CAN   (A4 — the real Side Panel reports a real
 *      appear                        recording of a real click)
 *   →  the content script dies (A5 — a real navigation, not a stop call, not a
 *                                    cleared key, not a mocked runtime)
 *   →  the claim STOPS         (A5 — measured, bounded, and never returning)
 *
 * Only with the first link is the third one evidence. Together with the
 * production suite's E2E-09, the criterion is met.
 *
 * ═══ WHAT DL-89 CORRECTED ABOUT THIS SUITE'S OWN EVIDENCE ═══
 *
 * A4 originally asserted the words "RECORDING — perform actions on the page".
 * Decision E found out WHY that could pass, and the reason is a property of the
 * HARNESS, not of the product: Playwright cannot drive Chrome's side-panel
 * container (DL-86 owner decision B; re-measured at DL-89 as `sidePanel.open()`
 * requiring a user gesture), so the panel is hosted as an ordinary TAB. A tab
 * carries a `sender.tab`, and the background's `isFromExtensionUI` requires
 * `sender.tab === undefined` — so EVERY live query from this panel is rejected
 * as `UNTRUSTED_SENDER`, and the banner DL-88 observed was fed entirely by the
 * DURABLE record.
 *
 * That is now ASSERTED in A4 rather than assumed, so the limitation is a
 * measured fact in the suite instead of a footnote in a report. The consequence
 * is stated plainly: the CONFIRMED banner line is not observable in this
 * harness, and DL-88's claim that it was observed is corrected in DL-89.
 *
 * ═══ WHAT THE E2E ARTIFACT IS NOT ═══
 *
 * It is not a build flag, an environment read, a runtime toggle, a URL switch,
 * a storage switch, a debug hook or a production test seam. Production keeps a
 * literal `export const RECORDING_ENABLED = false;` with nothing to override,
 * and `wxt.e2e.config.ts` — the config that performs the substitution — is
 * invoked by no build, verify, package or release script. A6 measures the
 * difference between the two artifacts in ONE RUN, so "production is disabled"
 * stays a fact this suite establishes rather than one it assumes.
 *
 * RUN IT:  pnpm build && pnpm build:e2e && pnpm test:e2e
 * REQUIRES: an ad-hoc `npm i -g playwright` (DL-20 keeps it out of the repo).
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';

import {
  E2E_EXTENSION_DIR,
  E2E_EXTENSION_NAME,
  EXTENSION_DIR,
  PRODUCTION_EXTENSION_NAME,
  fixtureTabId,
  launchExtension,
  queryTab,
  recordingLimits,
  startFixtureServer,
  until,
} from './harness.mjs';

const LIMITS = recordingLimits();

/** The exact banner copy. `lifecycle-view.ts` is the one place it is decided. */
const CONFIRMED_LINE = 'RECORDING — perform actions on the page';
const STALE_LINE = 'The recorder stopped responding — nothing is being captured';

/**
 * The permission set BOTH artifacts must report.
 *
 * Asserted against the E2E build as strictly as against production. A test-only
 * build that could quietly acquire a permission to make a proof easier would be
 * a build that proves nothing about the product — the same reason DL-86 refused
 * to add `tabs` when an assertion would have been simpler with it.
 */
const PERMISSIONS = ['activeTab', 'storage', 'scripting', 'sidePanel'];

/** Read one WS4 tab-scoped record from the extension's own session storage. */
function readTabRecord(worker, tabId, name) {
  return worker.evaluate(
    async (key) => (await chrome.storage.session.get(key))[key],
    `pg:v2:tab:${tabId}:${name}`,
  );
}

describe('WS9 closure — the recording-enabled E2E artifact', { concurrency: 1 }, () => {
  let ext;
  let fixture;
  let page;
  let panel;
  let tabId;

  before(async () => {
    fixture = await startFixtureServer();
    // Named explicitly. There is no ambient way to reach the enabled artifact:
    // `launchExtension()` with no argument is still the production build.
    ext = await launchExtension({ artifactDir: E2E_EXTENSION_DIR });
    page = await ext.context.newPage();
    await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
    tabId = await until(() => fixtureTabId(ext.worker), { what: 'the fixture tab to exist' });
    // Wait for REACHABILITY rather than sleeping. A first draft sent
    // START_RECORDING immediately and got "Receiving end does not exist",
    // because injection had not finished — the same lesson E2E-13 already
    // learned. Polling asserts the precondition instead of hoping for it.
    await until(
      async () => (await queryTab(ext.worker, tabId, { type: 'QUERY_RECORDING_STATE' })).delivered,
      { what: 'the content script to become reachable' },
    );
  });

  after(async () => {
    await ext?.close();
    await fixture?.close();
  });

  // ── E2E-A1 — which artifact is loaded, and what it may do ────────────────

  it('E2E-A1 — the loaded artifact identifies itself as the E2E build and holds no extra permission', async () => {
    const manifest = await ext.worker.evaluate(() => chrome.runtime.getManifest());

    // Identity FIRST, before any recording claim. A run pointed at the wrong
    // `--load-extension` directory must fail here, loudly, rather than report a
    // green result that is actually about the other artifact.
    assert.equal(manifest.name, E2E_EXTENSION_NAME);
    assert.notEqual(manifest.name, PRODUCTION_EXTENSION_NAME);
    assert.equal(manifest.manifest_version, 3);

    // And it is the SAME extension in every way that matters to the product.
    assert.deepEqual(manifest.permissions, PERMISSIONS);
    assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
  });

  // ── E2E-A2 — the substitution reached the RUNTIME, not merely the UI ─────

  it('E2E-A2 — START_RECORDING is accepted by the real runtime and the lifecycle really becomes ACTIVE', async () => {
    // THIS IS THE ASSERTION DL-87's FEASIBILITY EXPERIMENT WOULD HAVE FAILED.
    //
    // That experiment keyed its substitution on the import SPECIFIER. Two
    // spellings reach the recording config — `'../config/recording'` from the
    // runtime and `'../../src/config/recording'` from the sidepanel — so it
    // enabled the UI and left the runtime refusing. The artifact looked
    // enabled and behaved disabled.
    //
    // The banner alone cannot tell those two artifacts apart: it renders from
    // the UI half. `START_RECORDING` can, because the gate it crosses lives in
    // `runtime/recording.ts` — `const enabled = options.enabled ?? RECORDING_ENABLED`
    // — and that module imports the config by the OTHER specifier. An `ok:true`
    // here is proof the substitution was keyed on the resolved path.
    const start = await queryTab(ext.worker, tabId, { type: 'START_RECORDING' });
    assert.equal(start.delivered, true);
    assert.equal(
      start.ack.ok,
      true,
      'the runtime must ACCEPT the start — an `ok:false` here means the substitution reached ' +
        'the sidepanel but not the runtime, which is the half-enabled artifact DL-87 refused',
    );
    assert.equal(typeof start.ack.sessionId, 'string');
    assert.ok(start.ack.sessionId.length > 0, 'a real minted session id, not an empty string');

    const state = await queryTab(ext.worker, tabId, { type: 'QUERY_RECORDING_STATE' });
    assert.equal(state.ack.ok, true);
    assert.equal(state.ack.lifecycle, 'active', 'the live authority itself reports ACTIVE');
  });

  // ── E2E-A3 — a real click becomes a real RecordedStep ────────────────────

  it('E2E-A3 — a real user click on a real page produces a real RecordedStep through the real engine', async () => {
    // A REAL Playwright click on a REAL button in a REAL page. Nothing
    // dispatches a synthetic event into the runtime, nothing calls the recorder
    // directly, and nothing writes a step into storage by hand.
    await page.click('#save');

    const stored = await until(
      async () => (await readTabRecord(ext.worker, tabId, 'recording-workflow')) ?? null,
      { what: 'the durable workflow to be written by the real recorder' },
    );

    assert.equal(stored.v, 2, "WS4's envelope, written through the one gateway");
    const workflow = stored.data;
    assert.equal(workflow.steps.length, 1, 'exactly one action was performed and one recorded');

    const [step] = workflow.steps;
    assert.equal(step.kind, 'click');

    // The locator is the REAL engine's answer for the REAL element — the same
    // DomProbe, LocatorResolver and ranking the picker uses. A recorder that
    // stored a raw selector string, or a placeholder, would not produce this.
    assert.equal(step.target.locator.verdict, 'excellent');
    assert.equal(step.target.locator.visibleMatchCount, 1);
    assert.deepEqual(
      step.target.locator.chain.steps.map((s) => s.kind),
      ['role'],
      'getByRole is what the engine chose for a button with an accessible name',
    );
    assert.equal(step.target.facts.attributes.tagName, 'button');

    // And it crossed the ADMISSION boundary rather than bypassing it: an
    // untrustworthy target would have been refused and tallied, not stored.
    const observation = await readTabRecord(ext.worker, tabId, 'recording-observation');
    assert.equal(observation.data.lifecycle, 'active');
    assert.equal(
      observation.data.refusedCount,
      undefined,
      'a clean click is admitted, so no refusal is recorded',
    );
  });

  // ── E2E-A4 — THE PANEL'S CLAIM IS TRUTHFUL, AND IS NOT OVERSTATED ───────

  it('E2E-A4 — the real Side Panel reports the real recording WITHOUT claiming a confirmation it never received', async () => {
    panel = await ext.context.newPage();
    await panel.goto(`chrome-extension://${ext.extensionId}/sidepanel.html`);
    await panel.waitForSelector('text=Ready to inspect', { timeout: 10_000 });

    // The panel floats over the ACTIVE tab, so the fixture tab is brought to
    // the front and the panel rebinds through the real `chrome.tabs.onActivated`.
    await page.bringToFront();

    // ═══ WHY THIS TEST CHANGED AT DL-89, AND WHAT DL-88 ACTUALLY PROVED ═══
    //
    // This assertion used to require the line "RECORDING — perform actions on
    // the page". Decision E discovered WHY it could ever pass here, and the
    // reason is a limitation of the harness rather than a property of the
    // product: the Side Panel is hosted as an ordinary TAB (Playwright cannot
    // drive Chrome's side-panel container — DL-86 owner decision B, re-measured
    // at DL-89 as `sidePanel.open()` requiring a user gesture). A tab carries a
    // `sender.tab`, and the background's `isFromExtensionUI` requires
    // `sender.tab === undefined`, so EVERY live query from this panel is
    // rejected as UNTRUSTED_SENDER.
    //
    // The panel here is therefore permanently unable to reach the live
    // authority, and DL-88's banner evidence came entirely from the DURABLE
    // record. That is asserted below rather than assumed, so the limitation is
    // a measured fact in the suite instead of a footnote in a report.
    const rejected = await panel.evaluate(
      async (id) => chrome.runtime.sendMessage({ type: 'QUERY_RECORDING_STATE', targetTabId: id }),
      tabId,
    );
    assert.equal(
      rejected.code,
      'UNTRUSTED_SENDER',
      'the panel-as-a-tab cannot reach the live authority, so this run exercises the DURABLE path',
    );

    const line = await until(
      async () => {
        const t = (await panel.textContent('body')).replace(/\s+/g, ' ');
        return t.includes('Recording unconfirmed') ? t : null;
      },
      { timeout: LIMITS.heartbeatMs * 4, what: 'the Side Panel to report the recording' },
    );

    // IT STILL REPORTS THE RECORDING. Silence would be its own untruth — the
    // user would believe nothing is happening while a recorder runs.
    assert.ok(line.includes('the page has not answered'), 'it names why it cannot confirm');

    // AND IT DOES NOT ISSUE THE INSTRUCTION. This is the Decision E fix: acting
    // on "perform actions on the page" during an unconfirmed window loses the
    // user's work in silence, so the imperative is withheld until the live
    // authority answers.
    assert.ok(
      !line.includes(CONFIRMED_LINE),
      `the panel must not claim a confirmed live recording it never confirmed. Got: ${line.slice(0, 300)}`,
    );
    assert.ok(!line.includes('perform actions on the page'));

    // The truthful count and the real recorded code are unaffected — Decision E
    // withdrew a CLAIM, it did not withhold evidence.
    assert.ok(line.includes('1 action recorded'), 'the DL-84 tally is still truthful and shown');
    assert.ok(
      line.includes("getByRole('button', { name: 'Save' }).click()"),
      'the real recorded action is still rendered as Playwright code',
    );
  });

  // ── E2E-A5 — THE CLOSURE: kill the content script ────────────────────────

  it('E2E-A5 — killing the content script ends the recording claim, and it never returns', async () => {
    const claim = async () => {
      const t = (await panel.textContent('body')).replace(/\s+/g, ' ');
      if (t.includes(CONFIRMED_LINE)) return 'CONFIRMED_RECORDING';
      if (t.includes('Recording unconfirmed')) return 'UNCONFIRMED_RECORDING';
      if (t.includes(STALE_LINE)) return 'STOPPED_RESPONDING';
      return 'NONE';
    };
    assert.equal(await claim(), 'UNCONFIRMED_RECORDING', 'precondition: a recording claim stands');

    // THE KILL. A real browser navigation to `about:blank`, which the manifest's
    // `<all_urls>` does not match, so the content-script execution context is
    // destroyed and not recreated WHILE THE TAB SURVIVES. Nothing calls stop(),
    // nothing dispatches a synthetic STOP_RECORDING, nothing clears storage and
    // nothing touches an internal runtime API.
    const killedAt = Date.now();
    await page.goto('about:blank', { waitUntil: 'domcontentloaded' });

    const dead = await until(
      async () => {
        const r = await queryTab(ext.worker, tabId, { type: 'QUERY_RECORDING_STATE' });
        return r.delivered === false ? r : null;
      },
      { what: 'the content script to become unreachable' },
    );
    assert.match(dead.error, /Receiving end does not exist|Could not establish connection/);

    // ═══ THE ASSERTION THE WHOLE GATE EXISTS FOR ═══
    //
    // The panel stops making a recording claim at all and says what actually
    // happened. The bound is `heartbeatTimeoutMs` (staleness is DERIVED from
    // the clock — DL-73) plus room for the panel's own poll. Both numbers are
    // read from `src/config/recording.ts`, never written here.
    const bound = LIMITS.heartbeatTimeoutMs + LIMITS.heartbeatMs * 3;
    await until(async () => ((await claim()) === 'STOPPED_RESPONDING' ? true : null), {
      timeout: bound,
      interval: 500,
      what:
        `the Side Panel to stop claiming a recording within ${bound} ms of the content ` +
        `script's death and report "${STALE_LINE}"`,
    });
    const window = Date.now() - killedAt;

    // ═══ AND THE DURABLE ROW STILL SAYS `active` WHILE IT SAYS SO ═══
    //
    // The stored observation is untouched — it still literally reads
    // `lifecycle: 'active'` — and the panel refuses to repeat it, because
    // expiry is re-derived from the clock on every read rather than trusted
    // from the record. DL-79's precedence is unchanged; what DL-89 changed is
    // only what the panel is entitled to SAY about the view it was given.
    const record = await readTabRecord(ext.worker, tabId, 'recording-observation');
    assert.equal(
      record.data.lifecycle,
      'active',
      'the durable row genuinely still claims ACTIVE — nothing rewrote or cleared it',
    );
    assert.equal(
      await claim(),
      'STOPPED_RESPONDING',
      `and the panel still refuses to repeat that claim. Measured window: ${window} ms ` +
        `(heartbeatTimeoutMs = ${LIMITS.heartbeatTimeoutMs} ms).`,
    );

    // It never comes back, in EITHER form.
    const settle = Date.now() + LIMITS.heartbeatMs * 3;
    while (Date.now() < settle) {
      const c = await claim();
      assert.ok(
        c === 'STOPPED_RESPONDING' || c === 'NONE',
        `no recording claim may return for a recorder that is provably gone (got ${c})`,
      );
      await new Promise((r) => setTimeout(r, 500));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('WS9 closure — production vs E2E, measured in one run', { concurrency: 1 }, () => {
  let fixture;
  const opened = [];

  /** Launch an artifact, open the fixture, wait for the content script. */
  async function reach(artifactDir) {
    const ext = await launchExtension({ artifactDir });
    opened.push(ext);
    const page = await ext.context.newPage();
    await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
    const tabId = await until(() => fixtureTabId(ext.worker), { what: 'the fixture tab' });
    await until(
      async () => (await queryTab(ext.worker, tabId, { type: 'QUERY_RECORDING_STATE' })).delivered,
      { what: 'the content script to become reachable' },
    );
    return { ext, tabId };
  }

  before(async () => {
    fixture = await startFixtureServer();
  });

  after(async () => {
    for (const ext of opened) await ext.close();
    await fixture?.close();
  });

  it('E2E-A6 — the same message, the same page, two artifacts, opposite answers', async () => {
    const prod = await reach(EXTENSION_DIR);
    const e2e = await reach(E2E_EXTENSION_DIR);

    // Identity first, both sides, so neither result can be about the wrong build.
    assert.equal(
      await prod.ext.worker.evaluate(() => chrome.runtime.getManifest().name),
      PRODUCTION_EXTENSION_NAME,
    );
    assert.equal(
      await e2e.ext.worker.evaluate(() => chrome.runtime.getManifest().name),
      E2E_EXTENSION_NAME,
    );

    const inProduction = await queryTab(prod.ext.worker, prod.tabId, { type: 'START_RECORDING' });
    const inE2E = await queryTab(e2e.ext.worker, e2e.tabId, { type: 'START_RECORDING' });

    // THE PRODUCT REFUSES. This is a MEASURED fact about the shipped artifact,
    // established in the same run and the same browser version as the artifact
    // that accepts — so "recording is disabled in production" rests on an
    // observation rather than on the absence of a code path.
    assert.equal(inProduction.delivered, true, 'both content scripts are alive and reachable');
    assert.equal(inProduction.ack.ok, false);
    assert.equal(inProduction.ack.error, 'recording-disabled');

    // THE E2E ARTIFACT ACCEPTS. One module differs between them.
    assert.equal(inE2E.delivered, true);
    assert.equal(inE2E.ack.ok, true);

    // A refused start leaves NOTHING behind — not even `starting`, and no
    // durable row that a later read could mistake for a recording.
    const after = await queryTab(prod.ext.worker, prod.tabId, { type: 'QUERY_RECORDING_STATE' });
    assert.equal(after.ack.lifecycle, 'inactive');
    const orphan = await readTabRecord(prod.ext.worker, prod.tabId, 'recording-observation');
    assert.equal(orphan, undefined, 'a refused start writes no observation at all');

    // Both artifacts hold the SAME permissions. The enabled one bought its
    // capability with a module substitution, not with a capability grant.
    for (const { ext } of [prod, e2e]) {
      const manifest = await ext.worker.evaluate(() => chrome.runtime.getManifest());
      assert.deepEqual(manifest.permissions, PERMISSIONS);
      assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
    }
  });
});
