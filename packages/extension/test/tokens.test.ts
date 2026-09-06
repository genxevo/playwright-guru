/**
 * WS2 · item 1 — Design-token foundation contract.
 * ================================================================
 *
 * These tests pin the token SOURCE OF TRUTH (`src/ui/tokens.css`) and its
 * loading path. They are failure-first structural gates, not restatements of
 * the implementation:
 *
 *   • the required semantic token set exists (a renamed/removed token fails);
 *   • light and dark declare the SAME colour-token names (a theme that forgets
 *     a token fails — this is what makes dark theme real, not decorative);
 *   • the type scale honours the WS2 rule: 12px base, 11px minimum, no 9px;
 *   • every named foreground/background token PAIR meets WCAG AA (≥ 4.5:1) in
 *     both themes and in the code preview — if a future value edit drops a pair
 *     below AA, this test goes red;
 *   • both rendered panels actually import the stylesheet (the tokens reach the
 *     product, not just the repo).
 *
 * Node env, no DOM: the CSS is read as text and parsed with small regexes over
 * the flat (no nested-brace) :root blocks.
 *
 * Solid-fill + on-solid-text contrast pairs are intentionally NOT asserted here
 * — those are WS2 Phase B/C, where token values may be adjusted against the real
 * panel usage. This file covers only the pairs the foundation itself declares.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readComposed } from './helpers/surface-source';

const EXT = resolve(__dirname, '..');
const TOKENS = join(EXT, 'src/ui/tokens.css');
const css = readFileSync(TOKENS, 'utf8');

/** Extract the token map inside the first flat block whose header matches. */
function block(header: string): Record<string, string> {
  const start = css.indexOf(header);
  if (start === -1) throw new Error(`block not found: ${header}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);
  const map: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = m;
    if (name && value) map[name] = value.trim();
  }
  return map;
}

const rootLight = block(':root {');
const explicitDark = block(":root[data-theme='dark'] {");

/** Strict lookup: a missing token is a test failure, never a silent undefined. */
function pick(map: Record<string, string>, key: string): string {
  const value = map[key];
  if (value === undefined) throw new Error(`token not declared: ${key}`);
  return value;
}

// ─── WCAG contrast ──────────────────────────────────────────────────────────

function luminance(hex: string): number {
  let h = hex.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const chan = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** The required foreground/background token pairs, by theme map. */
const PAIRS: Array<[fg: string, bg: string]> = [
  ['--pg-color-text', '--pg-color-surface'],
  ['--pg-color-text', '--pg-color-bg'],
  ['--pg-color-text-muted', '--pg-color-surface'],
  ['--pg-color-text-subtle', '--pg-color-surface'],
  ['--pg-color-success-text', '--pg-color-success-tint'],
  ['--pg-color-info-text', '--pg-color-info-tint'],
  ['--pg-color-warning-text', '--pg-color-warning-tint'],
  ['--pg-color-danger-text', '--pg-color-danger-tint'],
  ['--pg-color-accent-text', '--pg-color-accent-tint'],
];

const REQUIRED_COLOR_TOKENS = [
  '--pg-color-bg',
  '--pg-color-surface',
  '--pg-color-surface-sunken',
  '--pg-color-border',
  '--pg-color-border-strong',
  '--pg-color-text',
  '--pg-color-text-muted',
  '--pg-color-text-subtle',
  '--pg-color-text-inverse',
  // Each accent family carries five roles: base / strong / tint / border / text.
  // (A speculative `-surface` role was removed in item 2 as unused — DL-44.)
  ...['success', 'info', 'warning', 'danger', 'accent'].flatMap((f) => [
    `--pg-color-${f}`,
    `--pg-color-${f}-strong`,
    `--pg-color-${f}-tint`,
    `--pg-color-${f}-border`,
    `--pg-color-${f}-text`,
  ]),
  '--pg-color-focus',
];

// ─── Existence + required set ────────────────────────────────────────────────

describe('tokens.css exists and declares the required semantic set', () => {
  it('the file is non-trivial', () => {
    expect(css.length).toBeGreaterThan(500);
  });

  it.each(REQUIRED_COLOR_TOKENS)('light :root defines %s', (token) => {
    expect(rootLight[token], `${token} missing from :root`).toBeDefined();
  });

  it('declares the typography, spacing and radius scale tokens', () => {
    for (const t of [
      '--pg-font-sans',
      '--pg-font-mono',
      '--pg-font-size-xs',
      '--pg-font-size-base',
      '--pg-line-height-normal',
      '--pg-space-1',
      '--pg-radius-md',
    ]) {
      expect(rootLight[t], `${t} missing`).toBeDefined();
    }
  });
});

// ─── Typography rule: 12 base, 11 min, no 9px ────────────────────────────────

describe('type scale honours the WS2 rule (12 base · 11 min · no 9px)', () => {
  it('base is 12px and the xs floor is 11px', () => {
    expect(rootLight['--pg-font-size-base']).toBe('12px');
    expect(rootLight['--pg-font-size-xs']).toBe('11px');
  });

  it('no font-size token is below 11px (and none is 9px)', () => {
    const sizes = Object.entries(rootLight)
      .filter(([k]) => k.startsWith('--pg-font-size-'))
      .map(([, v]) => Number(v.replace('px', '')));
    expect(sizes.length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...sizes), 'smallest type token is the 11px floor').toBe(11);
    expect(sizes).not.toContain(9);
  });
});

// ─── Light/dark parity ───────────────────────────────────────────────────────

describe('dark theme is real — it redefines every light colour token', () => {
  const lightColorKeys = Object.keys(rootLight).filter((k) => k.startsWith('--pg-color-'));

  it.each(lightColorKeys)('explicit dark redefines %s', (token) => {
    expect(explicitDark[token], `${token} not overridden in [data-theme='dark']`).toBeDefined();
  });

  it('explicit dark introduces no colour token absent from light (names stay in sync)', () => {
    for (const k of Object.keys(explicitDark).filter((k) => k.startsWith('--pg-color-'))) {
      expect(lightColorKeys, `${k} exists in dark but not light`).toContain(k);
    }
  });

  it('an explicit light choice wins over system dark via the :not guard (no duplicate block)', () => {
    // The dark system rule must exclude data-theme='light' so that an explicit
    // light choice falls through to the bare :root light values — this is what
    // lets light win over system dark WITHOUT re-declaring the whole palette.
    expect(css).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
    expect(css, "dark @media must be guarded with :root:not([data-theme='light'])").toMatch(
      /:root:not\(\[data-theme='light'\]\)/,
    );
  });

  it('dark actually changes values (it is not a copy of light)', () => {
    expect(explicitDark['--pg-color-bg']).not.toBe(rootLight['--pg-color-bg']);
    expect(explicitDark['--pg-color-text']).not.toBe(rootLight['--pg-color-text']);
  });
});

// ─── Contrast: every named pair ≥ 4.5:1, both themes + code ──────────────────

describe('every declared foreground/background pair meets WCAG AA', () => {
  it.each(PAIRS)('LIGHT %s on %s ≥ 4.5:1', (fg, bg) => {
    const fgv = pick(rootLight, fg);
    const bgv = pick(rootLight, bg);
    const ratio = contrast(fgv, bgv);
    expect(ratio, `${fg}(${fgv}) on ${bg}(${bgv}) = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it.each(PAIRS)('DARK %s on %s ≥ 4.5:1', (fg, bg) => {
    const fgv = pick(explicitDark, fg);
    const bgv = pick(explicitDark, bg);
    const ratio = contrast(fgv, bgv);
    expect(ratio, `${fg}(${fgv}) on ${bg}(${bgv}) = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('code preview text and comment stay legible on the code background', () => {
    const bg = pick(rootLight, '--pg-code-bg');
    expect(contrast(pick(rootLight, '--pg-code-text'), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(pick(rootLight, '--pg-code-comment'), bg)).toBeGreaterThanOrEqual(4.5);
  });
});

// ─── WS2 item 8: --pg-focus-ring finally has a real consumer ─────────────────
//
// Item 1 declared --pg-focus-ring (light + dark) but nothing ever consumed
// it — every interactive element relied on the browser default outline, and
// SidePanel.tsx's Verify Selector input explicitly removed it
// (outline:'none') with no replacement at all, a real WCAG 2.4.7 gap. Item 8
// wires up a single :focus-visible rule covering every button/input in both
// panels (native buttons already cover the Tabs primitive's tabs).

describe('WS2 item 8: a real :focus-visible rule consumes --pg-focus-ring', () => {
  it('tokens.css declares a :focus-visible rule for button and input using the token', () => {
    expect(css).toMatch(/button:focus-visible/);
    expect(css).toMatch(/input:focus-visible/);
    // Same rule body, not two separate re-declarations of the token value.
    const ruleMatch = css.match(
      /button:focus-visible,\s*\ninput:focus-visible\s*\{[^}]*box-shadow:\s*var\(--pg-focus-ring\)[^}]*\}/,
    );
    expect(
      ruleMatch,
      'expected one shared :focus-visible rule referencing var(--pg-focus-ring)',
    ).not.toBeNull();
  });

  it('the rule explicitly cancels the outline it replaces (outline: none) rather than stacking both', () => {
    const ruleMatch = css.match(/button:focus-visible,\s*\ninput:focus-visible\s*\{([^}]*)\}/);
    expect(ruleMatch).not.toBeNull();
    expect(ruleMatch![1]).toMatch(/outline:\s*none/);
  });

  it('--pg-focus-ring is a real box-shadow value in both light and dark', () => {
    for (const map of [rootLight, explicitDark]) {
      const ring = pick(map, '--pg-focus-ring');
      expect(ring).toMatch(/^0 0 0 \d+px #[0-9a-f]{6}$/i);
    }
  });

  /*
   * WS8 — the numeric bar item 8 deliberately did not assert.
   *
   * Item 8 wired `--pg-focus-ring` up and measured it at 1.98:1 (light) and
   * 1.74:1 (dark) against the worst background token — under WCAG 1.4.11's
   * 3:1 for a non-text focus indicator — then left the retune to a later pass
   * (DL-50). Opacity was the cause: a 55%/60%-alpha ring composites toward
   * whatever is behind it, so on a light tint there was nearly nothing left.
   *
   * The ring is now solid, and this is the bar it has to clear: at least 3:1
   * against EVERY background/surface token declared in the same theme. The
   * ring is painted as a spread box-shadow OUTSIDE the control, so those
   * surfaces are what it actually sits on. A control whose own fill happens
   * to sit close to the ring colour remains a per-component concern — this
   * guard does not claim to cover it, and does not pretend to be an audit of
   * the rendered panels in a browser.
   */
  it('the focus ring clears WCAG 1.4.11 (3:1) against every surface token in its own theme', () => {
    const SURFACE_TOKENS = Object.keys(rootLight).filter(
      (t) =>
        /^--pg-color-/.test(t) &&
        /(bg|surface|surface-sunken|border|border-strong|tint)$/.test(t) &&
        !t.startsWith('--pg-code-'),
    );
    expect(SURFACE_TOKENS.length).toBeGreaterThan(8); // the scan found real tokens

    for (const [themeName, map] of [
      ['light', rootLight],
      ['dark', explicitDark],
    ] as const) {
      const ringColour = pick(map, '--pg-focus-ring').match(/#[0-9a-f]{6}/i)?.[0];
      expect(ringColour, `${themeName}: ring must carry a hex colour`).toBeDefined();
      for (const token of SURFACE_TOKENS) {
        const bg = map[token];
        if (!bg || !/^#[0-9a-f]{6}$/i.test(bg)) continue;
        const ratio = contrast(ringColour!, bg);
        expect(
          ratio,
          `${themeName}: focus ring vs ${token} (${bg}) = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

/*
 * WS8 — motion and forced colours.
 *
 * Both panels animate through INLINE styles (SidePanel's recording pulse, the
 * primitives' background transitions), which no ordinary rule can override —
 * hence `!important` in one stylesheet block rather than an edit to every
 * component. And `box-shadow` is dropped entirely in forced-colors mode, so
 * without a system-keyword outline the focus ring would be invisible to
 * exactly the users who most depend on it.
 */
describe('WS8: motion and forced-colors accommodations live in the one stylesheet', () => {
  it('honours prefers-reduced-motion, and does so forcefully enough to beat inline styles', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
    expect(block, 'tokens.css must carry a prefers-reduced-motion block').not.toBeNull();
    expect(block![1]).toMatch(/animation-duration:[^;]*!important/);
    expect(block![1]).toMatch(/animation-iteration-count:[^;]*!important/);
    expect(block![1]).toMatch(/transition-duration:[^;]*!important/);
  });

  it('restores a visible focus indicator under forced colors, where box-shadow does not paint', () => {
    const block = css.match(/@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\}/);
    expect(block, 'tokens.css must carry a forced-colors block').not.toBeNull();
    expect(block![1]).toMatch(/button:focus-visible/);
    expect(block![1]).toMatch(/input:focus-visible/);
    expect(block![1]).toMatch(/outline:\s*2px solid Highlight/);
  });
});

// ─── Loading path: the tokens actually reach both panels ─────────────────────

describe('the token stylesheet is imported by both rendered panels', () => {
  it.each(['entrypoints/sidepanel/main.tsx', 'entrypoints/devtools-panel/main.tsx'])(
    '%s imports tokens.css',
    (rel) => {
      const src = readFileSync(join(EXT, rel), 'utf8');
      expect(src, `${rel} must import the token stylesheet`).toMatch(/tokens\.css/);
    },
  );
});

// ─── WS2 item 2: the 11px floor reaches the rendered panels ──────────────────
//
// tokens.test's earlier blocks pin the SCALE (tokens.css). This block pins the
// APPLICATION: no rendered-UI source may set an inline font-size below the 11px
// floor. It scans the real panel/UI source, so a reintroduced 9px/10px goes red.

const UI_SOURCES = [
  'entrypoints/sidepanel/SidePanel.tsx',
  'entrypoints/devtools-panel/Panel.tsx',
  'src/ui/ErrorBoundary.tsx',
];

/** Every inline font-size literal (numeric `fontSize:12` or string `fontSize:'12px'`). */
function inlineFontSizes(src: string): number[] {
  const sizes: number[] = [];
  for (const m of src.matchAll(/fontSize:\s*['"]?(\d+)(?:px)?['"]?/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) sizes.push(n);
  }
  return sizes;
}

describe('WS2 item 2 · rendered UI honours the 11px floor', () => {
  it.each(UI_SOURCES)('%s sets no inline font-size below 11px (and no 9px)', (rel) => {
    // WS5 — a surface is a composition: the inline font sizes it renders now
    // live in the shared panel components it imports, so the floor is checked
    // across everything the surface actually renders, not one file.
    const sizes = inlineFontSizes(readComposed(rel));
    const belowFloor = sizes.filter((n) => n < 11);
    expect(belowFloor, `${rel} has sub-11px inline font sizes: ${belowFloor.join(', ')}`).toEqual(
      [],
    );
    expect(
      sizes,
      `${rel} must still declare some font sizes (scan is not vacuous)`,
    ).not.toHaveLength(0);
  });

  it('tokens.css establishes the 12px base on body via the base token', () => {
    expect(css).toMatch(/body\s*\{[^}]*font-size:\s*var\(--pg-font-size-base\)/);
  });
});
