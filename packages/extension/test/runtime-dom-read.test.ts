// @vitest-environment happy-dom
/**
 * WS3 — dom-read.ts: attribute extraction, label association, and the E4 fix.
 */
import { describe, it, expect } from 'vitest';
import {
  extractAttributes,
  findAssociatedLabel,
  escapeAttrValue,
  cssEsc,
  buildAncestorStep,
} from '../src/runtime/dom-read';
import { setBody as set } from './helpers/dom-fixture';

describe('escapeAttrValue (E4 fix)', () => {
  it('escapes a literal quote with a backslash — the textually correct CSS string-literal escape', () => {
    // happy-dom's selector engine does not parse a backslash-escaped quote
    // inside an attribute selector (verified directly against happy-dom: the
    // textually-correct selector `[data-testid="say \"hi\""]` matches zero
    // elements there even though the attribute value is `say "hi"`) — a
    // real-browser (conformance) concern, not something this suite can prove.
    // What IS provable here, and what E4 was actually about, is that the
    // escaping produces the correct CSS string-literal form.
    expect(escapeAttrValue('say "hi"')).toBe('say \\"hi\\"');
  });

  it('escapes a literal backslash', () => {
    expect(escapeAttrValue('a\\b')).toBe('a\\\\b');
  });

  it('differs from cssEsc (identifier escaping) — the exact bug E4 fixes', () => {
    // CSS.escape('say "hi"') produces identifier escapes that are wrong inside
    // a quoted string; it must not be reused for an attribute VALUE.
    expect(escapeAttrValue('say "hi"')).not.toBe(cssEsc('say "hi"'));
  });
});

describe('extractAttributes — labelText vs ariaLabelledBy (correctness, not just relocation)', () => {
  it('labelText comes ONLY from for=/wrapping association — never from aria-labelledby', () => {
    set('<span id="lb">Remote label</span><input id="target" aria-labelledby="lb" />');
    const attrs = extractAttributes(document.getElementById('target')!);
    // getByLabel does not match aria-labelledby text; only ariaLabelledBy (a
    // separate matcher surface) should carry it.
    expect(attrs.labelText).toBeUndefined();
    expect(attrs.ariaLabelledBy).toBe('Remote label');
  });

  it('labelText resolves a for= association', () => {
    set('<label for="target">Email</label><input id="target" />');
    const attrs = extractAttributes(document.getElementById('target')!);
    expect(attrs.labelText).toBe('Email');
  });

  it('labelText resolves a wrapping association when no for= exists', () => {
    set('<label>Email <input id="target" /></label>');
    const attrs = extractAttributes(document.getElementById('target')!);
    expect(attrs.labelText).toBe('Email');
  });

  it('caps innerText at the requested length (100 by default, matching the wire contract)', () => {
    set(`<div id="target">${'x'.repeat(500)}</div>`);
    const attrs = extractAttributes(document.getElementById('target')!);
    expect(attrs.innerText?.length).toBeLessThanOrEqual(100);
  });

  it('a larger cap (FACT_LIMITS.maxInnerTextLength) is available for the internal fact model', () => {
    set(`<div id="target">${'x'.repeat(500)}</div>`);
    const attrs = extractAttributes(document.getElementById('target')!, 1000);
    expect(attrs.innerText?.length).toBe(500);
  });
});

describe('findAssociatedLabel', () => {
  it('prefers for= over aria-labelledby, so ElementContext never contradicts labelText', () => {
    set(
      '<span id="lb">Remote</span><label for="target">Direct</label><input id="target" aria-labelledby="lb" />',
    );
    const label = findAssociatedLabel(document.getElementById('target')!);
    expect(label).toEqual({ text: 'Direct', via: 'for' });
  });

  it('falls back to aria-labelledby only when no <label> association exists', () => {
    set('<span id="lb">Remote</span><input id="target" aria-labelledby="lb" />');
    const label = findAssociatedLabel(document.getElementById('target')!);
    expect(label).toEqual({ text: 'Remote', via: 'aria-labelledby' });
  });
});

describe('buildAncestorStep', () => {
  it('prefers an explicit or implicit role over a test id', () => {
    set('<nav data-testid="primary-nav"><a id="target">Home</a></nav>');
    const step = buildAncestorStep(document.querySelector('nav')!);
    expect(step?.kind).toBe('role');
  });

  it('falls back to testId when no role applies', () => {
    set('<div data-testid="widget"><span id="target">x</span></div>');
    const step = buildAncestorStep(document.querySelector('div')!);
    expect(step).toEqual({ kind: 'testId', selectorValue: { type: 'string', value: 'widget' } });
  });

  it('returns null when neither a role nor a test id can be built', () => {
    set('<div><span id="target">x</span></div>');
    const step = buildAncestorStep(document.querySelector('div')!);
    expect(step).toBeNull();
  });
});
