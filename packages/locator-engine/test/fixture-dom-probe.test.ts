/**
 * WS1 — tests for the happy-dom fixture harness + FixtureDomProbe.
 *
 * These prove the harness/probe themselves are correct and deterministic, and
 * PIN the two honest fidelity limitations (XPath unsupported; visibility not
 * modelled → `visible === total`). They reuse the domain's own role/name/text
 * functions through the probe rather than re-asserting them.
 *
 * R3 note: this suite constructs LOCAL happy-dom Windows via `createFixture`; it
 * never assigns globals, so `contracts.test.ts`'s "no document/window" guard
 * stays green (asserted below as a belt-and-braces check).
 */

import { describe, expect, it } from 'vitest';

import { resolveRole, computeAccessibleName } from '../src/accessibility';
import { UNKNOWN_MATCH_COUNT } from '../src/probe';
import { FixtureDomProbe } from './fakes/FixtureDomProbe';
import { createFixture, extractAttributes } from './fixtures/dom';

const FIXTURE = `
  <nav><a href="/practice.html" id="nav">Practice</a></nav>
  <h2 id="h2">Form Controls</h2>
  <label for="name">Name</label>
  <input id="name" data-testid="input-name" type="text" placeholder="mm/dd/yyyy" />
  <label>Country <select id="country"><option>US</option></select></label>
  <button id="btn">Submit</button>
  <input id="submit2" type="submit" value="Submit" />
  <div id="ariabtn" role="button" aria-label="Close dialog">x</div>
  <img id="logo" src="l.png" alt="Company logo" />
  <span id="lbl">Labelled By Text</span>
  <input id="albinput" aria-labelledby="lbl" />
  <p id="terms">Terms and conditions</p>
  <div id="wrap"><span id="inner">Nested text</span></div>
  <div id="hidden-css" style="display:none"><button id="hidbtn">HiddenBtn</button></div>
`;

const setup = () => {
  const fx = createFixture(FIXTURE);
  return { fx, probe: new FixtureDomProbe(fx.document) };
};

// ─── 1. fixture creation ─────────────────────────────────────────────────────

describe('createFixture', () => {
  it('parses HTML into a document', () => {
    const { fx } = setup();
    expect(fx.document).toBeTruthy();
    expect(fx.byId('name')).toBeTruthy();
  });

  it('does NOT leak into globalThis (R3 — no global document/window)', () => {
    setup();
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
  });
});

// ─── 2. element lookup ───────────────────────────────────────────────────────

describe('element lookup', () => {
  it('finds by id, single selector and collection', () => {
    const { fx } = setup();
    expect(fx.byId('btn')?.tagName).toBe('BUTTON');
    expect(fx.query('a')?.getAttribute('href')).toBe('/practice.html');
    expect(fx.queryAll('input').length).toBe(3); // name, submit2, albinput
  });
});

// ─── 3–6. attribute / text / ancestor / element-property extraction ─────────

describe('extractAttributes (mechanical DOM → ElementAttributes)', () => {
  it('reads raw attributes and the test id', () => {
    const { fx } = setup();
    const a = extractAttributes(fx.byId('name')!);
    expect(a.tagName).toBe('input');
    expect(a.type).toBe('text');
    expect(a.testId).toBe('input-name');
    expect(a.placeholder).toBe('mm/dd/yyyy');
    expect(a.id).toBe('name');
  });

  it('resolves label association via for= (a DOM relationship)', () => {
    const { fx } = setup();
    expect(extractAttributes(fx.byId('name')!).labelText).toBe('Name');
  });

  it('resolves label association via containment, stripping the control text', () => {
    const { fx } = setup();
    expect(extractAttributes(fx.byId('country')!).labelText).toBe('Country');
  });

  it('resolves aria-labelledby to the referenced element text', () => {
    const { fx } = setup();
    expect(extractAttributes(fx.byId('albinput')!).ariaLabelledBy).toBe('Labelled By Text');
  });

  it('feeds the domain role/name functions (no duplication in the harness)', () => {
    const { fx } = setup();
    const name = extractAttributes(fx.byId('name')!);
    expect(resolveRole(name)).toBe('textbox');
    expect(computeAccessibleName(name)).toBe('Name');

    const aria = extractAttributes(fx.byId('ariabtn')!);
    expect(resolveRole(aria)).toBe('button'); // explicit role attribute wins
    expect(computeAccessibleName(aria)).toBe('Close dialog');
  });
});

// ─── 7. countCss (collection/query) ─────────────────────────────────────────

describe('FixtureDomProbe.countCss', () => {
  it('counts CSS matches structurally', () => {
    const { probe } = setup();
    expect(probe.countCss('a').total).toBe(1);
    expect(probe.countCss('input').total).toBe(3);
    expect(probe.countCss('.does-not-exist').total).toBe(0);
  });

  it('reports an INVALID_SELECTOR error rather than throwing', () => {
    const { probe } = setup();
    const r = probe.countCss('::::nonsense');
    expect(r.error?.code).toBe('INVALID_SELECTOR');
    expect(r.total).toBe(UNKNOWN_MATCH_COUNT);
  });
});

// ─── 9 & 11 & 12. interactive / form controls / accessibility via countByRole ─

describe('FixtureDomProbe.countByRole (reuses resolveRole + accessible name)', () => {
  it('counts by resolved role, honouring implicit and explicit roles', () => {
    const { probe } = setup();
    // <button>, input[type=submit], role="button", AND the display:none #hidbtn
    // all resolve to button. #hidbtn is included because visibility is NOT
    // modelled (see the limitation) — a real Playwright getByRole would drop it.
    expect(probe.countByRole('button').total).toBe(4);
    expect(probe.countByRole('textbox').total).toBe(2); // name + albinput
    expect(probe.countByRole('combobox').total).toBe(1); // plain <select>
    expect(probe.countByRole('link').total).toBe(1);
    expect(probe.countByRole('heading').total).toBe(1);
  });

  it('filters by accessible name using Playwright substring semantics', () => {
    const { probe } = setup();
    expect(probe.countByRole('button', 'Submit').total).toBe(1); // only the <button>
    expect(probe.countByRole('button', 'close').total).toBe(1); // aria-label, case-insensitive
    expect(probe.countByRole('link', 'Practice').total).toBe(1);
    expect(probe.countByRole('heading', 'Form').total).toBe(1); // substring
    expect(probe.countByRole('button', 'Nonexistent').total).toBe(0);
  });
});

// ─── countByText (innermost structural match) ───────────────────────────────

describe('FixtureDomProbe.countByText', () => {
  it('matches the innermost element, not every ancestor', () => {
    const { probe } = setup();
    expect(probe.countByText('Nested text', 'substring').total).toBe(1); // span, not wrap
    expect(probe.countByText('Terms and conditions', 'exact').total).toBe(1);
  });

  it('applies case-insensitive substring by default and exact when asked', () => {
    const { probe } = setup();
    expect(probe.countByText('nested', 'substring').total).toBe(1);
    expect(probe.countByText('Nested', 'exact').total).toBe(0); // not a full-string match
  });
});

// ─── countByLabel (for= and containment) ────────────────────────────────────

describe('FixtureDomProbe.countByLabel', () => {
  it('counts controls associated with a matching label', () => {
    const { probe } = setup();
    expect(probe.countByLabel('Name', 'substring').total).toBe(1); // for=
    expect(probe.countByLabel('Country', 'substring').total).toBe(1); // containment
    expect(probe.countByLabel('Nonexistent', 'substring').total).toBe(0);
  });
});

// ─── XPath limitation (honest UNSUPPORTED) ──────────────────────────────────

describe('FixtureDomProbe.countXPath — happy-dom has no XPath engine', () => {
  it('returns UNSUPPORTED rather than fabricating a count', () => {
    const { probe } = setup();
    const r = probe.countXPath('//a[normalize-space()="Practice"]');
    expect(r.error?.code).toBe('UNSUPPORTED');
    expect(r.total).toBe(UNKNOWN_MATCH_COUNT);
    expect(r.visible).toBe(UNKNOWN_MATCH_COUNT);
  });
});

// ─── 10. hidden/visible: structural only (visible === total) ────────────────

describe('visibility fidelity — documented limitation', () => {
  it('counts structurally present elements even when CSS-hidden', () => {
    const { probe } = setup();
    // #hidbtn is inside display:none — happy-dom has no layout, so it is still
    // counted. This PINS that fixture visibility is NOT modelled.
    expect(probe.countCss('#hidbtn').total).toBe(1);
  });

  it('reports visible === total for every measured count', () => {
    const { probe } = setup();
    for (const c of [
      probe.countCss('input'),
      probe.countByRole('button'),
      probe.countByText('Nested text', 'substring'),
      probe.countByLabel('Name', 'substring'),
    ]) {
      expect(c.visible).toBe(c.total);
    }
  });
});

// ─── scope lifecycle ────────────────────────────────────────────────────────

describe('scope lifecycle', () => {
  it('restricts a query to a scope subtree', () => {
    const { fx, probe } = setup();
    const scope = probe.scopeHandleFor(fx.byId('wrap')!);
    expect(probe.countCss('span', { scope }).total).toBe(1);
    expect(probe.countCss('a', { scope }).total).toBe(0); // the nav link is outside
  });

  it('reports a live handle, and null once the element detaches', () => {
    const { fx, probe } = setup();
    const el = fx.byId('wrap')!;
    const scope = probe.scopeHandleFor(el);
    expect(probe.scopeOf(scope)).toEqual(scope);
    el.remove();
    expect(probe.scopeOf(scope)).toBeNull();
    expect(probe.countCss('span', { scope }).error?.code).toBe('SCOPE_DETACHED');
  });
});

// ─── 8. isolation + 13. determinism ─────────────────────────────────────────

describe('isolation and determinism', () => {
  it('keeps two fixtures independent', () => {
    const a = createFixture('<button id="x">A</button>');
    const b = createFixture('<button id="x">B</button>');
    a.byId('x')!.remove();
    expect(a.byId('x')).toBeNull();
    expect(b.byId('x')?.textContent).toBe('B'); // unaffected
  });

  it('produces identical results on repeated execution', () => {
    const { probe } = setup();
    const first = probe.countByRole('button', 'Submit').total;
    const second = probe.countByRole('button', 'Submit').total;
    const third = new FixtureDomProbe(createFixture(FIXTURE).document).countByRole(
      'button',
      'Submit',
    ).total;
    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(third).toBe(1);
  });
});
