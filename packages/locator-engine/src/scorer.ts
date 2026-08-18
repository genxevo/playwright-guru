/**
 * Playwright Guru — Multi-Candidate Scorer (pure, no DOM).
 *
 * Generates all plausible LocatorStep candidates for an element and ranks
 * them once the content script has supplied per-candidate DOM match counts.
 *
 * Scoring philosophy:
 *   • A unique match (count === 1) earns a large bonus so it always
 *     outranks any non-unique candidate of equal strategy type.
 *   • Within tied uniqueness, user-facing contracts (role, label) beat
 *     fragile attribute contracts (testId, title).
 *   • A zero-match candidate (broken locator) is heavily penalised but kept
 *     in the ranked list so the caller can see what was tried.
 */

import type { LocatorStep, ElementAttributes } from './types';
import { getImplicitRole, computeAccessibleName } from './accessibility';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ScoredCandidate {
  step: LocatorStep;
  /** Number of DOM elements this locator matches. -1 = unknown. */
  uniqueCount: number;
  /** Computed score. Higher = better. */
  score: number;
}

// ─── Scoring weights ───────────────────────────────────────────────────────

/** Base score for each locator strategy (before uniqueness bonus). */
const BASE_SCORES: Record<LocatorStep['kind'], number> = {
  role:        1_000,
  label:         900,
  placeholder:   800,
  text:          700,
  altText:       600,
  title:         500,
  testId:        400,
};

/** Bonus added when a candidate uniquely matches exactly one element. */
const UNIQUE_BONUS   = 10_000;
/** Penalty per extra element beyond the first (non-unique match). */
const AMBIGUITY_COST =    100;
/** Penalty for a locator that matches nothing (broken). */
const NO_MATCH_PENALTY = 5_000;

/**
 * Calculates the final score for a candidate given its DOM match count.
 */
export function scoreCandidate(step: LocatorStep, uniqueCount: number): number {
  const base = BASE_SCORES[step.kind] ?? 0;
  if (uniqueCount === 1)  return base + UNIQUE_BONUS;
  if (uniqueCount === 0)  return base - NO_MATCH_PENALTY;
  if (uniqueCount < 0)    return base;           // unknown: fall back to base score
  return base - (uniqueCount - 1) * AMBIGUITY_COST;
}

// ─── Candidate generation ──────────────────────────────────────────────────

const NON_INTERACTIVE_TAGS = new Set([
  'div', 'span', 'p', 'section', 'article', 'aside', 'main',
  'header', 'footer', 'nav', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'tr', 'td', 'th', 'tbody', 'thead', 'tfoot',
  'figure', 'figcaption', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

/**
 * Generates all plausible LocatorStep candidates for an element.
 * The content script runs DOM queries for each and supplies uniqueCount;
 * then `scoreCandidate` and `rankCandidates` select the winner.
 */
export function buildCandidateSteps(attrs: ElementAttributes): LocatorStep[] {
  const role          = attrs.role ?? getImplicitRole(attrs);
  const accessibleName = computeAccessibleName(attrs);
  const candidates: LocatorStep[] = [];
  const tag = attrs.tagName.toLowerCase();

  // ── 1. getByRole with accessible name ────────────────────────────────────
  if (role) {
    candidates.push({
      kind: 'role',
      selectorValue: { type: 'string', value: role },
      options: accessibleName
        ? { name: { type: 'string', value: accessibleName } }
        : undefined,
    });
    // Also try the role without a name constraint (lower uniqueness chance
    // but useful when the accessible name is dynamic or empty)
    if (accessibleName) {
      candidates.push({
        kind: 'role',
        selectorValue: { type: 'string', value: role },
      });
    }
  }

  // ── 2. getByLabel ────────────────────────────────────────────────────────
  if (attrs.labelText) {
    candidates.push({
      kind: 'label',
      selectorValue: { type: 'string', value: attrs.labelText },
    });
  }

  // ── 3. getByPlaceholder ──────────────────────────────────────────────────
  if (attrs.placeholder) {
    candidates.push({
      kind: 'placeholder',
      selectorValue: { type: 'string', value: attrs.placeholder },
    });
  }

  // ── 4. getByText (non-interactive elements only, exact match) ─────────────
  // Playwright recommends getByText only for non-interactive elements
  if (attrs.innerText && NON_INTERACTIVE_TAGS.has(tag)) {
    candidates.push({
      kind: 'text',
      selectorValue: { type: 'string', value: attrs.innerText },
      options: { exact: true },
    });
  }

  // ── 5. getByAltText ──────────────────────────────────────────────────────
  if (attrs.alt) {
    candidates.push({
      kind: 'altText',
      selectorValue: { type: 'string', value: attrs.alt },
    });
  }

  // ── 6. getByTitle ────────────────────────────────────────────────────────
  if (attrs.title) {
    candidates.push({
      kind: 'title',
      selectorValue: { type: 'string', value: attrs.title },
    });
  }

  // ── 7. getByTestId ───────────────────────────────────────────────────────
  if (attrs.testId) {
    candidates.push({
      kind: 'testId',
      selectorValue: { type: 'string', value: attrs.testId },
    });
  }

  return candidates;
}

/** Sorts ScoredCandidates by score descending. Returns a new array. */
export function rankCandidates(scored: ScoredCandidate[]): ScoredCandidate[] {
  return [...scored].sort((a, b) => b.score - a.score);
}

/** Returns the first candidate that is uniquely matching (count === 1). */
export function pickBestUnique(ranked: ScoredCandidate[]): ScoredCandidate | undefined {
  return ranked.find(c => c.uniqueCount === 1);
}
