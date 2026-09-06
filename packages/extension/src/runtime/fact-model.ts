/**
 * Playwright Guru — the WS0 fact model, captured live (WS3).
 * ---------------------------------------------------------------------------
 * `captureSnapshot(el)` builds a full `PickSnapshot`: `ElementContext`,
 * `ElementFacts`, a `recommended` locator resolved through `resolveChain`
 * against the live probe, verified candidates with rationale, and
 * budget-aware degradation.
 *
 * NOT IMPORTED BY `content.ts`, DELIBERATELY.
 *
 * The implementation authorization is explicit: "Do NOT modify SidePanel or
 * DevTools UI to consume PickSnapshot in WS3" (§10) — nothing in the shipped
 * product reads a `PickSnapshot` yet. Wiring this module's full construction
 * into every pick was measured to cross the extension's raw-size ceiling
 * (`278,760 B`) for zero behavioural benefit — exactly the "dead
 * infrastructure merely to satisfy a checklist" the authorization separately
 * warns against for the IIFE probe build (§20), and the same reasoning
 * applies here. This module is real, complete, and independently tested
 * (`test/runtime-fact-model.test.ts`); it is simply not on the shipped
 * content-script's import graph, so it costs nothing in the bundle a user
 * downloads. The workstream that puts a `PickSnapshot` in front of a UI is
 * the one that should decide whether to import it — that decision belongs to
 * that surface's own scope, not WS3's.
 *
 * It shares `capture.ts`'s exact resolution pass (`resolveCandidates`) so the
 * two artifacts can never disagree about which candidate won.
 */

import {
  resolveStep,
  resolveChain,
  rationale,
  FACT_LIMITS,
  SNAPSHOT_BUDGET,
  boundText,
  boundList,
  validateSnapshot,
  estimateSnapshotBytes,
  type LocatorStep,
  type LocatorChain,
  type ElementContext,
  type ElementFacts,
  type AncestorFact,
  type SiblingFact,
  type PickSnapshot,
  type RecommendedLocator,
  type VerifiedCandidate,
  type ResolveResult,
  type Rationale,
  type FrameRef,
} from '@playwright-guru/locator-engine';
import type { LiveDomProbe } from './probe';
import { resolveCandidates } from './capture';
import {
  extractAttributes,
  findAssociatedLabel,
  buildAncestorStep,
  detectFrameInfo,
  normalizedText,
  safeText,
} from './dom-read';

/** Builds the full `PickSnapshot` fact model for `el`. Not called by `content.ts`. */
export function captureSnapshot(el: Element): PickSnapshot {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
  const { probe, chain, ranked, ancestorStep, results } = resolveCandidates(el);

  const context = buildElementContext(el, probe);
  const { value: fullInnerText, truncated: textTruncated } = boundText(
    normalizedText((el as HTMLElement).innerText),
    FACT_LIMITS.maxInnerTextLength,
  );
  const attrs = extractAttributes(el);
  const facts: ElementFacts = {
    attributes: { ...attrs, innerText: fullInnerText },
    context,
    textTruncated,
  };

  const chainResolution = resolveChain(chain, probe);
  const recommended: RecommendedLocator = {
    chain,
    verdict: chainResolution.verdict,
    matchCount: chainResolution.matchCount,
    visibleMatchCount: chainResolution.visibleMatchCount,
    stepCounts: chainResolution.stepCounts,
    rationale: deriveChainRationale(chain, chainResolution, { ancestorStep, textTruncated }),
  };

  const playwrightCandidates: VerifiedCandidate[] = boundList(
    ranked,
    SNAPSHOT_BUDGET.maxPlaywrightCandidates,
  ).map((c) => {
    const result = results.get(c.step) ?? {
      matchCount: -1,
      visibleMatchCount: -1,
      verdict: 'unknown' as const,
      stepCounts: [],
    };
    return {
      step: c.step,
      verdict: result.verdict,
      matchCount: result.matchCount,
      visibleMatchCount: result.visibleMatchCount,
      rationale: deriveStepRationale(c.step, result),
    };
  });

  const outerHtmlPreview = safeText(el.outerHTML, SNAPSHOT_BUDGET.maxOuterHtmlPreviewLength);

  let snapshot: PickSnapshot = {
    schemaVersion: 2,
    id: mintId(),
    timestamp: Date.now(),
    url: el.ownerDocument.defaultView?.location.href ?? '',
    frame: context.frame,
    element: facts,
    recommended,
    playwrightCandidates,
    outerHtmlPreview,
    diagnostics: {
      captureMs: (typeof performance !== 'undefined' ? performance.now() : 0) - startedAt,
      probeCalls: probe.probeCalls,
      wholeDocumentTraversals: probe.wholeDocumentTraversals,
    },
  };
  snapshot = degradeSnapshot(snapshot);
  return snapshot;
}

function mintId(): string {
  return `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── ElementContext ─────────────────────────────────────────────────────────

export function buildElementContext(el: Element, probe: LiveDomProbe): ElementContext {
  const ancestors: AncestorFact[] = [];
  let current = el.parentElement;
  let depth = 1;
  while (current && ancestors.length < FACT_LIMITS.maxAncestors) {
    ancestors.push(buildAncestorFact(current, depth, probe));
    current = current.parentElement;
    depth++;
  }

  const parent = el.parentElement;
  const siblings = parent ? Array.from(parent.children) : [el];
  const indexInParent = siblings.indexOf(el);
  const sameType = siblings.filter((s) => s.tagName === el.tagName);
  const indexOfType = sameType.indexOf(el);

  const label = findAssociatedLabel(el);

  const formEl = el.closest('form');
  let formAncestor: ElementContext['formAncestor'];
  if (formEl) {
    let hops = 0;
    let node: Element | null = el.parentElement;
    while (node && node !== formEl) {
      hops++;
      node = node.parentElement;
    }
    if (node === formEl) hops++;
    formAncestor = {
      depth: hops,
      id: formEl.id || undefined,
      name: formEl.getAttribute('name') ?? undefined,
    };
  }

  const shadowHostPath: string[] = [];
  let root: Node = el.getRootNode();
  while (root instanceof ShadowRoot && shadowHostPath.length < FACT_LIMITS.maxShadowHostPath) {
    const host = root.host;
    shadowHostPath.push(describeElement(host));
    root = host.getRootNode();
  }

  const win = el.ownerDocument.defaultView ?? window;
  const frameInfo = detectFrameInfo(win);
  const frame: FrameRef | undefined = frameInfo
    ? { frameSelector: frameInfo.frameSelector, frameUrl: frameInfo.frameUrl, depth: 1 }
    : undefined;

  return {
    ancestors,
    indexInParent,
    indexOfType,
    siblingCount: siblings.length,
    siblingCountOfType: sameType.length,
    isFirstChild: indexInParent === 0,
    isLastChild: indexInParent === siblings.length - 1,
    isOnlyChild: siblings.length === 1,
    previousSibling: siblingFact(el.previousElementSibling),
    nextSibling: siblingFact(el.nextElementSibling),
    associatedLabel: label,
    formAncestor,
    inShadowRoot: shadowHostPath.length > 0,
    shadowHostPath: shadowHostPath.length > 0 ? shadowHostPath : undefined,
    frame,
  };
}

function buildAncestorFact(ancestor: Element, depth: number, probe: LiveDomProbe): AncestorFact {
  const attrs = extractAttributes(ancestor);
  const classList = boundList(Array.from(ancestor.classList), FACT_LIMITS.maxAncestorClasses).map(
    (c) => boundText(c, FACT_LIMITS.maxAncestorClassLength).value ?? c,
  );
  const accessibleName = boundText(
    (attrs.ariaLabel ?? attrs.labelText ?? attrs.innerText) || undefined,
    FACT_LIMITS.maxAccessibleNameLength,
  ).value;
  const step = buildAncestorStep(ancestor);
  const isUnique = step !== null && resolveStep(step, probe).visibleMatchCount === 1;
  const parent = ancestor.parentElement;
  const indexInParent = parent ? Array.from(parent.children).indexOf(ancestor) : 0;

  return {
    tagName: ancestor.tagName.toLowerCase(),
    id: ancestor.id || undefined,
    classList,
    role: attrs.role || undefined,
    accessibleName,
    testId: attrs.testId,
    indexInParent,
    depth,
    isUnique,
  };
}

function siblingFact(el: Element | null): SiblingFact | undefined {
  if (!el) return undefined;
  return {
    tagName: el.tagName.toLowerCase(),
    role: el.getAttribute('role') ?? undefined,
    text: boundText(normalizedText(el.textContent), FACT_LIMITS.maxSiblingTextLength).value,
  };
}

function describeElement(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  return `${el.tagName.toLowerCase()}${id}`;
}

// ─── Rationale derivation ───────────────────────────────────────────────────

const STRATEGY_RATIONALE: Partial<Record<LocatorStep['kind'], Rationale['code']>> = {
  role: 'ROLE_BASED',
  testId: 'TEST_ID',
  label: 'ASSOCIATED_LABEL',
};

function deriveStepRationale(step: LocatorStep, result: ResolveResult): Rationale[] {
  const items: Rationale[] = [];
  if (result.error) return items;
  const strategyCode = STRATEGY_RATIONALE[step.kind];
  if (strategyCode && result.visibleMatchCount === 1)
    items.push(rationale(strategyCode, 'positive'));
  if (result.visibleMatchCount === 1) items.push(rationale('UNIQUE_VISIBLE', 'positive'));
  else if (result.visibleMatchCount > 1)
    items.push(rationale('AMBIGUOUS_MATCHES', 'caution', { count: result.visibleMatchCount }));
  else if (result.visibleMatchCount === 0) items.push(rationale('NO_MATCH', 'negative'));
  return boundList(items, SNAPSHOT_BUDGET.maxRationalePerItem);
}

function deriveChainRationale(
  chain: LocatorChain,
  result: ResolveResult,
  ctx: { ancestorStep?: LocatorStep; textTruncated: boolean },
): Rationale[] {
  const terminal = chain.steps[chain.steps.length - 1];
  const items = terminal ? deriveStepRationale(terminal, result) : [];
  if (ctx.ancestorStep) items.push(rationale('SCOPED_BY_ANCESTOR', 'positive'));
  if (ctx.textTruncated && terminal?.kind === 'text')
    items.push(rationale('TEXT_TRUNCATED', 'caution'));
  return boundList(items, SNAPSHOT_BUDGET.maxRationalePerItem);
}

// ─── Budget degradation ladder ──────────────────────────────────────────────
//
// Never drops the pick. Degrades optional fields, in order of how disposable
// they are, until the snapshot is within budget or nothing further can be
// shed — matching `snapshot.ts`'s own framing: "a design budget, not a
// correctness limit."

export function degradeSnapshot(snapshot: PickSnapshot): PickSnapshot {
  let violations = validateSnapshot(snapshot);
  if (violations.length === 0) return snapshot;

  let s = snapshot;

  // 1. Drop the display-only outerHTML preview — never used for generation.
  if (
    violations.some((v) => v.code === 'PREVIEW_TOO_LONG' || v.code === 'OVER_ANOMALY_THRESHOLD')
  ) {
    s = { ...s, outerHtmlPreview: undefined };
  }
  violations = validateSnapshot(s);

  // 2. Trim the verified-candidate list further than the hard cap.
  if (
    violations.some(
      (v) => v.code === 'CANDIDATE_CAP_EXCEEDED' || v.code === 'OVER_ANOMALY_THRESHOLD',
    )
  ) {
    s = { ...s, playwrightCandidates: s.playwrightCandidates.slice(0, 5) };
  }
  violations = validateSnapshot(s);

  // 3. URL is the one field with no other owner to shed weight from.
  if (violations.some((v) => v.code === 'URL_TOO_LONG')) {
    s = { ...s, url: s.url.slice(0, SNAPSHOT_BUDGET.maxUrlLength) };
  }

  if (s === snapshot) return s;
  const bytes = estimateSnapshotBytes(s);
  return { ...s, diagnostics: { ...s.diagnostics, degraded: true, serialisedBytes: bytes } };
}
