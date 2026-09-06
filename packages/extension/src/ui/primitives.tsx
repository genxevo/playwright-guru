/**
 * Shared UI primitives (WS2 item 3).
 * ==================================
 *
 * These four leaf components were defined IDENTICALLY in both `SidePanel.tsx`
 * and `Panel.tsx`. Extracting them here removes that duplication: one copy now
 * lives in the shared chunk both panels already load, and the two local copies
 * are deleted — a net-negative change to the bundle, not an addition.
 *
 * Scope discipline (WS2 item 3):
 *   • This is CONSOLIDATION of already-duplicated markup, not a redesign and not
 *     a broad component migration (that is item 6). The divergent product
 *     components (LocatorRow / CSSRow / XPathRow / RecommendedCard) stay local.
 *   • Styling is preserved BYTE-FOR-BYTE from the originals — no visual change.
 *     The internal hex/px literals are migrated to `var(--pg-*)` tokens in
 *     item 7 (global hex→token migration), together with the rest of the UI;
 *     tokenising only these now would add bundle weight for no consolidation.
 *
 * Accessibility contract: the two interactive primitives render a NATIVE
 * `<button>` — real keyboard activation, focus, and disabled semantics come for
 * free and are never re-implemented on a `<div>`. `test/primitives.test.ts`
 * pins this.
 */
import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import type { TargetLanguage } from '@playwright-guru/codegen';

import { UNVERIFIED_SELECTOR_NOTICE } from '../../utils/css-xpath';
import { ACTION_MAP, applyAction } from './actions';
import { clipboardPort } from '../application/adapters';
import { ERROR_STATES, type ErrorStateCode } from './copy/errors';

type CopyState = 'idle' | 'done' | 'failed';

/**
 * Copies `text` to the clipboard; flips to ✓ for 1.5 s as confirmation.
 *
 * WS5: routed through `ClipboardPort` rather than calling the raw browser
 * clipboard API directly, so a rejected copy (permission denied, an
 * unfocused document, an unsupported context) renders as an explicit ✗ with
 * the reason in `title`, instead of vanishing as an unhandled promise
 * rejection with the button silently doing nothing.
 */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [state, setState] = useState<CopyState>('idle');
  const [failureDetail, setFailureDetail] = useState('');
  return (
    <button
      /**
       * WS9 workspace — ADDITIVE, and the reason is that the visible content is
       * a clipboard emoji. A screen reader otherwise announces "📋" or nothing
       * at all, which is exactly the defect WS8 fixed for the other icon-only
       * buttons. `label` is optional so no existing call site changes; a caller
       * that supplies one gets a real accessible name, and the outcome is
       * announced through it too rather than through colour alone.
       */
      aria-label={
        label === undefined
          ? undefined
          : state === 'done'
            ? `${label} — copied`
            : state === 'failed'
              ? `${label} — copy failed`
              : label
      }
      title={state === 'failed' ? failureDetail : label}
      onClick={async () => {
        const result = await clipboardPort.writeText(text);
        if (result.ok) {
          setState('done');
          setTimeout(() => setState('idle'), 1500);
        } else {
          setFailureDetail(result.detail ?? 'Copy failed.');
          setState('failed');
          setTimeout(() => setState('idle'), 1500);
        }
      }}
      style={{
        fontSize: 11,
        padding: '2px 7px',
        border: 'none',
        borderRadius: 3,
        cursor: 'pointer',
        fontWeight: 700,
        flexShrink: 0,
        background: state === 'done' ? '#16a34a' : state === 'failed' ? '#dc2626' : '#1e293b',
        color: '#fff',
        transition: 'background .2s',
      }}
    >
      {state === 'done' ? '✓' : state === 'failed' ? '✗' : '📋'}
    </button>
  );
}

/** Adds the locator (with its language-appropriate action call) to the buffer. */
export function AddButton({
  code,
  action,
  lang,
  onAdd,
}: {
  code: string;
  action: string;
  lang: TargetLanguage;
  onAdd: (s: string) => void;
}) {
  const [done, setDone] = useState(false);
  const al = action === 'none' ? '' : ` ${ACTION_MAP[action]?.[0] ?? action}`;
  return (
    <button
      onClick={() => {
        onAdd(applyAction(code, action, lang));
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      style={{
        fontSize: 11,
        padding: '2px 6px',
        border: 'none',
        borderRadius: 3,
        cursor: 'pointer',
        fontWeight: 700,
        flexShrink: 0,
        background: done ? '#16a34a' : '#dbeafe',
        color: done ? '#fff' : '#1e40af',
        transition: 'background .2s',
        whiteSpace: 'nowrap',
      }}
    >
      {done ? '✓' : `+ Code${al}`}
    </button>
  );
}

/** The banner that marks generated CSS/XPath as unverified output. */
export function UnverifiedNotice() {
  return (
    <div
      style={{
        padding: '6px 10px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        gap: 6,
        alignItems: 'flex-start',
      }}
    >
      <span style={{ fontSize: 11, lineHeight: 1.4, color: '#64748b', flexShrink: 0 }}>ℹ</span>
      <span style={{ fontSize: 11, lineHeight: 1.45, color: '#64748b' }}>
        {UNVERIFIED_SELECTOR_NOTICE}
      </span>
    </div>
  );
}

/**
 * WS8 — the one way an error is shown to the user, in either panel.
 *
 * Title, cause and action come from `copy/errors.ts`'s matrix, never from a
 * caller-supplied string, so no surface can quietly go back to rendering a
 * bare `ack.error`. `role="alert"` is deliberate over `role="status"`: these
 * are failures the user has to act on, and both panels reach this component
 * only after an action the user just took.
 *
 * `severity` changes the colour, never the content. `warning` is for the
 * states WS7 classifies as "could not measure" (`unsupported`/`unverifiable`)
 * — nothing is confirmed wrong there, so the alarming red a genuine failure
 * gets would overstate what the extension knows.
 */
export function ErrorNotice({
  code,
  severity = 'error',
  compact = false,
}: {
  code: ErrorStateCode;
  severity?: 'error' | 'warning';
  compact?: boolean;
}) {
  const { title, cause, action } = ERROR_STATES[code];
  const accent = severity === 'error' ? '#991b1b' : '#92400e';
  const surface = severity === 'error' ? '#fef2f2' : '#fffbeb';
  const border = severity === 'error' ? '#fecaca' : '#fcd34d';
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: compact ? '5px 10px' : '8px 10px',
        background: surface,
        border: `1px solid ${border}`,
        borderRadius: 4,
        textAlign: 'left',
      }}
    >
      <strong style={{ fontSize: 11, lineHeight: 1.4, color: accent }}>{title}</strong>
      <span style={{ fontSize: 11, lineHeight: 1.45, color: '#475569' }}>{cause}</span>
      <span style={{ fontSize: 11, lineHeight: 1.45, color: '#475569', fontWeight: 600 }}>
        {action}
      </span>
    </div>
  );
}

/** A "not applicable" strategy row — a labelled reason a strategy did not apply. */
export function NARow({ label, reason }: { label: string; reason: string }) {
  return (
    <div
      style={{
        borderBottom: '1px solid #f1f5f9',
        padding: '5px 10px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        background: '#fafafa',
        borderLeft: '3px solid #e2e8f0',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '1px 5px',
          borderRadius: 3,
          background: '#f1f5f9',
          color: '#64748b',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0, paddingTop: 1 }}>— N/A</span>
      <span style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{reason}</span>
    </div>
  );
}

/**
 * Tabs — an accessible tablist (WS2 item 4; `variant` added in item 6).
 * =======================================================================
 *
 * Replaces the two identical local `SubTabBar` pill bars (CSS + XPath category
 * filters) that both panels defined. Same appearance, now with the full
 * WAI-ARIA tab pattern:
 *
 *   • container `role="tablist"` with an accessible name;
 *   • each pill `role="tab"`, `aria-selected`, `aria-controls` → the panel,
 *     and a roving tabIndex (selected = 0, the rest = -1) so the tablist is a
 *     single Tab stop;
 *   • ArrowRight / ArrowLeft (wrapping) + Home / End move focus AND selection
 *     (automatic activation — chosen because selecting a category only FILTERS
 *     an already-generated list, so it is cheap and matches click-to-select).
 *
 * The single content region these tabs control is marked with the props from
 * `tabPanelProps(idBase, active)` (`role="tabpanel"`, matching `id`, and
 * `aria-labelledby` → the active tab). Ids derive from a caller-supplied,
 * per-instance `idBase`, so two tablists never collide. Behaviour and DOM
 * interactions are pinned by `test/tabs.test.ts` (real happy-dom render).
 *
 * `variant` (item 6): the main Playwright/CSS/XPath strategy bar in both
 * panels is genuine tabs too, but its visual language is a full-width
 * underline-indicator segment bar, not a rounded pill/chip filter — swapping
 * it straight onto the existing pill styling would change its appearance.
 * Rather than a second Tabs component (explicitly out of scope), the ARIA
 * structure and keyboard handling below are shared unchanged, and only the
 * container/button CSS branches on `variant`:
 *   • `'pill'` (default) — byte-identical to the item-4 styling; both
 *     existing `SubTabBar` call sites are unaffected and need no changes.
 *   • `'underline'` — reproduces the main strategy bar's existing look
 *     (equal-width flex segments, 2px bottom-border indicator, no pill
 *     background) exactly, so its migration is a pure accessibility upgrade.
 * `TabItem.accent` (item 6): the main strategy bar uses a DIFFERENT accent
 * per tab (green/blue/amber), unlike the single-accent `SubTabBar` groups.
 * When a tab supplies its own `accent`, it overrides the group-level
 * `accent` prop for that tab only; existing `SubTabBar` callers never set
 * per-tab `accent`, so their rendering is unaffected.
 *
 * `TabItem.textColor` (item 9): `accent` plays two roles under `'underline'`
 * — the selected tab's TEXT colour (needs ≥4.5:1, WCAG AA normal text) and
 * the border-bottom indicator colour (only needs ≥3:1, WCAG 1.4.11 non-text).
 * Two of the three main-bar accents (`#16a34a` 3.30:1, `#d97706` 3.19:1) pass
 * the indicator bar but fail as text — the exact dual-role conflict flagged
 * in DL-49. `textColor`, when supplied, overrides ONLY the selected tab's
 * text colour; the border-bottom indicator always keeps using `accent`
 * unchanged, so the indicator's appearance never regresses. Optional and
 * additive: omitting it (every existing `SubTabBar` pill caller, and the
 * `'css'` main-bar tab whose accent already passes AA as text) falls back to
 * `accent`, so nothing else changes.
 */
export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Overrides the group-level `accent` for this tab only. Optional. */
  accent?: string;
  /** AA-safe text colour override for the selected tab under `'underline'`; falls back to `accent`. Optional. */
  textColor?: string;
}

/** ARIA attributes for the single panel a `Tabs` instance controls. */
export function tabPanelProps(idBase: string, activeId: string) {
  return {
    role: 'tabpanel' as const,
    id: `${idBase}-panel`,
    'aria-labelledby': `${idBase}-tab-${activeId}`,
  };
}

export function Tabs<T extends string>({
  tabs,
  active,
  onSelect,
  accent,
  idBase,
  ariaLabel,
  variant = 'pill',
}: {
  tabs: ReadonlyArray<TabItem<T>>;
  active: T;
  onSelect: (t: T) => void;
  /** Fallback accent for tabs that do not supply their own `TabItem.accent`. */
  accent?: string;
  idBase: string;
  ariaLabel: string;
  /** `'pill'` (default, item 4) or `'underline'` (item 6, main strategy bar). */
  variant?: 'pill' | 'underline';
}) {
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const i = tabs.findIndex((t) => t.id === active);
    if (i === -1) return;
    let ni = i;
    if (e.key === 'ArrowRight') ni = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') ni = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') ni = 0;
    else if (e.key === 'End') ni = tabs.length - 1;
    else return;
    e.preventDefault();
    const next = tabs[ni]!.id;
    onSelect(next);
    refs.current[next]?.focus();
  };

  const listStyle: CSSProperties =
    variant === 'underline'
      ? { display: 'flex', background: '#fff', borderBottom: '2px solid #e2e8f0', flexShrink: 0 }
      : {
          display: 'flex',
          gap: 4,
          padding: '6px 8px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          flexWrap: 'wrap',
        };

  return (
    <div role="tablist" aria-label={ariaLabel} style={listStyle}>
      {tabs.map((t) => {
        const selected = active === t.id;
        const tabAccent = t.accent ?? accent ?? '#2563eb';
        const buttonStyle: CSSProperties =
          variant === 'underline'
            ? {
                flex: 1,
                padding: '7px 4px',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                background: selected ? '#fff' : '#f8fafc',
                // item 9: text uses the AA-safe override when supplied; the
                // border-bottom indicator below always keeps the raw accent.
                color: selected ? (t.textColor ?? tabAccent) : '#64748b',
                borderBottom: selected ? `2px solid ${tabAccent}` : '2px solid transparent',
                marginBottom: -2,
              }
            : {
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 10px',
                border: 'none',
                borderRadius: 12,
                cursor: 'pointer',
                background: selected ? tabAccent : '#e2e8f0',
                color: selected ? '#fff' : '#475569',
                transition: 'background .15s',
              };
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            role="tab"
            id={`${idBase}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(t.id)}
            onKeyDown={onKeyDown}
            style={buttonStyle}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
