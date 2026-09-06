// @vitest-environment happy-dom
/**
 * WS5 — the extracted leaves render, for real, with real props.
 * ============================================================================
 * DL-54/DL-55 deferred the leaf-first extraction as unprovable, recording that
 * this repository has no real-Chromium/e2e regression infrastructure. That is
 * still true. What DL-67 found is that it is not the whole truth: `tabs.test.ts`
 * and `showcase.test.ts` already render real components into a per-file
 * happy-dom document via `react-dom/client` + `act`, with R3's project-wide
 * `environment: 'node'` untouched. This file follows that precedent for the
 * components WS5 moves out of the two entrypoints.
 *
 * EVIDENCE BOUNDARY, stated once and meant literally: happy-dom is NOT
 * Chromium. These tests prove that a component mounts and puts the expected
 * structure and text into a DOM for given props. They prove nothing about real
 * layout, real CSS, real accessibility-tree computation, real Chrome DevTools
 * APIs or real extension storage. Those remain unproven here (F14).
 */
import { StrictMode, act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionStrip } from '../src/ui/panel/ActionStrip';
import { CodeWorkspace } from '../src/ui/panel/CodeWorkspace';
import { ElementHtml } from '../src/ui/panel/ElementHtml';
import { RecommendedCard } from '../src/ui/panel/RecommendedCard';
import { CSSRow, LocatorRow, XPathRow } from '../src/ui/panel/rows';
import { VerifySelectorCard } from '../src/ui/panel/VerifySelectorCard';
import { getContextualActions } from '../src/ui/panel/contextual-actions';

import type { Recommendation, ScoredCandidate } from '@playwright-guru/locator-engine';
import type { CSSVariant, XPathVariant } from '../utils/css-xpath';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (node: React.ReactElement) => {
  act(() => root.render(createElement(StrictMode, null, node)));
};

const candidate = (over: Partial<ScoredCandidate> = {}): ScoredCandidate =>
  ({
    step: { kind: 'role', role: 'button', name: 'Save' },
    uniqueCount: 1,
    totalCount: 1,
    ...over,
  }) as ScoredCandidate;

// ─── Rows ───────────────────────────────────────────────────────────────────

describe('LocatorRow', () => {
  it('renders the strategy label, the badge and the generated code', () => {
    render(
      createElement(LocatorRow, {
        candidate: candidate(),
        code: "page.getByRole('button', { name: 'Save' })",
        action: 'none',
        lang: 'typescript',
        onAdd: () => {},
      }),
    );
    expect(host.textContent).toContain('getByRole');
    expect(host.textContent).toContain("page.getByRole('button', { name: 'Save' })");
    expect(host.querySelector('code')).not.toBeNull();
  });

  it('marks a safely-unique candidate differently from an ambiguous one', () => {
    render(
      createElement(LocatorRow, {
        candidate: candidate({ uniqueCount: 1, totalCount: 1 } as never),
        code: 'x',
        action: 'none',
        lang: 'typescript',
        onAdd: () => {},
      }),
    );
    const unique = host.firstElementChild!.getAttribute('style') ?? '';
    act(() => root.unmount());
    root = createRoot(host);
    render(
      createElement(LocatorRow, {
        candidate: candidate({ uniqueCount: 3, totalCount: 3 } as never),
        code: 'x',
        action: 'none',
        lang: 'typescript',
        onAdd: () => {},
      }),
    );
    const many = host.firstElementChild!.getAttribute('style') ?? '';
    expect(unique).not.toBe(many);
  });

  it('hands the exact code to onAdd', () => {
    const onAdd = vi.fn();
    render(
      createElement(LocatorRow, {
        candidate: candidate(),
        code: 'CODE',
        action: 'none',
        lang: 'typescript',
        onAdd,
      }),
    );
    const add = Array.from(host.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Code'),
    );
    expect(add, 'the row must offer an add-to-workspace control').toBeTruthy();
    act(() => add!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onAdd).toHaveBeenCalledWith('CODE');
  });
});

describe('CSSRow', () => {
  const variant = (over: Partial<CSSVariant & { code?: string }> = {}) =>
    ({
      selector: '#save',
      description: 'By id',
      stability: 'high',
      subTab: 'core',
      ...over,
    }) as CSSVariant & { code?: string };

  it('renders the stability hint, the description and the selector', () => {
    render(
      createElement(CSSRow, {
        variant: variant(),
        lang: 'typescript',
        action: 'none',
        onAdd: () => {},
      }),
    );
    expect(host.textContent).toContain('By id');
    expect(host.textContent).toContain('#save');
  });

  it('D-d · prefers a pre-computed code over regenerating one', () => {
    render(
      createElement(CSSRow, {
        variant: variant({ code: 'PRECOMPUTED' }),
        lang: 'typescript',
        action: 'none',
        onAdd: () => {},
      }),
    );
    expect(host.textContent).toContain('PRECOMPUTED');
  });

  it('falls back to generating one when none is supplied', () => {
    render(
      createElement(CSSRow, {
        variant: variant(),
        lang: 'typescript',
        action: 'none',
        onAdd: () => {},
      }),
    );
    expect(host.textContent).toContain('page.locator');
  });
});

describe('XPathRow', () => {
  it('renders the xpath through the locator wrapper', () => {
    render(
      createElement(XPathRow, {
        variant: {
          xpath: '//button[@id="save"]',
          description: 'By id',
          stability: 'high',
          subTab: 'core',
        } as XPathVariant,
        lang: 'typescript',
        action: 'none',
        onAdd: () => {},
      }),
    );
    expect(host.textContent).toContain('//button[@id="save"]');
    expect(host.textContent).toContain('By id');
  });
});

// ─── RecommendedCard ────────────────────────────────────────────────────────

describe('RecommendedCard', () => {
  const rec = (over: Partial<Recommendation> = {}): Recommendation =>
    ({
      verdict: 'excellent',
      candidate: candidate(),
      alternative: null,
      rationales: [],
      reasonUnavailable: null,
      ...over,
    }) as Recommendation;

  it('renders the recommended code when the engine produced one', () => {
    render(
      createElement(RecommendedCard, {
        rec: rec(),
        code: 'RECOMMENDED',
        altCode: null,
        action: 'none',
        lang: 'typescript',
        onAdd: () => {},
      }),
    );
    expect(host.textContent).toContain('RECOMMENDED');
    expect(host.textContent).toContain('getByRole');
  });

  it('explains itself, without any green claim, when there is no candidate', () => {
    render(
      createElement(RecommendedCard, {
        rec: rec({ candidate: null, reasonUnavailable: 'no-candidates' } as never),
        code: null,
        altCode: null,
        action: 'none',
        lang: 'typescript',
        onAdd: () => {},
      }),
    );
    expect(host.textContent!.length).toBeGreaterThan(0);
    expect(host.innerHTML).not.toContain('#dcfce7');
  });

  it('renders the alternative only when both the candidate and its code exist', () => {
    render(
      createElement(RecommendedCard, {
        rec: rec({ alternative: candidate({ step: { kind: 'testId', testId: 'save' } } as never) }),
        code: 'MAIN',
        altCode: 'ALTERNATIVE',
        action: 'none',
        lang: 'typescript',
        onAdd: () => {},
      }),
    );
    expect(host.textContent).toContain('ALTERNATIVE');
  });
});

// ─── ActionStrip ────────────────────────────────────────────────────────────

describe('ActionStrip', () => {
  const attrs = { tagName: 'input', type: 'text' } as never;

  it('lists exactly the actions the element supports', () => {
    render(
      createElement(ActionStrip, {
        attributes: attrs,
        actions: getContextualActions(attrs),
        actionMode: 'none',
        onSelect: () => {},
      }),
    );
    const options = Array.from(host.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toContain('No action');
    expect(options).toContain(".fill('')");
    expect(options).not.toContain('.dblclick()');
  });

  it('offers .dblclick() on a button, on both surfaces (D-b)', () => {
    const button = { tagName: 'button' } as never;
    render(
      createElement(ActionStrip, {
        attributes: button,
        actions: getContextualActions(button),
        actionMode: 'none',
        onSelect: () => {},
      }),
    );
    expect(Array.from(host.querySelectorAll('option')).map((o) => o.textContent)).toContain(
      '.dblclick()',
    );
  });

  it('shows the hint for the selected action (D-c)', () => {
    render(
      createElement(ActionStrip, {
        attributes: attrs,
        actions: getContextualActions(attrs),
        actionMode: 'fill',
        onSelect: () => {},
      }),
    );
    expect(host.textContent).toContain('Clears and types new text');
  });

  it('names the element it is acting on', () => {
    render(
      createElement(ActionStrip, {
        attributes: attrs,
        actions: getContextualActions(attrs),
        actionMode: 'none',
        onSelect: () => {},
      }),
    );
    expect(host.textContent).toContain('<input[text]>');
  });
});

// ─── CodeWorkspace ──────────────────────────────────────────────────────────

describe('CodeWorkspace', () => {
  const props = (over: Record<string, unknown> = {}) => ({
    lines: ['one', 'two'],
    canUndo: true,
    copyState: 'idle' as const,
    copyFailure: '',
    onCopyAll: () => {},
    onUndo: () => {},
    onClear: () => {},
    onRemove: () => {},
    ...over,
  });

  it('renders one numbered row per line', () => {
    render(createElement(CodeWorkspace, props()));
    expect(host.textContent).toContain('one');
    expect(host.textContent).toContain('two');
    expect(host.textContent).toContain('2 lines');
  });

  it('uses the singular for a single line', () => {
    render(createElement(CodeWorkspace, props({ lines: ['only'] })));
    expect(host.textContent).toContain('1 line');
    expect(host.textContent).not.toContain('1 lines');
  });

  it('invites the user rather than showing an empty box', () => {
    render(createElement(CodeWorkspace, props({ lines: [] })));
    expect(host.textContent).toContain('+ Code');
  });

  it('gives every remove button an accessible name', () => {
    render(createElement(CodeWorkspace, props()));
    const removes = Array.from(host.querySelectorAll('button[aria-label]')).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(removes).toContain('Remove line 1 from the code buffer');
    expect(removes).toContain('Remove line 2 from the code buffer');
  });

  it('removes by index', () => {
    const onRemove = vi.fn();
    render(createElement(CodeWorkspace, props({ onRemove })));
    const second = host.querySelector('button[aria-label="Remove line 2 from the code buffer"]')!;
    act(() => second.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('disables Copy All, Undo and Clear when there is nothing to act on', () => {
    render(createElement(CodeWorkspace, props({ lines: [], canUndo: false })));
    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    expect(buttons.every((b) => b.hasAttribute('disabled'))).toBe(true);
  });

  it('reports a copy failure on the control that failed', () => {
    render(createElement(CodeWorkspace, props({ copyState: 'failed', copyFailure: 'denied' })));
    expect(host.textContent).toContain('Copy failed');
    expect(host.querySelector('button[title="denied"]')).not.toBeNull();
  });
});

// ─── ElementHtml ────────────────────────────────────────────────────────────

describe('ElementHtml', () => {
  it('renders the markup as text, never as HTML', () => {
    render(createElement(ElementHtml, { html: '<button id="save">Save</button>' }));
    expect(host.textContent).toContain('<button id="save">Save</button>');
    expect(host.querySelector('button#save')).toBeNull();
  });

  it('renders nothing at all when there is no markup', () => {
    render(createElement(ElementHtml, { html: undefined }));
    expect(host.textContent).toBe('');
  });
});

// ─── VerifySelectorCard ─────────────────────────────────────────────────────

describe('VerifySelectorCard', () => {
  const base = {
    value: '',
    onChange: () => {},
    onVerify: () => {},
    busy: false,
    outcome: null,
    verifyExpression: async () => ({ status: 'unverifiable' as const, expression: '' }) as never,
  };

  it('names its icon-only verify button (WS8)', () => {
    render(createElement(VerifySelectorCard, base));
    expect(
      host.querySelector('button[aria-label="Verify selector against the page"]'),
    ).not.toBeNull();
  });

  it('reports a measured unique match plainly', () => {
    render(
      createElement(VerifySelectorCard, {
        ...base,
        outcome: { count: 1, visibleCount: 1 },
      }),
    );
    expect(host.textContent).toContain('1 visible element matched');
  });

  it('discloses hidden matches rather than reporting only the visible count', () => {
    render(
      createElement(VerifySelectorCard, {
        ...base,
        outcome: { count: 3, visibleCount: 1 },
      }),
    );
    expect(host.textContent).toContain('3 total');
    expect(host.textContent).toContain('2 hidden');
  });

  it('renders the WS8 error matrix for an unmeasurable outcome, keeping the detail', () => {
    render(
      createElement(VerifySelectorCard, {
        ...base,
        outcome: { count: -1, error: 'bad selector', verifyStatus: 'invalid' as const },
      }),
    );
    expect(host.textContent).toContain('bad selector');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('calls onVerify on Enter', () => {
    const onVerify = vi.fn();
    render(createElement(VerifySelectorCard, { ...base, onVerify }));
    const input = host.querySelector('input')!;
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onVerify).toHaveBeenCalled();
  });
});
