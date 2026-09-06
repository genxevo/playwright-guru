/**
 * WS5 — the two Verify calls, orchestrated once.
 *
 * Both panels built these message payloads by hand, from the same fields, and
 * interpreted the acks the same way. Nothing about them is surface-specific
 * except which tab they are aimed at, which is why that is a parameter.
 *
 * There is no new protocol here and no CommandBus: this calls the existing
 * `RuntimeMessage` seam and the existing `normalizeAck`, which is exactly what
 * the two panels were already doing inline. DL-54's finding that `CommandBus`
 * is redundant with that seam stays locked.
 */
import type {
  RuntimeMessageAck,
  VerificationResult,
  VerifyLocatorExpressionMessage,
  VerifySelectorMessage,
} from '../../utils/messaging';
import type { VerifyOutcome } from '../ui/panel/types';

/** How a message reaches the background. Injected so this stays browser-free. */
export type SendRuntimeMessage = (
  message: VerifySelectorMessage | VerifyLocatorExpressionMessage,
) => Promise<RuntimeMessageAck>;

/** An XPath is what starts with `//` or `(//` — the rule both panels used. */
export function selectorTypeOf(selector: string): VerifySelectorMessage['selectorType'] {
  const trimmed = selector.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('(//') ? 'xpath' : 'css';
}

/** Verify a raw CSS/XPath string. WS7 classifies the outcome in `content.ts`. */
export async function verifySelector(
  send: SendRuntimeMessage,
  selector: string,
  targetTabId: number,
): Promise<VerifyOutcome> {
  const trimmed = selector.trim();
  try {
    const ack = await send({
      type: 'VERIFY_SELECTOR',
      selector: trimmed,
      selectorType: selectorTypeOf(trimmed),
      targetTabId,
    });
    return ack.ok
      ? { count: ack.count ?? 0, visibleCount: ack.visibleCount, verifyStatus: ack.verifyStatus }
      : { count: -1, error: ack.error, verifyStatus: ack.verifyStatus ?? 'unverifiable' };
  } catch (e) {
    return { count: -1, error: String(e), verifyStatus: 'unverifiable' };
  }
}

/**
 * WS6.2 — verify a Playwright locator EXPRESSION, which is a different thing
 * from a raw selector: the content script parses and resolves it with the one
 * `LocatorResolver`, and returns the six-state classification.
 */
export async function verifyLocatorExpression(
  send: SendRuntimeMessage,
  expression: string,
  targetTabId: number,
): Promise<VerificationResult> {
  try {
    const ack = await send({ type: 'VERIFY_LOCATOR_EXPRESSION', expression, targetTabId });
    if (ack.ok && ack.verification) return ack.verification;
    return {
      status: 'unverifiable',
      expression,
      resolveError: { code: 'PROBE_ERROR', detail: ack.error ?? 'Verification failed.' },
    };
  } catch (e) {
    return {
      status: 'unverifiable',
      expression,
      resolveError: { code: 'PROBE_ERROR', detail: String(e) },
    };
  }
}

/** The shape returned when no tab could be resolved at all. */
export function noTabVerification(expression: string): VerificationResult {
  return {
    status: 'unverifiable',
    expression,
    resolveError: { code: 'PROBE_ERROR', detail: 'No active tab' },
  };
}
