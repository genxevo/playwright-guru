/**
 * Which locator Guru recommends, and the evidence for saying so (DL-21).
 *
 * ## Why this module exists — the recommendation was destroyed inside the engine
 *
 * DL-21 was recorded `PARTIAL` because "the Side Panel does not consume
 * `pick.chain`". Tracing the data shows that framing was wrong, and the real
 * defect is one layer deeper: **`pick.chain` could never have supported an
 * honest recommendation.**
 *
 * `buildLocatorChain` selects a winning `ScoredCandidate` — which carries
 * `uniqueCount`, `totalCount` and `score` — and returns a `LocatorChain`, which
 * carries **steps only**. The evidence is dropped at that boundary, inside the
 * engine, before anything reaches `StoredPick`. A UI reading `chain` could
 * print the code but could not honestly say whether it resolves uniquely, so
 * every rendering of it would have been an assertion rather than a finding.
 *
 * Two further reasons `chain` is the wrong source:
 *
 *   - `fallbackChain` can synthesise a step from raw attributes that is **not
 *     one of the candidates at all**, so it has no measured counts by
 *     construction.
 *   - An ambiguous winner gets `.nth(0)` appended — a positional locator the
 *     product warns against elsewhere. Recommending it silently would
 *     contradict the `NTH_REQUIRED` caution.
 *
 * So the recommendation is derived from the ranked `candidates`, which retain
 * their measurements. `chain` remains what it always was: the generated locator
 * expression, unchanged by this module.
 *
 * ## What this module does NOT do
 *
 * It does not rank. `candidates` arrive already scored by `scoreCandidate` and
 * ordered by `rankCandidates`, and this module reads that order without
 * re-deriving it. There is no second scorer, no second strategy order, and no
 * "best candidate" algorithm anywhere above this file — the UI renders what it
 * is handed.
 *
 * It also does not decide that a nicer-looking strategy should win.
 * `PLAYWRIGHT_STRATEGY_ORDER` follows Playwright's own generator, so when an
 * element carries a `data-testid`, `getByTestId` is legitimately the
 * recommendation (DL-21, DL-22).
 */

import { isUserFacingAlternative } from './ranking';
import { rationale, verdictFor, type LocatorVerdict, type Rationale } from './rationale';
import type { ScoredCandidate } from './scorer';
import type { LocatorKind } from './types';

/** A count the probe could not answer. Never treated as a measurement. */
const UNMEASURED = -1;

/**
 * Does this candidate resolve to exactly one element, with nothing hidden
 * behind it?
 *
 * The single definition of safe uniqueness, shared by the recommendation and by
 * the candidate badges. Stage 2 established why the total matters: only
 * `getByRole` filters hidden elements, so a locator can match one *visible*
 * element while Playwright resolves several and throws a strict-mode
 * violation. `totalCount` of `undefined` or `-1` means "not measured" — never
 * zero — in which case the visible count is all the evidence there is.
 */
export function resolvesUniquely(visibleCount: number, totalCount?: number): boolean {
  if (visibleCount !== 1) return false;
  return totalCount === undefined || totalCount === UNMEASURED || totalCount === visibleCount;
}

/** Why no locator could be recommended. Codes, never prose. */
export type NoRecommendationReason = 'no-candidates' | 'all-ambiguous' | 'no-match' | 'unmeasured';

/**
 * Guru's recommendation for an element, with the evidence behind it.
 *
 * `candidate` is `null` when nothing qualifies. That is a real outcome, not a
 * failure to try: a fabricated recommendation is worse than none, because the
 * user acts on it.
 */
export interface Recommendation {
  /** The recommended candidate, or null when none qualifies. */
  candidate: ScoredCandidate | null;
  /** Quality judgement derived from the measured counts. */
  verdict: LocatorVerdict;
  /** Why this one — or, when there is none, why not. Codes for the UI to render. */
  rationales: Rationale[];
  /**
   * A unique role-based locator worth offering alongside the recommendation,
   * when the recommendation itself is not role-based.
   *
   * This is DL-21's second clause. Playwright's generator prefers test ids;
   * Playwright's documentation tells humans to prefer roles. Both are right,
   * and the product should not have to pick one and hide the other.
   */
  alternative: ScoredCandidate | null;
  /** Set only when `candidate` is null. */
  reasonUnavailable?: NoRecommendationReason;
}

/** The seven `getBy*` strategies. A recommendation may never be anything else. */
const RECOMMENDABLE_KINDS: ReadonlySet<LocatorKind> = new Set<LocatorKind>([
  'role',
  'label',
  'placeholder',
  'text',
  'altText',
  'title',
  'testId',
]);

/** Positive codes explaining what makes a given strategy trustworthy. */
function strategyRationales(kind: LocatorKind, isTopRanked: boolean): Rationale[] {
  const out: Rationale[] = [];
  switch (kind) {
    case 'testId':
      out.push(rationale('TEST_ID', 'positive'));
      break;
    case 'role':
      out.push(rationale('ROLE_BASED', 'positive'), rationale('USER_FACING', 'positive'));
      break;
    case 'label':
      out.push(rationale('ASSOCIATED_LABEL', 'positive'), rationale('USER_FACING', 'positive'));
      break;
    case 'placeholder':
    case 'text':
    case 'altText':
      out.push(rationale('USER_FACING', 'positive'));
      break;
    case 'title':
      // Deliberately no USER_FACING: title is poorly surfaced by assistive tech.
      break;
  }
  // Only claimed when this strategy is what Playwright's own generator would
  // have chosen — i.e. it came first in the ranked order.
  if (isTopRanked) out.push(rationale('PLAYWRIGHT_PREFERRED', 'positive'));
  return out;
}

/**
 * Picks the locator to recommend from candidates the engine has already scored
 * and ranked.
 *
 * Selection is a single pass in ranked order: the first candidate that resolves
 * uniquely and safely wins. No re-ranking, no tie-breaking of its own — the
 * order is the policy, and the policy lives in `ranking.ts`.
 *
 * @param ranked Candidates in the order `rankCandidates` produced them.
 */
export function recommendLocator(ranked: readonly ScoredCandidate[]): Recommendation {
  const usable = ranked.filter((c) => RECOMMENDABLE_KINDS.has(c.step.kind));

  if (usable.length === 0) {
    return {
      candidate: null,
      verdict: 'unknown',
      rationales: [],
      alternative: null,
      reasonUnavailable: 'no-candidates',
    };
  }

  const winner = usable.find((c) => resolvesUniquely(c.uniqueCount, c.totalCount));

  if (!winner) {
    // Nothing is safely unique. Say which kind of failure it was, using the
    // measurements — never invent a fallback recommendation.
    const anyMeasured = usable.some((c) => c.uniqueCount >= 0);
    const anyMatch = usable.some((c) => c.uniqueCount > 0);
    const reason: NoRecommendationReason = !anyMeasured
      ? 'unmeasured'
      : anyMatch
        ? 'all-ambiguous'
        : 'no-match';
    const rationales: Rationale[] =
      reason === 'all-ambiguous'
        ? [
            rationale('AMBIGUOUS_MATCHES', 'caution', {
              count: Math.max(...usable.map((c) => c.uniqueCount)),
            }),
          ]
        : reason === 'no-match'
          ? [rationale('NO_MATCH', 'negative')]
          : [];
    return {
      candidate: null,
      verdict:
        reason === 'no-match' ? 'no-match' : reason === 'unmeasured' ? 'unknown' : 'ambiguous',
      rationales,
      alternative: null,
      reasonUnavailable: reason,
    };
  }

  const rationales = strategyRationales(winner.step.kind, winner === usable[0]);
  rationales.push(rationale('UNIQUE_VISIBLE', 'positive'));

  // The user-facing alternative: a role locator that is ALSO safely unique, and
  // is not the recommendation itself. `isUserFacingAlternative` is the existing
  // definition; the extra safety check is Stage 2's total-awareness, which it
  // predates.
  const alternative =
    usable.find(
      (c) =>
        c !== winner &&
        isUserFacingAlternative(c.step.kind, c.uniqueCount) &&
        resolvesUniquely(c.uniqueCount, c.totalCount),
    ) ?? null;

  return {
    candidate: winner,
    verdict: verdictFor(winner.uniqueCount, winner.step.kind),
    rationales,
    alternative,
  };
}
