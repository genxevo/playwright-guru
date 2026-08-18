/**
 * Playwright Guru — LocatorResolver (WS0 contract).
 * ---------------------------------------------------------------------------
 * THERE IS EXACTLY ONE RESOLVER.
 *
 * Resolving a locator against a live DOM is needed in four places:
 *
 *                        LocatorResolver
 *                              │
 *        ┌─────────────────────┼─────────────────────┐
 *        ▼                     ▼                     ▼
 *      Pick                  Verify               Recording
 *   (candidate counts,   (user-supplied      (every recorded
 *    recommended-chain    expressions)        locator verified
 *    proof)                                   at capture)
 *
 * Phase 0 found four separate, divergent implementations of this — in the
 * content script, in the DevTools eval string, in the side panel, and implied
 * by the CSS/XPath generator. They disagreed with each other, which is how the
 * product came to display counts that did not correspond to the locator shown
 * beside them. No workstream may reintroduce a second implementation: if a
 * surface needs verification, it consumes this module.
 *
 * WS0 SCOPE
 * This establishes the seam and a correct minimal implementation. Richer
 * behaviour — scoped resolution across chain steps, filters, frame descent —
 * lands in WS1/WS3. The contract does not change when it does.
 */

import type { LocatorChain, LocatorStep } from './types';
import type { DomProbe, ProbeCount, ProbeError, ProbeOpts, TextMatchMode } from './probe';
import { UNKNOWN_MATCH_COUNT } from './probe';
import type { LocatorVerdict } from './rationale';
import { verdictFor } from './rationale';

// ─── Result ─────────────────────────────────────────────────────────────────

export type ResolveErrorCode =
  'EMPTY_CHAIN' | 'UNSUPPORTED_STEP' | 'PROBE_ERROR' | 'FRAME_UNSUPPORTED';

export interface ResolveError {
  code: ResolveErrorCode;
  /** Machine-oriented detail. Never UI copy. */
  detail?: string;
}

export interface ResolveResult {
  /** All matches, including hidden ones. */
  matchCount: number;
  /** Visible matches — what the UI leads with. */
  visibleMatchCount: number;
  verdict: LocatorVerdict;
  /**
   * Per-step observed match counts, in chain order.
   *
   * WS0 SEMANTICS — READ BEFORE USING THESE NUMBERS.
   * Each step is measured INDEPENDENTLY, against the whole document. These are
   * therefore per-step observations, NOT cumulative narrowing figures: the
   * sequence does not describe a chain converging on a single element, and a
   * later value may exceed an earlier one.
   *
   * True scoped resolution — where each step narrows the search root for the
   * next — requires the probe to return scope handles for matched elements, and
   * arrives with the live probe in WS3. The field and its shape do not change
   * then; only the meaning of the numbers becomes cumulative.
   */
  stepCounts: number[];
  error?: ResolveError;
}

function unresolved(error: ResolveError): ResolveResult {
  return {
    matchCount: UNKNOWN_MATCH_COUNT,
    visibleMatchCount: UNKNOWN_MATCH_COUNT,
    verdict: 'unknown',
    stepCounts: [],
    error,
  };
}

function fromProbeCount(count: ProbeCount, kind?: string): ResolveResult {
  if (count.error) {
    return {
      matchCount: UNKNOWN_MATCH_COUNT,
      visibleMatchCount: UNKNOWN_MATCH_COUNT,
      verdict: 'unknown',
      stepCounts: [],
      error: { code: 'PROBE_ERROR', detail: probeErrorDetail(count.error) },
    };
  }
  return {
    matchCount: count.total,
    visibleMatchCount: count.visible,
    verdict: verdictFor(count.visible, kind),
    stepCounts: [count.visible],
  };
}

function probeErrorDetail(error: ProbeError): string {
  return error.detail ? `${error.code}: ${error.detail}` : error.code;
}

// ─── Minimal CSS attribute-value escaping ───────────────────────────────────

/**
 * Escapes a value for embedding inside a QUOTED CSS attribute selector.
 *
 * Deliberately not `CSS.escape`: that produces *identifier* escapes and is the
 * wrong tool inside a quoted string — a Phase 0 finding (E4). Only the quote
 * character and the backslash need escaping in a CSS string literal.
 *
 * WS7's `selector-engine` owns the full escaping module; this is the minimum the
 * resolver needs to build attribute probes, and is intentionally small.
 */
function escapeCssStringLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** The attribute names Playwright's `getByTestId` recognises by default. */
const TEST_ID_ATTRIBUTES = ['data-testid', 'data-test-id', 'data-test'] as const;

// ─── Step resolution ────────────────────────────────────────────────────────

function textModeFor(step: LocatorStep): TextMatchMode {
  // Playwright's text matching is substring + case-insensitive unless `exact`.
  return step.options?.exact === true ? 'exact' : 'substring';
}

/**
 * Resolves a single locator step.
 *
 * Every branch delegates to the probe. The resolver contributes the mapping
 * from locator semantics to DOM questions — it never touches a DOM itself.
 */
export function resolveStep(step: LocatorStep, probe: DomProbe, opts?: ProbeOpts): ResolveResult {
  const value = step.selectorValue.value;

  // Regex matchers need engine-side matching, which the probe does not expose.
  // Reported honestly as unknown rather than approximated.
  if (step.selectorValue.type === 'regex' && step.kind !== 'role') {
    return unresolved({ code: 'UNSUPPORTED_STEP', detail: `regex matcher on kind=${step.kind}` });
  }

  switch (step.kind) {
    case 'role': {
      const name = step.options?.name;
      const nameValue = name && name.type === 'string' ? name.value : undefined;
      return fromProbeCount(probe.countByRole(value, nameValue, opts), 'role');
    }

    case 'text':
      return fromProbeCount(probe.countByText(value, textModeFor(step), opts), 'text');

    case 'label':
      return fromProbeCount(probe.countByLabel(value, textModeFor(step), opts), 'label');

    case 'placeholder':
      return fromProbeCount(
        probe.countCss(`[placeholder="${escapeCssStringLiteral(value)}"]`, opts),
        'placeholder',
      );

    case 'altText':
      return fromProbeCount(
        probe.countCss(`[alt="${escapeCssStringLiteral(value)}"]`, opts),
        'altText',
      );

    case 'title':
      return fromProbeCount(
        probe.countCss(`[title="${escapeCssStringLiteral(value)}"]`, opts),
        'title',
      );

    case 'testId': {
      const escaped = escapeCssStringLiteral(value);
      const selector = TEST_ID_ATTRIBUTES.map((attr) => `[${attr}="${escaped}"]`).join(',');
      return fromProbeCount(probe.countCss(selector, opts), 'testId');
    }

    default: {
      const exhaustive: never = step.kind;
      return unresolved({ code: 'UNSUPPORTED_STEP', detail: String(exhaustive) });
    }
  }
}

// ─── Chain resolution ───────────────────────────────────────────────────────

/**
 * Resolves a full chain.
 *
 * WS0 SEMANTICS — this does NOT perform scoped chain resolution.
 *
 * Each step is measured independently against the whole document. The chain
 * result reported is the TERMINAL step's own count, and `stepCounts` carries
 * the independent per-step observations rather than a narrowing sequence.
 *
 * The practical consequence, stated plainly so no caller is misled: for a
 * multi-step chain the WS0 count can be HIGHER than the chain's true scoped
 * count, because the ancestor steps are not yet constraining the descendant
 * ones. Callers must not present a multi-step WS0 result as proof of
 * uniqueness.
 *
 * Scoped resolution requires the probe to hand back scope handles for matched
 * elements, which arrives with the live probe in WS3. The contract does not
 * change when it lands; only this function's body does.
 */
export function resolveChain(chain: LocatorChain, probe: DomProbe): ResolveResult {
  if (chain.steps.length === 0) {
    return unresolved({ code: 'EMPTY_CHAIN' });
  }

  const stepCounts: number[] = [];
  let last: ResolveResult | undefined;

  for (const step of chain.steps) {
    const result = resolveStep(step, probe);
    if (result.error) {
      return { ...result, stepCounts };
    }
    stepCounts.push(result.visibleMatchCount);
    last = result;
  }

  // `last` is defined: the loop ran at least once and did not return early.
  const terminal = last as ResolveResult;
  const terminalKind = chain.steps[chain.steps.length - 1]?.kind;

  // `.nth()` selects one element from the matched set.
  if (chain.nth !== undefined) {
    const resolvesToOne = terminal.visibleMatchCount > chain.nth;
    return {
      matchCount: terminal.matchCount,
      visibleMatchCount: resolvesToOne ? 1 : 0,
      verdict: resolvesToOne ? verdictFor(1) : 'no-match',
      stepCounts,
    };
  }

  return {
    matchCount: terminal.matchCount,
    visibleMatchCount: terminal.visibleMatchCount,
    verdict: verdictFor(terminal.visibleMatchCount, terminalKind),
    stepCounts,
  };
}
