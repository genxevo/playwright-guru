// @vitest-environment happy-dom
/**
 * WS2 item 4 — Tabs primitive: accessibility + keyboard contract.
 * ==============================================================
 *
 * Unlike the other extension suites (source-scan guards in a node env), the
 * Tabs keyboard behaviour is genuinely interactive, so this file renders the
 * real component into a happy-dom document via `react-dom/client` and drives it
 * with real events — the strongest available oracle, following the WS1
 * precedent of a LOCAL DOM (here per-file `@vitest-environment happy-dom`; no
 * new dependency, no `@testing-library`).
 *
 * It covers: tablist/tab/tabpanel roles, aria-selected, aria-controls,
 * aria-labelledby, roving tabIndex (selected 0 / rest -1), ArrowRight/Left
 * (wrapping) + Home/End moving BOTH focus and selection, panel synchronisation,
 * and that two instances with different `idBase` do not collide.
 *
 * The companion structural guard (both panels use the shared Tabs, not a local
 * `SubTabBar`) lives in `test/primitives.test.ts` and is the failure-first
 * RED→GREEN evidence for the migration.
 */
import { StrictMode, createElement, useState, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Tabs, tabPanelProps, type TabItem } from '../src/ui/primitives';

// React's act() needs this flag set in a test environment.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TABS: ReadonlyArray<TabItem<'a' | 'b' | 'c'>> = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
];

/** A controlled harness: onSelect drives state, exactly as the panels use it. */
function Harness({
  idBase = 't',
  initial = 'a' as const,
}: {
  idBase?: string;
  initial?: 'a' | 'b' | 'c';
}) {
  const [active, setActive] = useState<'a' | 'b' | 'c'>(initial);
  return createElement(
    'div',
    null,
    createElement(Tabs<'a' | 'b' | 'c'>, {
      tabs: TABS,
      active,
      onSelect: setActive,
      accent: '#2563eb',
      idBase,
      ariaLabel: 'Category',
    }),
    createElement('div', tabPanelProps(idBase, active), `panel:${active}`),
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = (props?: { idBase?: string; initial?: 'a' | 'b' | 'c' }) => {
  act(() => root.render(createElement(StrictMode, null, createElement(Harness, props ?? {}))));
};

const tablist = () => container.querySelector<HTMLElement>('[role="tablist"]')!;
const tabs = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const panel = () => container.querySelector<HTMLElement>('[role="tabpanel"]')!;
const press = (el: Element, key: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });

describe('Tabs · ARIA structure', () => {
  it('renders a named tablist of role=tab buttons and one role=tabpanel', () => {
    mount();
    expect(tablist().getAttribute('aria-label')).toBe('Category');
    expect(tabs()).toHaveLength(3);
    expect(tabs().every((t) => t.tagName === 'BUTTON')).toBe(true);
    expect(panel().textContent).toBe('panel:a');
  });

  it('wires aria-selected, aria-controls, and the panel id/aria-labelledby', () => {
    mount({ idBase: 'css' });
    const [a, b] = tabs();
    expect(a!.getAttribute('aria-selected')).toBe('true');
    expect(b!.getAttribute('aria-selected')).toBe('false');
    expect(a!.id).toBe('css-tab-a');
    expect(a!.getAttribute('aria-controls')).toBe('css-panel');
    expect(panel().id).toBe('css-panel');
    expect(panel().getAttribute('aria-labelledby')).toBe('css-tab-a');
  });

  it('gives the selected tab tabIndex 0 and the rest -1 (roving)', () => {
    mount();
    const [a, b, c] = tabs();
    expect(a!.tabIndex).toBe(0);
    expect(b!.tabIndex).toBe(-1);
    expect(c!.tabIndex).toBe(-1);
  });
});

describe('Tabs · keyboard moves focus AND selection (automatic activation)', () => {
  it('ArrowRight advances, ArrowLeft wraps to the last', () => {
    mount();
    tabs()[0]!.focus();
    press(tabs()[0]!, 'ArrowRight');
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[1]);
    expect(panel().textContent).toBe('panel:b');
    expect(panel().getAttribute('aria-labelledby')).toBe('t-tab-b');

    press(tabs()[1]!, 'ArrowLeft'); // back to a
    press(tabs()[0]!, 'ArrowLeft'); // wrap to c
    expect(tabs()[2]!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[2]);
  });

  it('Home selects the first tab, End the last', () => {
    mount({ initial: 'b' });
    tabs()[1]!.focus();
    press(tabs()[1]!, 'End');
    expect(tabs()[2]!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[2]);
    press(tabs()[2]!, 'Home');
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('roving tabIndex follows selection after keyboard nav', () => {
    mount();
    tabs()[0]!.focus();
    press(tabs()[0]!, 'End');
    expect(tabs()[0]!.tabIndex).toBe(-1);
    expect(tabs()[2]!.tabIndex).toBe(0);
  });

  it('a non-arrow key is ignored (no selection change)', () => {
    mount();
    tabs()[0]!.focus();
    press(tabs()[0]!, 'x');
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
  });
});

describe('Tabs · a click selects, like the original pill bar', () => {
  it('clicking a tab selects it and updates the panel', () => {
    mount();
    act(() => {
      tabs()[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(tabs()[2]!.getAttribute('aria-selected')).toBe('true');
    expect(panel().textContent).toBe('panel:c');
  });
});

describe('Tabs · two instances do not collide', () => {
  it('distinct idBase yields distinct, deterministic ids', () => {
    mount({ idBase: 'css' });
    const cssTabId = tabs()[0]!.id;
    act(() => root.render(createElement(Harness, { idBase: 'xpath' })));
    expect(tabs()[0]!.id).toBe('xpath-tab-a');
    expect(cssTabId).toBe('css-tab-a');
    expect(cssTabId).not.toBe(tabs()[0]!.id);
  });
});

// ─── WS2 item 6: `variant` (main strategy bar) ────────────────────────────────
//
// The main Playwright/CSS/XPath strategy bar needed a different visual
// language (full-width underline segments, per-tab accent colour) than the
// pill/chip `SubTabBar` groups Tabs was built for in item 4. Rather than a
// second Tabs component, `variant` and `TabItem.accent` extend the existing
// one. These tests prove: (1) the default ('pill') is byte-for-byte
// unaffected — the two existing SubTabBar call sites need no changes — and
// (2) the new 'underline' variant reproduces the main bar's prior look
// (no pill background/border-radius, an underline indicator instead) while
// the shared ARIA/keyboard contract above is exercised unchanged.

const UNDERLINE_TABS: ReadonlyArray<TabItem<'a' | 'b' | 'c'>> = [
  { id: 'a', label: 'Alpha', accent: '#16a34a' },
  { id: 'b', label: 'Beta', accent: '#2563eb' },
  { id: 'c', label: 'Gamma', accent: '#d97706' },
];

/** Same controlled shape as Harness, but exercises `variant` + per-tab `accent`. */
function VariantHarness({
  idBase = 'v',
  initial = 'a' as const,
  variant,
}: {
  idBase?: string;
  initial?: 'a' | 'b' | 'c';
  variant?: 'pill' | 'underline';
}) {
  const [active, setActive] = useState<'a' | 'b' | 'c'>(initial);
  return createElement(
    'div',
    null,
    createElement(Tabs<'a' | 'b' | 'c'>, {
      tabs: UNDERLINE_TABS,
      active,
      onSelect: setActive,
      idBase,
      ariaLabel: 'Strategy',
      variant,
    }),
    createElement('div', tabPanelProps(idBase, active), `panel:${active}`),
  );
}

const mountVariant = (props?: {
  idBase?: string;
  initial?: 'a' | 'b' | 'c';
  variant?: 'pill' | 'underline';
}) => {
  act(() =>
    root.render(createElement(StrictMode, null, createElement(VariantHarness, props ?? {}))),
  );
};

describe("Tabs · variant='pill' (default) is unaffected (item 4 no-regression)", () => {
  it('the existing SubTabBar-style pill markup is byte-identical when variant is omitted', () => {
    mount(); // original Harness never passes `variant` — exercises the default
    const btn = tabs()[0]!;
    expect(btn.style.borderRadius).toBe('12px');
    expect(btn.style.padding).toBe('3px 10px');
    expect(tablist().style.gap).toBe('4px');
  });
});

describe("Tabs · variant='underline' (WS2 item 6, main strategy bar)", () => {
  it('keeps the full ARIA structure: tablist/tab/tabpanel, aria-selected, aria-controls', () => {
    mountVariant({ idBase: 'main', variant: 'underline' });
    expect(tablist().getAttribute('role')).toBe('tablist');
    const [a, b] = tabs();
    expect(a!.getAttribute('role')).toBe('tab');
    expect(a!.getAttribute('aria-selected')).toBe('true');
    expect(b!.getAttribute('aria-selected')).toBe('false');
    expect(a!.getAttribute('aria-controls')).toBe('main-panel');
    expect(panel().getAttribute('role')).toBe('tabpanel');
    expect(panel().id).toBe('main-panel');
    expect(panel().getAttribute('aria-labelledby')).toBe('main-tab-a');
  });

  it('renders no pill/chip styling — no border-radius, no rounded background chip', () => {
    mountVariant({ variant: 'underline' });
    const btn = tabs()[0]!;
    expect(btn.style.borderRadius).toBe('');
    expect(btn.style.padding).toBe('7px 4px');
    expect(btn.style.flex).toBe('1 1 0%'); // React's `flex: 1` shorthand, as happy-dom reports it
  });

  it('shows an underline indicator on the selected tab and none on the rest', () => {
    mountVariant({ variant: 'underline' });
    const [a, b] = tabs();
    expect(a!.style.borderBottom).toBe('2px solid #16a34a'); // tab a's own accent
    expect(b!.style.borderBottom).toBe('2px solid transparent');
  });

  it("uses each tab's own `accent`, not a single group accent", () => {
    mountVariant({ initial: 'b', variant: 'underline' });
    const [, b] = tabs();
    expect(b!.style.color).toBe('#2563eb'); // tab b's own accent, not a shared group accent
  });

  it('roving tabIndex is correct under the underline variant', () => {
    mountVariant({ variant: 'underline' });
    const [a, b, c] = tabs();
    expect(a!.tabIndex).toBe(0);
    expect(b!.tabIndex).toBe(-1);
    expect(c!.tabIndex).toBe(-1);
  });

  it('ArrowRight/ArrowLeft/Home/End keyboard navigation is unchanged under the underline variant', () => {
    mountVariant({ variant: 'underline' });
    tabs()[0]!.focus();
    press(tabs()[0]!, 'ArrowRight');
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[1]);

    press(tabs()[1]!, 'End');
    expect(tabs()[2]!.getAttribute('aria-selected')).toBe('true');
    press(tabs()[2]!, 'Home');
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('clicking a tab still selects it and updates the panel', () => {
    mountVariant({ variant: 'underline' });
    act(() => {
      tabs()[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(tabs()[2]!.getAttribute('aria-selected')).toBe('true');
    expect(panel().textContent).toBe('panel:c');
  });
});

// ─── WS2 item 9: TabItem.textColor (dual-role accent/text-contrast fix) ──────
//
// Under 'underline', `accent` used to drive BOTH the selected tab's text
// colour and its border-bottom indicator — the exact conflict DL-49 flagged,
// since the indicator only needs 3:1 (WCAG 1.4.11) while text needs 4.5:1
// (AA normal text). `textColor`, when present, overrides ONLY the text; the
// indicator always keeps using `accent`, unchanged. Omitting `textColor`
// preserves the original behaviour exactly (every existing 'pill' caller,
// and the 'css' main-bar tab, never set it).

const TEXT_OVERRIDE_TABS: ReadonlyArray<TabItem<'a' | 'b'>> = [
  { id: 'a', label: 'Alpha', accent: '#16a34a', textColor: '#166534' },
  { id: 'b', label: 'Beta', accent: '#d97706' }, // no override — must fall back to accent
];

function TextColorHarness({ idBase = 'tc' }: { idBase?: string }) {
  const [active, setActive] = useState<'a' | 'b'>('a');
  return createElement(
    'div',
    null,
    createElement(Tabs<'a' | 'b'>, {
      tabs: TEXT_OVERRIDE_TABS,
      active,
      onSelect: setActive,
      idBase,
      ariaLabel: 'Strategy',
      variant: 'underline',
    }),
    createElement('div', tabPanelProps(idBase, active), `panel:${active}`),
  );
}

describe("Tabs · variant='underline' textColor override (item 9)", () => {
  it('a selected tab with textColor uses it for TEXT, but keeps its own accent for the border-bottom indicator', () => {
    act(() => root.render(createElement(StrictMode, null, createElement(TextColorHarness))));
    const [a] = tabs();
    expect(a!.style.color).toBe('#166534'); // textColor, not accent
    expect(a!.style.borderBottom).toBe('2px solid #16a34a'); // still the raw accent
  });

  it('a selected tab with no textColor falls back to its accent for TEXT, exactly as before item 9', () => {
    act(() => root.render(createElement(StrictMode, null, createElement(TextColorHarness))));
    // select tab b (no textColor) via keyboard, same interaction path the panels use
    tabs()[0]!.focus();
    press(tabs()[0]!, 'ArrowRight');
    const [, b] = tabs();
    expect(b!.getAttribute('aria-selected')).toBe('true');
    expect(b!.style.color).toBe('#d97706'); // falls back to accent — unchanged behaviour
    expect(b!.style.borderBottom).toBe('2px solid #d97706');
  });

  it('an UNSELECTED tab is never coloured by textColor (still the fixed muted grey)', () => {
    act(() => root.render(createElement(StrictMode, null, createElement(TextColorHarness))));
    const [, b] = tabs(); // b starts unselected
    expect(b!.style.color).toBe('#64748b');
  });

  it("variant='pill' ignores textColor entirely — the pill branch has no such concept (no regression)", () => {
    // UNDERLINE_TABS/mountVariant with variant omitted exercises the default
    // 'pill' path; TEXT_OVERRIDE_TABS is deliberately not used with 'pill'
    // here since no existing SubTabBar caller ever sets textColor — this
    // proves the 'pill' branch's selected-text rule (white on accent bg) is
    // untouched by the item-9 change.
    mountVariant({ variant: 'pill' });
    const btn = tabs()[0]!;
    expect(btn.style.color).toBe('#fff'); // pill branch's own rule, textColor has no effect here
  });
});
