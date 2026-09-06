/**
 * Playwright Guru — pick capture, shipped hot path (WS3).
 * ---------------------------------------------------------------------------
 * `capturePick(el)` is what `content.ts` calls on every click and every
 * DevTools pick. Same ranking policy as before WS3 (`scoreCandidate` /
 * `rankCandidates` / `buildLocatorChain`, unchanged) — only the SOURCE of the
 * match counts changes, from the content script's old ad-hoc, O(n²),
 * `===`-on-raw-text counting to the shared `LiveDomProbe` + `resolveStep`.
 *
 * The richer WS0 fact model (`ElementContext`, `ElementFacts`, `PickSnapshot`)
 * lives in `./fact-model.ts`, a SEPARATE module this file does not import —
 * see that file's header for why. `resolveCandidates`/`findUniqueAncestor` are
 * exported so `fact-model.ts` can reuse this exact resolution pass without
 * content.ts's bundle ever pulling in fact-model.ts's exclusive dependencies.
 */

import {
  buildCandidateSteps,
  scoreCandidate,
  rankCandidates,
  pickBestUnique,
  buildLocatorChain,
  resolveStep,
  FACT_LIMITS,
  SNAPSHOT_BUDGET,
  type ScoredCandidate,
  type LocatorStep,
  type LocatorChain,
  type ElementAttributes,
  type ResolveResult,
} from '@playwright-guru/locator-engine';
import type { StoredPick } from '../../utils/messaging';
import { LiveDomProbe } from './probe';
import { extractAttributes, buildAncestorStep, detectFrameInfo, safeText } from './dom-read';

// ─── Shared resolution pass ─────────────────────────────────────────────────

export interface Resolution {
  attrs: ElementAttributes;
  probe: LiveDomProbe;
  chain: LocatorChain;
  ranked: ScoredCandidate[];
  ancestorStep: LocatorStep | undefined;
  results: Map<LocatorStep, ResolveResult>;
}

export function resolveCandidates(el: Element): Resolution {
  const doc = el.ownerDocument;
  const probe = new LiveDomProbe(doc);
  const attrs = extractAttributes(el);
  const frameInfo = detectFrameInfo(doc.defaultView ?? window) ?? undefined;

  const candidateSteps = buildCandidateSteps(attrs);
  const results = new Map<LocatorStep, ResolveResult>();
  const scoredCandidates: ScoredCandidate[] = candidateSteps.map((step) => {
    const result = resolveStep(step, probe);
    results.set(step, result);
    return { step, uniqueCount: result.visibleMatchCount, totalCount: result.matchCount, score: 0 };
  });
  for (const c of scoredCandidates) c.score = scoreCandidate(c.step, c.uniqueCount);
  const ranked = rankCandidates(scoredCandidates);
  const bestUnique = pickBestUnique(ranked);

  let chain: LocatorChain;
  let ancestorStep: LocatorStep | undefined;
  if (bestUnique) {
    chain = buildLocatorChain(
      attrs,
      ranked.map((c) => ({ step: c.step, uniqueCount: c.uniqueCount })),
      { frameInfo },
    );
  } else {
    const ancestorResult = findUniqueAncestor(el, probe);
    if (ancestorResult) {
      ancestorStep = ancestorResult.step;
      const scopeHandle = probe.scopeFor(ancestorResult.ancestor);
      const scopedCandidates: ScoredCandidate[] = candidateSteps.map((step) => {
        const result = resolveStep(step, probe, { scope: scopeHandle });
        results.set(step, result); // scoped result supersedes the unscoped one for this chain
        return {
          step,
          uniqueCount: result.visibleMatchCount,
          totalCount: result.matchCount,
          score: 0,
        };
      });
      for (const c of scopedCandidates) c.score = scoreCandidate(c.step, c.uniqueCount);
      chain = buildLocatorChain(
        attrs,
        scopedCandidates.map((c) => ({ step: c.step, uniqueCount: c.uniqueCount })),
        { frameInfo, parentChain: { steps: [ancestorResult.step] } },
      );
    } else {
      chain = buildLocatorChain(
        attrs,
        ranked.map((c) => ({ step: c.step, uniqueCount: c.uniqueCount })),
        { frameInfo },
      );
    }
  }

  return { attrs, probe, chain, ranked, ancestorStep, results };
}

/**
 * Walks up to `FACT_LIMITS.maxAncestors` parents looking for one that resolves
 * to exactly one VISIBLE element, unscoped. Same question the pre-WS3 content
 * script asked; the answer now comes from the shared resolver + live probe
 * instead of an inline query.
 */
export function findUniqueAncestor(
  el: Element,
  probe: LiveDomProbe,
): { ancestor: Element; step: LocatorStep } | null {
  let current = el.parentElement;
  let depth = 0;
  while (current && depth < FACT_LIMITS.maxAncestors) {
    const step = buildAncestorStep(current);
    if (step && resolveStep(step, probe).visibleMatchCount === 1)
      return { ancestor: current, step };
    current = current.parentElement;
    depth++;
  }
  return null;
}

// ─── capturePick — the shipped hot path ─────────────────────────────────────

export interface CapturePickResult {
  stored: StoredPick;
}

/** Captures a pick for `el` in the unchanged `StoredPick` wire shape. */
export function capturePick(el: Element): CapturePickResult {
  const doc = el.ownerDocument;
  const { attrs, chain, ranked } = resolveCandidates(el);
  const frameInfo = detectFrameInfo(doc.defaultView ?? window) ?? undefined;
  const outerHtml = safeText(el.outerHTML, SNAPSHOT_BUDGET.maxOuterHtmlPreviewLength);

  const stored: StoredPick = {
    attributes: attrs,
    chain,
    candidates: ranked,
    frameInfo,
    outerHtml,
    timestamp: Date.now(),
    url: doc.defaultView?.location.href ?? '',
  };
  return { stored };
}
