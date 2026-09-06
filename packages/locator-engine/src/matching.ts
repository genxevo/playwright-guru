/**
 * Playwright's text-matching semantics, as one definition.
 *
 * `getByLabel`, `getByText`, `getByPlaceholder`, `getByAltText` and
 * `getByTitle` all compare strings the same way, and **not** the way most
 * people assume. Verified against playwright-core 1.62.1 in a real browser
 * (see `test/conformance`):
 *
 *   label "Email Address", query "email address"  → MATCHES (case-insensitive)
 *   label "Email Address", query "Email"          → MATCHES (substring)
 *   label "Email Address", query "EMAIL"          → MATCHES (both at once)
 *   label "Email Address", query "Password"       → no match
 *   label "  Email   Address  ", query "Email Address", exact → MATCHES
 *
 * So the default is **case-insensitive substring over whitespace-normalised
 * text**, and `exact: true` is case-SENSITIVE full equality — still on
 * normalised whitespace.
 *
 * Guru's live counting used `===` on raw text, which is neither. On a page with
 * a label "Email Address", asking for "Email" reported zero matches while
 * Playwright would have found one — the count was wrong in the direction that
 * makes a good locator look broken.
 *
 * ## Why this module also exports JavaScript source
 *
 * Two surfaces need this rule. The content script imports the functions. The
 * DevTools panel evaluates a string inside the inspected page and cannot
 * import anything, so it interpolates `PLAYWRIGHT_TEXT_MATCH_JS` — the same
 * rule, emitted as source. One definition, two consumers. Writing the rule
 * twice is exactly how E2 and E4 came to be fixed in one place and left live in
 * another; a test asserts the two stay in step.
 */

/**
 * Collapses whitespace and trims, the way Playwright normalises both the
 * page's text and the query before comparing.
 */
export function normalizeMatchText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export interface TextMatchOptions {
  /** Case-sensitive full equality. Default `false` — substring, insensitive. */
  exact?: boolean;
}

/**
 * Does `candidate` (text found on the page) match `query` the way Playwright's
 * `getBy*` matchers would?
 */
export function matchesPlaywrightText(
  candidate: string | null | undefined,
  query: string,
  options: TextMatchOptions = {},
): boolean {
  return playwrightTextMatch(candidate, query, options.exact);
}

/**
 * The rule, written once, in a form that can be both called and serialised.
 *
 * Deliberately self-contained: it closes over nothing, so `toString()` yields
 * source that runs standalone inside the inspected page.
 */
function playwrightTextMatch(candidate: unknown, query: string, exact?: boolean): boolean {
  if (candidate === null || candidate === undefined) return false;
  const norm = (v: unknown): string => String(v).replace(/\s+/g, ' ').trim();
  const haystack = norm(candidate);
  const needle = norm(query);
  return exact === true
    ? haystack === needle
    : haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * The same rule as JavaScript source, for the DevTools panel's
 * `inspectedWindow.eval` payload, which cannot import.
 *
 * **Derived from the function above, not written out a second time.** A copied
 * rule is exactly how E2 and E4 came to be fixed in one place and left live in
 * another; here divergence is impossible by construction, because there is only
 * one definition and the string is generated from it.
 *
 * Defines `__pgMatchText(candidate, query, exact)` in the eval scope.
 */
export const PLAYWRIGHT_TEXT_MATCH_JS = `var __pgMatchText = ${playwrightTextMatch.toString()};`;
