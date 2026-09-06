/**
 * Stage 1 — Truth: the UI may not claim evidence it does not have.
 *
 * Three guarantees, each a regression test for something the product shipped:
 *
 *   1. Generated CSS/XPath are presented as unverified syntax, not as measured
 *      reliability. ~160 selector variants carry a hand-authored stability hint
 *      that no code ever checks against the DOM; the previous UI rendered it as
 *      "✓ High" on a green chip, which is the visual vocabulary of proof.
 *
 *   2. Match counts mean one thing. Candidate counting reported VISIBLE matches
 *      while Verify reported TOTAL, so one selector could show two different
 *      numbers in the same panel with nothing to explain the difference.
 *
 *   3. A render error is contained and explained rather than producing a blank
 *      panel — and the containment never renders the error text, which can
 *      carry page content.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  STABILITY_HINT_STYLES,
  UNVERIFIED_SELECTOR_NOTICE,
  generateAllCSSVariants,
  generateAllXPathVariants,
} from '../utils/css-xpath';

import { readComposed } from './helpers/surface-source';

const EXT = resolve(__dirname, '..');
/**
 * WS5 — a surface is a COMPOSITION, not a file.
 *
 * `readComposed` resolves a panel entrypoint path to everything that surface
 * actually imports (see `helpers/surface-source.ts`). Every assertion below is
 * unchanged; what changed is that they now follow the code when WS5 moves it,
 * instead of silently passing because the string they look for went to another
 * file. Any other path still reads exactly that one file.
 */
const read = (rel: string): string => readComposed(rel);

const SIDE_PANEL = 'entrypoints/sidepanel/SidePanel.tsx';
const DEVTOOLS_PANEL = 'entrypoints/devtools-panel/Panel.tsx';
const PANELS = [SIDE_PANEL, DEVTOOLS_PANEL];
const STRATEGY_META = 'src/ui/strategy-meta.ts';

// ─── 1. Generated selectors are not presented as verified ───────────────────

describe('CSS/XPath are presented as unverified syntax', () => {
  it('states plainly that the selectors are not checked against the page', () => {
    expect(UNVERIFIED_SELECTOR_NOTICE.toLowerCase()).toContain('not checked against the page');
    expect(UNVERIFIED_SELECTOR_NOTICE.toLowerCase()).toContain('verify selector');
  });

  it('shows that notice above the generated list on BOTH surfaces', () => {
    for (const panel of PANELS) {
      const source = read(panel);
      // The notice is now the shared `UnverifiedNotice` primitive (WS2 item 3);
      // each panel imports it and renders it once for CSS and once for XPath.
      expect(source, `${panel} must import the shared notice primitive`).toMatch(
        /import\s*\{[^}]*\bUnverifiedNotice\b[^}]*\}\s*from '[^']*primitives'/,
      );
      const rendered = source.match(/<UnverifiedNotice\s*\/>/g) ?? [];
      expect(rendered.length, `${panel} must render the notice for CSS and XPath`).toBe(2);
    }
  });

  it('the shared notice primitive renders the honest, unverified-selector text', () => {
    // The chain the two assertions above depend on: <UnverifiedNotice/> → the
    // primitive → the audited UNVERIFIED_SELECTOR_NOTICE constant. Verifying it
    // here keeps the honesty guarantee end-to-end after the item-3 extraction.
    expect(read('src/ui/primitives.tsx')).toContain('UNVERIFIED_SELECTOR_NOTICE');
  });

  it('uses hint wording, never a measured verdict', () => {
    const labels = Object.values(STABILITY_HINT_STYLES).map((s) => s.label);
    for (const label of labels) {
      // A tick mark is the vocabulary of proof and must not appear on a hint.
      expect(label, `"${label}" must not carry a verdict glyph`).not.toMatch(/[✓✔√]/);
      expect(label.toLowerCase(), `"${label}" must not read as a grade`).not.toMatch(
        /\b(high|medium|low)\b/,
      );
    }
    expect(labels).toEqual(['Stable pattern', 'May change', 'Fragile pattern']);
  });

  it('does not colour a hint as a passed check', () => {
    // #dcfce7 is the green used elsewhere for a MEASURED single match. Reusing
    // it for an unmeasured hint is what made the badge read as evidence.
    for (const style of Object.values(STABILITY_HINT_STYLES)) {
      expect(style.bg.toLowerCase()).not.toBe('#dcfce7');
    }
  });

  it('keeps the word "reliability" out of a module that measures nothing', () => {
    const source = read('utils/css-xpath.ts');
    expect(source).not.toMatch(/reliability/i);
    for (const panel of PANELS) {
      expect(read(panel), `${panel} must not speak of reliability`).not.toMatch(/reliability/i);
    }
  });

  it('proves the hint cannot be a measurement — the module never queries the DOM', () => {
    const source = read('utils/css-xpath.ts');
    // If it counted matches it would need one of these. It has none, which is
    // exactly why the labels had to change rather than be recomputed.
    expect(source).not.toMatch(/querySelectorAll|document\.evaluate|getBoundingClientRect/);
  });

  it('still generates selectors — honesty is not achieved by deleting the feature', () => {
    const attrs = {
      tagName: 'input',
      id: 'email',
      className: 'form-control',
      type: 'text',
      placeholder: 'Email',
    } as Parameters<typeof generateAllCSSVariants>[0];
    expect(generateAllCSSVariants(attrs).length).toBeGreaterThan(5);
    expect(generateAllXPathVariants(attrs).length).toBeGreaterThan(5);
  });

  it('does not call an unverified suggestion the "best"', () => {
    for (const panel of PANELS) {
      expect(read(panel), `${panel} must not label an unverified pick as Best`).not.toContain(
        '>Best:<',
      );
    }
  });
});

// ─── 2. One meaning per number ──────────────────────────────────────────────

describe('match-count semantics are consistent', () => {
  it('carries visible and total separately through the message contract', () => {
    const messaging = read('utils/messaging.ts');
    expect(messaging).toContain('visibleCount');
    expect(messaging).toMatch(/TOTAL DOM elements matched/);
  });

  it('collects elements once and filters them, rather than counting twice', () => {
    // WS3 moved XPath/CSS measuring out of content.ts's own ad-hoc counting
    // and into LiveDomProbe (src/runtime/probe.ts), which keeps this exact
    // guarantee: one collection (querySelectorAll / document.evaluate) is
    // filtered once by the shared `measure()` to answer both the total and
    // the visible question, rather than counting twice.
    //
    // WS6.2 (D2) added a third argument to `measuredCount` — the scope handle
    // for a unique match — so `measure()` now names the filtered list before
    // using it twice. The GUARANTEE is unchanged and is pinned no less tightly:
    // the total still comes from the single collection (`els.length`) and the
    // visible count still comes from filtering THAT SAME list, so a second
    // query to answer the second question would still fail this test.
    const probe = read('src/runtime/probe.ts');
    expect(probe).not.toMatch(/count\(\$\{expression\}\)/);
    expect(probe).toContain('ORDERED_NODE_SNAPSHOT_TYPE');
    expect(probe).toMatch(/const visible = els\.filter\(isElementVisible\);/);
    expect(probe).toMatch(/measuredCount\(\s*els\.length,\s*visible\.length,/);
  });

  it('leads with the visible count on both surfaces', () => {
    for (const panel of PANELS) {
      const source = read(panel);
      // WS5 renamed this from a local `verifyVisible` const to the shared
      // `visibleCountOf()` in `ui/panel/verify-message.ts`. Same rule: the
      // verdict follows the VISIBLE count, and the total is reported alongside.
      expect(source, `${panel} must derive its verdict from the visible count`).toMatch(
        /verifyVisible|visibleCountOf/,
      );
      expect(source, `${panel} must report the total too`).toMatch(
        /total,\s*\$\{hidden\}\s*hidden/,
      );
    }
  });

  it('labels candidate badges as visible counts, matching Verify', () => {
    // matchBadge — the function that renders these strings — moved to the
    // shared src/ui/strategy-meta.ts in WS2 item 6 (it was duplicated
    // byte-for-byte in both panels). Each panel imports it rather than
    // declaring it locally, so the guarantee is now checked end-to-end:
    // panel imports the shared function, and the shared function's own
    // source still carries the honest wording.
    for (const panel of PANELS) {
      const source = read(panel);
      expect(source, `${panel} must import the shared matchBadge`).toMatch(
        /import\s*\{[^}]*\bmatchBadge\b[^}]*\}\s*from '[^']*strategy-meta'/,
      );
    }
    const meta = read(STRATEGY_META);
    expect(meta, 'strategy-meta.ts badge must say "visible"').toMatch(/'✓ 1 visible'/);
    expect(meta, 'strategy-meta.ts must not claim an unqualified match').not.toMatch(/'✓ 1 match'/);
  });

  it('says "not measured" rather than "unknown" when the probe could not answer', () => {
    // Same chain as above: the string now lives in the shared matchBadge in
    // strategy-meta.ts, which both panels import.
    for (const panel of PANELS) {
      expect(read(panel), `${panel} must import the shared matchBadge`).toMatch(
        /import\s*\{[^}]*\bmatchBadge\b[^}]*\}\s*from '[^']*strategy-meta'/,
      );
    }
    expect(read(STRATEGY_META)).toMatch(/not measured/);
  });
});

// ─── 3. A render error is contained, explained, and leaks nothing ───────────

describe('panel roots contain render errors', () => {
  const BOUNDARY = 'src/ui/ErrorBoundary.tsx';

  it('wraps both panel roots', () => {
    for (const main of ['entrypoints/sidepanel/main.tsx', 'entrypoints/devtools-panel/main.tsx']) {
      const source = read(main);
      expect(source, `${main} must import the boundary`).toContain('ErrorBoundary');
      expect(source, `${main} must wrap its root component`).toMatch(/<ErrorBoundary surface="/);
    }
  });

  it('never renders the error text, which can carry page content', () => {
    const source = read(BOUNDARY);
    // The caught error goes to the console and nowhere else.
    expect(source).toContain('console.error');
    // No error value is held in state, so none can reach the DOM.
    expect(source).toMatch(
      /getDerivedStateFromError\(\):\s*ErrorBoundaryState\s*\{\s*return\s*\{\s*hasError:\s*true\s*\}/,
    );
    expect(source).not.toMatch(/\{\s*(this\.state\.)?error(\.message|\.stack)?\s*\}/);
  });

  it('offers a recovery action and stays honest about what happened', () => {
    const source = read(BOUNDARY);
    expect(source).toContain('window.location.reload');
    expect(source).toMatch(/role="alert"/);
    expect(source.toLowerCase()).toContain('nothing was sent anywhere');
  });

  it('introduces no dependency and no telemetry', () => {
    const source = read(BOUNDARY);
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['react']);
    expect(source).not.toMatch(/fetch|XMLHttpRequest|sendBeacon|analytics/i);
  });
});
