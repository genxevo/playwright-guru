/**
 * Visibility fixtures — one per way an element can be hidden, or appear to be.
 *
 * Each fixture renders a single `#target`. `refresh-visibility-golden.mjs` asks
 * a real Playwright whether it considers that element visible, and asks Guru's
 * predicate the same question, then records both.
 *
 * Deliberately synthetic rather than scraped from any site: these are the
 * twelve branches of the rule, and they must stay stable even when the sites we
 * happened to test against change.
 */

/** @type {ReadonlyArray<{name: string, html: string, why: string}>} */
export const VISIBILITY_FIXTURES = [
  {
    name: 'plain-visible',
    why: 'The baseline. If this ever reports hidden, the predicate is broken outright.',
    html: `<button id="target">Click me</button>`,
  },
  {
    name: 'display-none-target',
    why: 'The element itself is removed from layout.',
    html: `<button id="target" style="display:none">Click me</button>`,
  },
  {
    name: 'display-none-ancestor',
    why:
      'THE BUG. `display` is not inherited: #target computes `inline-block`, so a ' +
      'predicate that inspects only the element passes it as visible. This is the ' +
      'fixture that reproduces the "2 visible" false ambiguity on a unique locator.',
    html: `<div style="display:none"><button id="target">Click me</button></div>`,
  },
  {
    name: 'display-none-grandancestor',
    why: 'The walk must not stop at the immediate parent.',
    html: `<div style="display:none"><div><span><button id="target">Click me</button></span></div></div>`,
  },
  {
    name: 'visibility-hidden-target',
    why: 'Explicitly hidden, keeps its box — the box check alone would pass it.',
    html: `<button id="target" style="visibility:hidden">Click me</button>`,
  },
  {
    name: 'visibility-hidden-ancestor',
    why: 'visibility inherits, but the predicate should not rely on that alone.',
    html: `<div style="visibility:hidden"><button id="target">Click me</button></div>`,
  },
  {
    name: 'visibility-hidden-ancestor-child-visible',
    why:
      'visibility:hidden CAN be reversed by a descendant. Playwright honours the ' +
      "element's own computed visibility, so this one is visible.",
    html: `<div style="visibility:hidden"><button id="target" style="visibility:visible">Click me</button></div>`,
  },
  {
    name: 'hidden-attribute-target',
    why: 'The `hidden` attribute is display:none by UA stylesheet.',
    html: `<button id="target" hidden>Click me</button>`,
  },
  {
    name: 'hidden-attribute-ancestor',
    why: 'Same, applied to a container.',
    html: `<div hidden><button id="target">Click me</button></div>`,
  },
  {
    name: 'aria-hidden-target',
    why: 'Removed from the accessibility tree, so the getBy* engines skip it.',
    html: `<button id="target" aria-hidden="true">Click me</button>`,
  },
  {
    name: 'aria-hidden-ancestor',
    why: 'aria-hidden applies to the whole subtree.',
    html: `<div aria-hidden="true"><button id="target">Click me</button></div>`,
  },
  {
    name: 'opacity-zero-with-box',
    why:
      'THE SECOND BUG, in the opposite direction. A transparent real <input> behind ' +
      'a CSS toggle switch. Playwright locates it; the old predicate discarded it, ' +
      'losing three genuine matches on one practice page.',
    html: `<input type="checkbox" id="target" style="opacity:0;width:20px;height:20px">`,
  },
  {
    name: 'opacity-zero-ancestor',
    why: 'A transparent container does not hide its contents from Playwright either.',
    html: `<div style="opacity:0"><button id="target">Click me</button></div>`,
  },
  {
    name: 'zero-size',
    why: 'No box at all. Playwright will not match it.',
    html: `<button id="target" style="width:0;height:0;padding:0;border:0;overflow:hidden;font-size:0"></button>`,
  },
  {
    name: 'offscreen-transform',
    why:
      'The closed off-canvas mobile drawer. Only moved aside — display:block, ' +
      'visibility:visible, opacity:1, real box. Playwright considers it VISIBLE, ' +
      'which is why a duplicated mobile nav is a real strict-mode violation and not ' +
      'a phantom one. Treating transforms as hidden here would silently mask that.',
    html: `<div style="transform:translateX(2000px)"><a id="target" href="/practice">Practice</a></div>`,
  },
  {
    name: 'offscreen-absolute',
    why: 'The classic screen-reader-only offset. Still visible to Playwright.',
    html: `<a id="target" href="/x" style="position:absolute;left:-9999px">Skip to content</a>`,
  },
  {
    name: 'scrolled-out-of-viewport',
    why: 'Below the fold is not hidden. The predicate must not become a viewport test.',
    html: `<div style="height:5000px"></div><button id="target">Click me</button>`,
  },
];
