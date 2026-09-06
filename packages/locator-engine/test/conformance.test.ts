/**
 * Playwright conformance.
 *
 * Guru's positioning is "Playwright-native locator intelligence". That is a
 * falsifiable claim, and this suite is what makes it checkable: for every
 * fixture, Guru's computed role must equal the role **real Playwright actually
 * assigned** to the same element in a real browser.
 *
 * The expectations are not written by hand. `conformance/refresh-golden.mjs`
 * drives an actual Playwright against an actual Chromium, records what it
 * observed, and writes `conformance/playwright-golden.json`. This suite reads
 * only that file, so it needs no browser and stays fast and deterministic —
 * while the evidence behind it is genuinely Playwright's own behaviour.
 *
 * The golden records the Playwright version it came from. If Playwright changes
 * these semantics in a future release, regenerating produces a visible diff
 * rather than silently moving the goalposts.
 *
 * What this suite deliberately does NOT do: import Playwright into the
 * extension. The conformance machinery is development-only; the shipped bundle
 * never grows by a byte because of it.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveRole } from '../src/accessibility';
import type { ElementAttributes } from '../src/types';

interface RoleRecord {
  html: string;
  attrs: Record<string, unknown>;
  playwrightRoles: string[];
  playwrightRole: string | null;
  ambiguous: boolean;
}

interface LabelRecord {
  label: string;
  query: string;
  matchesDefault: boolean;
  matchesExact: boolean;
}

interface Golden {
  playwrightVersion: string;
  roles: Record<string, RoleRecord>;
  labels: Record<string, LabelRecord>;
}

const golden = JSON.parse(
  readFileSync(resolve(__dirname, 'conformance/playwright-golden.json'), 'utf8'),
) as Golden;

describe('Playwright conformance — recorded evidence', () => {
  it('was generated from a real Playwright release', () => {
    expect(golden.playwrightVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(Object.keys(golden.roles).length).toBeGreaterThan(30);
    expect(Object.keys(golden.labels).length).toBeGreaterThan(5);
  });
});

// ─── Role fidelity ──────────────────────────────────────────────────────────

describe(`implicit role matches Playwright ${golden.playwrightVersion}`, () => {
  for (const [name, record] of Object.entries(golden.roles)) {
    it(`${name} → ${record.playwrightRole ?? 'no role'}`, () => {
      // resolveRole is what scorer.ts and engine.ts call, so this tests the
      // production path rather than a helper beside it.
      const actual = resolveRole(record.attrs as unknown as ElementAttributes);
      expect(
        actual,
        `Playwright assigned "${record.playwrightRole}" to ${record.html} — Guru said "${actual}"`,
      ).toBe(record.playwrightRole);
    });
  }
});

// ─── The specific defects this milestone closes ─────────────────────────────

describe('defects closed by Stage 2, pinned individually', () => {
  const roleOf = (attrs: Partial<ElementAttributes>): string | null =>
    resolveRole(attrs as ElementAttributes);

  it('N-1 — input[type=file] is a button, not a textbox', () => {
    expect(roleOf({ tagName: 'input', type: 'file' })).toBe('button');
    expect(golden.roles['input type=file (N-1)'].playwrightRole).toBe('button');
  });

  it('N-2 — a datalist-backed text input is a combobox', () => {
    expect(roleOf({ tagName: 'input', type: 'text', list: 'l', listIsDatalist: true })).toBe(
      'combobox',
    );
    expect(roleOf({ tagName: 'input', type: 'email', list: 'l', listIsDatalist: true })).toBe(
      'combobox',
    );
  });

  it('N-2 — a `list` pointing at something that is not a datalist changes nothing', () => {
    // Playwright resolves the reference before deciding. So must Guru.
    expect(roleOf({ tagName: 'input', type: 'text', list: 'l', listIsDatalist: false })).toBe(
      'textbox',
    );
  });

  it('N-2 — search + datalist is a combobox, not a searchbox', () => {
    expect(roleOf({ tagName: 'input', type: 'search', list: 'l', listIsDatalist: true })).toBe(
      'combobox',
    );
    expect(roleOf({ tagName: 'input', type: 'search' })).toBe('searchbox');
  });

  it('E5 — date, time, month, week and datetime-local are textboxes', () => {
    for (const type of ['date', 'time', 'month', 'week', 'datetime-local']) {
      expect(roleOf({ tagName: 'input', type }), type).toBe('textbox');
    }
  });

  it('E5 — a multi-select is a listbox, a single select is a combobox', () => {
    expect(roleOf({ tagName: 'select' })).toBe('combobox');
    expect(roleOf({ tagName: 'select', size: 1 })).toBe('combobox');
    expect(roleOf({ tagName: 'select', multiple: true })).toBe('listbox');
    expect(roleOf({ tagName: 'select', size: 4 })).toBe('listbox');
  });

  it('E6 — remains closed: a password input IS a textbox in Playwright', () => {
    // Recorded from Playwright itself, not asserted from the ARIA spec. The
    // original E6 premise was that getByRole('textbox') would not find this.
    // It does. Guru must not "fix" correct behaviour.
    expect(golden.roles['input type=password (E6 — must remain textbox)'].playwrightRole).toBe(
      'textbox',
    );
    expect(roleOf({ tagName: 'input', type: 'password' })).toBe('textbox');
  });
});

// ─── getByLabel matching semantics (E2) ─────────────────────────────────────

describe('getByLabel default matching, as Playwright actually performs it', () => {
  it('is case-insensitive substring, not equality', () => {
    // The evidence, straight from the golden: every one of these matches by
    // default, and only the whitespace-equivalent ones match with exact:true.
    expect(golden.labels['different case'].matchesDefault).toBe(true);
    expect(golden.labels['different case'].matchesExact).toBe(false);
    expect(golden.labels['substring'].matchesDefault).toBe(true);
    expect(golden.labels['substring, wrong case'].matchesDefault).toBe(true);
    expect(golden.labels['non-matching'].matchesDefault).toBe(false);
  });

  it('trims and collapses whitespace on both sides of the comparison', () => {
    expect(golden.labels['surrounding whitespace in the label'].matchesExact).toBe(true);
    expect(golden.labels['inner whitespace collapsed'].matchesExact).toBe(true);
    expect(golden.labels['query with surrounding whitespace'].matchesDefault).toBe(true);
  });
});

// ─── The divergence WS5 closed ──────────────────────────────────────────────

describe('every surface resolves roles through this engine (E3 — closed by WS5)', () => {
  /**
   * Stage 2 recorded that the DevTools panel carried its OWN role inference
   * inside an `inspectedWindow.eval` payload, wrong on 17 of these 39 fixtures,
   * and pinned that number with a ratchet so it could shrink but never grow.
   *
   * WS5 deleted the payload rather than patching it: the panel now asks the
   * content script, which uses `resolveRole`. The ratchet was retired with the
   * duplicate it guarded, and the architectural assertion that replaces it
   * lives in `extension/test/devtools-architecture.test.ts`, where it can read
   * the panel source without inverting the dependency direction.
   *
   * What remains here is the claim that matters to this package: the engine
   * itself agrees with real Playwright on every recorded fixture, so a surface
   * that consumes it inherits that correctness instead of re-deriving it.
   */
  it('agrees with recorded Playwright on every role fixture', () => {
    for (const [name, record] of Object.entries(golden.roles)) {
      expect(resolveRole(record.attrs as unknown as ElementAttributes), name).toBe(
        record.playwrightRole,
      );
    }
  });

  it('covers the fixtures the DevTools duplicate used to get wrong', () => {
    // input[type=file] → button, datalist → combobox, select[multiple] →
    // listbox: the Stage 2 corrections the old eval never received.
    for (const name of [
      'input type=file (N-1)',
      'input type=text with datalist (N-2)',
      'select multiple (E5)',
    ]) {
      expect(golden.roles[name], `${name} must stay in the corpus`).toBeDefined();
    }
  });
});
