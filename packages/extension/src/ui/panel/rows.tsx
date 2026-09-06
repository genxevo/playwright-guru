/**
 * WS5 — the three locator rows, one implementation each.
 *
 * `LocatorRow` and `XPathRow` were measured byte-identical between the two
 * panels (DL-67), so extracting them changes nothing that can be observed.
 * `CSSRow` had diverged in exactly one way (D-d): the Side Panel honoured a
 * pre-computed `variant.code` and DevTools always regenerated. The owner's O4
 * decision keeps the richer branch, so this is the Side Panel's version.
 *
 * These components render. They do not decide: counts, badges, stability hints
 * and safety come from the engine and from `strategy-meta`/`match-badge`.
 */
import React from 'react';

import { isSafelyUnique } from '../match-badge';
import { AddButton as AddBtn, CopyButton as CopyBtn } from '../primitives';
import { STRATEGY_COLORS, STRATEGY_LABELS, matchBadge, strategyTextColor } from '../strategy-meta';
import {
  STABILITY_HINT_STYLES,
  toLocatorCode,
  toXPathLocatorCode,
  type CSSVariant,
  type XPathVariant,
} from '../../../utils/css-xpath';

import type { ScoredCandidate } from '@playwright-guru/locator-engine';
import type { PwLang } from './types';

const CODE_STYLE: React.CSSProperties = {
  fontFamily: '"Fira Code",Consolas,monospace',
  fontSize: 11,
  padding: '3px 6px',
  borderRadius: 3,
  display: 'block',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  lineHeight: 1.5,
};

export function LocatorRow({
  candidate,
  code,
  action,
  lang,
  onAdd,
}: {
  candidate: ScoredCandidate;
  code: string;
  action: string;
  lang: PwLang;
  onAdd: (s: string) => void;
}) {
  const color = STRATEGY_COLORS[candidate.step.kind] ?? '#6b7280';
  const label = STRATEGY_LABELS[candidate.step.kind] ?? candidate.step.kind;
  const badge = matchBadge(candidate.uniqueCount, candidate.totalCount);
  // Green "unique" styling is a safety claim, so it requires that Playwright
  // resolve no extra hidden matches — not merely that one element is visible.
  const unique = isSafelyUnique(candidate.uniqueCount, candidate.totalCount);
  return (
    <div
      style={{
        borderBottom: '1px solid #e2e8f0',
        padding: '7px 10px',
        background: unique ? '#f0fdf4' : '#fff',
        borderLeft: unique ? '3px solid #16a34a' : '3px solid #e2e8f0',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 3,
            background: color + '18',
            color: strategyTextColor(candidate.step.kind),
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: 3,
            background: badge.bg,
            color: badge.color,
          }}
        >
          {badge.text}
        </span>
        <div style={{ flex: 1 }} />
        <AddBtn code={code} action={action} lang={lang} onAdd={onAdd} />
        <CopyBtn text={code} />
      </div>
      <code style={{ ...CODE_STYLE, color: '#1e40af', background: '#eff6ff' }}>{code}</code>
    </div>
  );
}

export function CSSRow({
  variant,
  lang,
  action,
  onAdd,
}: {
  variant: CSSVariant & { code?: string };
  lang: PwLang;
  action: string;
  onAdd: (s: string) => void;
}) {
  const rel = STABILITY_HINT_STYLES[variant.stability];
  // D-d — a caller that has already generated the code passes it in; only when
  // nobody did do we build one here.
  const code = variant.code ?? toLocatorCode(variant.selector, lang);
  return (
    <div
      style={{
        borderBottom: '1px solid #f1f5f9',
        padding: '5px 10px',
        borderLeft: '3px solid #e2e8f0',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, flexWrap: 'wrap' }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: 3,
            background: rel.bg,
            color: rel.text,
            flexShrink: 0,
          }}
        >
          {rel.label}
        </span>
        <span
          style={{
            fontSize: 11,
            color: '#64748b',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {variant.description}
        </span>
        <AddBtn code={code} action={action} lang={lang} onAdd={onAdd} />
        <CopyBtn text={variant.selector} />
      </div>
      <code
        style={{
          ...CODE_STYLE,
          fontFamily: 'Consolas,monospace',
          padding: '2px 5px',
          lineHeight: undefined,
          color: '#7c3aed',
          background: '#fdf4ff',
        }}
      >
        {code}
      </code>
    </div>
  );
}

export function XPathRow({
  variant,
  lang,
  action,
  onAdd,
}: {
  variant: XPathVariant;
  lang: PwLang;
  action: string;
  onAdd: (s: string) => void;
}) {
  const rel = STABILITY_HINT_STYLES[variant.stability];
  const code = toXPathLocatorCode(variant.xpath, lang);
  return (
    <div
      style={{
        borderBottom: '1px solid #f1f5f9',
        padding: '5px 10px',
        borderLeft: '3px solid #f59e0b20',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, flexWrap: 'wrap' }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: 3,
            background: rel.bg,
            color: rel.text,
            flexShrink: 0,
          }}
        >
          {rel.label}
        </span>
        <span
          style={{
            fontSize: 11,
            color: '#64748b',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {variant.description}
        </span>
        <AddBtn code={code} action={action} lang={lang} onAdd={onAdd} />
        <CopyBtn text={variant.xpath} />
      </div>
      <code
        style={{
          ...CODE_STYLE,
          fontFamily: 'Consolas,monospace',
          padding: '2px 5px',
          lineHeight: undefined,
          color: '#92400e',
          background: '#fffbeb',
        }}
      >
        {code}
      </code>
    </div>
  );
}
