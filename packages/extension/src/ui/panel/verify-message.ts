/**
 * WS5 — how a raw CSS/XPath Verify result reads, decided once.
 *
 * WS7 (DL-59) already unified the CLASSIFICATION of these outcomes: both panels
 * call the same `classifyVerification` vocabulary through `content.ts` and
 * present it through the shared `verify-selector-status` module. What stayed
 * duplicated was the sentence — each panel built its own, inside its own
 * component, which is why DL-67's declaration-level sweep did not compare them.
 *
 * D-h — A DIVERGENCE DL-67 DID NOT MEASURE, recorded rather than quietly
 * merged. Extracting these two functions revealed one difference the discovery
 * gate's symbol-by-symbol comparison could not see, because both were declared
 * INSIDE their component rather than at module level: for an error the WS7
 * classifier could not put in a named state, the Side Panel rendered
 * `⚠ <detail>` and DevTools rendered `Error: <detail>`. Everything else — the
 * unique/zero/many wording, the hidden-count disclosure, the colour thresholds
 * — was already identical.
 *
 * It is drift of exactly the class O4 governs, so it is resolved the same way:
 * the Side Panel's form wins on both surfaces. That keeps the glyph vocabulary
 * consistent with the ✓/✗/⚠ the rest of these messages already use, and the
 * word "Error" is not lost from the product — WS8's matrix supplies the title,
 * cause and action for every outcome that has a named state, and this branch is
 * only ever the unclassified remainder.
 */
import { RAW_VERIFY_ERROR_STATUS_STYLE, isRawVerifyErrorStatus } from '../verify-selector-status';

import type { VerifyOutcome } from './types';

/** Visible-first: the verdict follows what a Playwright locator would resolve to. */
export function visibleCountOf(outcome: VerifyOutcome | null): number {
  return outcome ? (outcome.visibleCount ?? outcome.count) : 0;
}

/**
 * An error is not always red. WS7's `verifyStatus` separates bad syntax (still
 * red) from "this environment could not answer" (neutral grey), which a uniform
 * red previously claimed was as firm a negative as a confirmed zero-match count.
 */
export function verifyColorFor(outcome: VerifyOutcome | null): string {
  if (!outcome) return '';
  if (outcome.error) {
    return isRawVerifyErrorStatus(outcome.verifyStatus)
      ? RAW_VERIFY_ERROR_STATUS_STYLE[outcome.verifyStatus].color
      : '#dc2626';
  }
  const visible = visibleCountOf(outcome);
  return visible === 1 ? '#16a34a' : visible === 0 ? '#dc2626' : '#d97706';
}

export function verifyMessageFor(outcome: VerifyOutcome | null): string {
  if (!outcome) return '';
  if (outcome.error) {
    if (isRawVerifyErrorStatus(outcome.verifyStatus)) {
      return `${RAW_VERIFY_ERROR_STATUS_STYLE[outcome.verifyStatus].prefix}: ${outcome.error}`;
    }
    return `⚠ ${outcome.error}`;
  }
  const total = outcome.count;
  const visible = visibleCountOf(outcome);
  const hidden = total - visible;
  const totalNote = hidden > 0 ? ` (${total} total, ${hidden} hidden)` : '';
  if (visible === 1) return `✓ 1 visible element matched — unique${totalNote}`;
  if (visible === 0)
    return total > 0
      ? `✗ 0 visible elements matched — ${total} in the DOM but not visible`
      : '✗ No elements matched';
  return `⚠ ${visible} visible elements matched${totalNote}`;
}
