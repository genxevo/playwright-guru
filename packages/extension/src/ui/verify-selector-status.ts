/**
 * Playwright Guru — raw CSS/XPath Verify Selector, error-path truth (WS7).
 * ================================================================
 * `VERIFY_SELECTOR`'s error path used to fold every `ProbeErrorCode` into one
 * alarming red "⚠ CODE: detail" string — invalid syntax (`INVALID_SELECTOR`/
 * `INVALID_XPATH`), a genuine environment limit (`UNSUPPORTED`, e.g. XPath
 * without `document.evaluate`), and cases the probe simply could not measure
 * (`SCOPE_DETACHED`/`BUDGET_EXHAUSTED`) all rendered identically to a
 * confirmed zero-match result. That conflates three different truth claims:
 * "this is wrong" is not "this environment cannot tell you", and neither is
 * "nothing was actually measured".
 *
 * `content.ts`'s `handleVerify` already classifies every outcome through the
 * SAME six-state `VerificationStatus` that `classifyVerification` (WS6.2)
 * uses for Playwright locator expressions — no second classification scheme.
 * This module is the one place that classification becomes a colour/prefix
 * for the raw CSS/XPath surface, imported by both panels so neither hand-
 * rolls its own — the same "one shared implementation" precedent
 * `strategy-meta.ts`'s `matchBadge` already set for candidate counts.
 *
 * Deliberately narrow: the count-based states (`verified`/`not-found`/
 * `ambiguous`) are NOT covered here — each panel's existing, already-honest
 * count-driven `verifyMessage`/`verifyColor` logic is untouched by WS7 and
 * stays exactly as it was.
 */
import type { VerificationStatus } from '../../utils/messaging';

export type RawVerifyErrorStatus = 'invalid' | 'unsupported' | 'unverifiable';

/** True for the subset of `VerificationStatus` this module presents. */
export function isRawVerifyErrorStatus(
  status: VerificationStatus | undefined,
): status is RawVerifyErrorStatus {
  return status === 'invalid' || status === 'unsupported' || status === 'unverifiable';
}

export const RAW_VERIFY_ERROR_STATUS_STYLE: Record<
  RawVerifyErrorStatus,
  { color: string; prefix: string }
> = {
  invalid: { color: '#dc2626', prefix: '⚠ Invalid selector' },
  unsupported: { color: '#64748b', prefix: 'ℹ Unsupported in this environment' },
  unverifiable: { color: '#64748b', prefix: 'ℹ Unable to verify' },
};
