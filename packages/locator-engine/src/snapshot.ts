/**
 * Playwright Guru — PickSnapshot (WS0 contract).
 * ---------------------------------------------------------------------------
 * PICKSNAPSHOT IS A COMPACT FACT MODEL, NOT A DOM SNAPSHOT.
 *
 * All generation and verification happens once, in the browser layer, while the
 * element is live. What crosses the boundary afterwards is this: a verified,
 * self-describing result the UI can render without doing any DOM intelligence
 * of its own. That is what allows the Side Panel and the DevTools panel to
 * share one product implementation and differ only in how they obtain a
 * snapshot.
 *
 * BUDGET
 *   normal target        < 25 KB serialised
 *   anomaly threshold    > 50 KB — investigate, degrade, never drop the pick
 *
 * These are design budgets, not correctness limits. Exceeding them is a signal
 * that something unbounded slipped in, not a reason to fail the user's action.
 *
 * MUST NEVER BE SERIALISED HERE
 *   • arbitrary DOM subtrees or any descendant collection
 *   • the element's or document's full HTML
 *   • computed style objects
 *   • unrestricted text, or the runtime's normalised text index
 *   • live Element references
 *   • ScopeHandle values — runtime-only, meaningless once serialised
 *   • sibling lists, child lists, or any unbounded array
 */

import type { LocatorChain, LocatorStep } from './types';
import type { ElementFacts, FrameRef } from './facts';
import type { LocatorVerdict, Rationale } from './rationale';
import { isScopeHandle } from './probe';

// ─── Budget ─────────────────────────────────────────────────────────────────

export const SNAPSHOT_BUDGET = {
  /** Expected for virtually every pick. */
  normalTargetBytes: 25 * 1024,
  /** Above this: log a diagnostic, degrade optional fields, keep the pick. */
  anomalyThresholdBytes: 50 * 1024,

  maxPlaywrightCandidates: 12,
  maxVerifiedSelectors: 15,
  maxAmbiguousSelectors: 10,
  maxOuterHtmlPreviewLength: 300,
  maxUrlLength: 500,
  maxRationalePerItem: 5,
} as const;

export type SnapshotBudgetStatus = 'ok' | 'over-target' | 'anomaly';

// ─── Result shapes ──────────────────────────────────────────────────────────

/** A Playwright locator strategy that was generated and measured. */
export interface VerifiedCandidate {
  step: LocatorStep;
  verdict: LocatorVerdict;
  matchCount: number;
  visibleMatchCount: number;
  rationale: Rationale[];
}

/** The promoted answer: the chain the engine can prove is best. */
export interface RecommendedLocator {
  chain: LocatorChain;
  verdict: LocatorVerdict;
  matchCount: number;
  visibleMatchCount: number;
  /**
   * Per-step observed match counts, in chain order.
   *
   * See `ResolveResult.stepCounts`: in WS0 these are INDEPENDENT per-step
   * measurements, not cumulative narrowing figures. They become cumulative when
   * scoped resolution lands in WS3.
   */
  stepCounts: number[];
  rationale: Rationale[];
}

/**
 * A generated CSS or XPath expression that was measured against the page.
 *
 * Minimal structural shape. WS7's `selector-engine` produces a richer
 * `GeneratedSelector` which satisfies this contract. Reference (teaching)
 * examples are a DIFFERENT type entirely, with no verdict and no counts, so a
 * reference example structurally cannot render a verification badge.
 */
export interface SnapshotSelector {
  expression: string;
  syntax: 'css' | 'xpath';
  verdict: LocatorVerdict;
  matchCount: number;
  visibleMatchCount: number;
  rationale: Rationale[];
}

export interface SnapshotSelectorSet {
  best: SnapshotSelector | null;
  /** verdict 'excellent' | 'good'. Capped at `maxVerifiedSelectors`. */
  verified: SnapshotSelector[];
  /** verdict 'ambiguous'. Capped at `maxAmbiguousSelectors`. */
  ambiguous: SnapshotSelector[];
}

/** Debug-mode only. Never rendered in the product UI. */
export interface SnapshotDiagnostics {
  captureMs?: number;
  probeCalls?: number;
  wholeDocumentTraversals?: number;
  serialisedBytes?: number;
  degraded?: boolean;
}

// ─── The snapshot ───────────────────────────────────────────────────────────

export interface PickSnapshot {
  schemaVersion: 2;
  id: string;
  timestamp: number;
  /** Capped at `maxUrlLength`. */
  url: string;
  frame?: FrameRef;

  element: ElementFacts;
  recommended: RecommendedLocator;
  /** Capped at `maxPlaywrightCandidates`. */
  playwrightCandidates: VerifiedCandidate[];

  /** Populated by WS7's selector-engine. */
  css?: SnapshotSelectorSet;
  xpath?: SnapshotSelectorSet;

  /** DISPLAY ONLY. Never used for generation. Capped at 300 chars. */
  outerHtmlPreview?: string;

  diagnostics?: SnapshotDiagnostics;
}

// ─── Guards ─────────────────────────────────────────────────────────────────

/**
 * Deep scan for a ScopeHandle anywhere in a value.
 *
 * A ScopeHandle is runtime-only state. Serialising one produces a reference to
 * an element that no longer exists in the consuming context — a silent
 * correctness hazard and a size leak. Cycle-safe.
 */
export function containsScopeHandle(value: unknown, seen = new WeakSet<object>()): boolean {
  if (isScopeHandle(value)) return true;
  if (typeof value !== 'object' || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => containsScopeHandle(item, seen));
  }
  return Object.values(value as Record<string, unknown>).some((v) => containsScopeHandle(v, seen));
}

/** Serialised size in bytes, measured the way storage will measure it. */
export function estimateSnapshotBytes(snapshot: PickSnapshot): number {
  const json = JSON.stringify(snapshot);
  // Byte length, not code-unit length: storage quotas count bytes.
  // TextEncoder is a WHATWG Encoding standard global available in browsers,
  // workers and Node — not a DOM API — so using it does not breach R3.
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(json).length : json.length;
}

export interface SnapshotBudgetAssessment {
  bytes: number;
  status: SnapshotBudgetStatus;
}

export function assessSnapshotBudget(snapshot: PickSnapshot): SnapshotBudgetAssessment {
  const bytes = estimateSnapshotBytes(snapshot);
  if (bytes > SNAPSHOT_BUDGET.anomalyThresholdBytes) return { bytes, status: 'anomaly' };
  if (bytes > SNAPSHOT_BUDGET.normalTargetBytes) return { bytes, status: 'over-target' };
  return { bytes, status: 'ok' };
}

export type SnapshotViolationCode =
  | 'SCOPE_HANDLE_PRESENT'
  | 'NOT_SERIALISABLE'
  | 'OVER_ANOMALY_THRESHOLD'
  | 'CANDIDATE_CAP_EXCEEDED'
  | 'SELECTOR_CAP_EXCEEDED'
  | 'PREVIEW_TOO_LONG'
  | 'URL_TOO_LONG';

export interface SnapshotViolation {
  code: SnapshotViolationCode;
  detail?: string;
}

/**
 * Validates a snapshot against every protection this contract promises.
 *
 * Returns violations rather than throwing: the capture layer decides whether to
 * degrade (drop optional fields) or report. A user's pick is never lost because
 * the payload was larger than expected.
 */
export function validateSnapshot(snapshot: PickSnapshot): SnapshotViolation[] {
  const violations: SnapshotViolation[] = [];

  if (containsScopeHandle(snapshot)) {
    violations.push({
      code: 'SCOPE_HANDLE_PRESENT',
      detail: 'ScopeHandle is runtime-only and must not cross the serialisation boundary',
    });
  }

  let bytes = 0;
  try {
    bytes = estimateSnapshotBytes(snapshot);
  } catch (error) {
    violations.push({
      code: 'NOT_SERIALISABLE',
      detail: error instanceof Error ? error.message : String(error),
    });
    return violations;
  }

  if (bytes > SNAPSHOT_BUDGET.anomalyThresholdBytes) {
    violations.push({
      code: 'OVER_ANOMALY_THRESHOLD',
      detail: `${bytes} > ${SNAPSHOT_BUDGET.anomalyThresholdBytes}`,
    });
  }

  if (snapshot.playwrightCandidates.length > SNAPSHOT_BUDGET.maxPlaywrightCandidates) {
    violations.push({
      code: 'CANDIDATE_CAP_EXCEEDED',
      detail: String(snapshot.playwrightCandidates.length),
    });
  }

  for (const set of [snapshot.css, snapshot.xpath]) {
    if (!set) continue;
    if (
      set.verified.length > SNAPSHOT_BUDGET.maxVerifiedSelectors ||
      set.ambiguous.length > SNAPSHOT_BUDGET.maxAmbiguousSelectors
    ) {
      violations.push({
        code: 'SELECTOR_CAP_EXCEEDED',
        detail: `verified=${set.verified.length} ambiguous=${set.ambiguous.length}`,
      });
    }
  }

  if (
    snapshot.outerHtmlPreview !== undefined &&
    snapshot.outerHtmlPreview.length > SNAPSHOT_BUDGET.maxOuterHtmlPreviewLength
  ) {
    violations.push({ code: 'PREVIEW_TOO_LONG', detail: String(snapshot.outerHtmlPreview.length) });
  }

  if (snapshot.url.length > SNAPSHOT_BUDGET.maxUrlLength) {
    violations.push({ code: 'URL_TOO_LONG', detail: String(snapshot.url.length) });
  }

  return violations;
}

/** True when a snapshot satisfies every protection. */
export function isSnapshotValid(snapshot: PickSnapshot): boolean {
  return validateSnapshot(snapshot).length === 0;
}
