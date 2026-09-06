/**
 * WS9 — the REAL extension E2E harness.
 * ============================================================================
 * WHAT MAKES THIS DIFFERENT FROM EVERY OTHER TEST IN THIS REPOSITORY.
 *
 * The 1,900-odd vitest tests are unit and source-text evidence: they run under
 * `environment: 'node'` (rule R3) and prove pure functions and architectural
 * invariants. The two `test/conformance/refresh-*-golden.mjs` scripts DO launch
 * a real Chromium, but they load NO extension — they ask Playwright what
 * Playwright itself does and write a golden the node tests then read.
 *
 * This harness is the missing third thing: a real Chromium, running THE ACTUAL
 * BUILT EXTENSION, with its real manifest, its real service worker, its real
 * content script and its real Side Panel document. Nothing here is mocked.
 * There is no fake `chrome`, no fake storage, no fake runtime, no React
 * mounting, and no direct import of a lifecycle function as the assertion.
 *
 * ═══ PLAYWRIGHT IS DELIBERATELY NOT A REPOSITORY DEPENDENCY (DL-20) ═══
 *
 * `refresh-golden.mjs` established the policy this file follows exactly:
 * playwright is installed ad-hoc, never added to any `package.json`, so it can
 * never reach an extension bundle. The harness therefore RESOLVES it at runtime
 * and fails with an instruction rather than a stack trace when it is absent.
 * That is also why this is plain ESM run by `node --test` — Node's own test
 * runner, no new framework, no new dependency.
 *
 * ═══ HEADLESS, MEASURED RATHER THAN ASSUMED ═══
 *
 * MV3 extensions do NOT load in Playwright's default headless shell: a probe
 * against the untouched tree produced `SERVICE_WORKER=NO` and no extension id.
 * They DO load under Chrome's new headless, which Playwright selects with
 * `channel: 'chromium'` — the same probe then produced a service worker and a
 * real extension id. That single option is the difference between a harness
 * that tests the extension and one that quietly tests nothing, so it is
 * asserted rather than trusted: `launchExtension` throws if no service worker
 * appears.
 *
 * ═══ ISOLATION ═══
 *
 * Every run gets a fresh `mkdtemp` profile that is removed on teardown. The
 * developer's own Chrome profile is never touched, and no test state is written
 * into the repository.
 */

import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The built, unpacked PRODUCTION extension. This harness never builds it
 * implicitly.
 */
export const EXTENSION_DIR = resolve(HERE, '../../.output/chrome-mv3');

/**
 * The built, unpacked E2E-ONLY extension (WS9 Decision A).
 *
 * Produced by `pnpm build:e2e`, which loads `wxt.e2e.config.ts` — a config no
 * production script invokes. It is the production extension with exactly one
 * module substituted, `src/config/recording.ts` → `recording-enabled.config.ts`,
 * so `RECORDING_ENABLED` is `true` and a recording can actually reach ACTIVE.
 *
 * It is a SEPARATE DIRECTORY from `EXTENSION_DIR` on purpose. The two artifacts
 * coexist, the suite loads both in the same run, and the contrast between them
 * — same permissions, same code, opposite recording behaviour — is itself one
 * of the assertions. Nothing here ever points the production constant at this
 * directory or the other way round.
 */
export const E2E_EXTENSION_DIR = resolve(HERE, '../../.output-e2e/chrome-mv3');

/** The manifest name each artifact must report from inside the browser. */
export const PRODUCTION_EXTENSION_NAME = 'Playwright Guru';
export const E2E_EXTENSION_NAME = 'Playwright Guru — E2E RECORDING BUILD';

/**
 * The fixture page.
 *
 * Local, deterministic, network-independent, and deliberately free of anything
 * resembling a credential: a button and a text input are all the recorder needs
 * to be exercised. `password` fields are absent on purpose — this harness must
 * never be the place a secret fixture is introduced.
 */
const FIXTURE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Playwright Guru E2E fixture</title></head>
<body>
  <h1>Playwright Guru E2E fixture</h1>
  <button id="save">Save</button>
  <label for="search">Search</label>
  <input id="search" type="text" name="search">
</body></html>`;

/**
 * Resolve the ad-hoc playwright install, or explain how to get one.
 *
 * Several resolution roots, and NO hard-coded path: the local one first, then
 * the npm GLOBAL root discovered at runtime, because the documented install
 * for this repository's other browser scripts is a global, ad-hoc one. A
 * literal path to one machine's node_modules would work exactly once, on the
 * machine it was written on.
 *
 * The global root is discovered two independent ways, because on Windows the
 * first one silently produced nothing:
 *
 *   1. `npm root -g`. On Windows `npm` is a `.cmd` shim, and since Node
 *      18.20 / 20.12 spawning a `.cmd` WITHOUT a shell fails with EINVAL. The
 *      throw landed in the catch below, `roots` kept only the bare specifier,
 *      and a global install that was physically present reported itself as
 *      "not installed". `shell` on win32 is what makes the shim runnable; the
 *      argv is a fixed literal, so it adds no injection surface.
 *   2. npm's own configured prefix, read from the environment. This needs no
 *      child process at all, so it still answers when `npm` is off PATH
 *      entirely. `process.env` is read at runtime — nothing is written down.
 *
 * A bare specifier cannot reach a global install (Node does not search the
 * global root), so the absolute directory is handed to `require`, which
 * resolves it through the package's own `main`.
 */
export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const roots = ['playwright'];
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }).trim();
    if (globalRoot) roots.push(join(globalRoot, 'playwright'));
  } catch {
    /* npm is not on PATH; the remaining roots are the only route */
  }
  const prefix = process.env.npm_config_prefix || process.env.APPDATA;
  if (prefix) {
    roots.push(
      join(prefix, 'npm', 'node_modules', 'playwright'), // npm's Windows default
      join(prefix, 'lib', 'node_modules', 'playwright'), // npm's POSIX default
    );
  }
  for (const specifier of roots) {
    try {
      return require(specifier).chromium;
    } catch {
      /* try the next resolution root */
    }
  }
  throw new Error(
    '\n  playwright is not installed. It is intentionally NOT a repository\n' +
      '  dependency (DL-20), so the extension bundle stays untouched.\n' +
      '  Install it ad-hoc and re-run:  npm i -g playwright\n',
  );
}

/** A local HTTP fixture server. Content scripts do not inject into data: URLs. */
export async function startFixtureServer() {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(FIXTURE_HTML);
  });
  server.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    async close() {
      await new Promise((r) => server.close(r));
    },
  };
}

/**
 * Launch a real Chromium with a real built extension loaded.
 *
 * `artifactDir` defaults to the PRODUCTION artifact, so every caller written
 * before WS9 Decision A keeps its exact previous meaning. A caller that wants
 * the recording-enabled artifact must name it, which makes every such call site
 * grep-able: there is no ambient way to end up testing the enabled build.
 *
 * Throws if the directory holds no manifest, and throws if the service worker
 * never appears — because a context without one is a browser WITHOUT the
 * extension, and a harness that carried on there would assert against nothing
 * and report a false pass.
 */
export async function launchExtension({ artifactDir = EXTENSION_DIR } = {}) {
  const chromium = loadPlaywright();

  if (!existsSync(join(artifactDir, 'manifest.json'))) {
    throw new Error(
      `No built extension at ${artifactDir}.\n` +
        (artifactDir === E2E_EXTENSION_DIR
          ? '  Run `pnpm build:e2e` (WS9 Decision A — the test-only recording-enabled build).'
          : '  Run `pnpm build` first.'),
    );
  }

  const profile = mkdtempSync(join(tmpdir(), 'pg-e2e-profile-'));

  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', // Chrome's new headless — MV3 extensions do not load in the headless shell.
    headless: true,
    args: [
      `--disable-extensions-except=${artifactDir}`,
      `--load-extension=${artifactDir}`,
      '--no-sandbox',
    ],
  });

  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => null));

  if (!worker) {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
    throw new Error(
      `The extension at ${artifactDir} did not load: no service worker appeared. ` +
        'Check that the new-headless channel is available.',
    );
  }

  /** Derived from the loaded extension, never hard-coded. */
  const extensionId = new URL(worker.url()).host;

  return {
    context,
    worker,
    extensionId,
    async close() {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

/**
 * Ask the BACKGROUND to reach a tab's content script, from inside the real
 * service worker.
 *
 * This is the production path the Side Panel uses — `browser.tabs.sendMessage`
 * to a specific tab — evaluated in the extension's own worker rather than
 * simulated. A thrown "Receiving end does not exist" is exactly what
 * `dispatchToTab` catches and `normalizeAck` turns into `NO_HANDLER`.
 */
export function queryTab(worker, tabId, message) {
  return worker.evaluate(
    async ([id, msg]) => {
      try {
        return { delivered: true, ack: await chrome.tabs.sendMessage(id, msg) };
      } catch (error) {
        return { delivered: false, error: String(error) };
      }
    },
    [tabId, message],
  );
}

/** The id of the one http(s) tab the fixture opened. */
export async function fixtureTabId(worker) {
  const tabs = await worker.evaluate(async () => {
    const all = await chrome.tabs.query({});
    return all.filter((t) => t.url && t.url.startsWith('http://127.0.0.1')).map((t) => t.id);
  });
  return tabs[0] ?? null;
}

/**
 * The recording limits, READ FROM THE ONE MODULE THAT OWNS THEM.
 *
 * `src/config/recording.ts` states its contract at the top — "No other module
 * may define, hard-code or duplicate these numbers" — and a WS0 test enforces
 * it. A `.mjs` test cannot `import` a `.ts` module, so the alternative on offer
 * was to write `15_000` here and let it rot: the day someone tuned
 * `heartbeatTimeoutMs`, this suite would keep asserting the old window and
 * would either fail mysteriously or, far worse, pass against a tolerance the
 * product no longer has.
 *
 * So the numbers are PARSED from the authoritative source, and a shape this
 * reader does not recognise is a hard error rather than a default. That is the
 * same rule the repository's `surface-source` helpers already apply to TypeScript
 * read from tests.
 */
export function recordingLimits() {
  const source = readFileSync(resolve(HERE, '../../src/config/recording.ts'), 'utf8');
  const read = (name) => {
    const match = new RegExp(`\\b${name}:\\s*([0-9_*\\s]+?),`).exec(source);
    if (!match) {
      throw new Error(
        `Could not read \`${name}\` from src/config/recording.ts. The limits module is the ` +
          'single authoritative source for these numbers and this suite refuses to guess one.',
      );
    }
    // `500 * 1024` and `5_000` both appear in that file; evaluate the literal
    // arithmetic rather than re-encoding any of it here.
    return Number(
      match[1]
        .split('*')
        .map((part) => Number(part.replace(/[_\s]/g, '')))
        .reduce((a, b) => a * b, 1),
    );
  };
  return {
    heartbeatMs: read('heartbeatMs'),
    heartbeatTimeoutMs: read('heartbeatTimeoutMs'),
    warnAt: read('warnAt'),
    hardStop: read('hardStop'),
  };
}

/** Poll a predicate on the real browser rather than sleeping for a fixed time. */
export async function until(
  predicate,
  { timeout = 10_000, interval = 100, what = 'condition' } = {},
) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Timed out waiting for ${what}. Last value: ${JSON.stringify(last)}`);
}
