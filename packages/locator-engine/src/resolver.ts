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
 * SCOPE
 * WS0 established the seam and a correct minimal implementation. Scoped
 * resolution across chain steps landed in WS6.2 (D2) — see `resolveChain` —
 * using the scope machinery WS3 built, and without changing the contract, as
 * WS0 said it would not. Filters and frame descent remain out of scope and are
 * refused by the parser rather than approximated here.
 */

import type { LocatorChain, LocatorStep } from './types';
import type {
  DomProbe,
  ProbeCount,
  ProbeError,
  ProbeOpts,
  ScopeHandle,
  TextMatchMode,
} from './probe';
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
   * SEMANTICS AS OF WS6.2 (D2) — CUMULATIVE, exactly as the WS0 comment this
   * replaces said they would become. Each entry is the count measured INSIDE
   * the preceding step's matched element:
   *
   *     ['list', 'Save'] → [1, 2]   one list; two "Save"s inside THAT list
   *
   * The field and its shape did not change, as WS0 promised — only the meaning
   * of the numbers. The sequence stops where the chain stopped: a step that was
   * never evaluated (because its parent was ambiguous or absent) contributes no
   * entry, so `stepCounts.length` tells a caller how far the chain got.
   *
   * The WS0 caveat is therefore withdrawn: a later value may still exceed an
   * earlier one (two "Save"s inside one list), but it is now a narrowing
   * sequence and the terminal figure IS the chain's count.
   */
  stepCounts: number[];
  /**
   * The matched element's scope, present only when this step matched exactly
   * one visible element and the probe could mint a handle.
   *
   * RUNTIME-ONLY and INTERNAL to chain resolution: `resolveStep` produces it so
   * `resolveChain` can thread it into the next step, and `resolveChain` never
   * puts it on the result it returns. No consumer of a chain result — snapshot,
   * message, AST, stored pick — can therefore receive one.
   */
  scope?: ScopeHandle;
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
    ...(count.scope ? { scope: count.scope } : {}),
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

/**
 * The option keys `parser.ts` accepts but this resolver cannot evaluate
 * (WS6.2 trust correction, V-3).
 *
 * `LocatorStepOptions` has eight keys. The probe can serve two of them — `name`
 * (as a string; see the regex rule in `resolveStep`) and `exact` — because both
 * map to questions `DomProbe` already answers. The six here are ARIA STATE
 * qualifiers: answering them requires computing checked/pressed/selected/
 * expanded/disabled state, or a heading's level, per candidate element. That is
 * accessibility-tree work no port method exposes, and the port is deliberately
 * small (see `probe.ts`) — a `countByRoleWithState` would be a new question, not
 * a wiring change.
 *
 * Until then the honest answer is `unsupported`. It must NOT be "measure the
 * role and drop the filter": `getByRole('checkbox', { checked: true })` is not
 * `getByRole('checkbox')`, and answering the second while showing the first is
 * the V-2 defect in a different costume — including in the direction that
 * produces a green: one unticked checkbox would report "verified, 1 match" for
 * a locator Playwright resolves to zero.
 */
const UNEVALUABLE_OPTIONS = [
  'checked',
  'pressed',
  'selected',
  'expanded',
  'disabled',
  'level',
] as const;

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

  /**
   * The same rule, applied to the accessible-name OPTION (WS6.2 trust
   * correction, V-2).
   *
   * This branch read the name as `name.type === 'string' ? name.value :
   * undefined`, so a REGEX name quietly became `undefined` and the probe was
   * asked for the role with no name filter at all. The two expressions below
   * therefore produced the identical probe call and the identical verdict:
   *
   *     getByRole('button', { name: 'Save' })   → role=button name=Save
   *     getByRole('button', { name: /Sav/ })    → role=button name=undefined
   *
   * — so a locator Playwright resolves to one element was reported as
   * "ambiguous" across every button on the page. A matcher this resolver cannot
   * evaluate makes the STEP unsupported; it must never make the query broader,
   * because a broader query answers a question the user did not ask and the
   * count that comes back is not evidence about their locator.
   *
   * Regex accessible-name MATCHING is not implemented here and is not
   * approximated. `unsupported` is the honest answer, not a placeholder for one.
   */
  const nameOption = step.options?.name;
  if (nameOption && nameOption.type !== 'string') {
    return unresolved({
      code: 'UNSUPPORTED_STEP',
      detail: `regex name matcher on kind=${step.kind}`,
    });
  }

  /**
   * The same rule again, applied to the six ARIA state options (V-3).
   *
   * PRESENCE is what disqualifies the step, not truthiness. `{ checked: false }`
   * selects the boxes that are NOT ticked — a real filter, and a different set
   * from "every checkbox" — so a `false` may no more be dropped than a `true`.
   * Every key present and not `undefined` is named in the detail, so a log shows
   * which option could not be honoured rather than only that one could not.
   */
  const unevaluable = UNEVALUABLE_OPTIONS.filter((key) => step.options?.[key] !== undefined);
  if (unevaluable.length > 0) {
    return unresolved({
      code: 'UNSUPPORTED_STEP',
      detail: `unevaluable option(s) ${unevaluable.join(', ')} on kind=${step.kind}`,
    });
  }

  switch (step.kind) {
    case 'role':
      return fromProbeCount(probe.countByRole(value, nameOption?.value, opts), 'role');

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
 * Resolves a full chain — SCOPED (WS6.2 trust correction, D2).
 *
 * WHAT WAS WRONG. Until WS6.2 this loop called `resolveStep(step, probe)` with
 * no `opts`, therefore with no scope. Every step was measured against the whole
 * document and the chain reported the TERMINAL step's document-wide count, so
 *
 *     page.getByRole('list').getByText('Save')
 *
 * was answered with "how many 'Save' are on the page", not "how many 'Save' are
 * inside that list". On a page where the text existed only OUTSIDE the list, the
 * panel showed **verified, 1 match** for an expression Playwright resolves to
 * zero. A confidently wrong green is the worst result this product can produce,
 * and this function is where it came from.
 *
 * THE POLICY, WHICH IS THE WHOLE OF THE FIX. For each non-terminal step:
 *
 *     matched 0    → not-found   — the chain cannot continue; the child is
 *                                  never evaluated, because "no such parent"
 *                                  already answers the question.
 *     matched 1    → the child step is resolved ONLY inside that element, via
 *                    the scope handle the probe returned with the count.
 *     matched 2+   → ambiguous   — the child is never evaluated. There is no
 *                                  single scope to look inside, and picking one
 *                                  would be an answer to a question the user did
 *                                  not ask.
 *
 * No first-match. No `.nth(0)`. No arbitrary parent. No document-wide fallback —
 * including the case where the parent IS unique but the probe cannot mint a
 * handle: that is reported `UNSUPPORTED_STEP` (→ `unsupported`), never quietly
 * widened back to the document. Every path out of an unresolvable parent is one
 * of not-found / ambiguous / unsupported, and none of them is `verified`.
 *
 * `.nth()` is unchanged in meaning and now selects from the SCOPED terminal set,
 * which is what it always claimed to do.
 */
export function resolveChain(chain: LocatorChain, probe: DomProbe): ResolveResult {
  if (chain.steps.length === 0) {
    return unresolved({ code: 'EMPTY_CHAIN' });
  }

  const stepCounts: number[] = [];
  let scope: ScopeHandle | undefined;
  let terminal: ResolveResult | undefined;

  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i] as LocatorStep;
    const result = resolveStep(step, probe, scope ? { scope } : undefined);
    if (result.error) {
      return { ...result, stepCounts, scope: undefined };
    }
    stepCounts.push(result.visibleMatchCount);

    if (i === chain.steps.length - 1) {
      terminal = result;
      break;
    }

    // ── The ambiguity policy, applied to every non-terminal step ────────────
    if (result.visibleMatchCount < 0) {
      // The probe answered without an error but without a measurement either.
      // An unmeasured parent is not a measured zero, so it must not become one.
      return { ...result, verdict: 'unknown', stepCounts, scope: undefined };
    }
    if (result.visibleMatchCount === 0) {
      return {
        matchCount: result.matchCount,
        visibleMatchCount: 0,
        verdict: 'no-match',
        stepCounts,
      };
    }
    if (result.visibleMatchCount > 1) {
      return {
        matchCount: result.matchCount,
        visibleMatchCount: result.visibleMatchCount,
        verdict: 'ambiguous',
        stepCounts,
      };
    }
    if (!result.scope) {
      // Exactly one parent, but this probe cannot hand back a scope for it. The
      // only alternative to refusing is querying the child document-wide, which
      // is precisely the defect. Refuse.
      return {
        ...unresolved({
          code: 'UNSUPPORTED_STEP',
          detail: `probe returned no scope for a unique step at index ${i} (kind=${step.kind})`,
        }),
        stepCounts,
      };
    }
    scope = result.scope;
  }

  // Defined: the loop ran at least once and every other path returned.
  const last = terminal as ResolveResult;
  const terminalKind = chain.steps[chain.steps.length - 1]?.kind;

  // `.nth()` selects one element from the matched — now scoped — set.
  if (chain.nth !== undefined) {
    const resolvesToOne = last.visibleMatchCount > chain.nth;
    return {
      matchCount: last.matchCount,
      visibleMatchCount: resolvesToOne ? 1 : 0,
      verdict: resolvesToOne ? verdictFor(1) : 'no-match',
      stepCounts,
    };
  }

  return {
    matchCount: last.matchCount,
    visibleMatchCount: last.visibleMatchCount,
    verdict: verdictFor(last.visibleMatchCount, terminalKind),
    stepCounts,
  };
}
