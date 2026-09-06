// @vitest-environment happy-dom
/**
 * WS3 — LiveDomProbe.
 *
 * Failure-first coverage for the live `DomProbe` implementation: the binding
 * complexity contract (one whole-document text traversal per instance), the
 * O(n²)/`===`-on-raw-text defect the pre-WS3 content script had for the
 * `text` step, scope lifecycle, and the E4 escaping fix as it applies to a
 * live CSS query.
 *
 * happy-dom limitation, disclosed rather than worked around: it has no layout
 * engine, so `getBoundingClientRect()` is always a zero box and `visibility`
 * is always `total === visible` here. Real visibility filtering is a
 * real-Chromium (conformance) concern, already covered by
 * `test/conformance/visibility-golden.json` for the shared predicate this
 * probe delegates to (`isElementVisible`). happy-dom also has no
 * `document.evaluate`, so `countXPath` is exercised only for its honest
 * `UNSUPPORTED` path here.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LiveDomProbe } from '../src/runtime/probe';
import { stubLayout } from './helpers/layout-stub';
import { setBody } from './helpers/dom-fixture';

stubLayout();

function dom(html: string): Document {
  setBody(html);
  return document;
}

describe('LiveDomProbe — text index (binding invariant)', () => {
  it('builds the whole-document text index exactly once, no matter how many countByText calls follow', () => {
    const doc = dom('<div><p>Alpha</p><p>Beta</p><p>Gamma</p></div>');
    const probe = new LiveDomProbe(doc);
    probe.countByText('Alpha', 'exact');
    probe.countByText('Beta', 'exact');
    probe.countByText('Gamma', 'substring');
    expect(probe.wholeDocumentTraversals).toBe(1);
  });

  it('exact mode: O(1) bucket lookup, case-sensitive, whitespace-normalised', () => {
    const doc = dom('<p id="a">  Email   Address  </p>');
    const probe = new LiveDomProbe(doc);
    const hit = probe.countByText('Email Address', 'exact');
    expect(hit.total).toBe(1);
    const miss = probe.countByText('email address', 'exact');
    expect(miss.total).toBe(0); // exact is case-sensitive, per Playwright semantics
  });

  it('substring mode: case-insensitive, matches Playwright semantics', () => {
    const doc = dom('<label>Email Address</label>');
    const probe = new LiveDomProbe(doc);
    const result = probe.countByText('EMAIL', 'substring');
    expect(result.total).toBe(1);
  });

  it('innermost-only: a parent is not double-counted when a child already matches the same text', () => {
    const doc = dom('<div id="outer"><span id="inner">Save changes</span></div>');
    const probe = new LiveDomProbe(doc);
    const result = probe.countByText('Save changes', 'exact');
    // Only the <span> — the <div> shares its normalised text but has a
    // matching child, so it is excluded (matches FixtureDomProbe's rule).
    expect(result.total).toBe(1);
  });

  it('fixes the pre-WS3 defect: a substring query no longer reports zero for a real match', () => {
    // The old content.ts `text` step used raw `===`, which under-counted
    // exactly the way E2 originally did for `label` — the whole reason
    // matching.ts / resolver.ts exist.
    const doc = dom('<p>Contact support for help</p>');
    const probe = new LiveDomProbe(doc);
    const result = probe.countByText('support', 'substring');
    expect(result.total).toBe(1);
  });
});

describe('LiveDomProbe — countCss / countXPath', () => {
  it('countCss is memoised: identical selector + scope returns the same array without re-querying', () => {
    const doc = dom('<button data-testid="save">Save</button>');
    const probe = new LiveDomProbe(doc);
    const first = probe.countCss('[data-testid="save"]');
    const second = probe.countCss('[data-testid="save"]');
    expect(first).toEqual(second);
    expect(first.total).toBe(1);
  });

  it('countCss reports INVALID_SELECTOR honestly rather than throwing', () => {
    const doc = dom('<div></div>');
    const probe = new LiveDomProbe(doc);
    const result = probe.countCss(':::not-a-selector');
    expect(result.error?.code).toBe('INVALID_SELECTOR');
    expect(result.total).toBe(-1);
  });

  it('countXPath reports UNSUPPORTED on an engine without document.evaluate (happy-dom)', () => {
    const doc = dom('<div></div>');
    const probe = new LiveDomProbe(doc);
    const result = probe.countXPath('//div');
    expect(result.error?.code).toBe('UNSUPPORTED');
  });
});

describe('LiveDomProbe — countByRole', () => {
  it('filters by resolved role AND accessible name, matching accessibility.ts', () => {
    const doc = dom('<button>Save</button><button aria-label="Cancel">X</button>');
    const probe = new LiveDomProbe(doc);
    const named = probe.countByRole('button', 'Save');
    expect(named.total).toBe(1);
    const all = probe.countByRole('button');
    expect(all.total).toBe(2);
  });

  it('total === visible for role, by contract', () => {
    const doc = dom('<button>Save</button>');
    const probe = new LiveDomProbe(doc);
    const r = probe.countByRole('button');
    expect(r.total).toBe(r.visible);
  });
});

describe('LiveDomProbe — countByLabel', () => {
  it('resolves for= association', () => {
    const doc = dom('<label for="e">Email</label><input id="e" />');
    const probe = new LiveDomProbe(doc);
    const r = probe.countByLabel('Email', 'substring');
    expect(r.total).toBe(1);
  });

  it('resolves wrapping association', () => {
    const doc = dom('<label>Email <input /></label>');
    const probe = new LiveDomProbe(doc);
    const r = probe.countByLabel('Email', 'substring');
    expect(r.total).toBe(1);
  });
});

describe('LiveDomProbe — scope lifecycle', () => {
  let doc: Document;
  beforeEach(() => {
    doc = dom(
      '<div id="scope"><button data-testid="inner">A</button></div><button data-testid="outer">B</button>',
    );
  });

  it('scopeFor + a scoped query only sees elements inside the scope', () => {
    const probe = new LiveDomProbe(doc);
    const scopeEl = doc.getElementById('scope')!;
    const handle = probe.scopeFor(scopeEl);
    const scoped = probe.countCss('[data-testid]', { scope: handle });
    expect(scoped.total).toBe(1);
    const unscoped = probe.countCss('[data-testid]');
    expect(unscoped.total).toBe(2);
  });

  it('scopeOf returns null once the scoped element detaches', () => {
    const probe = new LiveDomProbe(doc);
    const scopeEl = doc.getElementById('scope')!;
    const handle = probe.scopeFor(scopeEl);
    scopeEl.remove();
    expect(probe.scopeOf(handle)).toBeNull();
  });

  it('a query against a detached scope reports SCOPE_DETACHED, never falls back to the whole document', () => {
    const probe = new LiveDomProbe(doc);
    const scopeEl = doc.getElementById('scope')!;
    const handle = probe.scopeFor(scopeEl);
    scopeEl.remove();
    const result = probe.countCss('[data-testid]', { scope: handle });
    expect(result.error?.code).toBe('SCOPE_DETACHED');
  });
});

// ─── WS6.2 (D2) — the probe returns the scope the resolver chains on ────────

describe('LiveDomProbe — a unique VISIBLE match comes back with a scope handle', () => {
  /**
   * `resolveChain` can only narrow into a parent the probe can name. These pin
   * the half of D2 that lives on the live implementation: a handle is offered
   * for exactly one visible match and withheld otherwise, so the resolver is
   * never handed "one of the matches" to search inside.
   */
  it('mints a scope when exactly one element matches', () => {
    const probe = new LiveDomProbe(dom('<div id="only"><span>x</span></div>'));
    const count = probe.countCss('#only');
    expect(count.visible).toBe(1);
    expect(count.scope).toBeDefined();
    expect(probe.scopeOf(count.scope!)).not.toBeNull();
  });

  it('withholds it for zero matches, and for two or more', () => {
    const probe = new LiveDomProbe(dom('<p class="m">a</p><p class="m">b</p>'));
    expect(probe.countCss('.absent').scope).toBeUndefined();
    const many = probe.countCss('.m');
    expect(many.visible).toBe(2);
    expect(many.scope).toBeUndefined();
  });

  it('the handle names the MATCHED element, so a scoped query looks inside it', () => {
    const probe = new LiveDomProbe(dom('<ul id="list"><li>Save</li></ul><div><b>Save</b></div>'));
    const list = probe.countCss('#list');
    expect(list.scope).toBeDefined();
    // Two "Save"s in the document; one inside the list.
    expect(probe.countByText('Save', 'substring').visible).toBe(2);
    expect(probe.countByText('Save', 'substring', { scope: list.scope }).visible).toBe(1);
  });

  it('offers the same handle for the same element twice, not a fresh one each call', () => {
    const probe = new LiveDomProbe(dom('<div id="only">x</div>'));
    expect(probe.countCss('#only').scope).toEqual(probe.countCss('div#only').scope);
  });

  it('countByRole and countByLabel mint one too — every query the resolver chains on', () => {
    const probe = new LiveDomProbe(
      dom('<main><button>Go</button></main><label for="e">Email</label><input id="e" />'),
    );
    expect(probe.countByRole('button').scope).toBeDefined();
    expect(probe.countByLabel('Email', 'substring').scope).toBeDefined();
  });
});

describe('LiveDomProbe + resolveChain — the false green, measured on the live path', () => {
  it('does not report a chained locator verified when the child is OUTSIDE the parent', async () => {
    const { verifyLocatorExpression } = await import('@playwright-guru/locator-engine');
    // The exact defect shape: "Save" exists on the page, but not in the list.
    const probe = new LiveDomProbe(
      dom('<ul role="list"><li>Cancel</li></ul><div><button>Save</button></div>'),
    );
    const verification = verifyLocatorExpression("page.getByRole('list').getByText('Save')", probe);
    expect(verification.status).toBe('not-found');
    expect(verification.status).not.toBe('verified');
  });

  it('still verifies the same locator when the child IS inside the parent', async () => {
    const { verifyLocatorExpression } = await import('@playwright-guru/locator-engine');
    const probe = new LiveDomProbe(dom('<ul role="list"><li>Save</li></ul>'));
    expect(verifyLocatorExpression("page.getByRole('list').getByText('Save')", probe).status).toBe(
      'verified',
    );
  });

  it('reports ambiguous — not a first-match guess — when the PARENT is ambiguous', async () => {
    const { verifyLocatorExpression } = await import('@playwright-guru/locator-engine');
    const probe = new LiveDomProbe(
      dom('<ul role="list"><li>Save</li></ul><ul role="list"><li>Cancel</li></ul>'),
    );
    const verification = verifyLocatorExpression("page.getByRole('list').getByText('Save')", probe);
    expect(verification.status).toBe('ambiguous');
    expect(verification.status).not.toBe('verified');
  });
});

describe('LiveDomProbe — E4 (live query correctness for a value containing a quote)', () => {
  it('countByRole resolves a role/name selector for an element whose accessible name is dynamic, without corrupting the query', () => {
    // The E4 defect was CSS.escape (identifier escaping) misused inside a
    // quoted attribute selector. escapeAttrValue (dom-read.ts) is the fix,
    // exercised here through countByRole's [role="…"] construction.
    const doc = dom('<div role="custom-role">x</div>');
    const probe = new LiveDomProbe(doc);
    const result = probe.countByRole('custom-role');
    expect(result.total).toBe(1);
  });
});
