/**
 * Playwright Guru — Multi-Candidate Scorer (pure, no DOM).
 *
 * Generates all plausible LocatorStep candidates for an element and ranks
 * them once the content script has supplied per-candidate DOM match counts.
 *
 * Scoring philosophy — see ./ranking.ts for the policy and its evidence:
 *   • How well a candidate resolves dominates everything. A unique locator of
 *     any kind outranks an ambiguous one of any kind.
 *   • Within a tier, strategies are preferred in the order Playwright's own
 *     selectorGenerator prefers them — test id first, then role, and so on.
 *   • A zero-match candidate is kept in the list, ranked last, so the caller
 *     can still see what was tried.
 */

import type { LocatorStep, ElementAttributes } from './types';
import { resolveRole, computeAccessibleName } from './accessibility';
import { scoreForRanking } from './ranking';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ScoredCandidate {
  step: LocatorStep;
  /** Number of DOM elements this locator matches. -1 = unknown. */
  uniqueCount: number;
  /**
   * How many elements Playwright's locator for this strategy would actually
   * resolve, which is not always `uniqueCount`.
   *
   * `getByRole` filters by accessibility-tree membership, so for it the two are
   * the same. The other six `getBy*` strategies match hidden elements, so a
   * locator can look uniquely visible while Playwright resolves several and
   * throws a strict-mode violation. Optional because not every surface measures
   * it — the DevTools panel builds candidates from its own eval and omits it,
   * and consumers must treat `undefined` as "not measured", never as zero.
   *
   * Purely informational: scoring and ranking read `uniqueCount` only.
   */
  totalCount?: number;
  /** Computed score. Higher = better. */
  score: number;
}

// ─── Scoring ───────────────────────────────────────────────────────────────
//
// The policy, its Playwright evidence and the score direction all live in
// ./ranking.ts. Nothing here invents a number.

/**
 * Scores a candidate given how many elements it matched. **Higher is better.**
 *
 * Delegates to the ranking policy so there is exactly one place where strategy
 * preference is decided — the previous magic-number table disagreed with
 * Playwright's own generator on test-ids and nothing caught it.
 */
export function scoreCandidate(step: LocatorStep, uniqueCount: number): number {
  return scoreForRanking(step.kind, uniqueCount);
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
  const role          = resolveRole(attrs);
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
