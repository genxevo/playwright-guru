/**
 * VerifyLocatorPanel — WS6.2 Verification V2.
 * ================================================================
 * Lets a user paste a Playwright locator EXPRESSION (`getByRole('button',
 * { name: 'Save' })`, not a raw CSS/XPath string — that is the existing,
 * separate "Verify Selector" feature both panels already ship) and get an
 * honest answer: verified / not found / ambiguous / invalid / unsupported /
 * unverifiable. Never a generic "failed".
 *
 * DEPENDENCY INJECTION, NOT A DIRECT BROWSER CALL (R5)
 * -------------------------------------------------------
 * This component never imports any extension/browser API directly — it takes
 * a `verify` callback and renders whatever `VerificationResult` it resolves
 * to. Each panel supplies its own `verify`, built from ITS OWN existing
 * tab-resolution (`getActiveTabId` in the Side Panel, the DevTools
 * `inspectedWindow` tab id in the DevTools panel) and the same
 * `VERIFY_LOCATOR_EXPRESSION` message / `RuntimeMessage` seam the existing
 * "Verify Selector" feature already uses (§20 of the WS6.2 authorisation:
 * reuse the seam, do not build a parallel one). Keeping the browser call out
 * of this file is what keeps it out of `R5`'s reach.
 */
import { useCallback, useId, useState } from 'react';
import type { VerificationResult } from '../../utils/messaging';
import { VERIFICATION_STATUS_COPY } from './copy/verification';

const TONE_VAR: Record<string, string> = {
  positive: 'var(--pg-color-success)',
  negative: 'var(--pg-color-danger)',
  caution: 'var(--pg-color-warning)',
  neutral: 'var(--pg-color-text-subtle)',
};

export interface VerifyLocatorPanelProps {
  /** Resolves to a full, honestly-classified verification outcome. Never throws. */
  verify: (expression: string) => Promise<VerificationResult>;
}

export function VerifyLocatorPanel({ verify }: VerifyLocatorPanelProps) {
  const inputId = useId();
  const [expression, setExpression] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const onSubmit = useCallback(
    async (e: { preventDefault: () => void }) => {
      e.preventDefault();
      const trimmed = expression.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      try {
        setResult(await verify(trimmed));
      } finally {
        setBusy(false);
      }
    },
    [expression, busy, verify],
  );

  const copy = result ? VERIFICATION_STATUS_COPY[result.status] : null;
  const tone = copy ? TONE_VAR[copy.tone] : undefined;

  return (
    <div style={{ padding: 'var(--pg-space-2)', borderTop: '1px solid var(--pg-color-border)' }}>
      <label
        htmlFor={inputId}
        style={{
          display: 'block',
          fontSize: 'var(--pg-font-size-xs)',
          fontWeight: 'var(--pg-font-weight-semibold)',
          color: 'var(--pg-color-text-muted)',
          marginBottom: 4,
        }}
      >
        Verify a Playwright locator
      </label>
      <form onSubmit={(e) => void onSubmit(e)} style={{ display: 'flex', gap: 6 }}>
        <input
          id={inputId}
          value={expression}
          onChange={(e) => {
            setExpression(e.target.value);
            setResult(null);
          }}
          placeholder="getByRole('button', { name: 'Save' })"
          spellCheck={false}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 'var(--pg-font-size-xs)',
            fontFamily: 'var(--pg-font-mono)',
            padding: '4px 8px',
            border: '1px solid var(--pg-color-border-strong)',
            borderRadius: 'var(--pg-radius-sm)',
            background: 'var(--pg-color-surface)',
            color: 'var(--pg-color-text)',
          }}
        />
        <button
          type="submit"
          disabled={busy || !expression.trim()}
          style={{
            fontSize: 'var(--pg-font-size-xs)',
            fontWeight: 'var(--pg-font-weight-bold)',
            padding: '4px 10px',
            border: 'none',
            borderRadius: 'var(--pg-radius-sm)',
            cursor: busy ? 'default' : 'pointer',
            background: 'var(--pg-color-accent)',
            color: 'var(--pg-color-text-inverse)',
            opacity: busy || !expression.trim() ? 0.6 : 1,
          }}
        >
          {busy ? '…' : 'Verify'}
        </button>
      </form>
      {/* aria-live: the result replaces itself on every submit, and must be
          announced without the user needing to re-focus this region. */}
      <div role="status" aria-live="polite" style={{ marginTop: 6, minHeight: 16 }}>
        {result && copy && (
          <span style={{ fontSize: 'var(--pg-font-size-xs)', color: tone, lineHeight: 1.4 }}>
            <strong>
              {copy.symbol} {copy.label}:
            </strong>{' '}
            {copy.message(result)}
          </span>
        )}
      </div>
    </div>
  );
}
