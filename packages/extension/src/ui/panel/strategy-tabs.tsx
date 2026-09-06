/**
 * WS5 — the three strategy tab bodies, one implementation each.
 *
 * MORE DIVERGENCES DL-67 DID NOT MEASURE, recorded rather than quietly merged.
 * DL-67's sweep compared module-level declarations; all of this markup lived
 * inside each panel's own `return`, so it was never in that comparison.
 * Extracting it surfaced three further differences, every one of them copy or
 * ordering drift of exactly the class O4 governs:
 *
 *   D-i  The XPath advisory. Side Panel: "⚠ Playwright recommends semantic
 *        locators (getByRole, getByLabel) or CSS over XPath. Use XPath only as
 *        last resort." DevTools: "⚠ Playwright recommends semantic locators
 *        over XPath." The fuller one says what to use instead, so it wins.
 *   D-j  `UnverifiedNotice` sat ABOVE the "Suggested:" row in the Side Panel
 *        and BELOW it in DevTools. The caveat belongs before the thing it
 *        qualifies — a user should not read a suggestion and only then be told
 *        it was never checked — so the Side Panel's order wins.
 *   D-k  The empty message: "No core selectors generated for this element."
 *        against "No core selectors for this element." The first distinguishes
 *        "we generated none" from "none exist", so it wins.
 *
 * Nothing here ranks, counts or verifies. Every number shown was measured by
 * the engine in the content script and arrived on the pick.
 */
import React from 'react';

import { naReasonFor } from '../copy/na-reason';
import { isSafelyUnique } from '../match-badge';
import { CopyButton as CopyBtn, NARow, Tabs, tabPanelProps, UnverifiedNotice } from '../primitives';
import { ALL_GETBY_KINDS } from './constants';
import { CSSRow, LocatorRow, XPathRow } from './rows';
import { RecommendedCard } from './RecommendedCard';
import {
  CSS_SUB_TABS,
  XPATH_SUB_TABS,
  type CSSSubTab,
  type CSSVariant,
  type XPathSubTab,
  type XPathVariant,
} from '../../../utils/css-xpath';

import type { Recommendation, ScoredCandidate } from '@playwright-guru/locator-engine';
import type { StoredPick } from '../../../utils/messaging';
import type { PwLang } from './types';

const HEADER: React.CSSProperties = {
  padding: '5px 10px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const CARD: React.CSSProperties = {
  margin: '8px',
  borderRadius: 8,
  overflow: 'hidden',
  background: '#fff',
};

const SUGGESTED_CODE: React.CSSProperties = {
  fontFamily: 'Consolas,monospace',
  fontSize: 11,
  flex: 1,
  padding: '2px 6px',
  borderRadius: 3,
};

export interface StrategyTabProps {
  pick: StoredPick;
  lang: PwLang;
  action: string;
  onAdd: (code: string) => void;
}

/** ⭐ All seven Playwright locator types, plus the DL-21 recommendation above them. */
export function PlaywrightTab({
  pick,
  lang,
  action,
  onAdd,
  byKind,
  recommendation,
  recCode,
  altCode,
  genCode,
}: StrategyTabProps & {
  byKind: Map<string, ScoredCandidate[]>;
  recommendation: Recommendation;
  recCode: string | null;
  altCode: string | null;
  genCode: (c: ScoredCandidate) => string;
}) {
  const uniqueCount = Array.from(byKind.values())
    .flat()
    .filter((c) => isSafelyUnique(c.uniqueCount, c.totalCount)).length;
  return (
    <div {...tabPanelProps('pg-main', 'playwright')}>
      {/* ★ RECOMMENDED (DL-21) — above the seven, never replacing them */}
      <RecommendedCard
        rec={recommendation}
        code={recCode}
        altCode={altCode}
        action={action}
        lang={lang}
        onAdd={onAdd}
      />
      <div style={{ ...CARD, border: '1px solid #e2e8f0' }}>
        <div style={{ ...HEADER, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
            ⭐ ALL 7 PLAYWRIGHT LOCATOR TYPES
          </span>
          <span style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>
            {uniqueCount} unique
          </span>
        </div>
        <div style={{ overflowY: 'auto', maxHeight: 196 }}>
          {ALL_GETBY_KINDS.map(({ kind, label, naReason }) => {
            const generated = byKind.get(kind) ?? [];
            const candidates = generated.filter((c) => c.uniqueCount !== 0);
            if (candidates.length === 0)
              return (
                <NARow
                  key={kind}
                  label={label}
                  reason={naReasonFor(kind, {
                    generatedCount: generated.length,
                    innerText: pick.attributes.innerText,
                    absent: naReason,
                  })}
                />
              );
            return candidates.map((c, i) => (
              <LocatorRow
                key={`${kind}-${i}-${lang}-${action}`}
                candidate={c}
                code={genCode(c)}
                action={action}
                lang={lang}
                onAdd={onAdd}
              />
            ));
          })}
        </div>
      </div>
    </div>
  );
}

/** ≡ page.locator() CSS variants. */
export function CssTab({
  lang,
  action,
  onAdd,
  variants,
  subTab,
  onSubTab,
  suggested,
}: Omit<StrategyTabProps, 'pick'> & {
  variants: CSSVariant[];
  subTab: CSSSubTab;
  onSubTab: (t: CSSSubTab) => void;
  suggested: string | null;
}) {
  const filtered = variants.filter((v) => v.subTab === subTab);
  return (
    <div {...tabPanelProps('pg-main', 'css')} style={{ ...CARD, border: '1px solid #e2e8f0' }}>
      <div style={{ ...HEADER, background: '#eff6ff', borderBottom: '1px solid #bfdbfe' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1e40af' }}>
          ≡ page.locator() CSS VARIANTS
        </span>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          {filtered.length} shown · {variants.length} total
        </span>
      </div>
      {/* D-j — the caveat comes before what it qualifies. */}
      <UnverifiedNotice />
      {suggested && (
        <div
          style={{
            padding: '8px 10px',
            background: '#f0f9ff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Suggested:</span>
          <code style={{ ...SUGGESTED_CODE, color: '#0c4a6e', background: '#e0f2fe' }}>
            {suggested}
          </code>
          <CopyBtn text={suggested} />
        </div>
      )}
      <Tabs
        tabs={CSS_SUB_TABS}
        active={subTab}
        onSelect={onSubTab}
        accent="#2563eb"
        idBase="pg-css-sub"
        ariaLabel="CSS selector category"
      />
      <div {...tabPanelProps('pg-css-sub', subTab)} style={{ overflowY: 'auto', maxHeight: 196 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '16px', fontSize: 11, color: '#64748b', textAlign: 'center' }}>
            No {subTab} selectors generated for this element.
          </div>
        ) : (
          filtered.map((v, i) => (
            <CSSRow key={i} variant={v} lang={lang} action={action} onAdd={onAdd} />
          ))
        )}
      </div>
    </div>
  );
}

/** ⋔ page.locator() XPath syntaxes. */
export function XPathTab({
  lang,
  action,
  onAdd,
  variants,
  subTab,
  onSubTab,
  suggested,
}: Omit<StrategyTabProps, 'pick'> & {
  variants: XPathVariant[];
  subTab: XPathSubTab;
  onSubTab: (t: XPathSubTab) => void;
  suggested: string | null;
}) {
  const filtered = variants.filter((v) => v.subTab === subTab);
  return (
    <div {...tabPanelProps('pg-main', 'xpath')}>
      {/* D-i — say what to use INSTEAD, not merely that this is discouraged. */}
      <div
        style={{
          background: '#fef3c7',
          color: '#92400e',
          padding: '4px 12px',
          fontSize: 11,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        ⚠ Playwright recommends semantic locators (getByRole, getByLabel) or CSS over XPath. Use
        XPath only as last resort.
      </div>
      <div style={{ ...CARD, border: '1px solid #fcd34d' }}>
        <div style={{ ...HEADER, background: '#fffbeb', borderBottom: '1px solid #fcd34d' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>
            ⋔ page.locator() XPATH SYNTAXES
          </span>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            {filtered.length} shown · {variants.length} total
          </span>
        </div>
        <UnverifiedNotice />
        {suggested && (
          <div
            style={{
              padding: '8px 10px',
              background: '#fffbeb',
              borderBottom: '1px solid #fcd34d',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Suggested:</span>
            <code style={{ ...SUGGESTED_CODE, color: '#78350f', background: '#fef9c3' }}>
              {suggested}
            </code>
            <CopyBtn text={suggested} />
          </div>
        )}
        <Tabs
          tabs={XPATH_SUB_TABS}
          active={subTab}
          onSelect={onSubTab}
          accent="#d97706"
          idBase="pg-xpath-sub"
          ariaLabel="XPath variant category"
        />
        <div
          {...tabPanelProps('pg-xpath-sub', subTab)}
          style={{ overflowY: 'auto', maxHeight: 196 }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '16px', fontSize: 11, color: '#64748b', textAlign: 'center' }}>
              No {subTab} XPath variants generated for this element.
            </div>
          ) : (
            filtered.map((v, i) => (
              <XPathRow key={i} variant={v} lang={lang} action={action} onAdd={onAdd} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
