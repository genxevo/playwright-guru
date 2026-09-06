/**
 * Shared strategy metadata (WS2 item 6).
 * =======================================
 *
 * `STRATEGY_COLORS`, `STRATEGY_LABELS` and `matchBadge` were defined
 * IDENTICALLY in both `SidePanel.tsx` and `Panel.tsx` (values and thresholds
 * match byte-for-byte; only formatting differed, because `Panel.tsx` is
 * prettier-ignored per WS0 divergence D-A). `STRATEGY_TABS` — the three main
 * strategy tabs (Playwright / CSS / XPath) — was likewise defined identically
 * in both panels as an inline array literal feeding the old local button map;
 * centralising it here follows the precedent already set by `CSS_SUB_TABS` /
 * `XPATH_SUB_TABS` (`utils/css-xpath.ts`), which are shared, not duplicated.
 *
 * Scope discipline (WS2 item 6, following item 3's precedent in `actions.ts`):
 *   • Pure data + one pure function. No React import, no JSX, no panel
 *     dependency, no browser API. `matchBadge` depends only on
 *     `./match-badge` (already the shared source of visible/total semantics
 *     both panels import from directly) — not on `@playwright-guru/locator-engine`.
 *   • Values, thresholds and rendered text are preserved EXACTLY from both
 *     panels' original local copies. This is consolidation, not a rewrite —
 *     divergent product copy elsewhere (LocatorRow/CSSRow/XPathRow/
 *     RecommendedCard/getContextualActions/ALL_GETBY_KINDS) is explicitly
 *     NOT touched here; those stay local per DL-45.
 *
 * `strategyTextColor` (WS2 item 7, revised item 8): `STRATEGY_COLORS['role'|'label']`
 * (#16a34a, ~3.3:1) and `STRATEGY_COLORS['testId']` (#d97706, ~3.2:1) fail
 * WCAG AA when used as small/bold TEXT — a case Item 2 measured and
 * deliberately deferred here. Every badge that shows this text ALSO uses the
 * same base colour for a light tint background (`color + '18'`), so the fix
 * cannot be "change STRATEGY_COLORS" (that would darken the tint too, a
 * visual change beyond the bug). `strategyTextColor` returns the AA-safe
 * `-text` shade for just those two kinds and the ordinary base colour
 * (unchanged) for the other five, which already pass AA as text.
 *
 * **Item 8 correction — these `-text` shades are deliberately LITERAL, not
 * `var(--pg-color-*-text)`.** Item 7 originally routed them through the
 * theme-aware token. That was a latent bug: every background these colours
 * sit on (`matchBadge`'s tint literals, the `color+'18'` alpha-tint badges,
 * and every panel container down to `body`, which sets no
 * `background-color`) is a hardcoded LIGHT literal that does not move with
 * `prefers-color-scheme`. Wrapping only the text in a theme-aware token while
 * its background stays fixed silently breaks the pairing — for any user with
 * OS/browser dark mode, the token resolved to its dark value (e.g. #86efac)
 * against the still-light background, measuring **1.18–1.40:1**, far below
 * AA. Fixed in item 8 (DL-50) by pinning these three shades to literal hex —
 * the same values Item 2/7 already proved AA-safe — matching the
 * `--pg-code-*` palette's existing "intentionally theme-invariant" precedent
 * below. This is cheaper too: a literal is ~21 bytes shorter than the
 * `var()` form it replaces.
 */

import { hasHiddenMatches, totalSuffix } from './match-badge';

/** Accent color per Playwright locator-strategy kind. */
export const STRATEGY_COLORS: Record<string, string> = {
  role: '#16a34a',
  label: '#16a34a',
  placeholder: '#2563eb',
  text: '#2563eb',
  altText: '#7c3aed',
  title: '#6b7280',
  testId: '#d97706',
};

/** Display label per Playwright locator-strategy kind. */
export const STRATEGY_LABELS: Record<string, string> = {
  role: 'getByRole',
  label: 'getByLabel',
  placeholder: 'getByPlaceholder',
  text: 'getByText',
  altText: 'getByAltText',
  title: 'getByTitle',
  testId: 'getByTestId',
};

/**
 * The three main strategy tabs both panels switch between.
 *
 * `textColor` (item 9): closes the dual-role conflict DL-49 flagged — the
 * underline `Tabs` variant used to colour the SELECTED tab's TEXT with the
 * same `accent` that also drives its border-bottom indicator, but the
 * indicator only needs ≥3:1 (WCAG 1.4.11) while text needs ≥4.5:1 (AA
 * normal text). `#16a34a` (3.30:1) and `#d97706` (3.19:1) pass the former
 * and fail the latter. `textColor` reuses the existing `strategyTextColor`
 * helper (item 7/8) — no new colour, no new token — for exactly the two
 * kinds it already knows fail as text; `accent` itself is untouched, so the
 * indicator keeps its original colour. `css`'s accent (`#2563eb`, 5.17:1)
 * already passes as text, so it needs no override and omits the field,
 * falling back to `accent` in `Tabs` — byte-unaffected.
 */
export const STRATEGY_TABS: ReadonlyArray<{
  id: 'playwright' | 'css' | 'xpath';
  label: string;
  accent: string;
  textColor?: string;
}> = [
  {
    id: 'playwright',
    label: '⭐ Playwright',
    accent: '#16a34a',
    textColor: strategyTextColor('role'),
  },
  { id: 'css', label: '{ } CSS', accent: '#2563eb' },
  { id: 'xpath', label: '≡ XPath', accent: '#d97706', textColor: strategyTextColor('testId') },
];

/**
 * The verdict badge shown next to a generated locator. `total` is optional —
 * when it is absent or equal to the visible count the badge reads exactly as
 * it always has. Logic and thresholds are unchanged from both panels'
 * original local copies. The text colours here are the AA-safe `-text`
 * shades (item 2 pinned the values; item 8 pinned them as literal hex — see
 * the module doc comment for why token-backed broke dark-mode contrast).
 */
export function matchBadge(
  count: number,
  total?: number,
): { text: string; bg: string; color: string } {
  const suffix = totalSuffix(count, total);
  if (count === 1 && !hasHiddenMatches(count, total)) {
    return { text: '✓ 1 visible', bg: '#dcfce7', color: '#166534' };
  }
  if (count === 1) {
    return { text: `⚠ 1 visible${suffix}`, bg: '#fef3c7', color: '#92400e' };
  }
  if (count > 1) {
    return {
      text: `⚠ ${count} visible${suffix}`,
      bg: '#fef3c7',
      color: '#92400e',
    };
  }
  if (count === 0) {
    return { text: `✗ 0 visible${suffix}`, bg: '#fee2e2', color: '#991b1b' };
  }
  return { text: '? not measured', bg: '#f1f5f9', color: '#475569' };
}

/**
 * Text-safe colour for a strategy badge. Returns the AA-safe literal `-text`
 * shade for the two kinds whose base colour fails AA as text (`role`/`label`
 * → success-text #166534, `testId` → warning-text #92400e); every other kind
 * keeps its ordinary `STRATEGY_COLORS` value, unchanged, since those already
 * pass AA as text and this is a targeted contrast fix, not a repaint.
 * Literal, not `var(--pg-color-*-text)` — see the module doc comment (item 8).
 */
export function strategyTextColor(kind: string): string {
  if (kind === 'role' || kind === 'label') return '#166534';
  if (kind === 'testId') return '#92400e';
  return STRATEGY_COLORS[kind] ?? '#6b7280';
}
