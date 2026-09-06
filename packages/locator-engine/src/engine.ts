/**
 * Playwright Guru — Locator Chain Orchestration (pure, no DOM).
 *
 * Takes pre-scored candidates (with uniqueness counts from the content
 * script's DOM queries) and produces the optimal LocatorChain.
 *
 * Two public entry points:
 *   • buildLocatorChain        — used by the content script (has DOM counts)
 *   • buildLocatorChainFromAttributes — used by the UI as a DOM-free fallback
 */

import type { LocatorChain, LocatorStep, FrameInfo, ElementAttributes } from './types';
import {
  buildCandidateSteps,
  scoreCandidate,
  rankCandidates,
  pickBestUnique,
  type ScoredCandidate,
} from './scorer';
import { resolveRole, computeAccessibleName } from './accessibility';

// ─── Public types ──────────────────────────────────────────────────────────

export interface ChainOptions {
  frameInfo?: FrameInfo;
  /**
   * When set, the produced chain is scoped to this parent chain.
   * The parent steps are prepended: `parent.steps ++ [winning_child_step]`.
   */
  parentChain?: LocatorChain;
}

// ─── Core orchestration ────────────────────────────────────────────────────

/**
 * Builds the best LocatorChain from a set of candidates whose DOM match
 * counts have been supplied by the content script.
 *
 * Selection order:
 *   1. Best unique candidate (uniqueCount === 1) by strategy score.
 *   2. If none is unique, use best by score + add `.nth(0)` as a signal
 *      that the locator may be ambiguous (the UI can flag this).
 *   3. If the list is empty, synthesise a fallback from raw attrs.
 */
export function buildLocatorChain(
  attrs: ElementAttributes,
  candidates: Array<{ step: LocatorStep; uniqueCount: number }>,
  options: ChainOptions = {}
): LocatorChain {
  const scored: ScoredCandidate[] = candidates.map(c => ({
    ...c,
    score: scoreCandidate(c.step, c.uniqueCount),
  }));
  const ranked = rankCandidates(scored);

  const winner = pickBestUnique(ranked) ?? ranked[0];

  if (!winner) {
    return fallbackChain(attrs, options);
  }

  const steps: LocatorStep[] = options.parentChain
    ? [...options.parentChain.steps, winner.step]
    : [winner.step];

  const chain: LocatorChain = { steps };
  if (options.frameInfo?.frameSelector) {
    chain.frameSelector = options.frameInfo.frameSelector;
  }
  // Only add nth() when no unique candidate exists and count is ambiguous
  if (!pickBestUnique(ranked) && winner.uniqueCount > 1) {
    chain.nth = 0;
  }
  return chain;
}

/**
 * Convenience wrapper for the UI layer — builds a locator chain from
 * attributes alone, without DOM uniqueness data. All candidates receive
 * a uniqueCount of -1 (unknown) so scoring falls back to strategy priority.
 */
export function buildLocatorChainFromAttributes(
  attrs: ElementAttributes,
  frameInfo?: FrameInfo
): LocatorChain {
  const steps = buildCandidateSteps(attrs);
  const unknownCandidates = steps.map(step => ({ step, uniqueCount: -1 as const }));
  return buildLocatorChain(attrs, unknownCandidates, { frameInfo });
}

// ─── Human-readable element label (for history list in the UI) ─────────────

/** Returns a compact label for display in the element history pane. */
export function getElementDescription(attrs: ElementAttributes): string {
  const name =
    attrs.ariaLabel ??
    attrs.labelText ??
    attrs.innerText?.slice(0, 40) ??
    attrs.placeholder ??
    attrs.alt ??
    attrs.id ??
    attrs.testId;
  const typeHint = attrs.type ? `[${attrs.type}]` : '';
  const suffix   = name ? `: ${name}` : '';
  return `${attrs.tagName}${typeHint}${suffix}`;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function fallbackChain(attrs: ElementAttributes, options: ChainOptions): LocatorChain {
  const role = resolveRole(attrs);
  const name = computeAccessibleName(attrs);

  const step: LocatorStep = role
    ? {
        kind: 'role',
        selectorValue: { type: 'string', value: role },
        options: name ? { name: { type: 'string', value: name } } : undefined,
      }
    : attrs.innerText
    ? { kind: 'text', selectorValue: { type: 'string', value: attrs.innerText } }
    : attrs.testId
    ? { kind: 'testId', selectorValue: { type: 'string', value: attrs.testId } }
    : { kind: 'text', selectorValue: { type: 'string', value: attrs.tagName } };

  const chain: LocatorChain = { steps: [step] };
  if (options.frameInfo?.frameSelector) {
    chain.frameSelector = options.frameInfo.frameSelector;
  }
  return chain;
}
