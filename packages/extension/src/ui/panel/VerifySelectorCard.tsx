/**
 * WS5 — the Verify Selector card, one implementation.
 *
 * Two distinct verifications live in this card and always have:
 *   1. a RAW CSS/XPath string, classified by WS7's six-state vocabulary; and
 *   2. a Playwright locator EXPRESSION, via WS6.2's `VerifyLocatorPanel`.
 *
 * Both panels rendered the same card with the same two halves; only the border
 * treatment and one message prefix differed (D-h, see `verify-message.ts`).
 */
import React from 'react';

import { ErrorNotice } from '../primitives';
import { VerifyLocatorPanel } from '../VerifyLocatorPanel';
import { errorStateForVerifyStatus } from '../copy/errors';
import { isRawVerifyErrorStatus } from '../verify-selector-status';
import { verifyColorFor, verifyMessageFor } from './verify-message';

import type { VerificationResult } from '../../../utils/messaging';
import type { VerifyOutcome } from './types';

export function VerifySelectorCard({
  value,
  onChange,
  onVerify,
  busy,
  outcome,
  verifyExpression,
}: {
  value: string;
  onChange: (next: string) => void;
  onVerify: () => void;
  busy: boolean;
  outcome: VerifyOutcome | null;
  verifyExpression: (expression: string) => Promise<VerificationResult>;
}) {
  const color = verifyColorFor(outcome);
  const message = verifyMessageFor(outcome);
  return (
    <div
      style={{
        padding: '8px 10px',
        margin: '0 8px 6px',
        border: '2px solid #7c3aed',
        borderRadius: 8,
        background: '#f5f3ff',
        boxShadow: '0 2px 8px rgba(124,58,237,0.18)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#5b21b6',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          marginBottom: 5,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#7c3aed',
          }}
        />
        Verify Selector
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onVerify()}
          placeholder="Type CSS or XPath then press Enter…"
          aria-label="CSS or XPath selector to verify"
          style={{
            flex: 1,
            padding: '4px 8px',
            fontSize: 11,
            border: '1.5px solid #a78bfa',
            borderRadius: 4,
            fontFamily: 'Consolas,monospace',
            background: '#fff',
            color: '#1e1b4b',
          }}
        />
        {/* WS8 — the glyph was the only label this button had, so a screen
            reader announced "button" or read the triangle aloud. aria-label
            names it; the glyph stays. */}
        <button
          onClick={onVerify}
          disabled={busy}
          aria-label="Verify selector against the page"
          title="Verify selector against the page"
          style={{
            padding: '4px 10px',
            borderRadius: 4,
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 700,
            background: '#7c3aed',
            color: '#fff',
            boxShadow: '0 2px 6px rgba(124,58,237,0.4)',
          }}
        >
          ▶
        </button>
      </div>

      {/* WS8 — when WS7 classified the outcome as one the extension could not
          measure, the user gets title + cause + action from the error matrix;
          the WS7 one-liner stays underneath as the technical detail (the raw
          probe code), which is the part a test author actually needs to fix a
          selector. A measured result keeps exactly the pre-WS8 single line. */}
      {outcome &&
        (isRawVerifyErrorStatus(outcome.verifyStatus) ? (
          <div style={{ marginTop: 5 }}>
            <ErrorNotice
              code={errorStateForVerifyStatus(outcome.verifyStatus)}
              severity={outcome.verifyStatus === 'invalid' ? 'error' : 'warning'}
              compact
            />
            <div style={{ marginTop: 3, fontSize: 11, fontWeight: 600, color, paddingLeft: 2 }}>
              {message}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 5, fontSize: 11, fontWeight: 600, color, paddingLeft: 2 }}>
            {message}
          </div>
        ))}

      {/* WS6.2 — a second, distinct verify surface: a Playwright locator
          EXPRESSION (getByRole(...)), not a raw CSS/XPath string. Same card,
          its own honestly-classified result. */}
      <VerifyLocatorPanel verify={verifyExpression} />
    </div>
  );
}
