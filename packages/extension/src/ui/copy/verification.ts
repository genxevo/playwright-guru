/**
 * WS6.2 — verification status & parse-error copy.
 * ================================================================
 * DOMAIN PROSE EXCLUSION, exactly as `ui/copy/rationale.ts` enforces for
 * `RationaleCode`: `VerificationStatus` and `ParseErrorCode`
 * (`@playwright-guru/locator-engine`) are codes, never sentences. This file
 * is the one place they become words a user reads, and the `satisfies
 * Record<...>` below makes a code with no copy a COMPILE ERROR — the same
 * exhaustiveness mechanism `RATIONALE_COPY` uses (mechanism E-2).
 *
 * TRUST RULE (MASTER-ROADMAP §WS6.2 / owner-decision gate precedent)
 * --------------------------------------------------------------------
 * Copy here must never claim more than the evidence supports. "Verified"
 * means exactly one visible match was actually measured — never "the syntax
 * looked valid". "Unable to verify" is used whenever the environment
 * genuinely could not answer, and is never silently reworded to sound like
 * a negative result.
 */
import type {
  VerificationResult,
  VerificationStatus,
  ParseErrorCode,
} from '@playwright-guru/locator-engine';

export type VerificationTone = 'positive' | 'neutral' | 'caution' | 'negative';

export interface VerificationStatusCopy {
  /** Short state label — the primary signal; never relies on colour alone. */
  label: string;
  tone: VerificationTone;
  /** A single symbol shown alongside the label (never the only indicator). */
  symbol: string;
  /** Builds the full message from the actual measured evidence. */
  message(result: VerificationResult): string;
}

function hiddenNote(total?: number, visible?: number): string {
  if (total === undefined || visible === undefined) return '';
  const hidden = total - visible;
  return hidden > 0 ? ` (${total} total, ${hidden} hidden)` : '';
}

export const VERIFICATION_STATUS_COPY = {
  verified: {
    label: 'Verified',
    tone: 'positive',
    symbol: '✓',
    message: (r) =>
      `Resolves to 1 matching element${hiddenNote(r.matchCount, r.visibleMatchCount)}.`,
  },
  'not-found': {
    label: 'Not found',
    tone: 'negative',
    symbol: '✗',
    message: (r) =>
      r.matchCount && r.matchCount > 0
        ? `No visible matches — ${r.matchCount} in the DOM but not visible.`
        : 'No matching elements found.',
  },
  ambiguous: {
    label: 'Ambiguous',
    tone: 'caution',
    symbol: '⚠',
    message: (r) =>
      `Matches ${r.visibleMatchCount ?? '?'} elements${hiddenNote(r.matchCount, r.visibleMatchCount)}. Locator is not unique.`,
  },
  invalid: {
    label: 'Invalid',
    tone: 'negative',
    symbol: '⚠',
    message: (r) =>
      `Couldn't parse this as a Playwright locator${r.parseError ? ` (${PARSE_ERROR_COPY[r.parseError.code]} at position ${r.parseError.position})` : '.'}`,
  },
  unsupported: {
    label: 'Unsupported',
    tone: 'neutral',
    symbol: 'ℹ',
    message: () => "This locator uses functionality this verifier doesn't check yet.",
  },
  unverifiable: {
    label: 'Unable to verify',
    tone: 'neutral',
    symbol: 'ℹ',
    message: () => 'Unable to verify this locator in the current environment.',
  },
} satisfies Record<VerificationStatus, VerificationStatusCopy>;

/** Short, human phrase for each `ParseErrorCode` — used inline in the `invalid` message above. */
export const PARSE_ERROR_COPY = {
  EMPTY_EXPRESSION: 'the expression is empty',
  UNEXPECTED_TOKEN: 'an unexpected character',
  UNTERMINATED_STRING: 'an unterminated quote',
  UNTERMINATED_CALL: 'a missing closing parenthesis',
  MISSING_ARGUMENT: 'a missing argument',
  INVALID_ARGUMENT: 'an invalid argument',
  UNSUPPORTED_METHOD: 'an unsupported method',
  UNKNOWN_OPTION: 'an unrecognised option',
} satisfies Record<ParseErrorCode, string>;
