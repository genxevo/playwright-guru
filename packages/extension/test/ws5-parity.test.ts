// @vitest-environment happy-dom
/**
 * WS5 exit criterion 5 — "both surfaces produce byte-identical snapshots for
 * identical input", tested at the byte level rather than asserted.
 * ============================================================================
 * DL-67 classified this criterion as GREEN only at STRUCTURAL evidence: one
 * `capturePick` serves the picker path and `PICK_DEVTOOLS_TARGET`, and
 * `devtools-architecture.test.ts` pins that they are the same function. That is
 * a strong argument — identical code on identical input must produce identical
 * output — but it is an argument, and the criterion says "byte-identical". This
 * file measures it.
 *
 * Two things are compared:
 *   1. THE SNAPSHOT. `capturePick` is called twice on the same element and the
 *      two results are compared as serialized bytes. This is the criterion's
 *      own subject: the `StoredPick` both surfaces receive.
 *   2. THE RENDER. Both surfaces now compose the same `PanelFrame` from the
 *      same shared components, so the same pick must produce the same DOM. The
 *      surface-specific parts (header control, status text, empty state) are
 *      supplied as props and are deliberately allowed to differ; everything
 *      below the header is compared byte for byte.
 *
 * EVIDENCE BOUNDARY: happy-dom is not Chromium, and this measures the code, not
 * Chrome. What it forecloses is the failure that actually happened before —
 * two implementations of the same view drifting apart unnoticed.
 */
import { StrictMode, act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { capturePick } from '../src/runtime/capture';
import { PanelFrame } from '../src/ui/panel/PanelFrame';
import { getContextualActions, resolveAction } from '../src/ui/panel/contextual-actions';
import { setBody } from './helpers/dom-fixture';

import type { PanelController } from '../src/hooks/usePanel';
import type { StoredPick } from '../utils/messaging';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ─── 1. The snapshot itself ─────────────────────────────────────────────────

describe('one capture path, byte-identical output for identical input', () => {
  it('produces byte-identical StoredPick bytes for the same element, twice', () => {
    setBody(
      '<form><label for="e">Email</label><input id="e" placeholder="you@example.com" /></form>',
    );
    const el = document.getElementById('e')!;

    const first = capturePick(el).stored as unknown as Record<string, unknown>;
    const second = capturePick(el).stored as unknown as Record<string, unknown>;

    // MEASURED, AND WORTH STATING PRECISELY. Two captures of the same element
    // differ in exactly ONE byte range: `timestamp`, which is `Date.now()` at
    // capture. That is a property of WHEN a snapshot was taken, not of WHICH
    // surface took it — both surfaces read it from the same line of the same
    // function — so the criterion is measured with it excluded, and the
    // exclusion is proven to be the only one needed.
    const { timestamp: t1, ...restFirst } = first;
    const { timestamp: t2, ...restSecond } = second;
    expect(JSON.stringify(restSecond)).toBe(JSON.stringify(restFirst));
    expect(Buffer.byteLength(JSON.stringify(restSecond), 'utf8')).toBe(
      Buffer.byteLength(JSON.stringify(restFirst), 'utf8'),
    );
    expect(typeof t1).toBe('number');
    expect(typeof t2).toBe('number');

    // Not vacuous: the snapshot has to actually carry the element's facts.
    expect(JSON.stringify(restFirst)).toContain('placeholder');
    expect(Object.keys(restFirst)).toContain('candidates');
  });

  it('is the same for a button, a link and a checkbox — no per-kind divergence', () => {
    setBody(
      '<div><button id="b">Save</button><a id="a" href="/x">Docs</a>' +
        '<input id="c" type="checkbox" /></div>',
    );
    const withoutTimestamp = (el: Element) => {
      const { timestamp: _t, ...rest } = capturePick(el).stored as unknown as Record<
        string,
        unknown
      >;
      return JSON.stringify(rest);
    };
    for (const id of ['b', 'a', 'c']) {
      const el = document.getElementById(id)!;
      expect(withoutTimestamp(el)).toBe(withoutTimestamp(el));
    }
  });

  it('exposes exactly one pick builder for both surfaces to call', async () => {
    const { readExtFile } = await import('./helpers/surface-source');
    const capture = readExtFile('src/runtime/capture.ts');
    expect((capture.match(/export function capturePick/g) ?? []).length).toBe(1);
  });
});

// ─── 2. The render ──────────────────────────────────────────────────────────

const PICK: StoredPick = {
  attributes: {
    tagName: 'button',
    id: 'save',
    innerText: 'Save',
    role: 'button',
  },
  chain: { steps: [] },
  candidates: [
    {
      step: { kind: 'role', role: 'button', name: 'Save' },
      uniqueCount: 1,
      totalCount: 1,
    },
    {
      step: { kind: 'text', text: 'Save' },
      uniqueCount: 1,
      totalCount: 1,
    },
  ],
  outerHtml: '<button id="save">Save</button>',
} as unknown as StoredPick;

/** A controller with the SAME pick, workspace and language for both surfaces. */
function controllerFor(): PanelController {
  const actions = getContextualActions(PICK.attributes);
  const { effective, definition } = resolveAction(actions, 'none');
  return {
    pick: { pick: PICK, tabId: 7, busy: false, sourceError: null, requestPick: () => {} },
    lang: 'typescript',
    setLang: () => {},
    workspace: {
      lines: ['await page.getByRole("button", { name: "Save" }).click();'],
      canUndo: true,
      writeFailed: false,
      append: () => {},
      removeAt: () => {},
      clear: () => {},
      undo: () => {},
    },
    copy: { copyState: 'idle', copyFailure: '', copyAll: () => {} },
    verify: {
      input: '',
      setInput: () => {},
      outcome: null,
      busy: false,
      verify: () => {},
      verifyExpression: async () => ({ status: 'unverifiable', expression: '' }) as never,
    },
    action: { actions, actionMode: 'none', setActionMode: () => {}, effective, definition },
    tabs: {
      mainTab: 'playwright',
      setMainTab: () => {},
      cssSubTab: 'core',
      setCssSubTab: () => {},
      xpathSubTab: 'core',
      setXpathSubTab: () => {},
    },
    derived: {
      byKind: new Map([['role', [PICK.candidates[0]!]]]),
      cssVariants: [],
      xpathVariants: [],
      cssSuggested: '#save',
      xpathSuggested: '//button[@id="save"]',
      recommendation: {
        verdict: 'excellent',
        candidate: PICK.candidates[0]!,
        alternative: null,
        rationales: [],
        reasonUnavailable: null,
      } as never,
      recCode: "page.getByRole('button', { name: 'Save' })",
      altCode: null,
      genCode: () => "page.getByRole('button', { name: 'Save' })",
    },
    errorCode: null,
    raiseError: () => {},
    clearError: () => {},
  };
}

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

/** Render one surface and return its markup, minus the surface-specific header. */
function renderSurface(leadingLabel: string, statusText: string, icon: string): string {
  act(() =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(PanelFrame, {
          controller: controllerFor(),
          leading: createElement('button', null, leadingLabel),
          status: { text: statusText, tone: 'info' as const },
          empty: { icon, title: 'nothing', hint: 'nothing' },
        }),
      ),
    ),
  );
  const shell = host.firstElementChild!;
  // Drop the header (surface-specific control) and the status line; everything
  // after them is the product, and the product must be identical.
  //
  // React's `useId` values (`:r1:`, `:r3:`, …) are normalised away: they come
  // from a per-mount counter, so two mounts of the SAME surface differ in them
  // too. They say nothing about parity, and pinning them would make this test
  // fail on mount order rather than on divergence.
  return Array.from(shell.children)
    .slice(2)
    .map((n) => n.outerHTML)
    .join('')
    .replace(/:r[0-9a-z]+:/g, ':rN:');
}

describe('the same pick renders the same product on both surfaces', () => {
  it('produces byte-identical markup below the surface-specific header', () => {
    const sidePanel = renderSurface('Inspect', 'picked', '🎯');
    act(() => root.unmount());
    root = createRoot(host);
    const devtools = renderSurface('Re-evaluate', 'selected', '🔍');

    expect(devtools).toBe(sidePanel);
    expect(Buffer.byteLength(devtools, 'utf8')).toBe(Buffer.byteLength(sidePanel, 'utf8'));
  });

  it('is not vacuous — the compared markup really is the product', () => {
    const markup = renderSurface('Inspect', 'picked', '🎯');
    expect(markup).toContain('getByRole');
    expect(markup).toContain('Verify Selector');
    expect(markup).toContain('CODE');
    expect(markup).toContain('ALL 7 PLAYWRIGHT LOCATOR TYPES');
    expect(Buffer.byteLength(markup, 'utf8')).toBeGreaterThan(2000);
  });

  it('renders one workspace, with the same lines, on both', () => {
    const markup = renderSurface('Inspect', 'picked', '🎯');
    expect(markup).toContain('page.getByRole');
    expect(markup).toContain('1 line');
    expect(markup).not.toContain('1 lines');
  });
});
