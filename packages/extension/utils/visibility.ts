/**
 * Playwright's visibility rules, as one definition each.
 *
 * ## Why this module exists
 *
 * Guru counts how many elements a locator matches and reports that count as its
 * verdict — "✓ 1 visible", "⚠ 2 visible". The number only means anything if
 * "visible" means what it means to Playwright. It did not.
 *
 * The shipped predicate inspected **only the element's own computed style**:
 *
 *     const s = getComputedStyle(el);
 *     if (s.display === 'none' || s.visibility === 'hidden') return false;
 *     if (parseFloat(s.opacity) === 0) return false;
 *     return true;
 *
 * Two defects pointing in opposite directions, which is why they cancelled out
 * often enough to survive:
 *
 * **Over-counting.** `display` is not inherited. A child of a `display:none`
 * container computes its own `display` — `inline-block`, say — so the check
 * passed. On a real page this reported `getByRole('textbox', { name: 'Name' })`
 * as matching **2** elements where Playwright matches **1**, the second being
 * inside a collapsed panel. Telling a user a unique locator is ambiguous is the
 * worst direction for the error to point: they add a `.first()` they never
 * needed.
 *
 * **Under-counting.** `opacity: 0` is not Playwright's criterion at all. The
 * transparent `<input type="checkbox">` behind a CSS toggle switch is perfectly
 * locatable; Guru discarded it, losing three genuine matches on one page.
 *
 * ## Two rules, not one — this is the part that is easy to get wrong
 *
 * Recorded from real Playwright against real Chromium (see
 * `test/conformance/visibility-golden.json`):
 *
 * | element state          | `isVisible()` | `getByRole` matches |
 * |------------------------|---------------|---------------------|
 * | `display:none` (self or ancestor) | false | no  |
 * | `visibility:hidden`    | false         | no                  |
 * | `[hidden]`             | false         | no                  |
 * | **zero-size box**      | **false**     | **yes**             |
 * | **`aria-hidden="true"`** | **true**    | **no**              |
 * | `opacity: 0`           | true          | yes                 |
 * | off-screen `transform` | true          | yes                 |
 *
 * Two rows separate the rules, in opposite directions. `aria-hidden` removes an
 * element from the accessibility tree without affecting whether it is rendered.
 * A zero-size element is not rendered but is still in the tree, so `getByRole`
 * still matches it. An earlier draft folded `aria-hidden` into the visibility
 * predicate and gated role matching on the bounding box; it was wrong on four
 * fixtures. Hence two functions with two names and two clause sets.
 *
 * `isVisible` needs no ancestor walk for `display`: a subtree inside
 * `display:none` has no layout box, so the box test already covers it, and
 * covers `[hidden]` with it. Role eligibility has no box test to lean on, so it
 * must walk `display` explicitly.
 *
 * Deliberately not part of either rule:
 *
 *   - `opacity: 0` — transparent is still visible and still locatable.
 *   - Off-screen position or `transform: translateX(...)` — a closed off-canvas
 *     drawer is still visible and still in the accessibility tree. That is why
 *     a duplicated mobile nav is a *real* strict-mode violation; suppressing it
 *     here would hide a defect rather than report one.
 *
 * ## Why this module also exports JavaScript source
 *
 * The conformance harness runs these exact predicates inside a real Chromium to
 * compare them against real Playwright, and cannot import a module there. The
 * `*_JS` exports are generated from the one definition by
 * `Function.prototype.toString()`, exactly as `matching.ts` does for text
 * matching (DL-24). One definition, two consumers, no drift — writing the rule
 * twice is how the original bug survived review.
 */

/**
 * Would Playwright's `isVisible()` return true for this element?
 *
 * Non-empty bounding box, and computed `visibility` is not `hidden`. That is
 * the whole rule. Deliberately self-contained: closes over nothing, so
 * `toString()` yields source that runs standalone in a page under test.
 */
function playwrightVisible(el: Element): boolean {
  if (window.getComputedStyle(el as HTMLElement).visibility === 'hidden') return false;
  // A zero box is how display:none reaches us — on the element or on any
  // ancestor — and how [hidden] does too. INTENTIONALLY not a viewport test:
  // an element scrolled or transformed out of view still has a box, and
  // Playwright still matches it.
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
}

/**
 * Would Playwright's `getByRole` engine consider this element at all?
 *
 * Visible in the sense above, and not removed from the accessibility tree by
 * `aria-hidden="true"` on itself or any ancestor.
 */
function playwrightRoleEligible(el: Element): boolean {
  if (window.getComputedStyle(el as HTMLElement).visibility === 'hidden') return false;
  let node: Element | null = el;
  while (node && node.tagName !== 'HTML') {
    // display:none removes the subtree from the accessibility tree. It has to
    // be walked explicitly here: unlike isVisible(), this rule has no bounding
    // box test to fall back on, because a zero-size element IS still matched.
    if (window.getComputedStyle(node as HTMLElement).display === 'none') return false;
    if (node.getAttribute('aria-hidden') === 'true') return false;
    node = node.parentElement;
  }
  return true;
}

/**
 * Would Playwright's `isVisible()` return true for this element?
 *
 * This is the right predicate for Verify Selector, where the user supplies a
 * raw CSS or XPath selector and wants to know what `page.locator(...)` resolves
 * to.
 */
export function isElementVisible(el: Element): boolean {
  return playwrightVisible(el);
}

/**
 * Would Playwright's `getByRole` engine match this element?
 *
 * `getByRole` is the one `getBy*` strategy that filters by accessibility-tree
 * membership; the other six match hidden elements too.
 */
export function isRoleEligible(el: Element): boolean {
  return playwrightRoleEligible(el);
}

/** Filters a collection down to the elements Playwright would call visible. */
export function visibleElementsFrom(els: Iterable<Element>): Element[] {
  return Array.from(els).filter(isElementVisible);
}

/** Filters a collection down to the elements `getByRole` would consider. */
export function roleEligibleFrom(els: Iterable<Element>): Element[] {
  return Array.from(els).filter(isRoleEligible);
}

/**
 * The rules as JavaScript source, for harnesses that must evaluate them inside
 * a page and cannot import.
 *
 * **Derived from the functions above, not written out a second time.** Defines
 * `__pgVisible(el)` and `__pgRoleEligible(el)` in the evaluating scope.
 */
export const PLAYWRIGHT_VISIBILITY_JS =
  `var __pgVisible = ${playwrightVisible.toString()};\n` +
  `var __pgRoleEligible = ${playwrightRoleEligible.toString()};`;
