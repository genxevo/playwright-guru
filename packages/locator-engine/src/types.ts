/**
 * Playwright Guru — Locator Engine
 * -----------------------------------------------------------------------
 * Core domain contracts: the Locator Abstract Syntax Tree (AST).
 *
 * This module is deliberately DOM-free and rendering-free. It describes
 * *what* locator should be generated for a resolved element, not *how*
 * the DOM was inspected to get there (that's `picker`/`accessible-name`,
 * a later phase) and not *how* it's printed in any target language
 * (that's `@playwright-guru/codegen`).
 *
 * Keeping this boundary clean is what lets one engine output five
 * languages instead of five engines.
 */

/** The seven Playwright locator factory methods we support generating. */
export type LocatorKind =
  | 'role'
  | 'text'
  | 'label'
  | 'placeholder'
  | 'altText'
  | 'title'
  | 'testId';

/**
 * A matcher value that can be rendered either as an exact/substring
 * string match or as a regular expression literal.
 *
 * `flags` only applies when `type` is `'regex'` and mirrors native
 * JS RegExp flags (e.g. `"i"` for case-insensitive).
 */
export type MatcherValue =
  | { type: 'string'; value: string }
  | { type: 'regex'; value: string; flags?: string };

/**
 * Boolean/numeric ARIA state qualifiers that some locator kinds —
 * primarily `role` — can be filtered by, mirroring Playwright's
 * `GetByRoleOptions`.
 */
export interface LocatorStateOptions {
  checked?: boolean;
  pressed?: boolean;
  selected?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  /** Heading level (1-6), only meaningful when `kind === 'role'` and role is "heading". */
  level?: number;
}

/**
 * Options accompanying a single locator step. Not every field is valid
 * for every `LocatorKind` — it's the renderer's responsibility to emit
 * only the options that apply to a given kind (e.g. `level` only makes
 * sense alongside `role`).
 */
export interface LocatorStepOptions extends LocatorStateOptions {
  /** Accessible name matcher — primarily used alongside `role`. */
  name?: MatcherValue;
  /** Whether the match should be exact rather than substring/case-insensitive. */
  exact?: boolean;
}

/**
 * A single locator action — e.g. `getByRole('button', { name: 'Add' })`
 * or `getByTestId('cart-icon')` — before any language-specific rendering.
 */
export interface LocatorStep {
  kind: LocatorKind;
  /**
   * The raw value the step matches against:
   *  - `role`        → the ARIA role string (e.g. "button")
   *  - `text` / `label` / `placeholder` / `altText` / `title` → the matcher value
   *  - `testId`       → the test id attribute value
   */
  selectorValue: MatcherValue;
  options?: LocatorStepOptions;
}

/** Constraints applied via Playwright's `.filter()` method. */
export interface LocatorFilter {
  hasText?: MatcherValue;
  hasNotText?: MatcherValue;
  /** Reserved for a later phase: nested locator-based has/hasNot filters. */
  has?: LocatorChain;
  hasNot?: LocatorChain;
}

/**
 * The full locator recipe for one resolved element.
 *
 * `steps` models hierarchical scoping/chaining — e.g.
 *
 *   page.getByRole('row', { name: 'Jane Doe' }).getByRole('button', { name: 'Edit' })
 *
 * is two steps: a row-scoping step, then the button step found within it.
 * A chain with a single step is just a plain, unscoped locator.
 */
export interface LocatorChain {
  /** Ordered chain of locator steps, applied left to right (outer to inner). */
  steps: LocatorStep[];
  /** Optional `.filter()` constraint applied after the full chain resolves. */
  filter?: LocatorFilter;
  /** Optional `.nth()` ordinal access, used when the chain isn't inherently unique. */
  nth?: number;
  /**
   * When set, the entire chain is prefixed with `page.frameLocator(frameSelector).`
   * (or its language equivalent). Populated by the content script when the clicked
   * element lives inside an `<iframe>`.
   */
  frameSelector?: string;
}

// ─── Element data (moved here from extension so locator-engine is self-contained) ──

/**
 * Raw semantic attributes captured from a clicked DOM element by the content
 * script. Defined in locator-engine (not the extension) so the accessibility,
 * scorer, and engine modules can operate on it without touching the browser API.
 */
export interface ElementAttributes {
  tagName: string;
  id?: string;
  type?: string;           // input[type=…]
  role?: string;           // explicit aria-role attribute value
  ariaLabel?: string;      // aria-label attribute value
  ariaLabelledBy?: string; // already-resolved text of the aria-labelledby target
  placeholder?: string;
  alt?: string;
  title?: string;
  innerText?: string;      // first 100 chars of visible innerText
  testId?: string;         // data-testid / data-test-id / data-test
  labelText?: string;      // text content of the associated <label> element
  href?: string;
  className?: string;
  /** The name attribute — common on form elements like input, select, textarea. */
  name?: string;

  // ── Facts the capture layer must resolve, because role rules depend on them
  //    and the domain layer may never touch a live DOM (R3).

  /** The `list` attribute value on an input, if present. */
  list?: string;
  /**
   * Whether `list` actually resolves to a `<datalist>`.
   *
   * Playwright checks the referenced element's tag before promoting an input
   * to `combobox`; a `list` pointing at a `<div>` changes nothing. The domain
   * cannot follow that reference itself, so capture resolves it here.
   */
  listIsDatalist?: boolean;
  /** `<select multiple>`. */
  multiple?: boolean;
  /** The `size` attribute on a `<select>`, parsed. */
  size?: number;
}

/**
 * Information about the iframe the clicked element lives in, if any.
 * Populated by the content script (which runs inside the frame context).
 */
export interface FrameInfo {
  /** CSS selector the consumer should pass to `page.frameLocator()`. */
  frameSelector: string;
  /** The href of the frame document, for display / debugging. */
  frameUrl?: string;
}
