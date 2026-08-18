/**
 * Playwright Guru — DomProbe (WS0 contract).
 * ---------------------------------------------------------------------------
 * THE DOMAIN'S ONLY WINDOW ONTO A LIVE DOM.
 *
 * Before this port existed the domain layer was pure *because it was blind*: it
 * could not ask the DOM anything, so it guessed, and reliability signals shown
 * to the user were asserted rather than measured. `DomProbe` resolves that
 * without contaminating the domain: engines receive a probe by injection and
 * stay free of `document`, `window`, `chrome.*` and every extension API.
 *
 * Two implementations exist across the system:
 *   • a live implementation in the content script / DevTools probe (WS3)
 *   • a fixture implementation over parsed HTML, used by tests (WS1)
 *
 * COHESION
 * --------
 * This interface is deliberately small. It answers DOM *questions the domain
 * cannot answer for itself* and nothing else. It is not, and must not become,
 * "everything the browser can do".
 *
 * It has two kinds of member, and the distinction matters when judging whether
 * a future addition belongs here:
 *
 *   LOCATOR QUERIES (5)   countCss · countXPath · countByText · countByRole ·
 *                         countByLabel
 *                         Each corresponds to locator semantics in the locked
 *                         AST. A new *query* method that does not map to a
 *                         locator strategy is a design smell.
 *
 *   SCOPE LIFECYCLE (1)   scopeOf
 *                         NOT a locator strategy, and not counted against the
 *                         rule above. A runtime helper that tells the caller
 *                         whether an opaque scope reference is still attached,
 *                         so a scoped query can fail honestly instead of
 *                         silently querying the wrong root.
 *
 * COMPLEXITY CONTRACT (binding — see the Phase 1 blueprint, Performance)
 * ---------------------------------------------------------------------
 *   countByText(mode: 'exact')      indexed lookup: O(1) average map hit, plus
 *                                   O(k) visibility filtering over the matched
 *                                   bucket (k = elements sharing that exact
 *                                   normalised string; typically 1–3).
 *
 *   countByText(mode: 'substring')  NOT O(1). O(u) over the index's DISTINCT
 *                                   normalised text values, plus O(m) bounded
 *                                   verification over matched buckets. On real
 *                                   pages u is far smaller than the node count.
 *                                   No DOM traversal, no forced layout.
 *
 *   countByRole / countByLabel      O(r) over one scoped query's result set,
 *                                   plus name comparison across that set.
 *
 *   countCss / countXPath           delegated to the browser engine; memoised
 *                                   per pick by expression.
 *
 * INVARIANT: no implementation may perform a whole-document text traversal
 * (`document.body.innerText`, or reading `innerText` across every element) more
 * than ONCE per pick. Whole-document work is amortised across all candidates,
 * never repeated per candidate.
 */

/** How a text value should be compared. Mirrors Playwright's `exact` option. */
export type TextMatchMode = 'exact' | 'substring';

/** Sentinel for "not measured". Kept for continuity with the existing scorer. */
export const UNKNOWN_MATCH_COUNT = -1;

export type ProbeErrorCode =
  'INVALID_SELECTOR' | 'INVALID_XPATH' | 'BUDGET_EXHAUSTED' | 'SCOPE_DETACHED' | 'UNSUPPORTED';

export interface ProbeError {
  code: ProbeErrorCode;
  /** Machine-oriented detail (an engine message, an expression). Never UI copy. */
  detail?: string;
}

/**
 * Both counts are always reported.
 *
 * `visible` is what the UI leads with, because Playwright's locators are
 * visibility-aware by default. `total` is retained so the UI can say
 * "1 visible (2 total, 1 hidden)" — which is more informative than either
 * number alone, and teaches the semantics that make locators behave as they do.
 */
export interface ProbeCount {
  total: number;
  visible: number;
  /** Present when the probe could not answer. Counts are then meaningless. */
  error?: ProbeError;
}

/**
 * An opaque reference to a scoping element.
 *
 * RUNTIME-ONLY. A ScopeHandle is meaningless once serialised and must never
 * appear in a PickSnapshot or in persisted state — `snapshot.ts` enforces this
 * with a structural guard, and a WS0 test asserts it.
 */
export type ScopeHandle = {
  readonly __brand: 'ScopeHandle';
  readonly id: number;
};

export interface ProbeOpts {
  /** Restrict the query to a subtree. */
  scope?: ScopeHandle;
  /** Defaults to `true` — mirrors Playwright's visibility semantics. */
  visibleOnly?: boolean;
}

export interface DomProbe {
  /** Elements matching a CSS selector. */
  countCss(selector: string, opts?: ProbeOpts): ProbeCount;

  /** Elements matching an XPath expression. */
  countXPath(expression: string, opts?: ProbeOpts): ProbeCount;

  /** Elements whose normalised text matches. Served from a prebuilt index. */
  countByText(text: string, mode: TextMatchMode, opts?: ProbeOpts): ProbeCount;

  /** Elements with the given ARIA role, optionally filtered by accessible name. */
  countByRole(role: string, name?: string, opts?: ProbeOpts): ProbeCount;

  /**
   * Form controls associated with a matching `<label>`.
   *
   * This exists because label→control association (`for=`, or containment) is a
   * DOM relationship that cannot be expressed as a CSS selector and cannot be
   * computed from extracted attributes. `LocatorKind: 'label'` is part of the
   * locked AST, so the single resolver must be able to serve it; without this
   * method the resolver would have to report `unknown` for every
   * `getByLabel(...)` candidate, i.e. guess.
   */
  countByLabel(text: string, mode: TextMatchMode, opts?: ProbeOpts): ProbeCount;

  /** Resolve a scope handle, or `null` if it is no longer attached. */
  scopeOf(handle: ScopeHandle): ScopeHandle | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Mints a ScopeHandle. Only runtime probe implementations and tests use this. */
export function createScopeHandle(id: number): ScopeHandle {
  return { __brand: 'ScopeHandle', id } as ScopeHandle;
}

/** Structural guard, used by the snapshot serialisation protection. */
export function isScopeHandle(value: unknown): value is ScopeHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __brand?: unknown }).__brand === 'ScopeHandle'
  );
}

/** A count that could not be measured. */
export function unknownCount(error?: ProbeError): ProbeCount {
  return { total: UNKNOWN_MATCH_COUNT, visible: UNKNOWN_MATCH_COUNT, ...(error ? { error } : {}) };
}

/** Convenience for implementations that measured both figures. */
export function measuredCount(total: number, visible: number): ProbeCount {
  return { total, visible };
}
