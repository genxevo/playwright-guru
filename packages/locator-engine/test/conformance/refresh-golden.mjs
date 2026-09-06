/**
 * Records what Playwright ACTUALLY does, so Guru can be tested against it.
 *
 * Guru's positioning is "Playwright-native". That is a falsifiable claim, and
 * this is what makes it checkable: for every fixture we ask a real Playwright
 * running against a real Chromium what role an element has and what
 * `getByLabel` matches, then write the answers to `playwright-golden.json`.
 *
 * The committed test reads only that JSON, so `pnpm test` needs no browser and
 * CI stays fast and deterministic. The golden records the Playwright version it
 * came from, so a semantics change between versions is visible rather than
 * silently absorbed.
 *
 * Regenerate when the supported Playwright version changes:
 *
 *   npm i playwright            # ad-hoc; deliberately NOT a repo dependency,
 *   node refresh-golden.mjs     # so the extension bundle stays untouched
 *
 * A diff in the golden is a deliberate act. Review it against Playwright's
 * release notes before accepting.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { FIXTURES, LABEL_FIXTURES } from './fixtures.mjs';

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

/** Every role Playwright can compute that any fixture could plausibly carry. */
const CANDIDATE_ROLES = [
  'button',
  'link',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'slider',
  'spinbutton',
  'combobox',
  'listbox',
  'img',
  'heading',
  'group',
  'list',
  'listitem',
  'option',
  'separator',
  'presentation',
  'generic',
];

async function main() {
  const executablePath = process.env.PW_CHROMIUM_PATH;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage();

  const roles = {};
  for (const fixture of FIXTURES) {
    await page.setContent(`<!doctype html><html><body>${fixture.html}</body></html>`);

    // Ask Playwright's own role engine: of every role it knows, which ones
    // does it consider this element to have? Membership, not interpretation.
    const matched = [];
    for (const role of CANDIDATE_ROLES) {
      const hit = await page
        .getByRole(role, { includeHidden: true })
        .evaluateAll((els) => els.some((e) => e.id === 't'))
        .catch(() => false);
      if (hit) matched.push(role);
    }

    // 'generic' and 'presentation' are structural fallbacks, not identities a
    // locator would target; record them separately rather than as "the role".
    const specific = matched.filter((r) => r !== 'generic' && r !== 'presentation');

    roles[fixture.name] = {
      html: fixture.html,
      attrs: fixture.attrs,
      playwrightRoles: matched,
      playwrightRole: specific.length === 1 ? specific[0] : (specific[0] ?? null),
      ambiguous: specific.length > 1,
    };
  }

  const labels = {};
  for (const fixture of LABEL_FIXTURES) {
    await page.setContent(
      `<!doctype html><html><body><label for="t">${fixture.label}</label><input id="t"></body></html>`,
    );
    const loose = await page
      .getByLabel(fixture.query)
      .count()
      .catch(() => -1);
    const exact = await page
      .getByLabel(fixture.query, { exact: true })
      .count()
      .catch(() => -1);
    labels[fixture.name] = {
      label: fixture.label,
      query: fixture.query,
      matchesDefault: loose > 0,
      matchesExact: exact > 0,
    };
  }

  await browser.close();

  const golden = {
    $schema: 'playwright-conformance-golden/1',
    generatedBy: 'refresh-golden.mjs',
    playwrightVersion: version,
    chromiumRevision: 'bundled with the above playwright release',
    note: 'Observed behaviour of real Playwright against real Chromium. Do not hand-edit; regenerate.',
    roles,
    labels,
  };

  const out = join(HERE, 'playwright-golden.json');
  writeFileSync(out, JSON.stringify(golden, null, 2) + '\n', 'utf8');
  console.log(`\n  Recorded Playwright ${version} behaviour`);
  console.log(`  roles   ${Object.keys(roles).length} fixtures`);
  console.log(`  labels  ${Object.keys(labels).length} fixtures`);
  console.log(`  -> ${out}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
