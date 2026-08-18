/**
 * Playwright Guru — ElementFacts (WS0 contract).
 * ---------------------------------------------------------------------------
 * The serialisable, BOUNDED description of a picked element and its position in
 * the document.
 *
 * WHY THIS EXISTS
 * Phase 0 found that CSS/XPath generation ran from attributes alone, with no
 * knowledge of the element's surroundings — so it emitted `form > input` for
 * elements not inside a form, `input:first-child` for elements that were not
 * first children, and stamped each with a reliability badge that had never been
 * measured. `ElementContext` supplies the missing truths, so a structural
 * selector is only ever emitted when the structure it claims actually holds.
 *
 * WHY EVERY FIELD IS CAPPED
 * These facts travel inside a `PickSnapshot`, which is a compact fact model and
 * not a DOM snapshot. Unbounded fields are how a fact model quietly becomes a
 * serialised document. The caps in `FACT_LIMITS` are the enforcement, and
 * `attributes.innerText` is the field that matters most: picking `<body>` on a
 * content-heavy page would otherwise serialise the entire page text.
 */

import type { ElementAttributes } from './types';

// ─── Limits ─────────────────────────────────────────────────────────────────

/**
 * Bounds for every field that could grow with page size.
 *
 * Chosen so that a realistic worst case — picking a large container on a
 * text-heavy page — still lands inside the snapshot budget.
 */
export const FACT_LIMITS = {
  /** Ancestors retained, nearest first. Deep enough for real hierarchy. */
  maxAncestors: 8,
  /** Ancestors retained in the reduced form used by recorded workflows. */
  maxLiteAncestors: 3,
  /** Classes retained per ancestor. Utility-class soup is unbounded otherwise. */
  maxAncestorClasses: 10,
  maxAncestorClassLength: 50,
  /** An ancestor row can contain a great deal of text. */
  maxAccessibleNameLength: 200,
  /** Enough to identify a sibling, not enough to duplicate its content. */
  maxSiblingTextLength: 80,
  maxShadowHostPath: 4,
  /**
   * Text retained for MATCHING. The highest-risk field in the whole model.
   * When text exceeds this, `ElementFacts.textTruncated` is set and the engine
   * must not offer an exact-text locator — it could not match.
   */
  maxInnerTextLength: 1_000,
  /** Text retained for DISPLAY. Never used for locator generation. */
  maxInnerTextDisplayLength: 100,
  maxClassNameLength: 150,
  maxLabelTextLength: 200,
} as const;

// ─── Frames ─────────────────────────────────────────────────────────────────

/** Where an element lives when it is not in the top document. */
export interface FrameRef {
  /** CSS selector to pass to `page.frameLocator()`. */
  frameSelector: string;
  /** For display and debugging only. */
  frameUrl?: string;
  /** 0 = top document. */
  depth: number;
}

// ─── Structural facts ───────────────────────────────────────────────────────

/**
 * An immediate sibling.
 *
 * Immediate siblings only — never a sibling list. This is the only honest basis
 * for emitting `label + input` or `E ~ F`.
 */
export interface SiblingFact {
  tagName: string;
  role?: string;
  /** Capped at `maxSiblingTextLength`. */
  text?: string;
}

/** An ancestor, with enough detail to scope a locator to it. */
export interface AncestorFact {
  tagName: string;
  id?: string;
  /** Capped at `maxAncestorClasses` entries. */
  classList: string[];
  role?: string;
  /** Capped at `maxAccessibleNameLength`. */
  accessibleName?: string;
  testId?: string;
  indexInParent: number;
  /** 1 = direct parent. */
  depth: number;
  /**
   * Resolved during capture: does a locator for this ancestor match exactly one
   * element? Only a unique ancestor is a safe scoping anchor.
   */
  isUnique: boolean;
}

/** The element's real position in the document. */
export interface ElementContext {
  /** Nearest first. Capped at `maxAncestors`. */
  ancestors: AncestorFact[];

  // Position — the only honest basis for :nth-child / :nth-of-type
  indexInParent: number;
  indexOfType: number;
  siblingCount: number;
  siblingCountOfType: number;
  isFirstChild: boolean;
  isLastChild: boolean;
  isOnlyChild: boolean;

  previousSibling?: SiblingFact;
  nextSibling?: SiblingFact;

  /** How the label was associated, when one was found. */
  associatedLabel?: {
    text: string;
    via: 'for' | 'wrapping' | 'aria-labelledby';
  };

  /** Set only when the element genuinely sits inside a form. */
  formAncestor?: {
    /** Ancestor depth, so `form > el` is only emitted when depth is 1. */
    depth: number;
    id?: string;
    name?: string;
  };

  /** Captured in Phase 1; acted upon in Phase 2. */
  inShadowRoot: boolean;
  /** Capped at `maxShadowHostPath`. */
  shadowHostPath?: string[];

  frame?: FrameRef;
}

// ─── Facts ──────────────────────────────────────────────────────────────────

/** Everything the engines need about a picked element. Bounded by construction. */
export interface ElementFacts {
  attributes: ElementAttributes;
  context: ElementContext;
  /**
   * True when `attributes.innerText` was capped at `maxInnerTextLength`.
   * The engine must emit `TEXT_TRUNCATED` and withhold exact-text locators.
   */
  textTruncated: boolean;
}

/**
 * The reduced fact set stored per recorded action.
 *
 * A recorded workflow may hold up to 100 actions. Full `ElementFacts` per action
 * would breach the persisted-state budget, so recordings keep only what is
 * needed to re-render the same action with a different locator strategy later.
 */
export interface ElementFactsLite {
  attributes: ElementAttributes;
  /** Capped at `maxLiteAncestors`. */
  ancestors: AncestorFact[];
  indexInParent: number;
  associatedLabel?: { text: string; via: 'for' | 'wrapping' | 'aria-labelledby' };
  inShadowRoot: boolean;
  frame?: FrameRef;
}

// ─── Bounding helpers ───────────────────────────────────────────────────────

/**
 * Truncates a string to `max`, reporting whether it was cut.
 *
 * Returns `undefined` for empty input so optional fields stay absent rather
 * than serialising an empty string.
 */
export function boundText(
  raw: string | undefined,
  max: number,
): { value: string | undefined; truncated: boolean } {
  if (raw === undefined || raw.length === 0) return { value: undefined, truncated: false };
  if (raw.length <= max) return { value: raw, truncated: false };
  return { value: raw.slice(0, max), truncated: true };
}

/** Caps an array's length. */
export function boundList<T>(items: readonly T[], max: number): T[] {
  return items.length <= max ? [...items] : items.slice(0, max);
}

/** Reduces full facts to the form a recorded action stores. */
export function toElementFactsLite(facts: ElementFacts): ElementFactsLite {
  const lite: ElementFactsLite = {
    attributes: facts.attributes,
    ancestors: boundList(facts.context.ancestors, FACT_LIMITS.maxLiteAncestors),
    indexInParent: facts.context.indexInParent,
    inShadowRoot: facts.context.inShadowRoot,
  };
  if (facts.context.associatedLabel) lite.associatedLabel = facts.context.associatedLabel;
  if (facts.context.frame) lite.frame = facts.context.frame;
  return lite;
}
