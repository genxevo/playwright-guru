/**
 * The locator ranking policy — and the reasoning behind it.
 *
 * ## The problem this replaces
 *
 * Guru scored strategies with a table of magic numbers whose order was the
 * inverse of Playwright's on the single most common case. Guru ranked
 * `getByTestId` **last**; Playwright's own `selectorGenerator` scores it
 * **first**. Pick an element carrying a `data-testid` and Guru recommended
 * something different from what `npx playwright codegen` emits — while the
 * product's whole claim is to be Playwright-native. Nothing detected this,
 * because the numbers were unexplained and untested.
 *
 * ## What Playwright actually does
 *
 * `packages/injected/src/selectorGenerator.ts` scores candidates, lower being
 * preferred, and takes the cheapest that resolves uniquely:
 *
 *     data-testid            1        placeholder          125
 *     other data-test*       2        associated label     145
 *     role + accessible name 105      alt text             165
 *                                     text content         185
 *                                     title                205
 *
 * Meanwhile Playwright's *documentation* recommends role first and calls
 * test-ids "not user facing". Both are true and they are not in conflict: the
 * generator optimises for a locator that is certainly unique and cheap to
 * evaluate; the docs advise humans on what survives a redesign.
 *
 * ## The policy
 *
 * **Follow the generator, then surface the user-facing alternative.**
 *
 *   1. Rank as Playwright's generator ranks. A tool claiming Playwright
 *      fidelity may not quietly disagree with Playwright.
 *   2. When a role-based locator is *also* unique, mark it `USER_FACING` so it
 *      is offered as a first-class alternative rather than buried.
 *   3. Say which is which. The rationale codes carry the reason, so the UI can
 *      explain the choice instead of asserting it.
 *
 * That is something neither competitor does: Locator Labs is framework-agnostic
 * and cannot know Playwright's generator order; Playwright CRX reproduces the
 * generator exactly but offers no opinion and no alternative.
 *
 * ## Score direction — stated once, tested, and impossible to invert silently
 *
 * **HIGHER IS BETTER.** `rankCandidates` sorts descending. The magnitudes are
 * derived from an ordered list rather than hand-written, so a strategy cannot
 * be accidentally demoted by editing a number: to change the order you must
 * change the order.
 */

import type { LocatorKind } from './types';

/**
 * Playwright's generator preference, most preferred first.
 *
 * Derived from the score table above: testId(1) → role+name(105) →
 * placeholder(125) → label(145) → altText(165) → text(185) → title(205).
 *
 * Guru's previous order was role → label → placeholder → text → altText →
 * title → testId: test-id inverted end to end, and two adjacent pairs swapped.
 */
export const PLAYWRIGHT_STRATEGY_ORDER: readonly LocatorKind[] = [
  'testId',
  'role',
  'placeholder',
  'label',
  'altText',
  'text',
  'title',
] as const;

/**
 * How well a candidate resolves. This dominates strategy preference, because
 * Playwright itself only accepts a candidate that resolves uniquely — a unique
 * `getByTitle` is worth more than an ambiguous `getByTestId`.
 */
export type ResolutionTier = 'unique' | 'ambiguous' | 'unmeasured' | 'no-match';

/** Tier weights. Separated by more than any strategy bonus can bridge. */
const TIER_WEIGHT: Readonly<Record<ResolutionTier, number>> = {
  unique: 1_000_000,
  ambiguous: 10_000,
  unmeasured: 1_000,
  'no-match': 0,
};

/** Strategy bonus step. Smaller than the gap between any two tiers. */
const STRATEGY_STEP = 100;

/** Deducted per extra match, so "2 matches" outranks "9 matches". Capped so it
 *  can never reach into the tier below. */
const AMBIGUITY_PENALTY = 10;
const MAX_AMBIGUITY_PENALTY = 900;

/** Classifies a raw match count. `-1` means the probe could not answer. */
export function resolutionTier(matchCount: number): ResolutionTier {
  if (matchCount < 0) return 'unmeasured';
  if (matchCount === 0) return 'no-match';
  if (matchCount === 1) return 'unique';
  return 'ambiguous';
}

/**
 * Preference bonus for a strategy. Higher is better; unknown kinds score 0 and
 * therefore sort last within their tier rather than throwing.
 */
export function strategyBonus(kind: LocatorKind): number {
  const index = PLAYWRIGHT_STRATEGY_ORDER.indexOf(kind);
  if (index < 0) return 0;
  return (PLAYWRIGHT_STRATEGY_ORDER.length - index) * STRATEGY_STEP;
}

/**
 * The score for a candidate. **Higher is better.**
 *
 * tier weight (dominant) + strategy preference − ambiguity penalty.
 */
export function scoreForRanking(kind: LocatorKind, matchCount: number): number {
  const tier = resolutionTier(matchCount);
  const penalty =
    tier === 'ambiguous'
      ? Math.min((matchCount - 1) * AMBIGUITY_PENALTY, MAX_AMBIGUITY_PENALTY)
      : 0;
  return TIER_WEIGHT[tier] + strategyBonus(kind) - penalty;
}

/**
 * True when this candidate is a user-facing locator worth offering alongside
 * the recommendation, even though the generator prefers a test id.
 *
 * Role is the locator Playwright's documentation recommends humans reach for,
 * because it survives styling and markup changes and reflects what a user and
 * assistive technology perceive.
 */
export function isUserFacingAlternative(kind: LocatorKind, matchCount: number): boolean {
  return kind === 'role' && resolutionTier(matchCount) === 'unique';
}
