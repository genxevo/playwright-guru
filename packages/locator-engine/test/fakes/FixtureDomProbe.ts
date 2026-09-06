/**
 * WS1 — FixtureDomProbe (item 2 of the remaining WS1 sequence).
 *
 * A `DomProbe` implementation backed by a happy-dom fixture (see
 * `../fixtures/dom.ts`). Where `FakeDomProbe` answers from a hand-written table,
 * this answers from REAL parsed HTML — the "fixture implementation over parsed
 * HTML, used by tests" the port's own doc comment promised (WS1).
 *
 * ── IT IS AN ADAPTER, NOT A SECOND ENGINE ─────────────────────────────────
 * It reuses the domain's single implementations and adds none of its own:
 *   • role identity      → `resolveRole` (accessibility.ts)
 *   • accessible name     → `computeAccessibleName` (accessibility.ts)
 *   • role → CSS candidates → `ROLE_CSS_SELECTORS` (accessibility.ts)
 *   • text / name matching → `matchesPlaywrightText` (matching.ts)
 * The only new code is mechanical DOM plumbing (querying, ancestor walks, label
 * association) — never a rule the domain already owns.
 *
 * ── FIDELITY (honest, evidence-based — see fixtures/dom.ts) ────────────────
 * happy-dom is a DOM model without a browser, so this probe is a STRUCTURAL
 * probe. Two limitations are surfaced through the port's OWN channels rather
 * than invented around:
 *
 *   1. XPATH is unsupported — happy-dom has no `document.evaluate`. `countXPath`
 *      returns `unknownCount({ code: 'UNSUPPORTED' })`, the contract's designed
 *      "I cannot answer this" signal. It never fabricates a number.
 *
 *   2. VISIBILITY is not modelled — happy-dom has no layout
 *      (`getBoundingClientRect` is always 0), and the box-based `playwrightVisible`
 *      predicate lives in the extension (out of WS1 scope). So every measured
 *      count reports `visible === total`. This probe therefore answers
 *      "how many elements match STRUCTURALLY", not "how many Playwright would
 *      call visible". The visible/total split, `getByRole` accessibility-tree
 *      filtering, and zero-size-box semantics are a REAL-CHROMIUM / Playwright
 *      evidence level (the conformance golden), deliberately NOT reproduced here.
 *
 * Nothing in production changed to make happy-dom easier; the differences are
 * isolated and declared.
 */

import { resolveRole, computeAccessibleName, ROLE_CSS_SELECTORS } from '../../src/accessibility';
import { matchesPlaywrightText } from '../../src/matching';
import {
  createScopeHandle,
  measuredCount,
  unknownCount,
  type DomProbe,
  type ProbeCount,
  type ProbeOpts,
  type ScopeHandle,
  type TextMatchMode,
} from '../../src/probe';
import { extractAttributes } from '../fixtures/dom';

export class FixtureDomProbe implements DomProbe {
  private readonly scopes = new Map<number, Element>();
  private readonly scopeIds = new WeakMap<Element, number>();
  private nextScopeId = 1;

  constructor(private readonly document: Document) {}

  /**
   * Test helper (NOT part of the `DomProbe` port): mints a scope handle bound to
   * a fixture element, so a test can exercise scoped queries and scope lifecycle.
   *
   * Stable per element — asking twice for the same element yields the same id,
   * matching `LiveDomProbe.scopeFor`.
   */
  scopeHandleFor(el: Element): ScopeHandle {
    let id = this.scopeIds.get(el);
    if (id === undefined) {
      id = this.nextScopeId++;
      this.scopeIds.set(el, id);
      this.scopes.set(id, el);
    }
    return createScopeHandle(id);
  }

  /**
   * `visible === total` by construction — happy-dom cannot model layout-based
   * visibility (see the file header). Every measured figure goes through here so
   * the limitation is applied in exactly one place.
   *
   * It also mints the D2 scope handle when exactly one element matched, which is
   * why it takes the ELEMENTS rather than a bare count: the resolver can only
   * chain into a parent the probe can name.
   */
  private structural(els: readonly Element[]): ProbeCount {
    return measuredCount(
      els.length,
      els.length,
      els.length === 1 ? this.scopeHandleFor(els[0] as Element) : undefined,
    );
  }

  /** Resolves the query root for an opts.scope, or `null` if it has detached. */
  private rootFor(opts?: ProbeOpts): { root: ParentNode } | { detached: true } {
    if (!opts?.scope) return { root: this.document };
    const el = this.scopes.get(opts.scope.id);
    if (!el || !el.isConnected) return { detached: true };
    return { root: el };
  }

  countCss(selector: string, opts?: ProbeOpts): ProbeCount {
    const r = this.rootFor(opts);
    if ('detached' in r) return unknownCount({ code: 'SCOPE_DETACHED' });
    try {
      return this.structural(Array.from(r.root.querySelectorAll(selector)));
    } catch (e) {
      return unknownCount({ code: 'INVALID_SELECTOR', detail: String((e as Error).message) });
    }
  }

  /**
   * happy-dom has no XPath engine. Rather than invent a count, report the
   * contract's `UNSUPPORTED` — an honest "this evidence level cannot answer".
   */
  countXPath(_expression: string, _opts?: ProbeOpts): ProbeCount {
    return unknownCount({
      code: 'UNSUPPORTED',
      detail: 'happy-dom has no XPath engine (document.evaluate is undefined)',
    });
  }

  countByText(text: string, mode: TextMatchMode, opts?: ProbeOpts): ProbeCount {
    const r = this.rootFor(opts);
    if ('detached' in r) return unknownCount({ code: 'SCOPE_DETACHED' });
    const exact = mode === 'exact';
    // Count the INNERMOST elements whose own text matches — an element is not
    // counted when a descendant element already satisfies the same query, which
    // keeps every ancestor of a matching leaf from being counted too. This is a
    // documented structural approximation of getByText's element selection; the
    // precise Playwright rule is a real-browser (conformance) concern.
    const all = Array.from(r.root.querySelectorAll('*'));
    const matched: Element[] = [];
    for (const el of all) {
      if (!matchesPlaywrightText(el.textContent, text, { exact })) continue;
      const childMatches = Array.from(el.children).some((c) =>
        matchesPlaywrightText(c.textContent, text, { exact }),
      );
      if (!childMatches) matched.push(el);
    }
    return this.structural(matched);
  }

  countByRole(role: string, name?: string, opts?: ProbeOpts): ProbeCount {
    const r = this.rootFor(opts);
    if ('detached' in r) return unknownCount({ code: 'SCOPE_DETACHED' });
    const selector = ROLE_CSS_SELECTORS[role] ?? `[role="${role}"]`;
    let candidates: Element[];
    try {
      candidates = Array.from(r.root.querySelectorAll(selector));
    } catch (e) {
      return unknownCount({ code: 'INVALID_SELECTOR', detail: String((e as Error).message) });
    }
    const matched: Element[] = [];
    for (const el of candidates) {
      const attrs = extractAttributes(el);
      if (resolveRole(attrs) !== role) continue; // honour explicit-role overrides
      if (name !== undefined) {
        const accessibleName = computeAccessibleName(attrs);
        // getByRole's name is case-insensitive substring by default.
        if (!matchesPlaywrightText(accessibleName, name, { exact: false })) continue;
      }
      matched.push(el);
    }
    return this.structural(matched);
  }

  countByLabel(text: string, mode: TextMatchMode, opts?: ProbeOpts): ProbeCount {
    const r = this.rootFor(opts);
    if ('detached' in r) return unknownCount({ code: 'SCOPE_DETACHED' });
    const exact = mode === 'exact';
    const controls = new Set<Element>();
    for (const label of Array.from(r.root.querySelectorAll('label'))) {
      if (!matchesPlaywrightText(label.textContent, text, { exact })) continue;
      // for= association wins; otherwise the label's own contained control.
      const forId = label.getAttribute('for');
      const target = forId ? this.document.getElementById(forId) : null;
      if (target) {
        controls.add(target);
        continue;
      }
      const contained = label.querySelector('input,select,textarea');
      if (contained) controls.add(contained);
    }
    return this.structural(Array.from(controls));
  }

  scopeOf(handle: ScopeHandle): ScopeHandle | null {
    const el = this.scopes.get(handle.id);
    return el && el.isConnected ? handle : null;
  }
}
