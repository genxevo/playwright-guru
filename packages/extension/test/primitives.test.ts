/**
 * WS2 item 3 — shared primitives: consolidation + accessibility contract.
 * =======================================================================
 *
 * The extension test environment is `node` (no DOM), so — matching
 * `architecture.test.ts` and `tokens.test.ts` — these are structural
 * source-scan guards rather than render tests:
 *
 *   • ACCESSIBILITY. The interactive primitives must render a NATIVE `<button>`,
 *     never a click-handled `<div>`/`<span>`. Native buttons carry keyboard
 *     activation, focus-visible and disabled semantics for free; re-homing them
 *     on a div silently drops all three. This guard fails if that regresses.
 *
 *   • CONSOLIDATION (failure-first). The four leaf components — and the
 *     `ACTION_MAP`/`applyAction` pair `AddButton` needs — were duplicated in
 *     BOTH panels. After item 3 each panel imports the single shared copy and
 *     defines none of them locally. These assertions were RED before the
 *     migration (the panels still declared the duplicates) and GREEN after —
 *     and they stay green only while the duplication does not creep back.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  declaringFiles,
  denseCode,
  readComposed,
  surfaceComposes,
  SURFACE_ENTRY,
  type SurfaceName,
} from './helpers/surface-source';

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

const PRIMITIVES = read('src/ui/primitives.tsx');
const ACTIONS = read('src/ui/actions.ts');
const STRATEGY_META = read('src/ui/strategy-meta.ts');
const PANELS = ['entrypoints/sidepanel/SidePanel.tsx', 'entrypoints/devtools-panel/Panel.tsx'];
/** The surface that a panel entrypoint path names. */
const surfaceOf = (rel: string): SurfaceName =>
  (Object.keys(SURFACE_ENTRY) as SurfaceName[]).find((n) => SURFACE_ENTRY[n] === rel)!;

// ─── Accessibility: interactive primitives are native buttons ────────────────

describe('interactive primitives render native <button> (a11y contract)', () => {
  it.each(['CopyButton', 'AddButton'])('%s is a <button>, not a click-handled div/span', (name) => {
    // Isolate the component body: from `export function <name>` to the next
    // top-level `export function` (or EOF).
    const start = PRIMITIVES.indexOf(`export function ${name}`);
    expect(start, `${name} must be exported from primitives.tsx`).toBeGreaterThanOrEqual(0);
    const rest = PRIMITIVES.slice(start + 1);
    const nextExport = rest.indexOf('\nexport function ');
    const body = nextExport === -1 ? rest : rest.slice(0, nextExport);

    expect(body, `${name} must render a native <button>`).toMatch(/<button\b/);
    expect(body, `${name} must not put onClick on a <div>/<span>`).not.toMatch(
      /<(div|span)\b[^>]*onClick/,
    );
  });

  it('the shared action helper is a pure module (logic only, no JSX render)', () => {
    // No JSX element returns (a `Record<string, …>` generic is not JSX).
    expect(ACTIONS).not.toMatch(/return\s*</);
    expect(ACTIONS).not.toMatch(/<(div|span|button)\b/);
    expect(ACTIONS).toMatch(/export function applyAction/);
    expect(ACTIONS).toMatch(/export const ACTION_MAP/);
  });
});

// ─── Consolidation: the duplicates are gone and the shared copy is used ──────

describe('both panels consume the shared primitives, not local copies', () => {
  it.each(PANELS)('%s composes src/ui/primitives', (rel) => {
    // WS5 — the import may now be reached through a shared panel component
    // rather than written in the entrypoint, so the honest question is whether
    // the surface COMPOSES the shared module, not which file spells the path.
    expect(
      surfaceComposes(surfaceOf(rel), 'src/ui/primitives.tsx'),
      `${rel} must compose the shared primitives`,
    ).toBe(true);
  });

  it.each(PANELS)(
    '%s declares the extracted leaf components exactly once, in primitives',
    (rel) => {
      const surface = surfaceOf(rel);
      for (const name of ['CopyButton', 'AddButton', 'UnverifiedNotice', 'NARow']) {
        expect(
          declaringFiles(surface, new RegExp(`function ${name}\\b`)),
          `${rel} must have exactly one ${name}, owned by primitives.tsx`,
        ).toEqual(['src/ui/primitives.tsx']);
      }
      // The old local aliases must be gone from the composition entirely.
      for (const decl of ['function CopyBtn', 'function AddBtn']) {
        expect(read(rel), `${rel} must not re-declare ${decl}`).not.toContain(decl);
      }
    },
  );

  it.each(PANELS)('%s has ONE ACTION_MAP / applyAction, in the shared helper', (rel) => {
    const surface = surfaceOf(rel);
    expect(declaringFiles(surface, /const ACTION_MAP\b/), `${rel}`).toEqual(['src/ui/actions.ts']);
    expect(declaringFiles(surface, /function applyAction\b/), `${rel}`).toEqual([
      'src/ui/actions.ts',
    ]);
  });
});

// ─── WS2 item 4: both panels use the shared accessible Tabs, not local SubTabBar ─

describe('both panels use the shared Tabs primitive (item 4)', () => {
  it('Tabs and tabPanelProps are exported from primitives', () => {
    expect(PRIMITIVES).toMatch(/export function Tabs\b/);
    expect(PRIMITIVES).toMatch(/export function tabPanelProps\b/);
  });

  it.each(PANELS)('%s uses the shared Tabs, declared once in primitives', (rel) => {
    const surface = surfaceOf(rel);
    expect(declaringFiles(surface, /export function Tabs\b/), `${rel}`).toEqual([
      'src/ui/primitives.tsx',
    ]);
    expect(read(rel), `${rel} must render the shared Tabs`).toMatch(/<Tabs\b/);
  });

  it.each(PANELS)('%s no longer DEFINES a local SubTabBar', (rel) => {
    expect(
      read(rel),
      `${rel} must not re-declare SubTabBar (it is now the shared Tabs)`,
    ).not.toContain('function SubTabBar');
  });

  it.each(PANELS)('%s marks the sub-tab content region as a role=tabpanel', (rel) => {
    // Adopting Tabs is only complete if the controlled region is a real panel.
    expect(read(rel), `${rel} must render tabPanelProps for the Tabs it uses`).toMatch(
      /tabPanelProps\(/,
    );
  });
});

// ─── WS2 item 6: the main strategy bar (Playwright/CSS/XPath) now uses the ──
// ─── shared Tabs primitive (underline variant), not the old local button map ─

describe('both panels migrate the main strategy bar to the shared Tabs primitive (item 6)', () => {
  it("Tabs supports a 'variant' prop and TabItem supports a per-tab 'accent' — no second Tabs component", () => {
    // Exactly one Tabs export (the consolidation guard above already pins
    // this); the underline variant and per-tab accent override extend it.
    expect(PRIMITIVES.match(/export function Tabs\b/g)).toHaveLength(1);
    expect(PRIMITIVES).toMatch(/variant\s*\??:\s*'pill'\s*\|\s*'underline'/);
    expect(PRIMITIVES).toMatch(/accent\s*\?:\s*string/); // TabItem.accent is optional
  });

  it.each(PANELS)(
    '%s no longer builds the main strategy bar from an inline tab-array map',
    (rel) => {
      const src = read(rel);
      // The old implementation's fingerprint: an inline [[id,label,accent],...]
      // literal, `.map(...)`-rendered into local <button> elements.
      expect(src, `${rel} must not re-declare the local main-bar button map`).not.toMatch(
        /\[\['playwright'/,
      );
    },
  );

  it.each(PANELS)(
    '%s renders the main strategy bar with the shared Tabs, underline variant',
    (rel) => {
      const src = read(rel);
      expect(src, `${rel} must use STRATEGY_TABS with the shared Tabs`).toMatch(
        /<Tabs\s+tabs=\{STRATEGY_TABS\}/,
      );
      expect(src, `${rel} must use the underline variant for the main bar`).toMatch(
        /variant="underline"/,
      );
    },
  );

  it.each(PANELS)(
    '%s wires a tabpanel region keyed to the main strategy bar (idBase "pg-main")',
    (rel) => {
      expect(
        read(rel),
        `${rel} must render tabPanelProps('pg-main', …) for its strategy content`,
      ).toMatch(/tabPanelProps\('pg-main',/);
    },
  );

  it.each(PANELS)('%s still represents all three strategies (playwright/css/xpath)', (rel) => {
    // WS5 renamed the state holder from a local `mainTab` to the shared
    // `tabs.mainTab`; the gate itself is unchanged and still one branch per
    // strategy, so the guard follows the identifier rather than pinning the
    // old spelling.
    const src = denseCode(read(rel));
    for (const tab of ['playwright', 'css', 'xpath']) {
      expect(src, `${rel} must still gate content on mainTab === '${tab}'`).toMatch(
        new RegExp(`mainTab===='?${tab}'|mainTab==='${tab}'`),
      );
    }
  });
});

// ─── WS2 item 6: strategy metadata consolidation (data + one pure function) ──

describe('strategy metadata (STRATEGY_COLORS/STRATEGY_LABELS/matchBadge/STRATEGY_TABS) is shared, not duplicated', () => {
  it('src/ui/strategy-meta.ts exports the four shared strategy symbols', () => {
    expect(STRATEGY_META).toMatch(/export const STRATEGY_COLORS/);
    expect(STRATEGY_META).toMatch(/export const STRATEGY_LABELS/);
    expect(STRATEGY_META).toMatch(/export const STRATEGY_TABS/);
    expect(STRATEGY_META).toMatch(/export function matchBadge/);
  });

  it('strategy-meta.ts is a pure UI data module: no React, no JSX, no domain package import', () => {
    expect(STRATEGY_META, 'must not import React').not.toMatch(/from 'react'/);
    expect(STRATEGY_META, 'must not render JSX').not.toMatch(/<(div|span|button)\b/);
    expect(STRATEGY_META, 'must not import the domain package directly').not.toMatch(
      /^import[^;]*@playwright-guru\/locator-engine/m,
    );
  });

  it.each(PANELS)(
    '%s no longer declares a local STRATEGY_COLORS / STRATEGY_LABELS / matchBadge',
    (rel) => {
      const surface = surfaceOf(rel);
      for (const [what, pattern] of [
        ['STRATEGY_COLORS', /const STRATEGY_COLORS\s*[:=]/],
        ['STRATEGY_LABELS', /const STRATEGY_LABELS\s*[:=]/],
        ['matchBadge', /function matchBadge\(/],
      ] as const) {
        expect(
          declaringFiles(surface, pattern),
          `${rel} must have exactly one ${what}, owned by strategy-meta.ts`,
        ).toEqual(['src/ui/strategy-meta.ts']);
      }
    },
  );

  it.each(PANELS)('%s composes the shared strategy metadata', (rel) => {
    expect(
      surfaceComposes(surfaceOf(rel), 'src/ui/strategy-meta.ts'),
      `${rel} must compose src/ui/strategy-meta`,
    ).toBe(true);
  });

  it('preserves the exact pre-extraction values (colors, labels, thresholds)', () => {
    // Evidence, not trust: re-derive the module's own exports and diff them
    // against the values that were hand-verified identical in both panels
    // before extraction (DL entry / Phase-1 inspection).
    expect(STRATEGY_META).toContain("role: '#16a34a'");
    expect(STRATEGY_META).toContain("testId: '#d97706'");
    expect(STRATEGY_META).toContain("testId: 'getByTestId'");
    expect(STRATEGY_META).toContain("text: '✓ 1 visible'");
    expect(STRATEGY_META).toContain("bg: '#fee2e2'");
  });
});
