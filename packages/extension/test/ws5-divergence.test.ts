/**
 * WS5 — the seven measured divergences, resolved and pinned (DL-68).
 * ============================================================================
 * DL-67 re-measured Phase 0's "diverged in seven ways" symbol by symbol
 * instead of repeating the claim, and found seven real ones. The owner then
 * resolved D-a…D-d in favour of the Side Panel's richer existing behaviour
 * (O4), on the principle that a measured difference which is clearly drift —
 * not an intentional product distinction — unifies on the more actionable
 * side.
 *
 * These tests exist so the resolution cannot silently drift apart again. They
 * assert PRODUCT BEHAVIOUR through the shared modules wherever that is
 * possible, and fall back to composed-source guards (via the surface-source
 * helper, which follows a surface's real import closure) only where the thing
 * being protected genuinely is a wiring fact.
 */
import { describe, expect, it } from 'vitest';

import { ALL_GETBY_KINDS, LANGS, NO_ACTION } from '../src/ui/panel/constants';
import { getContextualActions, getDefaultAction } from '../src/ui/panel/contextual-actions';
import { eachSurface, eachSurfaceCode, sharedFiles, SURFACE_NAMES } from './helpers/surface-source';

import type { ElementAttributes } from '@playwright-guru/locator-engine';

const attrs = (over: Partial<ElementAttributes> = {}): ElementAttributes =>
  ({ tagName: 'div', ...over }) as ElementAttributes;

/** Every action `value` a given element offers. */
const values = (a: ElementAttributes | null) => getContextualActions(a).map((o) => o.value);
const hintFor = (a: ElementAttributes | null, value: string) =>
  getContextualActions(a).find((o) => o.value === value)?.hint;

// ─── D-a — one N/A copy, the fuller one, for both surfaces ──────────────────

describe('D-a · N/A reasons are one shared table, at the Side Panel level of help', () => {
  it('is declared once and composed by both surfaces', () => {
    const shared = sharedFiles();
    expect(shared, 'both surfaces must compose the shared constants module').toContain(
      'src/ui/panel/constants.ts',
    );
  });

  it('keeps the actionable half of every reason the Side Panel used to give', () => {
    const byKind = Object.fromEntries(ALL_GETBY_KINDS.map((k) => [k.kind, k.naReason]));
    // These are the exact fragments the DevTools copy had dropped (DL-67 D-a).
    expect(byKind.role).toMatch(/semantic HTML/);
    expect(byKind.label).toMatch(/label for=/);
    expect(byKind.placeholder).toMatch(/<textarea>/);
    expect(byKind.altText).toMatch(/input type="image"/);
    expect(byKind.title).toMatch(/assistive tech/);
    expect(byKind.testId).toMatch(/most stable locator/);
  });

  it('offers all seven kinds, in the product order', () => {
    expect(ALL_GETBY_KINDS.map((k) => k.kind)).toEqual([
      'role',
      'label',
      'placeholder',
      'text',
      'altText',
      'title',
      'testId',
    ]);
  });

  it('leaves no second N/A table behind in either surface', () => {
    for (const [name, source] of eachSurface()) {
      const declarations = source.match(/const ALL_GETBY_KINDS\b[^=]*=/g) ?? [];
      expect(declarations.length, `${name} must declare ALL_GETBY_KINDS exactly once`).toBe(1);
    }
  });
});

// ─── D-b — .dblclick() is a real capability, and it exists on both ──────────

describe('D-b · .dblclick() is offered by both surfaces', () => {
  it('offers it on a button element', () => {
    expect(values(attrs({ tagName: 'button' }))).toContain('dblclick');
  });

  it('offers it on a submit/button/reset input', () => {
    expect(values(attrs({ tagName: 'input', type: 'submit' }))).toContain('dblclick');
    expect(values(attrs({ tagName: 'input', type: 'button' }))).toContain('dblclick');
    expect(values(attrs({ tagName: 'input', type: 'reset' }))).toContain('dblclick');
  });

  it('offers it on an element with role=button', () => {
    expect(values(attrs({ tagName: 'span', role: 'button' }))).toContain('dblclick');
  });

  it('does NOT invent it where the Side Panel never offered it', () => {
    // Text inputs, selects, links, checkboxes and the no-attributes fallback
    // deliberately do not list it — unifying must not add product behaviour.
    expect(values(attrs({ tagName: 'input', type: 'text' }))).not.toContain('dblclick');
    expect(values(attrs({ tagName: 'select' }))).not.toContain('dblclick');
    expect(values(attrs({ tagName: 'a' }))).not.toContain('dblclick');
    expect(values(attrs({ tagName: 'input', type: 'checkbox' }))).not.toContain('dblclick');
    expect(values(null)).not.toContain('dblclick');
  });

  it('is a real codegen action, not a label with nothing behind it', async () => {
    const { ACTION_MAP } = await import('../src/ui/actions');
    expect(ACTION_MAP.dblclick).toEqual([
      '.dblclick()',
      '.dblclick()',
      '.dblclick()',
      '.DblClickAsync()',
    ]);
  });

  it('is offered through one shared table, composed by both surfaces', () => {
    expect(sharedFiles()).toContain('src/ui/panel/contextual-actions.ts');
    for (const [name, source] of eachSurface()) {
      const declarations = source.match(/function getContextualActions\b/g) ?? [];
      expect(declarations.length, `${name} must declare it exactly once`).toBe(1);
    }
  });
});

// ─── D-c — the fuller hint copy wins ────────────────────────────────────────

describe('D-c · action hints keep the Side Panel wording on both surfaces', () => {
  it('keeps the explanatory hints DevTools had truncated', () => {
    expect(hintFor(null, 'click')).toBe('Clicks the element');
    expect(hintFor(attrs({ tagName: 'input', type: 'radio' }), 'check')).toBe(
      'Selects this option',
    );
    expect(hintFor(attrs({ tagName: 'input', type: 'radio' }), 'click')).toBe('Clicks to select');
    expect(hintFor(attrs({ tagName: 'input', type: 'submit' }), 'click')).toBe('Clicks the button');
    expect(hintFor(attrs({ tagName: 'select' }), 'selectOption')).toBe(
      "Selects a dropdown option — replace '' with value",
    );
    expect(hintFor(attrs({ tagName: 'input', type: 'text' }), 'fill')).toBe(
      'Clears and types new text',
    );
    expect(hintFor(attrs({ tagName: 'input', type: 'text' }), 'click')).toBe('Focuses field');
    expect(hintFor(attrs({ tagName: 'input', type: 'text' }), 'press')).toBe('Sends keyboard key');
    expect(hintFor(attrs({ tagName: 'a' }), 'hover')).toBe('Hovers for menu triggers');
    expect(hintFor(attrs({ tagName: 'div' }), 'waitFor')).toBe('Waits until visible');
  });

  it('keeps "No action" first and hint-free everywhere', () => {
    expect(NO_ACTION).toEqual({ label: 'No action', value: 'none', hint: '' });
    for (const a of [
      null,
      attrs({ tagName: 'button' }),
      attrs({ tagName: 'a' }),
      attrs({ tagName: 'select' }),
      attrs({ tagName: 'input', type: 'checkbox' }),
      attrs({ tagName: 'input', type: 'text' }),
    ]) {
      expect(getContextualActions(a)[0]).toBe(NO_ACTION);
    }
  });

  it('still picks the same default action per element as before', () => {
    expect(getDefaultAction(attrs({ tagName: 'input', type: 'checkbox' }))).toBe('check');
    expect(getDefaultAction(attrs({ tagName: 'input', type: 'radio' }))).toBe('check');
    expect(getDefaultAction(attrs({ tagName: 'select' }))).toBe('selectOption');
    expect(getDefaultAction(attrs({ tagName: 'input' }))).toBe('fill');
    expect(getDefaultAction(attrs({ tagName: 'textarea' }))).toBe('fill');
    expect(getDefaultAction(attrs({ tagName: 'button' }))).toBe('click');
    expect(getDefaultAction(attrs({ tagName: 'a' }))).toBe('click');
    expect(getDefaultAction(attrs({ tagName: 'div' }))).toBe('none');
  });

  it('every offered action has a hint except "none"', () => {
    for (const a of [null, attrs({ tagName: 'button' }), attrs({ tagName: 'select' })]) {
      for (const option of getContextualActions(a)) {
        if (option.value === 'none') expect(option.hint).toBe('');
        else expect(option.hint.length, `${option.value} must explain itself`).toBeGreaterThan(0);
      }
    }
  });
});

// ─── D-d — CSSRow honours a pre-computed code on both surfaces ──────────────

describe('D-d · CSSRow uses a pre-computed variant code when one is supplied', () => {
  it('is one shared component composed by both surfaces', () => {
    expect(sharedFiles()).toContain('src/ui/panel/rows.tsx');
    for (const [name, source] of eachSurface()) {
      expect((source.match(/function CSSRow\b/g) ?? []).length, `${name}`).toBe(1);
    }
  });

  it('keeps the pre-computed branch rather than always regenerating', async () => {
    const rows = await import('../src/ui/panel/rows');
    expect(typeof rows.CSSRow).toBe('function');
    const { readExtFile } = await import('./helpers/surface-source');
    // The branch itself is the behaviour: `variant.code ?? toLocatorCode(...)`.
    expect(readExtFile('src/ui/panel/rows.tsx')).toMatch(/variant\.code\s*\?\?\s*toLocatorCode\(/);
  });
});

// ─── D-g — one runtime-messaging seam ───────────────────────────────────────

describe('D-g · both surfaces send runtime messages through the same seam', () => {
  it('neither surface calls chrome.runtime.sendMessage any more', () => {
    for (const [name, source] of eachSurfaceCode()) {
      expect(source, `${name} must not use chrome.runtime.sendMessage`).not.toMatch(
        /chrome\.runtime\.sendMessage/,
      );
    }
  });

  it('DevTools keeps its legitimate chrome.devtools APIs', async () => {
    const { readExtFile } = await import('./helpers/surface-source');
    const panel = readExtFile('src/browser/pick-source.ts');
    expect(panel).toMatch(/chrome\.devtools\.inspectedWindow/);
    expect(panel).toMatch(/chrome\.devtools\.panels\.elements\.onSelectionChanged/);
  });

  it('introduces no CommandBus implementation (DL-54 stays locked)', () => {
    for (const [name, source] of eachSurfaceCode()) {
      expect(source, `${name} must not implement a CommandBus`).not.toMatch(
        /implements\s+CommandBus|:\s*CommandBus\b|createCommandBus/,
      );
    }
  });

  it('keeps normalizeAck on every ack path', async () => {
    const { readExtFile } = await import('./helpers/surface-source');
    expect(readExtFile('src/browser/runtime.ts')).toContain('normalizeAck');
  });
});

// ─── The unification is real, not two copies that happen to agree ───────────

describe('the two surfaces genuinely share one implementation', () => {
  it('shares every panel presentation module', () => {
    const shared = sharedFiles();
    for (const f of [
      'src/ui/panel/types.ts',
      'src/ui/panel/constants.ts',
      'src/ui/panel/contextual-actions.ts',
      'src/ui/panel/rows.tsx',
      'src/ui/panel/RecommendedCard.tsx',
      'src/ui/panel/PanelFrame.tsx',
      'src/ui/panel/CodeWorkspace.tsx',
      'src/ui/panel/VerifySelectorCard.tsx',
    ]) {
      expect(shared, `both surfaces must compose ${f}`).toContain(f);
    }
  });

  it('declares each shared leaf exactly once per composed surface', () => {
    for (const name of SURFACE_NAMES) {
      const [, source] = eachSurface().find(([n]) => n === name)!;
      for (const symbol of ['LocatorRow', 'XPathRow', 'CSSRow', 'RecommendedCard']) {
        const declarations = source.match(new RegExp(`function ${symbol}\\b`, 'g')) ?? [];
        expect(declarations.length, `${name} must declare ${symbol} once`).toBe(1);
      }
    }
  });

  it('keeps the five languages identical and in one place', () => {
    expect(LANGS.map((l) => l.value)).toEqual([
      'typescript',
      'javascript',
      'python_sync',
      'java',
      'csharp_async',
    ]);
    for (const [name, source] of eachSurface()) {
      expect((source.match(/const LANGS\b/g) ?? []).length, `${name}`).toBe(1);
    }
  });
});
