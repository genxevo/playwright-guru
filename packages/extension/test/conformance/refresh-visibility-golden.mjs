/**
 * Records what Playwright ACTUALLY considers visible, so Guru can be tested
 * against it rather than against an assumption.
 *
 * Same contract as `locator-engine/test/conformance/refresh-golden.mjs`: a real
 * Playwright drives a real Chromium, the answers land in a committed JSON, and
 * the offline suite reads only that JSON so `pnpm test` needs no browser.
 *
 * Two things are recorded per fixture:
 *
 *   playwrightVisible — `locator.isVisible()` from Playwright itself
 *   guruVisible       — Guru's predicate, evaluated in the same page
 *
 * Guru's predicate is not re-implemented here. `PLAYWRIGHT_VISIBILITY_JS` is
 * generated from the one definition in `utils/visibility.ts`, so this harness
 * cannot drift from the shipped rule (DL-24).
 *
 * The predicate source is recorded alongside. The offline test compares it to
 * the current source and fails when they differ, so editing the rule forces a
 * re-verification against Playwright instead of quietly invalidating the
 * evidence.
 *
 * Regenerate when the rule or the supported Playwright version changes:
 *
 *   npm i playwright                    # ad-hoc; deliberately NOT a repo
 *   node refresh-visibility-golden.mjs  # dependency, so the bundle is untouched
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { VISIBILITY_FIXTURES } from './visibility-fixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let chromium, version;
try {
  ({ chromium } = require('playwright'));
  version = require('playwright/package.json').version;
} catch {
  console.error(
    '\n  playwright is not installed. This script is intentionally not a repo\n  dependency — install it ad-hoc:  npm i playwright\n',
  );
  process.exit(1);
}

/**
 * Reads `PLAYWRIGHT_VISIBILITY_JS` out of the TypeScript source.
 *
 * The harness is plain ESM with no build step, so it cannot import the .ts
 * module. It extracts the one definition instead of restating it — a copy here
 * would defeat the entire point of the module.
 */
function predicateSource() {
  const ts = readFileSync(join(HERE, '../../utils/visibility.ts'), 'utf8');
  const extract = (name) => {
    const fn = ts.match(
      new RegExp(`function ${name}\\(el: Element\\): boolean \\{[\\s\\S]*?\\n\\}`),
    );
    if (!fn) throw new Error(`could not locate ${name}() in utils/visibility.ts`);
    return fn[0]
      .replace(/\(el: Element\): boolean/, '(el)')
      .replace(/let node: Element \| null = el;/, 'let node = el;')
      .replace(/ as HTMLElement/g, '');
  };
  return (
    `var __pgVisible = ${extract('playwrightVisible')};\n` +
    `var __pgRoleEligible = ${extract('playwrightRoleEligible')};`
  );
}

const PREDICATE_JS = predicateSource();

/** The roles any fixture's `#target` could carry. */
const ROLE_PROBES = ['button', 'link', 'checkbox', 'textbox', 'img'];

const page$ = async (page, html) => {
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>${html}</body></html>`,
  );
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const visibility = {};
  let disagreements = 0;

  for (const fixture of VISIBILITY_FIXTURES) {
    // Every target is given the same accessible name so that a role query is
    // meaningful for fixtures whose element would otherwise be nameless.
    const html = fixture.html.replace('id="target"', 'id="target" aria-label="PGTARGET"');
    await page$(page, html);

    // Playwright's own verdicts — the ground truth, asked two ways because
    // isVisible() and getByRole() do NOT agree (aria-hidden, zero-size).
    const playwrightVisible = await page.locator('#target').isVisible();
    const roleCounts = await Promise.all(
      ROLE_PROBES.map((role) => page.getByRole(role, { name: 'PGTARGET' }).count()),
    );
    const playwrightRoleMatches = roleCounts.some((n) => n > 0);

    // Guru's predicates, evaluated in the same page on the same element.
    const [guruVisible, guruRoleEligible] = await page.evaluate((src) => {
      // eslint-disable-next-line no-eval
      (0, eval)(src);
      const el = document.getElementById('target');
      return [__pgVisible(el), __pgRoleEligible(el)];
    }, PREDICATE_JS);

    if (playwrightVisible !== guruVisible) disagreements++;
    if (playwrightRoleMatches !== guruRoleEligible) disagreements++;

    visibility[fixture.name] = {
      html: fixture.html,
      why: fixture.why,
      playwrightVisible,
      guruVisible,
      playwrightRoleMatches,
      guruRoleEligible,
    };
  }

  await browser.close();

  writeFileSync(
    join(HERE, 'visibility-golden.json'),
    JSON.stringify(
      {
        $schema: 'Observed behaviour. Do not hand-edit; regenerate.',
        generatedBy: 'refresh-visibility-golden.mjs',
        playwrightVersion: version,
        note:
          'playwrightVisible is Playwright locator.isVisible(). ' +
          'playwrightRoleMatches is whether a getByRole query finds the element. ' +
          'They deliberately differ (aria-hidden, zero-size). guru* are Guru’s ' +
          'two predicates evaluated on the same element in the same page.',
        predicateSource: PREDICATE_JS,
        visibility,
      },
      null,
      2,
    ) + '\n',
  );

  const total = VISIBILITY_FIXTURES.length;
  console.log(`\n  playwright ${version} · ${total} visibility fixtures recorded`);
  console.log(
    disagreements === 0
      ? '  Guru agrees with Playwright on all of them.\n'
      : `  ⚠ Guru DISAGREES with Playwright on ${disagreements} of ${total}.\n`,
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
