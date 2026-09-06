/**
 * WS8 — structural accessibility guards.
 * ============================================================================
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * --------------------------------
 * WS8's roadmap exit criterion names axe-core: "axe-core zero critical/serious
 * in both panels in both themes". This suite is NOT that, and does not claim
 * to be. axe-core needs a rendered DOM; every vitest project in this repo runs
 * `environment: 'node'` by deliberate architectural design (R3 —
 * `vitest.workspace.ts`), and no React render harness exists anywhere in the
 * repository. Running axe under happy-dom would produce fixture-level output
 * that is not Chromium truth (the same boundary `FixtureDomProbe` observes for
 * XPath), and standing up a real-browser harness is new test infrastructure
 * that WS8's own authorisation does not grant.
 *
 * So the project owner decided the evidence level for WS8 (DL entry for this
 * gate): structural guards in the existing source-scan idiom, honestly labelled
 * as such, with axe-core validation deferred as named follow-up work rather
 * than faked at a weaker evidence level.
 *
 * What these guards genuinely protect: the accessibility properties that are
 * decidable from the source — native controls over `div` handlers, accessible
 * names on icon-only buttons, live regions on surfaces that change after a
 * user action, the shared focus ring, and the tablist's keyboard contract.
 * Each one below exists because it was either a real defect found in this pass
 * or a fix from an earlier pass that nothing was stopping from regressing.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
const PANELS = [SIDE_PANEL, DEVTOOLS_PANEL] as const;
const PRIMITIVES = 'src/ui/primitives.tsx';
const TOKENS_CSS = 'src/ui/tokens.css';
const ERROR_BOUNDARY = 'src/ui/ErrorBoundary.tsx';

/** Every source file that renders panel UI. */
const RENDERED_UI = [...PANELS, PRIMITIVES, 'src/ui/VerifyLocatorPanel.tsx', ERROR_BOUNDARY];

// ─── Native controls ────────────────────────────────────────────────────────
//
// A `<div onClick>` is not focusable, not keyboard-activatable, and announces
// as nothing. The primitives were built on native `<button>` for exactly this
// reason (WS2 item 3); this keeps every other surface honest too.

describe('interaction lives on native controls, never on a div', () => {
  it.each(RENDERED_UI)('%s attaches no click handler to a non-interactive element', (rel) => {
    const src = read(rel);
    // Any JSX opening tag that is not a native interactive element but carries onClick.
    // Only HOST elements can be the defect this guard exists for. A React
    // COMPONENT is capitalised and renders its own native control — WS5's
    // `<HeaderButton onClick=…>` is a `<button>` underneath, and flagging it
    // would report the extraction rather than an accessibility problem. The
    // hazard is and always was `<div onClick>`.
    const offenders = [...src.matchAll(/<([a-z]\w*)([^>]*?)\bonClick=/g)]
      .map((m) => ({ tag: m[1] ?? '', attrs: m[2] ?? '' }))
      .filter(({ tag }) => !['button', 'input', 'a', 'select', 'textarea'].includes(tag));
    expect(offenders.map((o) => o.tag)).toEqual([]);
  });

  it('the Tabs primitive uses real buttons inside a real tablist', () => {
    const src = read(PRIMITIVES);
    expect(src).toMatch(/role="tablist"/);
    expect(src).toMatch(/role="tab"/);
    expect(src).toMatch(/aria-selected=/);
    expect(src).toMatch(/<button/);
  });

  it('the tablist keeps a roving tabIndex, so Tab enters it once and arrows move within it', () => {
    const src = read(PRIMITIVES);
    expect(src).toMatch(/tabIndex=\{selected \? 0 : -1\}/);
    expect(src).toMatch(/ArrowRight|ArrowLeft/);
  });
});

// ─── Accessible names ───────────────────────────────────────────────────────
//
// Found in this pass: three buttons whose only content was a glyph (▶ twice,
// ✕ once). A screen reader announced "button", or read the character itself.
// The glyph is decoration; the name has to be text.

describe('every icon-only button carries an accessible name', () => {
  const GLYPHS = /[▶✕✓✗⟳↖↗●⎘↩]/u;

  it.each(PANELS)('%s names every button whose visible content is only a glyph', (rel) => {
    const src = read(rel);
    const unnamed: string[] = [];
    // Match a button element with its full attribute list, then its children.
    for (const m of src.matchAll(/<button\b([\s\S]*?)>([\s\S]{0,60}?)<\/button>/g)) {
      const attrs = m[1] ?? '';
      const children = m[2] ?? '';
      const text = children.replace(/\{[^}]*\}/g, '').trim();
      const glyphOnly = text.length > 0 && text.length <= 3 && GLYPHS.test(text);
      if (glyphOnly && !/aria-label[=\s]/.test(attrs) && !/title=/.test(attrs)) {
        unnamed.push(text);
      }
    }
    expect(unnamed, `${rel}: glyph-only buttons with no accessible name`).toEqual([]);
  });

  it('the two Verify buttons are named, not left as a bare play triangle', () => {
    for (const rel of PANELS) {
      expect(read(rel), `${rel}`).toMatch(/aria-label="Verify selector against the page"/);
    }
  });
});

// ─── Live regions ───────────────────────────────────────────────────────────
//
// Both panels have a status bar that changes in response to something the user
// just did — activating the picker, selecting an element, a failure. Before
// WS8 neither was a live region, so a screen-reader user pressed Pick and heard
// nothing at all. The region must also be present in the DOM before its text
// changes: mounting an aria-live node and filling it in the same tick is the
// classic way to have the announcement dropped.

describe('surfaces that change after a user action are announced', () => {
  it.each(PANELS)('%s marks its status bar as a polite live region', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/role="status"\s+aria-live="polite"/);
  });

  it('the side panel status region is always mounted, not conditionally rendered', () => {
    const src = read(SIDE_PANEL);
    // The old form was `{statusMsg && (<div …>)}` — the region appeared only
    // once there was something to say, which is exactly when it is too late.
    expect(src).not.toMatch(/\{statusMsg\s*&&\s*\(\s*\n?\s*<div/);
    expect(src).toMatch(/<div role="status" aria-live="polite"/);
  });

  it('the Playwright-expression verify result stays a live region (WS6.2, not regressed)', () => {
    expect(read('src/ui/VerifyLocatorPanel.tsx')).toMatch(/role="status"\s+aria-live="polite"/);
  });

  it('a render crash announces itself as an alert, not as silent replaced content', () => {
    expect(read(ERROR_BOUNDARY)).toMatch(/role="alert"/);
  });

  it('an error notice is an alert — the user has to act on it', () => {
    expect(read(PRIMITIVES)).toMatch(/role="alert"/);
  });
});

// ─── Focus visibility ───────────────────────────────────────────────────────
//
// tokens.test.ts owns the ring's contrast maths. This guards the wiring: one
// shared rule, and no component quietly cancelling the outline again the way
// SidePanel's verify input did before WS2 item 8.

describe('focus stays visible', () => {
  it('one shared :focus-visible rule covers every native control in both panels', () => {
    const css = read(TOKENS_CSS);
    expect(css).toMatch(/button:focus-visible,\s*\ninput:focus-visible\s*\{/);
    expect(css).toMatch(/box-shadow:\s*var\(--pg-focus-ring\)/);
  });

  it.each(RENDERED_UI)('%s never sets outline:none inline without a replacement', (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/outline:\s*['"]none['"]/);
  });
});
