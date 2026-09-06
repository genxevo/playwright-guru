/**
 * How a match count is presented — and when "unique" may be claimed.
 *
 * ## The defect this closes
 *
 * Guru counts matches through its visibility predicate and reports the result
 * as the verdict: "✓ 1 visible". That is the right number for `getByRole`,
 * which genuinely filters by accessibility-tree membership. It is NOT the
 * number Playwright resolves for the other six strategies.
 *
 * Measured against real Playwright 1.62.1: `getByTestId`, `getByLabel`,
 * `getByPlaceholder`, `getByAltText`, `getByTitle` and `getByText` all match
 * hidden elements — every hiding mechanism, including `display:none`. Only
 * `getByRole` filters.
 *
 * On one real page that produced a locator Guru called safely unique and
 * Playwright does not:
 *
 *     getByPlaceholder('mm/dd/yyyy')
 *     Guru        → ✓ 1 visible — unique
 *     Playwright  → resolves 2 elements
 *     .fill()     → strict mode violation
 *
 * Claiming uniqueness that does not exist is worse than reporting an awkward
 * number, because the user acts on it.
 *
 * ## What this module does NOT do
 *
 * It does not change any count. The visible count is computed exactly as
 * before, by exactly the same predicate, and it remains what the badge leads
 * with. The total is additional information, shown only when it differs.
 * Counting semantics, strategy eligibility and ranking are all untouched —
 * this is a transparency fix, not a semantic rewrite.
 *
 * This mirrors the vocabulary Verify Selector already uses ("1 visible …
 * 4 total, 3 hidden"), so the two surfaces finally report the same quantity
 * the same way.
 */

import { resolvesUniquely } from '@playwright-guru/locator-engine';

/** A count the probe could not answer. Never rendered as a number. */
const UNMEASURED = -1;

/**
 * May this candidate be presented as uniquely resolving?
 *
 * Delegates to the engine so the badge and the DL-21 recommendation cannot
 * disagree about what "unique" means. Re-exported under the badge's own name
 * because that is what the panels read, but there is exactly one rule.
 */
export const isSafelyUnique = resolvesUniquely;

/**
 * The trailing "· N total" fragment, or empty when there is nothing to add.
 *
 * Deliberately silent when the counts agree: the common case must look exactly
 * as it did before, or the signal stops meaning anything.
 */
export function totalSuffix(visible: number, total?: number): string {
  if (total === undefined || total === UNMEASURED || visible === UNMEASURED) return '';
  if (total === visible) return '';
  return ` · ${total} total`;
}

/**
 * True when Playwright would resolve more elements than Guru counts as visible
 * — the case where a locator can throw a strict-mode violation despite looking
 * clean. Drives the badge's tone, so a hidden duplicate cannot read as green.
 */
export function hasHiddenMatches(visible: number, total?: number): boolean {
  if (total === undefined || total === UNMEASURED || visible === UNMEASURED) return false;
  return total > visible;
}
