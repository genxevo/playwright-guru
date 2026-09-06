/**
 * Playwright Guru — LiveDomProbe (WS3).
 * ---------------------------------------------------------------------------
 * The live-browser implementation of `DomProbe` (see `probe.ts`'s own doc
 * comment in locator-engine, which names this exact file as its WS3
 * counterpart to `FixtureDomProbe`).
 *
 * IT IS AN ADAPTER, NOT A SECOND ENGINE — it reuses the domain's single
 * implementations exactly as `FixtureDomProbe` does, and adds only the
 * mechanical DOM plumbing a real page requires that a parsed fixture does not:
 * real layout-based visibility (`visibility.ts`), a real `document.evaluate`
 * for XPath, and per-pick memoisation so a whole-document pass never repeats.
 *
 * COMPLEXITY CONTRACT (see `probe.ts`'s doc comment — binding):
 *   • `countByText('exact')` is an indexed O(1) map hit + O(k) visibility
 *     filter, served from a text index built ONCE per instance.
 *   • `countByText('substring')` scans the index's DISTINCT normalised values
 *     (never the raw element list) plus bounded per-bucket verification.
 *   • `countByRole` / `countByLabel` are O(r) over one scoped query.
 *   • `countCss` / `countXPath` are memoised per expression per scope.
 *
 * A `LiveDomProbe` is constructed FRESH for every pick and discarded after —
 * there is no cross-pick cache, so a page mutation between picks can never
 * serve a stale answer.
 */

import {
  createScopeHandle,
  measuredCount,
  unknownCount,
  matchesPlaywrightText,
  normalizeMatchText,
  resolveRole,
  computeAccessibleName,
  ROLE_CSS_SELECTORS,
  type DomProbe,
  type ProbeCount,
  type ProbeOpts,
  type ScopeHandle,
  type TextMatchMode,
  type ElementAttributes,
} from '@playwright-guru/locator-engine';
import { isElementVisible, isRoleEligible } from '../../utils/visibility';
import { extractAttributes, escapeAttrValue } from './dom-read';

type ScopeResult = { detached: true } | { detached: false; root: Document | Element };

export class LiveDomProbe implements DomProbe {
  /** Diagnostics only — never affects behaviour. */
  probeCalls = 0;
  wholeDocumentTraversals = 0;

  private readonly queryCache = new Map<string, Element[]>();
  private textIndex: Map<string, Element[]> | null = null;
  private readonly attrsCache = new WeakMap<Element, ElementAttributes>();
  private readonly scopes = new Map<number, Element>();
  private readonly scopeIds = new WeakMap<Element, number>();
  private nextScopeId = 1;

  constructor(private readonly doc: Document) {}

  // ── Scope lifecycle (runtime-only; ScopeHandle never crosses serialisation) ──

  /** Mints a scope handle bound to a live element. Not part of the DomProbe port. */
  scopeFor(el: Element): ScopeHandle {
    let id = this.scopeIds.get(el);
    if (id === undefined) {
      id = this.nextScopeId++;
      this.scopeIds.set(el, id);
      this.scopes.set(id, el);
    }
    return createScopeHandle(id);
  }

  scopeOf(handle: ScopeHandle): ScopeHandle | null {
    const el = this.scopes.get(handle.id);
    return el && this.doc.contains(el) ? handle : null;
  }

  private resolveScope(opts?: ProbeOpts): ScopeResult {
    if (!opts?.scope) return { detached: false, root: this.doc };
    const el = this.scopes.get(opts.scope.id);
    if (!el || !this.doc.contains(el)) return { detached: true };
    return { detached: false, root: el };
  }

  private scopeKey(root: Document | Element): string {
    if (root === this.doc) return '#doc';
    return `#${this.scopeIds.get(root as Element) ?? 'x'}`;
  }

  /** Memoised per pick: role resolution and name computation share one extraction. */
  private attrsFor(el: Element): ElementAttributes {
    let attrs = this.attrsCache.get(el);
    if (!attrs) {
      attrs = extractAttributes(el);
      this.attrsCache.set(el, attrs);
    }
    return attrs;
  }

  /**
   * Turns a matched element list into a `ProbeCount`, minting a scope handle
   * when — and only when — exactly one VISIBLE element matched (WS6.2, D2).
   *
   * The handle is for the visible match specifically, because `visible` is the
   * figure the resolver chains on. `measuredCount` re-checks the `visible === 1`
   * rule, so the invariant holds even if a caller here were to get it wrong.
   */
  private measure(els: readonly Element[]): ProbeCount {
    const visible = els.filter(isElementVisible);
    return measuredCount(
      els.length,
      visible.length,
      visible.length === 1 ? this.scopeFor(visible[0] as Element) : undefined,
    );
  }

  // ── CSS / XPath — delegated, memoised per expression per scope ─────────────

  countCss(selector: string, opts?: ProbeOpts): ProbeCount {
    this.probeCalls++;
    const scope = this.resolveScope(opts);
    if (scope.detached) return unknownCount({ code: 'SCOPE_DETACHED' });
    const key = `css::${this.scopeKey(scope.root)}::${selector}`;
    let matches = this.queryCache.get(key);
    if (!matches) {
      try {
        matches = Array.from(scope.root.querySelectorAll(selector));
      } catch (e) {
        return unknownCount({
          code: 'INVALID_SELECTOR',
          detail: String((e as Error).message ?? e),
        });
      }
      this.queryCache.set(key, matches);
    }
    return this.measure(matches);
  }

  countXPath(expression: string, opts?: ProbeOpts): ProbeCount {
    this.probeCalls++;
    const scope = this.resolveScope(opts);
    if (scope.detached) return unknownCount({ code: 'SCOPE_DETACHED' });
    if (typeof this.doc.evaluate !== 'function') {
      return unknownCount({ code: 'UNSUPPORTED', detail: 'document.evaluate is unavailable' });
    }
    const key = `xpath::${this.scopeKey(scope.root)}::${expression}`;
    let matches = this.queryCache.get(key);
    if (!matches) {
      try {
        const snapshot = this.doc.evaluate(
          expression,
          scope.root,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );
        matches = [];
        for (let i = 0; i < snapshot.snapshotLength; i++) {
          const node = snapshot.snapshotItem(i);
          if (node instanceof Element) matches.push(node);
        }
      } catch (e) {
        return unknownCount({ code: 'INVALID_XPATH', detail: String((e as Error).message ?? e) });
      }
      this.queryCache.set(key, matches);
    }
    return this.measure(matches);
  }

  // ── Text — indexed, built once per instance (the binding invariant) ────────

  private ensureTextIndex(): Map<string, Element[]> {
    if (this.textIndex) return this.textIndex;
    this.wholeDocumentTraversals++;
    const index = new Map<string, Element[]>();
    const body = this.doc.body;
    if (body) {
      for (const el of Array.from(body.querySelectorAll('*'))) {
        const norm = normalizeMatchText(el.textContent ?? '');
        if (!norm) continue;
        const bucket = index.get(norm);
        if (bucket) bucket.push(el);
        else index.set(norm, [el]);
      }
    }
    this.textIndex = index;
    return index;
  }

  countByText(text: string, mode: TextMatchMode, opts?: ProbeOpts): ProbeCount {
    this.probeCalls++;
    const scope = this.resolveScope(opts);
    if (scope.detached) return unknownCount({ code: 'SCOPE_DETACHED' });
    const index = this.ensureTextIndex();

    let matched: Element[];
    if (mode === 'exact') {
      // O(1) map hit + O(k) innermost-only filter over the matched bucket.
      const bucket = index.get(normalizeMatchText(text)) ?? [];
      const bucketSet = new Set(bucket);
      matched = bucket.filter((el) => !Array.from(el.children).some((c) => bucketSet.has(c)));
    } else {
      // O(u) over the index's distinct normalised values, then bounded
      // per-bucket verification — never a raw element scan.
      const needle = normalizeMatchText(text).toLowerCase();
      matched = [];
      for (const [key, bucket] of index) {
        if (!key.toLowerCase().includes(needle)) continue;
        for (const el of bucket) {
          const childMatches = Array.from(el.children).some((c) =>
            matchesPlaywrightText(c.textContent, text, { exact: false }),
          );
          if (!childMatches) matched.push(el);
        }
      }
    }

    const scoped =
      scope.root === this.doc
        ? matched
        : matched.filter((el) => (scope.root as Element).contains(el));
    return this.measure(scoped);
  }

  // ── Role — the one strategy where total === visible by definition ──────────

  countByRole(role: string, name?: string, opts?: ProbeOpts): ProbeCount {
    this.probeCalls++;
    const scope = this.resolveScope(opts);
    if (scope.detached) return unknownCount({ code: 'SCOPE_DETACHED' });
    const cssSelector = ROLE_CSS_SELECTORS[role];
    const selector = cssSelector
      ? `${cssSelector},[role="${escapeAttrValue(role)}"]`
      : `[role="${escapeAttrValue(role)}"]`;
    const key = `role::${this.scopeKey(scope.root)}::${selector}`;
    let candidates = this.queryCache.get(key);
    if (!candidates) {
      try {
        candidates = Array.from(scope.root.querySelectorAll(selector));
      } catch (e) {
        return unknownCount({
          code: 'INVALID_SELECTOR',
          detail: String((e as Error).message ?? e),
        });
      }
      this.queryCache.set(key, candidates);
    }
    const eligible = candidates
      .filter(isRoleEligible)
      .filter((el) => resolveRole(this.attrsFor(el)) === role);
    const matched =
      name === undefined
        ? eligible
        : eligible.filter((el) =>
            matchesPlaywrightText(computeAccessibleName(this.attrsFor(el)), name, { exact: false }),
          );
    return measuredCount(
      matched.length,
      matched.length,
      matched.length === 1 ? this.scopeFor(matched[0] as Element) : undefined,
    );
  }

  // ── Label — a DOM relationship no CSS selector can express ─────────────────

  countByLabel(text: string, mode: TextMatchMode, opts?: ProbeOpts): ProbeCount {
    this.probeCalls++;
    const scope = this.resolveScope(opts);
    if (scope.detached) return unknownCount({ code: 'SCOPE_DETACHED' });
    const key = `labels::${this.scopeKey(scope.root)}`;
    let labels = this.queryCache.get(key);
    if (!labels) {
      labels = Array.from(scope.root.querySelectorAll('label'));
      this.queryCache.set(key, labels);
    }
    const exact = mode === 'exact';
    const matchingLabels = labels.filter((l) =>
      matchesPlaywrightText(l.textContent, text, { exact }),
    );
    const controls = new Set<Element>();
    for (const label of matchingLabels) {
      const forId = label.getAttribute('for');
      if (forId) {
        const target = this.doc.getElementById(forId);
        if (target && scope.root.contains(target)) controls.add(target);
      }
      const contained = label.querySelector('input,select,textarea');
      if (contained) controls.add(contained);
    }
    const all = Array.from(controls);
    const visible = all.filter(
      (c) => isElementVisible(c) && matchingLabels.some((l) => isElementVisible(l)),
    );
    return measuredCount(
      all.length,
      visible.length,
      visible.length === 1 ? this.scopeFor(visible[0] as Element) : undefined,
    );
  }
}
