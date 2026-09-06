/**
 * Why a locator strategy produced no row — stated truthfully.
 *
 * ## The defect this replaces
 *
 * Each panel carried a static `naReason` string per strategy, so an absent row
 * always gave the same explanation regardless of why it was absent. On a
 * `<button>Submit</button>` the panel said:
 *
 *     getByText — N/A — No visible text
 *
 * The button's text is "Submit". The claim was simply false.
 *
 * The real reason is policy: `buildCandidateSteps` deliberately offers
 * `getByText` only for non-interactive elements, because `getByRole` with an
 * accessible name is more robust for anything clickable. That policy is sound.
 * Asserting a false fact to justify it is not — and it is exactly what the
 * Stage 1 honesty rules exist to prevent.
 *
 * There is a second, quieter falsehood: a strategy whose candidate WAS
 * generated but matched nothing still reported "No placeholder attribute" even
 * though the placeholder existed. "I found nothing" and "I never looked" are
 * different statements and the UI now distinguishes them.
 *
 * Wording lives here rather than in either panel because there are two panels
 * and they had already drifted apart — the Side Panel and the DevTools panel
 * carried differently-worded copies of the same wrong sentence.
 */

/** What the panel knows about a strategy that produced no visible row. */
export interface NaReasonInput {
  /** Candidates the engine generated for this strategy, before filtering. */
  generatedCount: number;
  /** The element's visible text, if any — decides the getByText wording. */
  innerText?: string;
  /** Fallback copy for "this element simply has nothing to match on". */
  absent: string;
}

/**
 * A candidate existed but resolved to nothing. Said plainly, because a user
 * comparing this against Verify Selector deserves the same answer twice.
 */
const MATCHED_NOTHING = 'Generated, but it matched no element on the page right now.';

/**
 * The element has text; we chose not to offer a text locator for it.
 * Truthful about both halves: the text exists, and this is a recommendation.
 */
const TEXT_NOT_OFFERED =
  'Not offered — this element has text, but for interactive elements getByRole ' +
  'with an accessible name is more robust.';

/** Resolves the honest reason a strategy shows no row. */
export function naReasonFor(kind: string, input: NaReasonInput): string {
  if (input.generatedCount > 0) return MATCHED_NOTHING;
  if (kind === 'text' && (input.innerText ?? '').trim() !== '') return TEXT_NOT_OFFERED;
  return input.absent;
}

/** Exported for the regression test that pins the wording. */
export const NA_REASON_COPY = { MATCHED_NOTHING, TEXT_NOT_OFFERED } as const;
