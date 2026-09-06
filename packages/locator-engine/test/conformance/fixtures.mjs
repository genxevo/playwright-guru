/**
 * Conformance fixtures — the DOM shapes whose Playwright semantics Guru claims
 * to reproduce.
 *
 * Compact by design. Each entry exists because it can drift: a role that
 * Playwright computes differently from the ARIA specification, a matcher whose
 * default is looser than it looks, or a case Guru got wrong before.
 *
 * `id` marks the element under test. `attrs` is the ElementAttributes Guru's
 * capture layer would produce for it — kept beside the HTML so the two views of
 * the same element cannot drift apart.
 */

export const FIXTURES = [
  // ── Buttons and links ───────────────────────────────────────────────────
  {
    name: 'button element',
    html: '<button id="t">Save</button>',
    attrs: { tagName: 'button', innerText: 'Save' },
  },
  {
    name: 'input type=button',
    html: '<input id="t" type="button" value="Save">',
    attrs: { tagName: 'input', type: 'button', value: 'Save' },
  },
  {
    name: 'input type=submit',
    html: '<input id="t" type="submit" value="Go">',
    attrs: { tagName: 'input', type: 'submit', value: 'Go' },
  },
  {
    name: 'input type=image',
    html: '<input id="t" type="image" alt="Search">',
    attrs: { tagName: 'input', type: 'image', alt: 'Search' },
  },
  {
    name: 'anchor with href',
    html: '<a id="t" href="/docs">Docs</a>',
    attrs: { tagName: 'a', href: '/docs', innerText: 'Docs' },
  },
  {
    name: 'anchor without href',
    html: '<a id="t">Docs</a>',
    attrs: { tagName: 'a', innerText: 'Docs' },
  },

  // ── Text-like inputs ────────────────────────────────────────────────────
  {
    name: 'input type=text',
    html: '<input id="t" type="text">',
    attrs: { tagName: 'input', type: 'text' },
  },
  { name: 'input with no type attribute', html: '<input id="t">', attrs: { tagName: 'input' } },
  {
    name: 'input type=email',
    html: '<input id="t" type="email">',
    attrs: { tagName: 'input', type: 'email' },
  },
  {
    name: 'input type=tel',
    html: '<input id="t" type="tel">',
    attrs: { tagName: 'input', type: 'tel' },
  },
  {
    name: 'input type=url',
    html: '<input id="t" type="url">',
    attrs: { tagName: 'input', type: 'url' },
  },
  {
    name: 'input type=search',
    html: '<input id="t" type="search">',
    attrs: { tagName: 'input', type: 'search' },
  },
  {
    name: 'input type=password (E6 — must remain textbox)',
    html: '<input id="t" type="password">',
    attrs: { tagName: 'input', type: 'password' },
  },
  { name: 'textarea', html: '<textarea id="t"></textarea>', attrs: { tagName: 'textarea' } },

  // ── E5: date and time family ────────────────────────────────────────────
  {
    name: 'input type=date (E5)',
    html: '<input id="t" type="date">',
    attrs: { tagName: 'input', type: 'date' },
  },
  {
    name: 'input type=time (E5)',
    html: '<input id="t" type="time">',
    attrs: { tagName: 'input', type: 'time' },
  },
  {
    name: 'input type=month (E5)',
    html: '<input id="t" type="month">',
    attrs: { tagName: 'input', type: 'month' },
  },
  {
    name: 'input type=week (E5)',
    html: '<input id="t" type="week">',
    attrs: { tagName: 'input', type: 'week' },
  },
  {
    name: 'input type=datetime-local (E5)',
    html: '<input id="t" type="datetime-local">',
    attrs: { tagName: 'input', type: 'datetime-local' },
  },

  // ── N-1: file input ─────────────────────────────────────────────────────
  {
    name: 'input type=file (N-1)',
    html: '<input id="t" type="file">',
    attrs: { tagName: 'input', type: 'file' },
  },

  // ── N-2: datalist-backed inputs ─────────────────────────────────────────
  {
    name: 'input type=text with datalist (N-2)',
    html: '<input id="t" type="text" list="l"><datalist id="l"><option value="a"></option></datalist>',
    attrs: { tagName: 'input', type: 'text', list: 'l', listIsDatalist: true },
  },
  {
    name: 'input type=email with datalist (N-2)',
    html: '<input id="t" type="email" list="l"><datalist id="l"><option value="a"></option></datalist>',
    attrs: { tagName: 'input', type: 'email', list: 'l', listIsDatalist: true },
  },
  {
    name: 'input type=search with datalist (N-2)',
    html: '<input id="t" type="search" list="l"><datalist id="l"><option value="a"></option></datalist>',
    attrs: { tagName: 'input', type: 'search', list: 'l', listIsDatalist: true },
  },
  {
    name: 'input with list pointing at a non-datalist',
    html: '<input id="t" type="text" list="l"><div id="l"></div>',
    attrs: { tagName: 'input', type: 'text', list: 'l', listIsDatalist: false },
  },

  // ── Other input types ───────────────────────────────────────────────────
  {
    name: 'input type=checkbox',
    html: '<input id="t" type="checkbox">',
    attrs: { tagName: 'input', type: 'checkbox' },
  },
  {
    name: 'input type=radio',
    html: '<input id="t" type="radio">',
    attrs: { tagName: 'input', type: 'radio' },
  },
  {
    name: 'input type=range',
    html: '<input id="t" type="range">',
    attrs: { tagName: 'input', type: 'range' },
  },
  {
    name: 'input type=number',
    html: '<input id="t" type="number">',
    attrs: { tagName: 'input', type: 'number' },
  },
  {
    name: 'input type=hidden',
    html: '<input id="t" type="hidden">',
    attrs: { tagName: 'input', type: 'hidden' },
  },
  {
    name: 'input type=reset',
    html: '<input id="t" type="reset">',
    attrs: { tagName: 'input', type: 'reset' },
  },

  // ── E5: select variants ─────────────────────────────────────────────────
  {
    name: 'select (single)',
    html: '<select id="t"><option>a</option></select>',
    attrs: { tagName: 'select' },
  },
  {
    name: 'select multiple (E5)',
    html: '<select id="t" multiple><option>a</option></select>',
    attrs: { tagName: 'select', multiple: true },
  },
  {
    name: 'select size=4 (E5)',
    html: '<select id="t" size="4"><option>a</option></select>',
    attrs: { tagName: 'select', size: 4 },
  },
  {
    name: 'select size=1',
    html: '<select id="t" size="1"><option>a</option></select>',
    attrs: { tagName: 'select', size: 1 },
  },

  // ── Explicit role wins ──────────────────────────────────────────────────
  {
    name: 'div with explicit role=button',
    html: '<div id="t" role="button">Go</div>',
    attrs: { tagName: 'div', role: 'button', innerText: 'Go' },
  },
  {
    name: 'plain div',
    html: '<div id="t">Hello</div>',
    attrs: { tagName: 'div', innerText: 'Hello' },
  },
  {
    name: 'img with alt',
    html: '<img id="t" alt="Logo" src="x.png">',
    attrs: { tagName: 'img', alt: 'Logo' },
  },
  {
    name: 'img with empty alt',
    html: '<img id="t" alt="" src="x.png">',
    attrs: { tagName: 'img', alt: '' },
  },
  { name: 'heading', html: '<h2 id="t">Title</h2>', attrs: { tagName: 'h2', innerText: 'Title' } },
];

/**
 * getByLabel matching semantics (E2). Playwright's default is NOT exact
 * equality — these fixtures pin what it actually is.
 */
export const LABEL_FIXTURES = [
  { name: 'exact match', label: 'Email Address', query: 'Email Address' },
  { name: 'different case', label: 'Email Address', query: 'email address' },
  { name: 'substring', label: 'Email Address', query: 'Email' },
  { name: 'substring, wrong case', label: 'Email Address', query: 'EMAIL' },
  {
    name: 'surrounding whitespace in the label',
    label: '  Email Address  ',
    query: 'Email Address',
  },
  { name: 'query with surrounding whitespace', label: 'Email Address', query: '  Email  ' },
  { name: 'non-matching', label: 'Email Address', query: 'Password' },
  { name: 'inner whitespace collapsed', label: 'Email    Address', query: 'Email Address' },
];
