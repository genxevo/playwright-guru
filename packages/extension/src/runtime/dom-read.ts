/**
 * Playwright Guru — live DOM reading helpers (WS3).
 * ---------------------------------------------------------------------------
 * Mechanical DOM plumbing only: extracting attributes, resolving frame
 * identity, escaping values for the two different CSS-selector contexts. It
 * reuses the domain's single implementations (accessibility.ts, matching.ts)
 * for anything that is a RULE rather than plumbing, mirroring the pattern
 * `FixtureDomProbe` already established: "an adapter, not a second engine."
 *
 * ── E4 ─────────────────────────────────────────────────────────────────────
 * `cssEsc()` (CSS.escape) is the right tool for a CSS IDENTIFIER — `#${id}`,
 * `.${cls}`. It is the WRONG tool for a value inside a QUOTED ATTRIBUTE
 * SELECTOR — `[name="${value}"]` — because CSS.escape produces identifier
 * escapes (e.g. escaping a leading digit, spaces as `\ `) that are meaningless
 * or actively wrong inside a quoted string, where only the quote character and
 * a literal backslash need escaping. `escapeAttrValue` is that second, correct
 * tool — the same rule `resolver.ts` already uses for the same reason
 * (`escapeCssStringLiteral`), kept as a second minimal copy here because the
 * live content-script boundary must not import a runtime helper from the pure
 * domain package's internals (it is not exported from locator-engine).
 */

import {
  resolveRole,
  computeAccessibleName,
  type ElementAttributes,
  type FrameInfo,
  type LocatorStep,
} from '@playwright-guru/locator-engine';

// ─── Text ───────────────────────────────────────────────────────────────────

/** Collapses whitespace and trims. No length cap — callers cap as needed. */
export function normalizedText(v: string | null | undefined): string {
  return (v ?? '').trim().replace(/\s+/g, ' ');
}

/** Trims, collapses whitespace, and caps — `undefined` when nothing is left. */
export function safeText(v: string | null | undefined, max = 100): string | undefined {
  const t = normalizedText(v).slice(0, max);
  return t || undefined;
}

// ─── Escaping ───────────────────────────────────────────────────────────────

/** CSS **identifier** escaping — `#id`, `.class`. Not for quoted attribute values. */
export function cssEsc(str: string): string {
  try {
    return CSS.escape(str);
  } catch {
    return str.replace(/[^\w-]/g, (c) => `\\${c}`);
  }
}

/**
 * Escapes a value for a QUOTED CSS attribute selector — `[attr="${value}"]`.
 * Only the backslash and the quote character need escaping in a CSS string
 * literal. Mirrors `resolver.ts`'s `escapeCssStringLiteral` (E4's reference
 * fix) exactly.
 */
export function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ─── Attribute extraction ───────────────────────────────────────────────────

/**
 * Reads an element's semantic attributes from the live DOM.
 *
 * `maxInnerText` lets a caller ask for more than the wire contract's 100-char
 * display cap: `FACT_LIMITS.maxInnerTextLength` (1000) for the internal
 * `ElementFacts` capture, the historical 100 for everything that still
 * produces the unchanged `StoredPick` shape. One DOM read, two callers, no
 * duplicated traversal logic.
 */
export function extractAttributes(el: Element, maxInnerText = 100): ElementAttributes {
  const doc = el.ownerDocument;
  const tagName = el.tagName.toLowerCase();
  const id = el.id || undefined;
  const role = el.getAttribute('role') ?? undefined;
  const ariaLabel = el.getAttribute('aria-label') ?? undefined;
  const placeholder = el.getAttribute('placeholder') ?? undefined;
  const alt = el.getAttribute('alt') ?? undefined;
  const title = el.getAttribute('title') ?? undefined;
  const type = el.getAttribute('type') ?? undefined;
  const href = el instanceof HTMLAnchorElement ? el.href || undefined : undefined;
  const testId =
    el.getAttribute('data-testid') ??
    el.getAttribute('data-test-id') ??
    el.getAttribute('data-test') ??
    undefined;
  const innerText = safeText((el as HTMLElement).innerText, maxInnerText);

  const ariaLabelledBy = resolveAriaLabelledBy(el);

  // getByLabel matches a real <label> association only — NOT aria-labelledby,
  // which is its own, separate matcher surface (ariaLabelledBy, above).
  // `findAssociatedLabel` deliberately checks for=/wrapping first for exactly
  // this reason: it is shared with the broader `ElementContext.associatedLabel`
  // fact, which DOES consider aria-labelledby, but only as a fallback that
  // this narrower field must never see win.
  const labelText = findForOrWrappingLabel(el)?.text;

  const className = safeText(typeof el.className === 'string' ? el.className : undefined, 150);

  // Facts the Stage 2 role rules depend on. The domain may never touch a live
  // DOM (R3), so whether `list` resolves to a real <datalist> — which is what
  // Playwright checks before promoting an input to combobox — is resolved
  // here, at capture.
  const list = el.getAttribute('list') ?? undefined;
  const listIsDatalist =
    list !== undefined ? doc.getElementById(list)?.tagName.toLowerCase() === 'datalist' : undefined;
  const multiple = el instanceof HTMLSelectElement ? el.multiple : undefined;
  const size = el instanceof HTMLSelectElement ? el.size : undefined;
  const name = el.getAttribute('name') ?? undefined;

  return {
    tagName,
    id,
    type,
    role,
    ariaLabel,
    ariaLabelledBy,
    placeholder,
    alt,
    title,
    innerText,
    testId,
    labelText,
    href,
    className,
    name,
    list,
    listIsDatalist,
    multiple,
    size,
  };
}

/** How `associatedLabel` was found, matching `ElementContext.associatedLabel.via`. */
export interface AssociatedLabel {
  text: string;
  via: 'for' | 'wrapping' | 'aria-labelledby';
}

function resolveAriaLabelledBy(el: Element): string | undefined {
  const lbId = el.getAttribute('aria-labelledby');
  if (!lbId) return undefined;
  const doc = el.ownerDocument;
  const text = lbId
    .split(/\s+/)
    .map((i) => doc.getElementById(i)?.textContent?.trim() || '')
    .filter(Boolean)
    .join(' ');
  return text || undefined;
}

/**
 * The association `getByLabel` actually matches: a real `<label for=…>` or a
 * wrapping `<label>`. Deliberately excludes aria-labelledby (that is a
 * different matcher surface entirely — `ElementAttributes.ariaLabelledBy`).
 */
function findForOrWrappingLabel(el: Element): AssociatedLabel | undefined {
  const doc = el.ownerDocument;
  const id = el.id;
  if (id) {
    try {
      const found = doc.querySelector<HTMLLabelElement>(`label[for="${escapeAttrValue(id)}"]`);
      const text = safeText(found?.textContent);
      if (text) return { text, via: 'for' };
    } catch {
      /* invalid id as a selector fragment — ignore */
    }
  }

  const parentLabel = el.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as Element;
    clone.querySelectorAll('input,select,textarea,button').forEach((c) => c.remove());
    const text = safeText(clone.textContent);
    if (text) return { text, via: 'wrapping' };
  }

  return undefined;
}

/**
 * Resolves the label associated with a form control for `ElementContext`,
 * broader than `labelText`: for=/wrapping win, same as `getByLabel`, with
 * aria-labelledby considered only as a fallback so it can never shadow them.
 */
export function findAssociatedLabel(el: Element): AssociatedLabel | undefined {
  const forOrWrapping = findForOrWrappingLabel(el);
  if (forOrWrapping) return forOrWrapping;
  const text = resolveAriaLabelledBy(el);
  return text ? { text, via: 'aria-labelledby' } : undefined;
}

// ─── Frame identity ─────────────────────────────────────────────────────────

/**
 * Detects whether the current document is inside an `<iframe>` and, if so,
 * builds a selector for `page.frameLocator()`.
 *
 * The `name`-attribute branch is carried over UNCHANGED from the pre-WS3
 * implementation, including its lack of escaping — that is a separate,
 * out-of-scope observation (not the confirmed E4 defect pattern, which is
 * specifically `CSS.escape` misused for a quoted attribute value; this branch
 * calls no escaping function at all) and fixing it was not authorized this
 * pass.
 */
export function detectFrameInfo(win: Window = window): FrameInfo | null {
  if (win.self === win.top) return null;
  let frameSelector = 'iframe';
  try {
    const frameEl = win.frameElement;
    if (frameEl) {
      if (frameEl.getAttribute('name')) {
        frameSelector = `iframe[name="${frameEl.getAttribute('name')}"]`;
      } else if (frameEl.id) {
        frameSelector = `iframe#${cssEsc(frameEl.id)}`;
      } else if (frameEl.getAttribute('title')) {
        frameSelector = `iframe[title="${escapeAttrValue(frameEl.getAttribute('title')!)}"]`;
      } else if (frameEl.getAttribute('src')) {
        frameSelector = `iframe[src*="${(frameEl.getAttribute('src') ?? '').replace(/"/g, '').slice(0, 40)}"]`;
      }
    } else if (win.name) {
      frameSelector = `iframe[name="${win.name}"]`;
    } else {
      frameSelector = `iframe[src*="${new URL(win.location.href).hostname}"]`;
    }
  } catch {
    frameSelector = win.name ? `iframe[name="${win.name}"]` : 'iframe';
  }
  return { frameSelector, frameUrl: win.location.href };
}

// ─── Ancestor step (for ancestor-scoping) ───────────────────────────────────

const ANCESTOR_ROLE_MAP: Record<string, string> = {
  article: 'article',
  aside: 'complementary',
  dialog: 'dialog',
  form: 'form',
  header: 'banner',
  footer: 'contentinfo',
  main: 'main',
  nav: 'navigation',
  section: 'region',
  table: 'table',
  tr: 'row',
  td: 'cell',
  th: 'columnheader',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
};

/** Builds the locator step that would scope to this ancestor, if any applies. */
export function buildAncestorStep(ancestor: Element): LocatorStep | null {
  const tag = ancestor.tagName.toLowerCase();
  const explicitRole = ancestor.getAttribute('role');
  const role = explicitRole || ANCESTOR_ROLE_MAP[tag] || resolveRole(extractAttributes(ancestor));
  if (role) {
    const name = computeAccessibleName(extractAttributes(ancestor));
    if (name) {
      return {
        kind: 'role',
        selectorValue: { type: 'string', value: role },
        options: { name: { type: 'string', value: name } },
      };
    }
    return { kind: 'role', selectorValue: { type: 'string', value: role } };
  }
  const testId = ancestor.getAttribute('data-testid') ?? ancestor.getAttribute('data-test-id');
  if (testId) return { kind: 'testId', selectorValue: { type: 'string', value: testId } };
  return null;
}
