/**
 * Playwright Guru — the recording ADMISSION boundary (WS9, DL-84).
 * ---------------------------------------------------------------------------
 * THE ONE DECISION: does this measured target become a `RecordedStep`, and if
 * not, WHY NOT?
 *
 * This is not a new rule. It is the rule that already lived as a boolean inside
 * `runtime/recording.ts`, moved here and asked to return its reason instead of
 * hiding it. `isTrustworthy` is now `refusalFor(target) === null`, so there is
 * still exactly ONE computation deciding admission — the reason a user is shown
 * is the very computation that dropped the action, not a second opinion that
 * happens to agree. A guard pins that identity.
 *
 * It lives in `recording/` rather than `runtime/` because two callers need it
 * and neither may depend on the other: the runtime ADMITS with it, and
 * `persistence.ts` VALIDATES a stored reason against the same list. A copy of
 * the vocabulary in the storage layer is exactly the second source of truth
 * this project keeps refusing to create.
 *
 * ═══ THE VOCABULARY IS BORROWED, NOT INVENTED ═══
 *
 * Every code below names a state the locator engine already has a word for, so
 * this is not a parallel verification taxonomy:
 *
 *   ambiguous         `LocatorVerdict.ambiguous` — more than one visible match,
 *                     or a chain that only became unique by appending `.nth()`,
 *                     which `buildLocatorChain`'s own doc calls a positional
 *                     guess. Both are the same fact: the engine could not tell
 *                     the candidates apart.
 *   not-found         `LocatorVerdict.no-match` / `VerificationStatus.not-found`
 *                     — zero visible matches. Nothing to replay.
 *   unverifiable      `VerificationStatus.unverifiable` — the measurement did
 *                     not happen, so there is no evidence either way. Capture
 *                     throwing on a hostile or half-torn-down DOM is the same
 *                     answer and shares this code.
 *   frame-unsupported the capability limit DL-83 established. WS6.2's parser
 *                     independently calls `page.frameLocator()`
 *                     `UNSUPPORTED_METHOD`, and `detectFrameInfo` only ever
 *                     GUESSES the frame selector, so a frame target cannot be
 *                     verified end to end. Refused, not flattened.
 *   limit-reached     `RECORDING_LIMITS.hardStop`. The recording is full; the
 *                     action is refused and everything captured is preserved.
 *
 * ═══ WHAT IS NOT A REFUSAL ═══
 *
 * Two things are deliberately absent, because reporting them would invent a
 * failure the user did not have:
 *
 *   THE NOISE FILTER. `stepForClick` returns `null` for a click on a text input
 *   because the FILL owns that element. The user's intent IS recorded — by the
 *   other event. Counting it would claim an action was lost when none was.
 *
 *   A SESSION THAT IS NOT LIVE. `recordAction`'s `rejected-*` outcomes mean the
 *   recorder was inactive, stale, stopped or foreign. The LIFECYCLE already
 *   tells the user that, in the banner, and a second channel saying the same
 *   thing in different words is how one fact starts disagreeing with itself.
 *
 * ═══ IT CONTAINS NOTHING ABOUT THE PAGE ═══
 *
 * A refusal is a CODE and nothing else. No selector, no attribute, no value, no
 * element text, no frame URL. `iframe[src*="…"] was rejected` would leak page
 * content into a status line the user may screenshot; `frame-unsupported` says
 * the same useful thing and carries nothing.
 *
 * PURE. No DOM, no probe, no resolver, no storage, no messages, no clock.
 */

import { RECORDING_LIMITS } from '../config/recording';

import type { RecordedTarget } from './workflow';

/** Why an action did not become a `RecordedStep`. Finite, bounded, opaque. */
export type RecordingRefusal =
  'frame-unsupported' | 'ambiguous' | 'not-found' | 'unverifiable' | 'limit-reached';

/** The whole vocabulary, in one place, for validation and exhaustive mapping. */
export const REFUSALS: readonly RecordingRefusal[] = [
  'frame-unsupported',
  'ambiguous',
  'not-found',
  'unverifiable',
  'limit-reached',
];

export function isRefusal(raw: unknown): raw is RecordingRefusal {
  return typeof raw === 'string' && REFUSALS.includes(raw as RecordingRefusal);
}

/**
 * THE ADMISSION DECISION. `null` means "record it".
 *
 * The order of the clauses is deliberate and load-bearing:
 *
 *   1. THE FRAME CLAUSE COMES FIRST (DL-83). An in-frame element usually DOES
 *      have exactly one visible match within its own document, so every clause
 *      below would wave it through — the counts are not wrong, they answer a
 *      different question than the emitted locator asks.
 *   2. A chain that needed `.nth()` is a positional guess wearing a verified
 *      result's clothes: it resolves to exactly one element and means "I could
 *      not tell these apart". It is checked before the counts because the count
 *      it produces is the guess's, not the element's.
 *   3. Zero and many are separated, because "nothing there" and "several of
 *      them" are different things to tell someone.
 *   4. The verdict is last: by here the counts already agree, so a verdict that
 *      still refuses is reporting something only the engine knows.
 */
export function refusalFor(target: RecordedTarget): RecordingRefusal | null {
  const { chain, verdict, visibleMatchCount } = target.locator;

  if (chain.frameSelector !== undefined) return 'frame-unsupported';
  if (chain.nth !== undefined) return 'ambiguous';
  if (visibleMatchCount === 0) return 'not-found';
  if (visibleMatchCount !== 1) return 'ambiguous';

  if (verdict === 'excellent' || verdict === 'good') return null;
  if (verdict === 'no-match') return 'not-found';
  return verdict === 'unknown' ? 'unverifiable' : 'ambiguous';
}

/** What the runtime has refused during ONE session. Two scalars, never more. */
export interface RefusalTally {
  count: number;
  last: RecordingRefusal | null;
}

export const NO_REFUSALS: RefusalTally = { count: 0, last: null };

/**
 * Adds one refusal, bounded by the AUTHORITATIVE recording limit.
 *
 * `hardStop` is reused rather than a ceiling of this module's own — the rule
 * `config/recording.ts` states at the top, and the reason DL-4's 600-versus-500
 * drift cannot happen again. A page that refuses forever therefore reports "100
 * or more" rather than an unbounded integer, and the record stays a fixed size.
 */
export function tallyRefusal(tally: RefusalTally, reason: RecordingRefusal): RefusalTally {
  return {
    count: Math.min(tally.count + 1, RECORDING_LIMITS.hardStop),
    last: reason,
  };
}

/** True for a count that could have come from `tallyRefusal`. Used on read. */
export function isRefusedCount(raw: unknown): raw is number {
  return (
    typeof raw === 'number' &&
    Number.isSafeInteger(raw) &&
    raw > 0 &&
    raw <= RECORDING_LIMITS.hardStop
  );
}
