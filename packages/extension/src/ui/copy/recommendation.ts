/**
 * Wording for the Recommended locator card (DL-21).
 *
 * The engine decides WHAT to recommend and emits rationale codes; this module
 * turns those into English, exactly as `rationale.ts` does for candidate
 * rationales. Nothing here selects a locator, and nothing here invents a
 * justification the engine did not supply.
 *
 * ## The honesty rules this encodes
 *
 * A recommendation is not a verification. The card may say a locator resolves
 * to one element, because that was measured; it may not say "reliable",
 * "guaranteed" or "stable", because nothing measured those. When the engine
 * reports no safe recommendation, the card says so plainly rather than
 * promoting the least-bad candidate — a fabricated recommendation is worse than
 * none, because the user pastes it into a test.
 */

import type { LocatorVerdict, NoRecommendationReason } from '@playwright-guru/locator-engine';

/** The card's headline, which never overstates what was measured. */
export const RECOMMENDATION_TITLE = "Guru's recommended locator";

/**
 * What to say when nothing qualifies.
 *
 * Each line states the measurement and what the user can do, and none of them
 * offers a locator anyway.
 */
export const NO_RECOMMENDATION_COPY: Readonly<Record<NoRecommendationReason, string>> = {
  'no-candidates':
    'No Playwright locator could be built for this element. It has no role, label, placeholder, text, alt, title or test id to match on.',
  'all-ambiguous':
    'Every strategy matches more than one element here, so none is safe to recommend. Scope to a parent, or ask your team for a data-testid.',
  'no-match':
    'No strategy matched this element on the page as it is right now. It may be hidden, inside an iframe, or not rendered yet.',
  unmeasured:
    'Match counts are not available for this element, so no locator can be recommended with evidence behind it.',
};

/**
 * How confident the card is allowed to look.
 *
 * `excellent` and `good` are both real recommendations and differ only in the
 * strength of the strategy — neither is a claim that the locator is verified to
 * work in a test run. The remaining verdicts never appear on a recommended
 * card, because the engine returns no candidate for them; they are mapped so
 * the type is exhaustive rather than because they render.
 */
export const VERDICT_TONE: Readonly<
  Record<LocatorVerdict, { label: string; bg: string; color: string }>
> = {
  excellent: { label: 'resolves to 1 element', bg: '#dcfce7', color: '#166534' },
  good: { label: 'resolves to 1 element', bg: '#dcfce7', color: '#166534' },
  ambiguous: { label: 'matches several', bg: '#fef3c7', color: '#92400e' },
  'no-match': { label: 'matches nothing', bg: '#fee2e2', color: '#991b1b' },
  unknown: { label: 'not measured', bg: '#f1f5f9', color: '#475569' },
};

/**
 * The line that names the strategy the recommendation came from, so the card
 * and the seven-strategy list below it read as one thing rather than two.
 *
 * The recommended locator also appears in that list; saying so is what stops it
 * looking like a second, competing opinion.
 */
export function alsoListedBelow(strategyLabel: string): string {
  return `Also listed below under ${strategyLabel}.`;
}

/** Introduces the user-facing alternative, without demoting the recommendation. */
export const ALTERNATIVE_LEAD = 'Prefer a user-facing locator?';
