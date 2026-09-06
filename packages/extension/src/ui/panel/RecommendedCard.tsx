/**
 * The Recommended locator card (DL-21) — now one implementation.
 *
 * Renders `recommendLocator()`'s output and nothing else. It performs NO
 * selection of its own — no sorting, no "best of" logic, no tie-breaking. If
 * this component disappeared, the recommendation would be unchanged; only its
 * presentation would.
 *
 * Honesty constraints it obeys:
 *   - the badge repeats the measured counts, never a confidence adjective;
 *   - no green anything when the engine returned no candidate;
 *   - it names the strategy so the card and the list below read as one thing.
 *
 * WHY IT IS SHARED NOW. DL-45 and DL-48 each examined this card and chose to
 * keep it local, on the stated grounds that the two panels' copy genuinely
 * differed; DL-54 did not reopen that. DL-67 re-measured both implementations
 * declaration by declaration, whitespace-normalised and comment-stripped, and
 * found the only differences to be the order of two props and the name of one
 * local variable — the copy had converged when `ui/copy/recommendation.ts` was
 * extracted, and nothing had noticed. The earlier decision is not overturned
 * on taste; its premise stopped being true, and that was measured, not assumed.
 */
import React from 'react';

import { AddButton as AddBtn, CopyButton as CopyBtn } from '../primitives';
import {
  ALTERNATIVE_LEAD,
  NO_RECOMMENDATION_COPY,
  RECOMMENDATION_TITLE,
  VERDICT_TONE,
  alsoListedBelow,
} from '../copy/recommendation';
import { resolveRationaleCopy } from '../copy/rationale';
import { STRATEGY_COLORS, STRATEGY_LABELS, strategyTextColor } from '../strategy-meta';

import type { Recommendation } from '@playwright-guru/locator-engine';
import type { PwLang } from './types';

export function RecommendedCard({
  rec,
  code,
  action,
  lang,
  onAdd,
  altCode,
}: {
  rec: Recommendation;
  code: string | null;
  action: string;
  lang: PwLang;
  onAdd: (s: string) => void;
  altCode: string | null;
}) {
  const tone = VERDICT_TONE[rec.verdict];
  const has = rec.candidate !== null;
  return (
    <div
      style={{
        margin: '8px',
        border: `2px solid ${has ? '#16a34a' : '#cbd5e1'}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: has ? '#f7fdf9' : '#fafafa',
      }}
    >
      <div
        style={{
          padding: '5px 10px',
          background: has ? '#dcfce7' : '#f1f5f9',
          borderBottom: `1px solid ${has ? '#86efac' : '#e2e8f0'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: has ? '#166534' : '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
          }}
        >
          ★ {RECOMMENDATION_TITLE}
        </span>
        {has && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: 3,
              background: tone.bg,
              color: tone.color,
            }}
          >
            {tone.label}
          </span>
        )}
      </div>

      {!has && (
        <div style={{ padding: '9px 10px', fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
          {NO_RECOMMENDATION_COPY[rec.reasonUnavailable ?? 'no-candidates']}
        </div>
      )}

      {has && code && (
        <div style={{ padding: '8px 10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginBottom: 5,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 3,
                background: (STRATEGY_COLORS[rec.candidate!.step.kind] ?? '#6b7280') + '18',
                color: strategyTextColor(rec.candidate!.step.kind),
              }}
            >
              {STRATEGY_LABELS[rec.candidate!.step.kind] ?? rec.candidate!.step.kind}
            </span>
            <div style={{ flex: 1 }} />
            <AddBtn code={code} action={action} lang={lang} onAdd={onAdd} />
            <CopyBtn text={code} />
          </div>
          <code
            style={{
              fontFamily: '"Fira Code",Consolas,monospace',
              fontSize: 11,
              color: '#14532d',
              background: '#dcfce7',
              padding: '4px 7px',
              borderRadius: 3,
              display: 'block',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              lineHeight: 1.5,
            }}
          >
            {code}
          </code>

          <ul
            style={{
              listStyle: 'none',
              margin: '6px 0 0',
              padding: 0,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
            }}
          >
            {rec.rationales.map((r, i) => {
              const copy = resolveRationaleCopy(r.code, r.params);
              return (
                <li
                  key={i}
                  title={copy.detail}
                  style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 10,
                    background: '#f0fdf4',
                    color: '#166534',
                    border: '1px solid #bbf7d0',
                  }}
                >
                  {copy.title}
                </li>
              );
            })}
          </ul>

          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
            {alsoListedBelow(STRATEGY_LABELS[rec.candidate!.step.kind] ?? rec.candidate!.step.kind)}
          </div>

          {rec.alternative && altCode && (
            <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px dashed #d1d5db' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 3 }}>
                {ALTERNATIVE_LEAD}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: '#16a34a18',
                    color: '#166534',
                  }}
                >
                  {STRATEGY_LABELS[rec.alternative.step.kind]}
                </span>
                <div style={{ flex: 1 }} />
                <AddBtn code={altCode} action={action} lang={lang} onAdd={onAdd} />
                <CopyBtn text={altCode} />
              </div>
              <code
                style={{
                  fontFamily: '"Fira Code",Consolas,monospace',
                  fontSize: 11,
                  color: '#1e40af',
                  background: '#eff6ff',
                  padding: '3px 6px',
                  borderRadius: 3,
                  display: 'block',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {altCode}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
