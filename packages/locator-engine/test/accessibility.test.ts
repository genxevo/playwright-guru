/**
 * WS1 — Domain / Contract Tests · accessibility.ts (canonical FIRST sub-item).
 *
 * `resolveRole` is already exercised against real-Playwright evidence by
 * `conformance.test.ts` (the golden). These tests cover the two functions that
 * had NO direct unit coverage — `computeAccessibleName` and the branch structure
 * of `getImplicitRole` — plus `resolveRole`'s explicit-over-implicit contract.
 *
 * Every assertion PINS the CURRENT behaviour. Nothing here changes source. Where
 * a branch is a known WS1-owned concern (E7 — the innerText fall-through in
 * `computeAccessibleName`), the test is a CHARACTERISATION test: it records what
 * the code does today so a future change is visible, not a claim that today's
 * behaviour is the final contract.
 */

import { describe, expect, it } from 'vitest';

import { computeAccessibleName, getImplicitRole, resolveRole } from '../src/accessibility';
import type { ElementAttributes } from '../src/types';

const el = (attrs: Partial<ElementAttributes> & { tagName: string }): ElementAttributes => attrs;

// ─── getImplicitRole — inputs ───────────────────────────────────────────────

describe('getImplicitRole · input types', () => {
  it('defaults a bare input (no type) to textbox', () => {
    expect(getImplicitRole(el({ tagName: 'input' }))).toBe('textbox');
  });

  it('maps the button-like input types to button', () => {
    for (const type of ['button', 'submit', 'reset', 'image']) {
      expect(getImplicitRole(el({ tagName: 'input', type }))).toBe('button');
    }
  });

  it('maps file to button (N-1), not textbox', () => {
    expect(getImplicitRole(el({ tagName: 'input', type: 'file' }))).toBe('button');
  });

  it('maps checkbox, radio, range, number, search to their roles', () => {
    expect(getImplicitRole(el({ tagName: 'input', type: 'checkbox' }))).toBe('checkbox');
    expect(getImplicitRole(el({ tagName: 'input', type: 'radio' }))).toBe('radio');
    expect(getImplicitRole(el({ tagName: 'input', type: 'range' }))).toBe('slider');
    expect(getImplicitRole(el({ tagName: 'input', type: 'number' }))).toBe('spinbutton');
    expect(getImplicitRole(el({ tagName: 'input', type: 'search' }))).toBe('searchbox');
  });

  it('maps hidden input to null', () => {
    expect(getImplicitRole(el({ tagName: 'input', type: 'hidden' }))).toBeNull();
  });

  it('falls the date/time family and password through to textbox (E5/E6)', () => {
    for (const type of [
      'password',
      'date',
      'time',
      'month',
      'week',
      'datetime-local',
      'tel',
      'url',
      'email',
    ]) {
      expect(getImplicitRole(el({ tagName: 'input', type }))).toBe('textbox');
    }
  });

  it('is case-insensitive on the input type', () => {
    expect(getImplicitRole(el({ tagName: 'input', type: 'CHECKBOX' }))).toBe('checkbox');
    expect(getImplicitRole(el({ tagName: 'INPUT', type: 'File' }))).toBe('button');
  });

  it('promotes a text-like input with a real datalist to combobox (N-2)', () => {
    expect(
      getImplicitRole(el({ tagName: 'input', type: 'text', list: 'd', listIsDatalist: true })),
    ).toBe('combobox');
    expect(
      getImplicitRole(el({ tagName: 'input', type: 'email', list: 'd', listIsDatalist: true })),
    ).toBe('combobox');
  });

  it('does NOT promote when list does not resolve to a datalist', () => {
    // A `list` aimed at a non-datalist changes nothing — Playwright resolves the
    // reference first. Guru relies on `listIsDatalist` being false/undefined.
    expect(
      getImplicitRole(el({ tagName: 'input', type: 'text', list: 'd', listIsDatalist: false })),
    ).toBe('textbox');
    expect(getImplicitRole(el({ tagName: 'input', type: 'text', list: 'd' }))).toBe('textbox');
  });

  it('does NOT promote a non-text-like input even with a datalist', () => {
    // checkbox is not in the combobox-eligible set, so the datalist is ignored.
    expect(getImplicitRole(el({ tagName: 'input', type: 'checkbox', listIsDatalist: true }))).toBe(
      'checkbox',
    );
  });
});

// ─── getImplicitRole — select / a / img / tag map ───────────────────────────

describe('getImplicitRole · select', () => {
  it('is combobox for a plain single select', () => {
    expect(getImplicitRole(el({ tagName: 'select' }))).toBe('combobox');
    expect(getImplicitRole(el({ tagName: 'select', size: 1 }))).toBe('combobox');
  });

  it('is listbox for multiple or size > 1 (E5)', () => {
    expect(getImplicitRole(el({ tagName: 'select', multiple: true }))).toBe('listbox');
    expect(getImplicitRole(el({ tagName: 'select', size: 2 }))).toBe('listbox');
  });
});

describe('getImplicitRole · anchors and images', () => {
  it('is link only when href is present (including empty string)', () => {
    expect(getImplicitRole(el({ tagName: 'a', href: '/x' }))).toBe('link');
    expect(getImplicitRole(el({ tagName: 'a', href: '' }))).toBe('link');
    expect(getImplicitRole(el({ tagName: 'a' }))).toBeNull();
    expect(getImplicitRole(el({ tagName: 'area', href: '/x' }))).toBe('link');
    expect(getImplicitRole(el({ tagName: 'area' }))).toBeNull();
  });

  it('is img unless alt="" marks it decorative', () => {
    expect(getImplicitRole(el({ tagName: 'img', alt: 'a cat' }))).toBe('img');
    expect(getImplicitRole(el({ tagName: 'img' }))).toBe('img'); // absent alt is still img
    expect(getImplicitRole(el({ tagName: 'img', alt: '' }))).toBeNull();
  });
});

describe('getImplicitRole · static tag map', () => {
  it('maps common landmark and structural tags', () => {
    expect(getImplicitRole(el({ tagName: 'button' }))).toBe('button');
    expect(getImplicitRole(el({ tagName: 'nav' }))).toBe('navigation');
    expect(getImplicitRole(el({ tagName: 'h3' }))).toBe('heading');
    expect(getImplicitRole(el({ tagName: 'textarea' }))).toBe('textbox');
    expect(getImplicitRole(el({ tagName: 'ul' }))).toBe('list');
    expect(getImplicitRole(el({ tagName: 'li' }))).toBe('listitem');
    expect(getImplicitRole(el({ tagName: 'summary' }))).toBe('button');
  });

  it('returns null for a generic element with no implicit role', () => {
    expect(getImplicitRole(el({ tagName: 'div' }))).toBeNull();
    expect(getImplicitRole(el({ tagName: 'span' }))).toBeNull();
  });
});

// ─── resolveRole — explicit wins ────────────────────────────────────────────

describe('resolveRole', () => {
  it('prefers an explicit role attribute over the implicit role', () => {
    expect(resolveRole(el({ tagName: 'div', role: 'button' }))).toBe('button');
    // even when the implicit role would be non-null:
    expect(resolveRole(el({ tagName: 'a', href: '/x', role: 'tab' }))).toBe('tab');
  });

  it('falls back to the implicit role when no explicit role is set', () => {
    expect(resolveRole(el({ tagName: 'select' }))).toBe('combobox');
    expect(resolveRole(el({ tagName: 'div' }))).toBeNull();
  });

  it('treats a blank/whitespace explicit role as absent', () => {
    expect(resolveRole(el({ tagName: 'select', role: '   ' }))).toBe('combobox');
    expect(resolveRole(el({ tagName: 'div', role: '' }))).toBeNull();
  });
});

// ─── computeAccessibleName — AccName priority order ─────────────────────────

describe('computeAccessibleName · priority order', () => {
  it('1. aria-labelledby (resolved text) wins over everything below', () => {
    const name = computeAccessibleName(
      el({
        tagName: 'input',
        ariaLabelledBy: 'From labelledby',
        ariaLabel: 'aria',
        labelText: 'label',
        title: 'title',
      }),
    );
    expect(name).toBe('From labelledby');
  });

  it('2. aria-label wins when there is no aria-labelledby', () => {
    expect(
      computeAccessibleName(el({ tagName: 'input', ariaLabel: 'Search', labelText: 'label' })),
    ).toBe('Search');
  });

  it('3. associated <label> text wins for a form control', () => {
    expect(computeAccessibleName(el({ tagName: 'input', labelText: 'Email' }))).toBe('Email');
  });

  it('4. innerText for text-bearing tags (button/link/heading/…)', () => {
    expect(computeAccessibleName(el({ tagName: 'button', innerText: 'Submit' }))).toBe('Submit');
    expect(computeAccessibleName(el({ tagName: 'a', innerText: 'Home', href: '/' }))).toBe('Home');
    expect(computeAccessibleName(el({ tagName: 'h2', innerText: 'Form Controls' }))).toBe(
      'Form Controls',
    );
  });

  it('4. innerText also applies when the explicit role is button/link', () => {
    expect(computeAccessibleName(el({ tagName: 'span', role: 'button', innerText: 'Go' }))).toBe(
      'Go',
    );
  });

  it('5. alt for images and input[type=image]', () => {
    expect(computeAccessibleName(el({ tagName: 'img', alt: 'Logo' }))).toBe('Logo');
    expect(
      computeAccessibleName(el({ tagName: 'input', type: 'image', alt: 'Search button' })),
    ).toBe('Search button');
  });

  it('6. title as a later resort', () => {
    expect(computeAccessibleName(el({ tagName: 'input', title: 'Tooltip' }))).toBe('Tooltip');
  });

  it('trims surrounding whitespace at every tier', () => {
    expect(computeAccessibleName(el({ tagName: 'input', ariaLabel: '  padded  ' }))).toBe('padded');
    expect(computeAccessibleName(el({ tagName: 'button', innerText: '\n Save \n' }))).toBe('Save');
  });

  it('skips a tier whose value is empty/whitespace and uses the next', () => {
    // aria-label present but blank → falls to labelText
    expect(
      computeAccessibleName(el({ tagName: 'input', ariaLabel: '   ', labelText: 'Name' })),
    ).toBe('Name');
  });

  it('returns undefined when nothing supplies a name', () => {
    expect(computeAccessibleName(el({ tagName: 'input' }))).toBeUndefined();
    expect(computeAccessibleName(el({ tagName: 'div' }))).toBeUndefined();
  });
});

describe('computeAccessibleName · E7 innerText fall-through (characterisation)', () => {
  // E7 is a WS1-owned concern: for a non-text-bearing element with no name from
  // any higher tier, the current code returns innerText as a last resort. This
  // test PINS that behaviour; it does not endorse it. In the live pipeline this
  // name is only consumed alongside a resolved role, so a role-less <div> never
  // turns it into a locator (see scorer.test.ts / engine.test.ts).
  it('returns innerText for a role-less, non-text-bearing element (current behaviour)', () => {
    expect(computeAccessibleName(el({ tagName: 'div', innerText: 'orphan text' }))).toBe(
      'orphan text',
    );
  });

  it('does not fabricate a name from tagName alone', () => {
    expect(computeAccessibleName(el({ tagName: 'div' }))).toBeUndefined();
  });

  it('title still outranks the fall-through innerText', () => {
    expect(
      computeAccessibleName(el({ tagName: 'div', title: 'the title', innerText: 'the text' })),
    ).toBe('the title');
  });
});
