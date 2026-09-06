/**
 * Playwright Guru — Locator verification (WS6.2).
 * ---------------------------------------------------------------------------
 * Answers one question honestly: "what do we actually know about this
 * user-typed locator expression?" It is the fourth consumer `resolver.ts`'s
 * own module doc names ("Verify — user-supplied expressions") and reuses
 * that single resolver rather than adding a second counting path.
 *
 * THE TRUST RULE THIS FILE EXISTS TO ENFORCE
 * -------------------------------------------
 * `classifyVerification` never returns more confidence than the evidence
 * supports. In particular:
 *   - a probe error is `unverifiable` or `unsupported`, never `not-found`
 *     (an unmeasured count is not the same claim as a measured zero);
 *   - more than one visible match is always `ambiguous`, never silently
 *     narrowed to a single "recommended" one (no `.nth(0)` fabrication);
 *   - a syntactically valid but semantically out-of-scope expression
 *     (`.filter(...)`, `page.frameLocator(...)`) is rejected by the PARSER
 *     (`parser.ts`) before it ever reaches here, specifically so this module
 *     is never tempted to resolve a chain and silently ignore a field it
 *     cannot honour (see `parser.ts`'s own doc comment for why).
 */

import type { DomProbe } from './probe';
import { resolveChain, type ResolveError } from './resolver';
import { parseLocatorExpression, type ParseError } from './parser';
import type { LocatorChain } from './types';

/**
 * The six states a verification can land in. Never collapsed into a single
 * generic "failed" — each means something distinct to a user deciding
 * whether to trust a locator (MASTER-ROADMAP §WS6.2).
 *
 *   verified      exactly one visible element resolves.
 *   'not-found'   the expression is valid and was resolved; zero elements.
 *   ambiguous     more than one visible element resolves.
 *   invalid       the expression could not be parsed as a Playwright
 *                 locator (syntax error) — see `parseError`.
 *   unsupported   the expression parses but names functionality this
 *                 verifier intentionally does not implement, or the probe
 *                 reports the underlying query itself is unsupported in
 *                 this environment (e.g. XPath without `document.evaluate`).
 *   unverifiable  the environment could not answer — a probe error, a
 *                 detached scope, or (panel-side) a transport failure. Never
 *                 used to mean "zero matches".
 */
export type VerificationStatus =
  'verified' | 'not-found' | 'ambiguous' | 'invalid' | 'unsupported' | 'unverifiable';

export interface VerificationResult {
  status: VerificationStatus;
  /** The expression as given, unmodified — echoed back for display. */
  expression: string;
  /** Present once the expression parsed successfully. */
  chain?: LocatorChain;
  /** All matches, including hidden ones. Present only when actually measured. */
  matchCount?: number;
  /** Visible matches — what the UI leads with, mirroring `ResolveResult`. */
  visibleMatchCount?: number;
  /** Per-step counts, in chain order — same WS0 semantics as `ResolveResult.stepCounts`. */
  stepCounts?: number[];
  /** Present only when `status === 'invalid'`. */
  parseError?: ParseError;
  /** Present when resolution itself could not complete. */
  resolveError?: ResolveError;
}

/** The evidence `classifyVerification` needs — nothing more. */
export interface VerificationEvidence {
  /** -1 (or any negative number) means "not measured". */
  matchCount: number;
  visibleMatchCount: number;
}

/**
 * THE single place a match count becomes a trust verdict.
 *
 * Both the direct-`DomProbe` path (`verifyLocatorExpression`, used by tests
 * and anything with a real `DomProbe` in-process) and the message-relayed
 * browser path (`content.ts`'s handler, which also calls
 * `verifyLocatorExpression` directly — see its own comment) go through this
 * function, so there cannot be two different opinions about what "verified"
 * means.
 */
export function classifyVerification(
  evidence: VerificationEvidence,
): 'verified' | 'not-found' | 'ambiguous' | 'unverifiable' {
  if (evidence.visibleMatchCount < 0) return 'unverifiable';
  if (evidence.visibleMatchCount === 0) return 'not-found';
  if (evidence.visibleMatchCount === 1) return 'verified';
  return 'ambiguous';
}

function statusForResolveError(error: ResolveError): VerificationStatus {
  // `UNSUPPORTED_STEP` means the resolver itself declined the step (e.g. a
  // regex matcher it cannot evaluate) — an honest "this isn't supported",
  // not merely "couldn't answer right now". Every other resolve error
  // (`EMPTY_CHAIN`, `FRAME_UNSUPPORTED`, `PROBE_ERROR`) is an environment
  // limitation: the expression is legitimate, the answer just isn't
  // available here.
  return error.code === 'UNSUPPORTED_STEP' ? 'unsupported' : 'unverifiable';
}

/**
 * Parses `expression` and resolves it against `probe`, producing a single
 * honest `VerificationResult`. Never throws — every failure mode is a typed
 * status, not an exception.
 */
export function verifyLocatorExpression(expression: string, probe: DomProbe): VerificationResult {
  const parsed = parseLocatorExpression(expression);
  if (!parsed.ok) {
    return { status: 'invalid', expression, parseError: parsed.error };
  }

  const { chain } = parsed;
  const result = resolveChain(chain, probe);

  if (result.error) {
    return {
      status: statusForResolveError(result.error),
      expression,
      chain,
      resolveError: result.error,
    };
  }

  return {
    status: classifyVerification({
      matchCount: result.matchCount,
      visibleMatchCount: result.visibleMatchCount,
    }),
    expression,
    chain,
    matchCount: result.matchCount,
    visibleMatchCount: result.visibleMatchCount,
    stepCounts: result.stepCounts,
  };
}
