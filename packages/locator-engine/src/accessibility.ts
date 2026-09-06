/**
 * Playwright Guru — W3C Accessible Name & Role Computation (pure, no DOM).
 *
 * Implements a simplified subset of:
 *   - ARIA in HTML §5 — implicit ARIA semantics
 *   - AccName 1.2     — accessible name and description computation
 *
 * Operates on pre-extracted ElementAttributes (no live DOM), so these
 * functions can run in any context: content script, devtools panel, Node.
 */

import type { ElementAttributes } from './types';

// ─── Implicit role mapping ─────────────────────────────────────────────────

/** Static tag → implicit ARIA role mapping (ARIA in HTML §5). */
const TAG_TO_ROLE: Readonly<Record<string, string>> = {
  article:    'article',
  aside:      'complementary',
  button:     'button',
  datalist:   'listbox',
  details:    'group',
  dialog:     'dialog',
  fieldset:   'group',
  figure:     'figure',
  footer:     'contentinfo',
  form:       'form',
  h1: 'heading', h2: 'heading', h3: 'heading',
  h4: 'heading', h5: 'heading', h6: 'heading',
  header:     'banner',
  hr:         'separator',
  li:         'listitem',
  main:       'main',
  math:       'math',
  menu:       'list',
  meter:      'meter',
  nav:        'navigation',
  ol:         'list',
  optgroup:   'group',
  option:     'option',
  output:     'status',
  progress:   'progressbar',
  section:    'region',
  select:     'combobox',
  summary:    'button',
  table:      'table',
  tbody:      'rowgroup',
  td:         'cell',
  textarea:   'textbox',
  tfoot:      'rowgroup',
  th:         'columnheader',
  thead:      'rowgroup',
  tr:         'row',
  ul:         'list',
};

/**
 * Returns the implicit ARIA role for an element given its extracted attributes,
 * or `null` if the element has no meaningful implicit role (e.g., `<div>`).
 */
/**
 * Input types Playwright will promote to `combobox` when they are backed by a
 * `<datalist>`. Matches its own whitelist: email, search, tel, text, url and
 * the empty (absent) type.
 */
const COMBOBOX_ELIGIBLE_INPUT_TYPES = new Set(['text', 'email', 'search', 'tel', 'url', '']);

export function getImplicitRole(attrs: ElementAttributes): string | null {
  const tag = attrs.tagName.toLowerCase();

  if (tag === 'input') {
    const type = (attrs.type ?? 'text').toLowerCase();

    // A `list` pointing at a real <datalist> makes the input a combobox — but
    // ONLY for the text-like types. Playwright resolves the reference before
    // deciding, so a `list` aimed at a <div> changes nothing. Verified against
    // playwright-core 1.62.1 (see test/conformance).
    if (COMBOBOX_ELIGIBLE_INPUT_TYPES.has(type) && attrs.listIsDatalist === true) {
      return 'combobox';
    }

    switch (type) {
      case 'button': case 'submit': case 'reset': case 'image': return 'button';
      case 'checkbox':  return 'checkbox';
      case 'radio':     return 'radio';
      case 'range':     return 'slider';
      case 'number':    return 'spinbutton';
      case 'search':    return 'searchbox';
      case 'hidden':    return null;
      // N-1. Playwright reports `button` for a file input, not `textbox`.
      // getByRole('textbox') will not find one; getByRole('button') will.
      case 'file':      return 'button';
      // Everything else — including password, date, time, month, week and
      // datetime-local — falls through to textbox, matching Playwright's own
      // `inputTypeToRole[type] || 'textbox'` fallback. This is why E6 is
      // closed: password IS a textbox in Playwright.
      default:          return 'textbox';
    }
  }

  if (tag === 'select') {
    // Playwright: multiple || size > 1 ? 'listbox' : 'combobox'.
    // Guru previously said combobox for every select.
    return attrs.multiple === true || (attrs.size ?? 1) > 1 ? 'listbox' : 'combobox';
  }

  if (tag === 'a' || tag === 'area') {
    return attrs.href !== undefined ? 'link' : null;
  }

  if (tag === 'img') {
    // alt="" marks an image as decorative — no meaningful role for locators
    return attrs.alt !== '' ? 'img' : null;
  }

  return TAG_TO_ROLE[tag] ?? null;
}

// ─── CSS selector map (for DOM uniqueness queries in the content script) ──

/**
 * Maps each ARIA role to a CSS selector that matches elements having that role
 * either explicitly (via the `role` attribute) or implicitly (via HTML semantics).
 *
 * Exported for use by the content script's DOM uniqueness checker.
 */
export const ROLE_CSS_SELECTORS: Readonly<Record<string, string>> = {
  alert:         '[role="alert"]',
  alertdialog:   '[role="alertdialog"]',
  article:       'article, [role="article"]',
  banner:        'header, [role="banner"]',
  button:        'button, summary, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], input[type="image"], input[type="file"]',
  cell:          'td, [role="cell"]',
  checkbox:      'input[type="checkbox"], [role="checkbox"]',
  columnheader:  'th, [role="columnheader"]',
  combobox:      'select:not([multiple]):not([size]), select[size="1"], input[list], [role="combobox"]',
  complementary: 'aside, [role="complementary"]',
  contentinfo:   'footer, [role="contentinfo"]',
  dialog:        'dialog, [role="dialog"]',
  figure:        'figure, [role="figure"]',
  form:          'form, [role="form"]',
  grid:          '[role="grid"]',
  gridcell:      '[role="gridcell"]',
  group:         'fieldset, details, optgroup, [role="group"]',
  heading:       'h1, h2, h3, h4, h5, h6, [role="heading"]',
  img:           'img:not([alt=""]), [role="img"]',
  link:          'a[href], area[href], [role="link"]',
  list:          'ul, ol, menu, [role="list"]',
  listbox:       'select[multiple], select[size]:not([size="1"]), [role="listbox"]',
  listitem:      'li, [role="listitem"]',
  main:          'main, [role="main"]',
  math:          'math, [role="math"]',
  menu:          '[role="menu"]',
  menubar:       '[role="menubar"]',
  menuitem:      '[role="menuitem"]',
  meter:         'meter, [role="meter"]',
  navigation:    'nav, [role="navigation"]',
  option:        'option, [role="option"]',
  progressbar:   'progress, [role="progressbar"]',
  radio:         'input[type="radio"], [role="radio"]',
  region:        'section, [role="region"]',
  row:           'tr, [role="row"]',
  rowgroup:      'tbody, thead, tfoot, [role="rowgroup"]',
  rowheader:     '[role="rowheader"]',
  searchbox:     'input[type="search"]:not([list]), [role="searchbox"]',
  separator:     'hr, [role="separator"]',
  slider:        'input[type="range"], [role="slider"]',
  spinbutton:    'input[type="number"], [role="spinbutton"]',
  status:        'output, [role="status"]',
  switch:        '[role="switch"]',
  tab:           '[role="tab"]',
  tablist:       '[role="tablist"]',
  tabpanel:      '[role="tabpanel"]',
  table:         'table, [role="table"]',
  // E5. Adds the date/time family, which Playwright resolves to textbox via its
  // `|| 'textbox'` fallback. Removes `search` and `number`, which have their own
  // roles (searchbox / spinbutton) and were being double-claimed here. Inputs
  // carrying a `list` are excluded — a datalist makes them a combobox (N-2).
  textbox:       'textarea, input:not([type]):not([list]), input[type="text"]:not([list]), input[type="email"]:not([list]), input[type="tel"]:not([list]), input[type="url"]:not([list]), input[type="password"], input[type="date"], input[type="time"], input[type="month"], input[type="week"], input[type="datetime-local"], [role="textbox"]',
  tooltip:       '[role="tooltip"]',
  tree:          '[role="tree"]',
  treeitem:      '[role="treeitem"]',
  treegrid:      '[role="treegrid"]',
};

// ─── Accessible name computation ───────────────────────────────────────────

const TEXT_BEARING_TAGS = new Set([
  'button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'summary', 'th', 'td', 'li', 'caption', 'figcaption',
]);

/**
 * Computes the accessible name from pre-extracted attributes following
 * the AccName 1.2 priority order (simplified — no live DOM traversal).
 *
 * Priority:
 *   1. aria-labelledby (text content already resolved by the content script)
 *   2. aria-label attribute
 *   3. Associated <label> element text (for form controls)
 *   4. Visible text content (for buttons, links, headings, etc.)
 *   5. alt attribute (for images and input[type=image])
 *   6. title attribute (last resort)
 */
export function computeAccessibleName(attrs: ElementAttributes): string | undefined {
  const tag = attrs.tagName.toLowerCase();

  // 1. aria-labelledby (already resolved to text by content script)
  const labelledByText = attrs.ariaLabelledBy?.trim();
  if (labelledByText) return labelledByText;

  // 2. aria-label
  const ariaLabel = attrs.ariaLabel?.trim();
  if (ariaLabel) return ariaLabel;

  // 3. Associated <label> for form controls
  const labelText = attrs.labelText?.trim();
  if (labelText) return labelText;

  // 4. Visible text for text-bearing interactive elements
  if (TEXT_BEARING_TAGS.has(tag) || attrs.role === 'button' || attrs.role === 'link') {
    const text = attrs.innerText?.trim();
    if (text) return text;
  }

  // 5. alt for images (including input[type=image])
  if (tag === 'img' || (tag === 'input' && attrs.type === 'image')) {
    const alt = attrs.alt?.trim();
    if (alt) return alt;
  }

  // 6. title attribute
  const title = attrs.title?.trim();
  if (title) return title;

  // For other interactive elements, fall through to innerText as last resort
  const text = attrs.innerText?.trim();
  if (text) return text;

  return undefined;
}

/**
 * The element's effective ARIA role: an explicit `role` attribute if present,
 * otherwise the implicit role.
 *
 * This existed as `attrs.role ?? getImplicitRole(attrs)` in both `scorer.ts`
 * and `engine.ts`. Two copies of one rule is precisely how E2 and E4 came to be
 * fixed in one place and left live in another, so there is now exactly one.
 * The conformance suite tests THIS function, so what is verified is what the
 * product actually uses.
 */
export function resolveRole(attrs: ElementAttributes): string | null {
  const explicit = attrs.role?.trim();
  return explicit ? explicit : getImplicitRole(attrs);
}
