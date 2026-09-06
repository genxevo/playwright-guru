/**
 * WS1 — happy-dom fixture harness (item 1 of the remaining WS1 sequence).
 *
 * A deterministic, browser-free DOM for exercising the locator engine's probe
 * contract without launching Chromium for every case. It parses fixture HTML
 * with happy-dom and hands back an isolated `Document`, plus a mechanical
 * DOM → `ElementAttributes` extractor the probe uses to reach the domain's own
 * role / accessible-name functions.
 *
 * ── R3 SAFETY ─────────────────────────────────────────────────────────────
 * The locator-engine test scope runs in vitest's `node` environment with NO
 * DOM, and `contracts.test.ts` asserts `globalThis.document`/`window` stay
 * `undefined`. This harness therefore uses an explicit `new Window()` INSTANCE
 * and never assigns to any global. Verified: constructing a happy-dom Window
 * does not populate `globalThis.document`/`window`. The domain source stays
 * DOM-free; only this test helper touches a (local, injected) DOM.
 *
 * ── FIDELITY (read before trusting a count) ───────────────────────────────
 * happy-dom is a parser + DOM model, NOT a browser:
 *   • NO layout engine — `getBoundingClientRect()` is always 0×0.
 *   • NO XPath engine — `document.evaluate` is undefined.
 *   • `getComputedStyle` reflects INLINE styles only; ancestor `display:none`
 *     is not propagated and the `[hidden]` UA rule is not applied.
 * These are real limitations, isolated here and surfaced honestly by
 * `FixtureDomProbe` (XPath → `UNSUPPORTED`; visibility → `visible === total`),
 * never papered over by changing production semantics. Box-geometry visibility
 * and accessibility-tree filtering are a REAL-CHROMIUM / Playwright evidence
 * level (the conformance golden), not a fixture-harness one.
 */

import { Window } from 'happy-dom';

import type { ElementAttributes } from '../../src/types';

/** An isolated fixture DOM. Each fixture owns its own happy-dom Window. */
export interface Fixture {
  /** The fixture's document. Never a global — scoped to this fixture. */
  readonly document: Document;
  /** `document.querySelector`, typed. */
  query(selector: string): Element | null;
  /** `document.querySelectorAll` as a real array. */
  queryAll(selector: string): Element[];
  /** `document.getElementById`. */
  byId(id: string): Element | null;
  /** Releases the happy-dom Window. Optional — fixtures are independent. */
  dispose(): void;
}

/**
 * Builds an isolated fixture DOM from a body-fragment (or full-document) HTML
 * string. Each call returns a fresh, independent Window — that independence IS
 * the reset/isolation contract: two fixtures never share state.
 */
export function createFixture(html: string): Fixture {
  const win = new Window();
  const doc = win.document as unknown as Document;
  // Parse through document.write (not innerHTML — repo lint forbids innerHTML
  // assignment, and this is the idiomatic happy-dom parse path). A bare body
  // fragment is wrapped so it lands inside <body>; a full document is written
  // as-is.
  const isFullDoc = /<html[\s>]/i.test(html) || /<!doctype/i.test(html);
  (doc as unknown as { write(markup: string): void }).write(
    isFullDoc ? html : `<!doctype html><html><body>${html}</body></html>`,
  );

  return {
    document: doc,
    query: (selector) => doc.querySelector(selector),
    queryAll: (selector) => Array.from(doc.querySelectorAll(selector)),
    byId: (id) => doc.getElementById(id),
    dispose: () => {
      try {
        (win as unknown as { close?: () => void }).close?.();
      } catch {
        /* happy-dom versions differ; disposal is best-effort */
      }
    },
  };
}

// ─── DOM → ElementAttributes (mechanical extraction, NOT engine intelligence) ─
//
// This reads raw attributes off a node and resolves the one DOM RELATIONSHIP the
// domain cannot express from attributes alone — label association. It computes
// NO roles, NO accessible names, NO visibility: those come from the domain's own
// `accessibility.ts` applied to the returned attributes. Keeping this split is
// the whole point — the harness supplies facts, the domain supplies judgement.

/** Reads the associated `<label>` text for a control (`for=` then containment). */
function labelTextFor(el: Element): string | undefined {
  const id = el.getAttribute('id');
  if (id) {
    const forLabel = el.ownerDocument?.querySelector(`label[for="${cssEscape(id)}"]`);
    const text = forLabel?.textContent?.trim();
    if (text) return text;
  }
  // Containment: <label>Name <input></label> — the label's text minus controls.
  let node: Element | null = el.parentElement;
  while (node) {
    if (node.tagName === 'LABEL') {
      const clone = node.cloneNode(true) as Element;
      // Use parentNode.removeChild, not `.remove()`: on a <select>, `.remove()`
      // is HTMLSelectElement.remove(index) (removes an option), not ChildNode's.
      // Array.from first — snapshot before mutating.
      for (const c of Array.from(clone.querySelectorAll('input,select,textarea,button'))) {
        c.parentNode?.removeChild(c);
      }
      const text = clone.textContent?.trim();
      return text || undefined;
    }
    node = node.parentElement;
  }
  return undefined;
}

/** Minimal CSS.escape for the id-in-attribute-selector case. */
function cssEscape(value: string): string {
  return value.replace(/["\\\]#.:>~+*\s]/g, '\\$&');
}

const attr = (el: Element, name: string): string | undefined => el.getAttribute(name) ?? undefined;

/**
 * Extracts the `ElementAttributes` the domain layer reasons about, from a live
 * (fixture) DOM element. Mechanical only — mirrors the SHAPE of the extension's
 * capture without importing it (WS1 is out of scope for extension code).
 */
export function extractAttributes(el: Element): ElementAttributes {
  const tagName = el.tagName.toLowerCase();
  const list = attr(el, 'list');
  const listIsDatalist =
    list !== undefined
      ? el.ownerDocument?.getElementById(list)?.tagName.toLowerCase() === 'datalist'
      : undefined;

  const sizeRaw = attr(el, 'size');
  const size = sizeRaw !== undefined && sizeRaw !== '' ? Number(sizeRaw) : undefined;

  // aria-labelledby is resolved to text by the capture layer; do the same here.
  let ariaLabelledBy: string | undefined;
  const labelledByIds = attr(el, 'aria-labelledby');
  if (labelledByIds) {
    const text = labelledByIds
      .split(/\s+/)
      .map((id) => el.ownerDocument?.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ')
      .trim();
    ariaLabelledBy = text || undefined;
  }

  return {
    tagName,
    id: attr(el, 'id'),
    type: attr(el, 'type'),
    role: attr(el, 'role'),
    ariaLabel: attr(el, 'aria-label'),
    ariaLabelledBy,
    placeholder: attr(el, 'placeholder'),
    alt: attr(el, 'alt'),
    title: attr(el, 'title'),
    innerText: (el as { textContent?: string }).textContent?.trim() || undefined,
    testId:
      attr(el, 'data-testid') ?? attr(el, 'data-test-id') ?? attr(el, 'data-test') ?? undefined,
    labelText: labelTextFor(el),
    href: attr(el, 'href'),
    className: attr(el, 'class'),
    name: attr(el, 'name'),
    list,
    listIsDatalist,
    multiple: el.hasAttribute('multiple') ? true : undefined,
    size: Number.isFinite(size) ? size : undefined,
  };
}
