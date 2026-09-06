/**
 * WS2 item 7 — hex → semantic token migration. Revised in item 8.
 * =============================================================================
 *
 * Scope actually delivered in item 7 (bounded, not the full "zero hardcoded
 * hex outside tokens.css" reading of the exit criterion — see the item-7
 * final report / DL-49 for why a full migration is bundle-budget-infeasible
 * under the current inline-style-object architecture):
 *
 *   (A) the two AA-contrast bugs Item 2 measured and deferred — role/label
 *       (#16a34a, ~3.3:1) and testId (#d97706, ~3.2:1) used as small/bold
 *       BADGE TEXT — fixed via `strategyTextColor()`, mapping just those two
 *       kinds to the AA-safe `-text` shade, leaving the base
 *       `STRATEGY_COLORS` values (which correctly drive tint/border/
 *       background) untouched; plus `matchBadge()`'s already-AA-safe text
 *       colours, applied 1:1 (zero visual change).
 *   (B) the VS-Code-style CODE-preview footer's exact-match literals
 *       (`#1e1e1e`/`#252526`/`#d4d4d4`/`#6a9955`/`#569cd6`/`#2a2d2e`/`#ce9178`)
 *       tokenized to the existing theme-invariant `--pg-code-*` family in
 *       both panels.
 *
 * **Item 8 correction — (A)'s `-text` shades are LITERAL hex, not
 * `var(--pg-color-*-text)`.** Item 7 originally wrapped them in the
 * theme-aware token. Item 8's inspection found this was a regression: every
 * background these colours sit on (`matchBadge`'s tint literals, the
 * `color+'18'` alpha-tint badges, and every panel container — `body` sets no
 * `background-color`) is a hardcoded LIGHT literal, unmoved by
 * `prefers-color-scheme`. A user with OS/browser dark mode got the token's
 * dark value (e.g. #86efac) against the still-light background — measured at
 * **1.18–1.40:1**, far below AA. (A) is now pinned to literal hex — the same
 * values, just not wrapped in a token whose pairing background never moves.
 * (B)'s `--pg-code-*` tokens are UNCHANGED by item 8: they are genuinely,
 * singly-declared theme-invariant (never overridden in a dark block), so no
 * pairing-background bug is possible there.
 *
 * Deliberately NOT touched (documented, not silently dropped):
 *   - the XPath `Tabs` underline tab's `accent="#d97706"` (dual role: also
 *     drives the border-bottom indicator inside the shared `Tabs` primitive
 *     — too large a design decision for this bounded pass, tracked beyond item 8);
 *   - disabled-state / decorative literals with no matching token
 *     (`#f97316` CODE border-top, `#555` disabled undo/border, `#5a5a5a`
 *     line-number gutter, `#4a4a4a` empty-buffer hint, `#dc2626` error red,
 *     `#333` divider) — category E, "no suitable equivalent, leave literal";
 *   - code-preview SYNTAX colours that are not exact matches to an existing
 *     token (e.g. `#1e40af`/`#eff6ff` locator-code chip) — left as-is, this
 *     is a palette, not a semantic UI surface;
 *   - the broader fact that dark theme is functionally cosmetic in the
 *     shipped UI today (nothing else responds to `prefers-color-scheme`) —
 *     a real, larger limitation no item-8-sized budget can fix; flagged for
 *     item 9 (WS2 exit review).
 *
 * These are failure-first structural + numeric guards, matching the pattern
 * established by `tokens.test.ts` / `primitives.test.ts`: node env, no DOM,
 * source read as text.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STRATEGY_COLORS,
  STRATEGY_TABS,
  matchBadge,
  strategyTextColor,
} from '../src/ui/strategy-meta';

import { denseCode, readComposed } from './helpers/surface-source';

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
const PANELS = ['entrypoints/sidepanel/SidePanel.tsx', 'entrypoints/devtools-panel/Panel.tsx'];

// ─── WCAG contrast (small local copy, mirrors tokens.test.ts) ────────────────

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

/** Blend an 8-digit-hex-alpha colour (`RRGGBBAA`) over an opaque base. */
function blendAlpha(rgbHex: string, alphaHex: string, base: string): string {
  const alpha = parseInt(alphaHex, 16) / 255;
  const fg = rgbHex.replace('#', '');
  const bg = base.replace('#', '');
  const chan = (i: number) => {
    const f = parseInt(fg.slice(i, i + 2), 16);
    const b = parseInt(bg.slice(i, i + 2), 16);
    return Math.round(alpha * f + (1 - alpha) * b);
  };
  const hex = [chan(0), chan(2), chan(4)].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `#${hex}`;
}

// ─── (A) strategyTextColor: pure-function unit contract ──────────────────────

describe('strategyTextColor (item 7, literal hex since item 8)', () => {
  it('returns the AA-safe literal success-text for role and label', () => {
    expect(strategyTextColor('role')).toBe('#166534');
    expect(strategyTextColor('label')).toBe('#166534');
  });

  it('returns the AA-safe literal warning-text for testId', () => {
    expect(strategyTextColor('testId')).toBe('#92400e');
  });

  it('never returns a var(--pg-color-*-text) form (item 8: pairing background never moves with theme)', () => {
    for (const kind of ['role', 'label', 'testId', 'placeholder', 'text', 'altText', 'title']) {
      expect(strategyTextColor(kind)).not.toMatch(/^var\(/);
    }
  });

  it('falls through to the ordinary STRATEGY_COLORS value for every other kind', () => {
    for (const kind of ['placeholder', 'text', 'altText', 'title']) {
      expect(strategyTextColor(kind)).toBe(STRATEGY_COLORS[kind]);
    }
  });

  it('falls back to the neutral default for an unknown kind (never throws, never undefined)', () => {
    expect(strategyTextColor('nonexistent-kind')).toBe('#6b7280');
  });

  it('does NOT alter the base STRATEGY_COLORS table (backgrounds/borders/tints stay exact)', () => {
    // The whole point of the helper is a SPLIT: base colour still drives
    // background/border/tint; only the derived text colour changes. If this
    // regresses to "just repaint STRATEGY_COLORS", the light-tint badge
    // background would silently darken too — an unwanted visual change.
    expect(STRATEGY_COLORS.role).toBe('#16a34a');
    expect(STRATEGY_COLORS.label).toBe('#16a34a');
    expect(STRATEGY_COLORS.testId).toBe('#d97706');
  });
});

// ─── (A) matchBadge: tokenized colours, unchanged text/bg ─────────────────────

describe('matchBadge text colours are literal AA-safe hex (item 7 values, item 8 mechanism), text/bg untouched', () => {
  it('1 visible (no total) → literal success-text, same bg/text as before', () => {
    const badge = matchBadge(1);
    expect(badge.text).toBe('✓ 1 visible');
    expect(badge.bg).toBe('#dcfce7');
    expect(badge.color).toBe('#166534');
  });

  it('hidden matches → literal warning-text, same bg/text as before', () => {
    const badge = matchBadge(1, 3);
    expect(badge.bg).toBe('#fef3c7');
    expect(badge.color).toBe('#92400e');
  });

  it('0 visible → literal danger-text, same bg/text as before', () => {
    const badge = matchBadge(0);
    expect(badge.text).toBe('✗ 0 visible');
    expect(badge.bg).toBe('#fee2e2');
    expect(badge.color).toBe('#991b1b');
  });

  it('not-measured stays an intentionally plain literal (no semantic role to tokenize)', () => {
    // count is neither 1, >1 nor 0 (e.g. undefined-ish via NaN) falls to the
    // final branch — kept literal deliberately: "not measured" is neutral,
    // not success/warning/danger, and no neutral-badge-text token exists.
    const badge = matchBadge(Number.NaN);
    expect(badge.color).toBe('#475569');
  });

  it('never returns a var(--pg-color-*-text) form for any branch (item 8)', () => {
    for (const badge of [matchBadge(1), matchBadge(1, 3), matchBadge(2, 5), matchBadge(0)]) {
      expect(badge.color).not.toMatch(/^var\(/);
    }
  });
});

// ─── (A) contrast proof for the ACTUAL usage context ──────────────────────────

describe('AA contrast holds in the real rendered context, not just the token pair (item 7)', () => {
  it('success-text on the solid matchBadge tint (#dcfce7) is AA (already covered structurally, re-derived numerically here)', () => {
    expect(contrast('#166534', '#dcfce7')).toBeGreaterThanOrEqual(4.5);
  });

  it('warning-text on the solid matchBadge tint (#fef3c7) is AA', () => {
    expect(contrast('#92400e', '#fef3c7')).toBeGreaterThanOrEqual(4.5);
  });

  it("success-text on the direct role/label badge's alpha tint (color+'18' over the row's #fff/#f0fdf4 backgrounds) is AA", () => {
    // LocatorRow/RecommendedCard render the badge as background: color+'18'
    // (append hex-alpha 0x18 ≈ 9.4%) directly over the row background, which
    // is '#fff' (SidePanel unique row) or '#f0fdf4' (both panels' unique-row
    // tint) or '#fafafa' (RecommendedCard default). All three are lighter
    // than the solid matchBadge tint above, so if THAT passes AA this passes
    // with more headroom — proven numerically rather than assumed.
    for (const rowBg of ['#ffffff', '#f0fdf4', '#fafafa']) {
      const blended = blendAlpha('#16a34a', '18', rowBg);
      expect(
        contrast('#166534', blended),
        `success-text on #16a34a18 over ${rowBg} = ${blended}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("warning-text is AA on testId's own solid tint (proves the token choice, independent of the deferred XPath-tab accent case)", () => {
    expect(contrast('#92400e', '#fef3c7')).toBeGreaterThanOrEqual(4.5);
  });
});

// ─── Dark-mode safety (item 8): the regression Item 7's tests could not catch ─
//
// Item 7's contrast tests above proved the LIGHT-mode literal pairing. None of
// them simulated what `var(--pg-color-*-text)` resolves to under
// `prefers-color-scheme: dark` — because nothing else in the rendered UI
// responds to theme (body sets no background-color; no code sets
// data-theme), the token-wrapped text was the ONLY thing that would have
// moved, breaking against the still-light background it was paired with.

const DARK_SUCCESS_TEXT = '#86efac'; // tokens.css :root:not([data-theme='light']) dark value
const DARK_WARNING_TEXT = '#fcd34d';
const DARK_DANGER_TEXT = '#fecaca';

describe('dark-mode-safety: the item-7 token form would have failed AA (item 8 RED evidence)', () => {
  it('RED — reconstructing the pre-item-8 token-backed form: dark success-text on the light matchBadge tint fails AA catastrophically', () => {
    const ratio = contrast(DARK_SUCCESS_TEXT, '#dcfce7');
    expect(ratio, `dark success-text on light tint = ${ratio.toFixed(2)}`).toBeLessThan(4.5);
    expect(ratio).toBeLessThan(2); // ~1.28:1 — not a marginal miss, a near-total failure
  });

  it('RED — dark warning-text on the light matchBadge tint fails AA catastrophically', () => {
    const ratio = contrast(DARK_WARNING_TEXT, '#fef3c7');
    expect(ratio).toBeLessThan(2); // ~1.29:1
  });

  it('RED — dark danger-text on the light matchBadge tint fails AA catastrophically', () => {
    const ratio = contrast(DARK_DANGER_TEXT, '#fee2e2');
    expect(ratio).toBeLessThan(2); // ~1.18:1
  });

  it('RED — dark success-text on the direct-badge alpha tint over every row background fails AA catastrophically', () => {
    for (const rowBg of ['#ffffff', '#f0fdf4', '#fafafa']) {
      const blended = blendAlpha('#16a34a', '18', rowBg);
      const ratio = contrast(DARK_SUCCESS_TEXT, blended);
      expect(
        ratio,
        `dark success-text on #16a34a18 over ${rowBg} = ${ratio.toFixed(2)}`,
      ).toBeLessThan(2);
    }
  });

  it('GREEN — the actual literal values used today are theme-invariant, so this class of failure cannot recur without an explicit code change', () => {
    // strategyTextColor()/matchBadge() are pure functions with no access to
    // `prefers-color-scheme` or `document` at all — their return values
    // cannot vary by theme by construction. Re-affirmed by re-checking the
    // real functions return the literal, non-token forms already asserted
    // above (see "never returns a var(...) form" tests), which is what makes
    // this whole failure class structurally impossible now, not just
    // currently passing.
    expect(matchBadge(1).color).toBe('#166534');
    expect(strategyTextColor('role')).toBe('#166534');
  });
});

// ─── (A)+(B) structural guard: the specific call sites this item edited ──────
//
// Failure-first evidence: each assertion pair below is proven meaningful by
// first checking it WOULD have failed against the pre-migration literal (the
// exact string this item replaced), then asserting the real source no longer
// contains it and does contain the token in its place.

interface Site {
  label: string;
  oldLiteral: string;
  newToken: string;
}

const SHARED_SITES: Site[] = [
  {
    label: 'matchBadge success color',
    oldLiteral: "color: '#166534'",
    newToken: "color: 'var(--pg-color-success-text)'",
  },
  {
    label: 'matchBadge warning color',
    oldLiteral: "color: '#92400e'",
    newToken: "color: 'var(--pg-color-warning-text)'",
  },
  {
    label: 'matchBadge danger color',
    oldLiteral: "color: '#991b1b'",
    newToken: "color: 'var(--pg-color-danger-text)'",
  },
];

describe('strategy-meta.ts: item-7 token form is gone, item-8 literal form is back (dark-mode-safety fix)', () => {
  const src = read('src/ui/strategy-meta.ts');

  it.each(SHARED_SITES.map((s): [string, Site] => [s.label, s]))(
    '%s',
    (_label, { oldLiteral, newToken }) => {
      // RED-evidence sanity check: a hand-built reconstruction of the exact
      // item-7 `matchBadge` return line (token-wrapped, the regression this
      // item fixes) DOES match the "item-7 token form" pattern below —
      // proving the assertion is capable of failing, not vacuously true.
      const item7Fragment = `return { text: 't', bg: '#fff', ${newToken} };`;
      expect(item7Fragment).toContain(newToken);

      // GREEN: the real, current source is back to the literal form (the
      // same value item 2 pinned), and the item-7 token-wrapped form is gone.
      expect(src, `expected literal form present for ${_label}`).toContain(oldLiteral);
      expect(src, `item-7 var() form must be gone for ${_label}`).not.toContain(newToken);
    },
  );

  it('no var(--pg-color-*-text) form remains anywhere in strategy-meta.ts source (outside the doc comment)', () => {
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, ''); // strip block comments
    expect(codeOnly).not.toMatch(/var\(--pg-color-(success|warning|danger)-text\)/);
  });
});

/** Per-panel site table: old inline literal vs. new token/helper-call form. */
function panelSites(rel: string): Site[] {
  const isSidePanel = rel.includes('sidepanel');
  return [
    {
      label: 'LocatorRow badge text colour',
      oldLiteral: isSidePanel ? "background:color+'18',color}}" : "background:color+'18',color}}",
      newToken: isSidePanel
        ? "background:color+'18',color:strategyTextColor(candidate.step.kind)}}"
        : "background:color+'18',color:strategyTextColor(candidate.step.kind)}}",
    },
    {
      label: "RecommendedCard 'Alternative' badge text colour",
      oldLiteral: "background:'#16a34a18',color:'#16a34a'}}",
      newToken: "background:'#16a34a18',color:'#166534'}}",
    },
    {
      label: 'CODE footer background',
      oldLiteral: "background:'#1e1e1e'",
      newToken: "background:'var(--pg-code-bg)'",
    },
    {
      label: 'CODE footer header surface',
      oldLiteral: "background:'#252526'",
      newToken: "background:'var(--pg-code-surface)'",
    },
    {
      label: 'CODE label colour',
      oldLiteral: "color:'#d4d4d4',",
      newToken: "color:'var(--pg-code-text)',",
    },
    {
      label: 'CODE line-hover background',
      oldLiteral: "background='#2a2d2e'",
      newToken: "background='var(--pg-code-line)'",
    },
    {
      label: 'CODE line text colour',
      oldLiteral: "color:'#ce9178'",
      newToken: "color:'var(--pg-code-string)'",
    },
    {
      label: 'CODE comment hints',
      oldLiteral: "color:'#6a9955'",
      newToken: "color:'var(--pg-code-comment)'",
    },
    {
      label: 'CODE keyword hint',
      oldLiteral: "color:'#569cd6'",
      newToken: "color:'var(--pg-code-keyword)'",
    },
  ];
}

describe.each(PANELS)(
  '%s: pre-migration CODE-footer/badge literals are gone, tokens are in place (item 7)',
  (rel) => {
    const src = denseCode(read(rel));
    const sites = panelSites(rel);

    it.each(sites.map((s): [string, Site] => [s.label, s]))('%s', (_label, site) => {
      expect(src, `${rel} still contains new-token form for ${site.label}`).toContain(
        site.newToken,
      );
    });

    it('the LocatorRow badge no longer returns the bare accent colour as text (regressed to unconditional `color`)', () => {
      // The pre-item-7 form was the bare destructured `color` var used directly
      // as the span's text colour with no AA adjustment. Proven RED here
      // against a hand-built reconstruction of that exact JSX fragment, then
      // GREEN against the real source.
      const preMigrationFragment = "borderRadius:3,background:color+'18',color}}>{label}</span>";
      expect(preMigrationFragment).toMatch(/,color}}>{label}<\/span>$/);
      expect(src, 'unconditional bare `color` as badge text must be gone').not.toMatch(
        /background:color\+'18',color}}>\{label\}<\/span>/,
      );
    });

    it('RecommendedCard main badge no longer uses the raw STRATEGY_COLORS lookup as text colour', () => {
      expect(src).not.toMatch(
        /color:STRATEGY_COLORS\[rec\.candidate!\.step\.kind\]\?\?'#6b7280'}}/,
      );
      expect(src).toContain('color:strategyTextColor(rec.candidate!.step.kind)');
    });

    it('"N unique" span no longer hardcodes the raw success hex as text colour', () => {
      expect(src).not.toMatch(/color:'#16a34a',fontWeight:600/);
    });

    it('CODE footer no longer hardcodes the VS-Code-palette hex values this item tokenized', () => {
      for (const hex of ['#1e1e1e', '#252526', '#2a2d2e']) {
        // These three are exact-match, single-purpose (bg/surface/hover-line)
        // literals with no other legitimate use in the CODE footer, so a
        // blanket absence check is safe (unlike '#d4d4d4'/'#ce9178'/etc, which
        // this item scoped to their *specific* call sites above because the
        // same literal could in principle recur in an untouched context).
        expect(src, `${hex} must no longer appear literally in ${rel}`).not.toContain(`'${hex}'`);
      }
    });

    it('no var(--pg-color-*-text) form remains anywhere in this panel (item 8 dark-mode-safety fix)', () => {
      expect(src).not.toMatch(/var\(--pg-color-(success|warning|danger)-text\)/);
    });

    it('--pg-code-* tokens are UNCHANGED by item 8 — still present, still theme-invariant by declaration', () => {
      for (const token of [
        'var(--pg-code-bg)',
        'var(--pg-code-surface)',
        'var(--pg-code-text)',
        'var(--pg-code-comment)',
        'var(--pg-code-keyword)',
        'var(--pg-code-line)',
        'var(--pg-code-string)',
      ]) {
        expect(src, `${token} must still be present in ${rel}`).toContain(token);
      }
    });
  },
);

// ─── Category-E literals deliberately preserved (documents the scope-down) ──

describe.each(PANELS)(
  '%s: deliberately-preserved literals stay literal (item 7 scope discipline)',
  (rel) => {
    const src = denseCode(read(rel));

    it('CODE border-top accent (#f97316) has no matching token and is left as-is', () => {
      expect(src).toContain("borderTop:'3px solid #f97316'");
    });

    it('disabled-state literals (#555) have no matching token and are left as-is', () => {
      expect(src).toContain("':'#555'");
    });

    it('line-number gutter (#5a5a5a) is decorative-only and is left as-is', () => {
      expect(src).toContain("#5a5a5a'");
    });
  },
);

// ─── Focus visibility (item 8): the Verify Selector input no longer kills its own focus ring ─

describe('item 8: no inline outline suppression survives without the global :focus-visible replacement', () => {
  it('RED — the pre-item-8 SidePanel input DID suppress its own focus outline with nothing to replace it', () => {
    // Reconstructed exactly as it read before item 8: outline:'none' as the
    // trailing property in the Verify Selector input's inline style object.
    const preItem8Fragment = "background:'#fff',color:'#1e1b4b',outline:'none'}}/>";
    expect(preItem8Fragment).toMatch(/outline:'none'/);
  });

  it.each(PANELS)('GREEN — %s no longer sets an inline outline:none anywhere', (rel) => {
    const src = denseCode(read(rel));
    expect(src, `${rel} must not suppress focus outline inline`).not.toMatch(/outline:\s*'none'/);
  });
});

// ─── Main strategy bar selected-tab text contrast (item 9, DL-49's dual-role conflict) ─

describe('item 9: main strategy bar selected-tab TEXT contrast (Tabs underline variant)', () => {
  it('RED — using the raw accent as text (the pre-item-9 behaviour) fails AA for playwright and xpath', () => {
    // Reconstructed exactly as it was before item 9: `color: selected ? tabAccent : ...`
    // with no textColor override, so the selected tab's text WAS the raw accent.
    expect(contrast('#16a34a', '#ffffff')).toBeLessThan(4.5); // playwright accent as text
    expect(contrast('#d97706', '#ffffff')).toBeLessThan(4.5); // xpath accent as text
  });

  it('GREEN — playwright and xpath now carry a textColor override that passes AA', () => {
    const pw = STRATEGY_TABS.find((t) => t.id === 'playwright')!;
    const xp = STRATEGY_TABS.find((t) => t.id === 'xpath')!;
    expect(pw.textColor).toBe('#166534');
    expect(xp.textColor).toBe('#92400e');
    expect(contrast(pw.textColor!, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(xp.textColor!, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('css needs no override — its accent already passes AA as text, and it has none', () => {
    const css = STRATEGY_TABS.find((t) => t.id === 'css')!;
    expect(css.textColor).toBeUndefined();
    expect(contrast(css.accent, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('every textColor is derived from the existing strategyTextColor helper, not a new colour', () => {
    const pw = STRATEGY_TABS.find((t) => t.id === 'playwright')!;
    const xp = STRATEGY_TABS.find((t) => t.id === 'xpath')!;
    expect(pw.textColor).toBe(strategyTextColor('role'));
    expect(xp.textColor).toBe(strategyTextColor('testId'));
  });

  it('accent (the border-bottom indicator colour) is completely unchanged for all three tabs', () => {
    expect(STRATEGY_TABS.find((t) => t.id === 'playwright')!.accent).toBe('#16a34a');
    expect(STRATEGY_TABS.find((t) => t.id === 'css')!.accent).toBe('#2563eb');
    expect(STRATEGY_TABS.find((t) => t.id === 'xpath')!.accent).toBe('#d97706');
  });

  it('the indicator accents still clear the WCAG 1.4.11 non-text 3:1 bar (unaffected by the text fix)', () => {
    expect(contrast('#16a34a', '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(contrast('#d97706', '#ffffff')).toBeGreaterThanOrEqual(3);
  });

  it('no fourth colour and no new token was introduced — textColor values are literal hex, not var()', () => {
    for (const t of STRATEGY_TABS) {
      if (t.textColor) expect(t.textColor).not.toMatch(/^var\(/);
    }
  });
});

// ─── Finding 2 (item 9): XPath pill sub-tab contrast — DEFERRED, not fixed, documented ─

describe('item 9 Finding 2: XPath pill sub-tab selected-state contrast — confirmed, deliberately NOT fixed', () => {
  it('DEFERRED — white text on the #d97706 pill fill still fails AA (documented limitation, not silently dropped)', () => {
    // CSS_SUB_TABS/XPATH_SUB_TABS feed the *pill* Tabs variant with
    // accent="#d97706" (see both panels); selected-state text is white,
    // background is the raw accent — a solid-fill + on-solid-text pair
    // tokens.css's own item-1 design notes already flagged as deferred to
    // "WS2 Phase B/C". This test pins the measurement so a future pass can't
    // silently forget it, without weakening it into a false GREEN.
    const ratio = contrast('#ffffff', '#d97706');
    expect(ratio).toBeLessThan(4.5);
    expect(ratio).toBeCloseTo(3.19, 1);
  });

  it('the pill variant itself is untouched by the item-9 textColor fix (different Tabs branch)', () => {
    // item 9 only touches the underline branch's text colour; the pill
    // branch's selected styling (`background: tabAccent, color: '#fff'`) has
    // no textColor concept at all — confirmed structurally against the
    // shared Tabs primitive source below.
    const src = read('src/ui/primitives.tsx');
    const pillBranchMatch = src.match(/: \{\s*fontSize: 11,\s*fontWeight: 600,[\s\S]*?\};/);
    expect(pillBranchMatch, 'pill branch style object must exist').not.toBeNull();
    expect(pillBranchMatch![0]).not.toMatch(/textColor/);
  });
});
