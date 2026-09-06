/**
 * WS5 — the Verify Selector card's state, one hook for both surfaces.
 *
 * The orchestration is in `services/verification.ts`; this holds the input, the
 * outcome and the busy flag, and supplies the tab the request is aimed at.
 * Which tab that is comes from the surface's own pick source — the Side Panel's
 * active tab, DevTools' INSPECTED tab (O2) — so the same hook targets the right
 * page on both surfaces without knowing how either resolves it.
 */
import { useCallback, useState } from 'react';

import {
  noTabVerification,
  verifyLocatorExpression,
  verifySelector,
  type SendRuntimeMessage,
} from '../services/verification';

import type { VerificationResult } from '../../utils/messaging';
import type { ErrorStateCode } from '../ui/copy/errors';
import type { VerifyOutcome } from '../ui/panel/types';

export interface VerifyApi {
  input: string;
  setInput: (next: string) => void;
  outcome: VerifyOutcome | null;
  busy: boolean;
  verify: () => void;
  verifyExpression: (expression: string) => Promise<VerificationResult>;
}

export function useVerify(
  tabId: number | null,
  send: SendRuntimeMessage,
  onNoTab?: (code: ErrorStateCode) => void,
): VerifyApi {
  const [input, setInputRaw] = useState('');
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  // Editing the selector invalidates the result that described the old one.
  const setInput = useCallback((next: string) => {
    setInputRaw(next);
    setOutcome(null);
  }, []);

  const verify = useCallback(() => {
    if (!input.trim()) return;
    setOutcome(null);
    // WS8 — "no active tab" is a KNOWN cause with a specific action, so it gets
    // its own matrix entry rather than being flattened into the generic
    // "could not check the page" result the probe path produces.
    if (tabId === null) {
      onNoTab?.('NO_ACTIVE_TAB');
      return;
    }
    setBusy(true);
    void verifySelector(send, input, tabId).then((result) => {
      setOutcome(result);
      setBusy(false);
    });
  }, [input, tabId, send, onNoTab]);

  const verifyExpression = useCallback(
    async (expression: string) =>
      tabId === null
        ? noTabVerification(expression)
        : verifyLocatorExpression(send, expression, tabId),
    [tabId, send],
  );

  return { input, setInput, outcome, busy, verify, verifyExpression };
}
