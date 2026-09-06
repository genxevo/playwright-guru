/**
 * WS5 — the panel, as one component.
 * ============================================================================
 * Header, live region, error notice, strategy tabs, action strip, element HTML,
 * Verify Selector, the three strategy bodies and the code workspace. Both
 * surfaces rendered all of it, separately, in files of 905 and 470 lines. It is
 * rendered once here, from a controller the surface composed.
 *
 * What is still a prop, because it is a genuine surface difference and not
 * drift:
 *   - `leading`   — the Side Panel arms a page picker; DevTools re-reads `$0`.
 *   - `status`    — each surface reports different things about itself.
 *   - `empty`     — "click the pick button" and "select an element in Elements"
 *                   are different instructions because they are different acts.
 *   - `banner`    — the Side Panel's recording strip (WS9, flag-gated).
 *
 * Everything else is shared, and any future difference has to be introduced
 * here, deliberately, rather than by two files quietly drifting.
 */
import React from 'react';

import { ErrorNotice, Tabs } from '../primitives';
import { STRATEGY_TABS } from '../strategy-meta';
import { ActionStrip } from './ActionStrip';
import { CodeWorkspace } from './CodeWorkspace';
import { ElementHtml } from './ElementHtml';
import { LANGS } from './constants';
import { CssTab, PlaywrightTab, XPathTab } from './strategy-tabs';
import { VerifySelectorCard } from './VerifySelectorCard';

import type { PanelController } from '../../hooks/usePanel';
import type { PwLang } from './types';

export interface PanelStatus {
  text: string;
  tone: 'ok' | 'error' | 'info';
}

export interface PanelEmptyState {
  icon: string;
  title: string;
  hint: React.ReactNode;
}

const STATUS_TONE: Record<PanelStatus['tone'], React.CSSProperties> = {
  ok: { background: '#f0fdf4', color: '#166534', borderBottom: '1px solid #bbf7d0' },
  error: { background: '#fef2f2', color: '#dc2626', borderBottom: '1px solid #fecaca' },
  info: { background: '#f0f9ff', color: '#0369a1', borderBottom: '1px solid #bae6fd' },
};

export function PanelFrame({
  controller,
  leading,
  banner,
  status,
  empty,
  elementHtmlOpen = false,
}: {
  controller: PanelController;
  leading: React.ReactNode;
  banner?: React.ReactNode;
  status: PanelStatus;
  empty: PanelEmptyState;
  elementHtmlOpen?: boolean;
}) {
  const { pick, lang, setLang, workspace, copy, verify, action, tabs, derived, errorCode } =
    controller;
  const current = pick.pick;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: 'system-ui,-apple-system,sans-serif',
        fontSize: 13,
        color: '#1e293b',
        background: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {/* 1. Global header */}
      <div
        style={{
          background: '#1e293b',
          color: '#fff',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {leading}
        <span
          style={{
            fontWeight: 800,
            fontSize: 13,
            flex: 1,
            letterSpacing: '-0.3px',
            textAlign: 'center',
          }}
        >
          ⚡ Playwright Guru
        </span>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as PwLang)}
          aria-label="Target language for generated code"
          style={{
            fontSize: 11,
            background: '#374151',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '3px 5px',
            cursor: 'pointer',
          }}
        >
          {LANGS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {banner}

      {/* WS8 — live region. These messages appear in response to something the
          user just did and were previously announced to nobody: a screen-reader
          user pressed Pick and heard nothing at all. `role="status"` +
          aria-live="polite" announces without stealing focus. The element is
          always mounted so the region exists BEFORE its text changes —
          inserting an aria-live node and filling it in the same tick is the
          classic way to have an announcement silently dropped. */}
      <div
        role="status"
        aria-live="polite"
        style={
          status.text
            ? {
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 500,
                textAlign: 'center',
                flexShrink: 0,
                ...STATUS_TONE[status.tone],
              }
            : undefined
        }
      >
        {status.text}
      </div>

      {/* WS8 — error-state matrix: title, cause, action, never a bare code. */}
      {errorCode && (
        <div style={{ padding: '6px 10px', flexShrink: 0 }}>
          <ErrorNotice code={errorCode} compact />
        </div>
      )}

      {/* 2. Main strategy tabs (WS2 item 6 — the shared Tabs primitive) */}
      <Tabs
        tabs={STRATEGY_TABS}
        active={tabs.mainTab}
        onSelect={tabs.setMainTab}
        idBase="pg-main"
        ariaLabel="Locator strategy"
        variant="underline"
      />

      {/* 3. Action strip — shared across all tabs */}
      {current && (
        <ActionStrip
          attributes={current.attributes}
          actions={action.actions}
          actionMode={action.actionMode}
          onSelect={action.setActionMode}
        />
      )}

      {/* Scrollable content */}
      <div style={{ overflowY: 'auto', flexShrink: 0 }}>
        {!current && !pick.busy && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
              gap: 10,
              color: '#64748b',
              textAlign: 'center',
              minHeight: 200,
            }}
          >
            <div style={{ fontSize: 40 }}>{empty.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#64748b' }}>{empty.title}</div>
            <div style={{ fontSize: 11, maxWidth: 240, lineHeight: 1.5 }}>{empty.hint}</div>
          </div>
        )}

        {current && (
          <>
            <ElementHtml html={current.outerHtml} defaultOpen={elementHtmlOpen} />

            <VerifySelectorCard
              value={verify.input}
              onChange={verify.setInput}
              onVerify={verify.verify}
              busy={verify.busy}
              outcome={verify.outcome}
              verifyExpression={verify.verifyExpression}
            />

            {tabs.mainTab === 'playwright' && (
              <PlaywrightTab
                pick={current}
                lang={lang}
                action={action.effective}
                onAdd={workspace.append}
                byKind={derived.byKind}
                recommendation={derived.recommendation}
                recCode={derived.recCode}
                altCode={derived.altCode}
                genCode={derived.genCode}
              />
            )}

            {tabs.mainTab === 'css' && (
              <CssTab
                lang={lang}
                action={action.effective}
                onAdd={workspace.append}
                variants={derived.cssVariants}
                subTab={tabs.cssSubTab}
                onSubTab={tabs.setCssSubTab}
                suggested={derived.cssSuggested}
              />
            )}

            {tabs.mainTab === 'xpath' && (
              <XPathTab
                lang={lang}
                action={action.effective}
                onAdd={workspace.append}
                variants={derived.xpathVariants}
                subTab={tabs.xpathSubTab}
                onSubTab={tabs.setXpathSubTab}
                suggested={derived.xpathSuggested}
              />
            )}
          </>
        )}
      </div>

      {/* CODE workspace — anchored at the footer, one workspace (O1) */}
      <CodeWorkspace
        lines={workspace.lines}
        canUndo={workspace.canUndo}
        copyState={copy.copyState}
        copyFailure={copy.copyFailure}
        writeFailed={workspace.writeFailed}
        onCopyAll={copy.copyAll}
        onUndo={workspace.undo}
        onClear={workspace.clear}
        onRemove={workspace.removeAt}
      />
    </div>
  );
}
