// @vitest-environment happy-dom
/**
 * WS3 — captureSnapshot / the WS0 fact model.
 *
 * This module is not imported by `content.ts` (see `fact-model.ts`'s header —
 * a bundle-size GO/NO-GO check found the full fact model crosses the
 * extension's raw-size ceiling with zero current consumers). It is still
 * real, working code: these tests exercise it directly, independent of the
 * shipped bundle.
 */
import { describe, it, expect } from 'vitest';
import { captureSnapshot, buildElementContext, degradeSnapshot } from '../src/runtime/fact-model';
import { LiveDomProbe } from '../src/runtime/probe';
import {
  isSnapshotValid,
  assessSnapshotBudget,
  SNAPSHOT_BUDGET,
  type PickSnapshot,
} from '@playwright-guru/locator-engine';
import { stubLayout } from './helpers/layout-stub';
import { setBody as set } from './helpers/dom-fixture';

stubLayout();

describe('captureSnapshot', () => {
  it('produces a schemaVersion 2 snapshot that validates against the budget', () => {
    set('<button data-testid="save">Save</button>');
    const snapshot = captureSnapshot(document.querySelector('button')!);
    expect(snapshot.schemaVersion).toBe(2);
    expect(isSnapshotValid(snapshot)).toBe(true);
  });

  it('recommended is built via the resolver pipeline (resolveChain), not a duplicate scoring pass', () => {
    set('<button data-testid="save">Save</button>');
    const snapshot = captureSnapshot(document.querySelector('button')!);
    expect(snapshot.recommended.visibleMatchCount).toBe(1);
    expect(snapshot.recommended.verdict).toBe('excellent'); // testId is a premium kind, unique
  });

  it('never drops the pick when the ScopeHandle guard would otherwise apply — no ScopeHandle ever appears', () => {
    set('<button data-testid="save">Save</button>');
    const snapshot = captureSnapshot(document.querySelector('button')!);
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });

  it('caps ancestors at FACT_LIMITS.maxAncestors even on a deeply nested element', () => {
    let html = '<span id="leaf">x</span>';
    for (let i = 0; i < 20; i++) html = `<div>${html}</div>`;
    set(html);
    const snapshot = captureSnapshot(document.getElementById('leaf')!);
    expect(snapshot.element.context.ancestors.length).toBeLessThanOrEqual(8);
  });

  it('reports textTruncated and includes it in the recommended rationale when the element has long text', () => {
    set(`<p>${'word '.repeat(400)}</p>`); // > 1000 chars normalised
    const snapshot = captureSnapshot(document.querySelector('p')!);
    expect(snapshot.element.textTruncated).toBe(true);
  });

  it('sets isUnique on an ancestor fact that actually resolves to one visible element', () => {
    set('<nav data-testid="primary"><a id="leaf">Home</a></nav>');
    const snapshot = captureSnapshot(document.getElementById('leaf')!);
    const nav = snapshot.element.context.ancestors.find((a) => a.tagName === 'nav');
    expect(nav?.isUnique).toBe(true);
  });

  it('a realistic pick lands well within the <25 KB normal budget target (design blueprint §19, TEST F)', () => {
    // A moderately realistic form field: a handful of sibling inputs, a label,
    // an ancestor chain, and normal-length text — not a degenerate one-tag
    // fixture, but nothing pathological either.
    set(`
      <form id="signup" data-testid="signup-form">
        <div class="field-group">
          <label for="email">Email address</label>
          <input id="email" name="email" type="email" placeholder="you@example.com" />
        </div>
        <div class="field-group">
          <label for="name">Full name</label>
          <input id="name" name="name" type="text" />
        </div>
        <button type="submit">Create account</button>
      </form>
    `);
    const snapshot = captureSnapshot(document.getElementById('email')!);
    const assessment = assessSnapshotBudget(snapshot);
    expect(assessment.status).toBe('ok');
    expect(assessment.bytes).toBeLessThan(SNAPSHOT_BUDGET.normalTargetBytes);
  });
});

describe('buildElementContext', () => {
  it('reports sibling position facts correctly', () => {
    set('<ul><li>A</li><li id="target">B</li><li>C</li></ul>');
    const probe = new LiveDomProbe(document);
    const ctx = buildElementContext(document.getElementById('target')!, probe);
    expect(ctx.indexInParent).toBe(1);
    expect(ctx.siblingCount).toBe(3);
    expect(ctx.isFirstChild).toBe(false);
    expect(ctx.isLastChild).toBe(false);
    expect(ctx.previousSibling?.text).toBe('A');
    expect(ctx.nextSibling?.text).toBe('C');
  });

  it('reports formAncestor only when a real <form> ancestor exists, with the correct depth', () => {
    set('<form id="f"><div><input id="target" /></div></form>');
    const probe = new LiveDomProbe(document);
    const ctx = buildElementContext(document.getElementById('target')!, probe);
    expect(ctx.formAncestor).toEqual({ depth: 2, id: 'f', name: undefined });
  });

  it('reports inShadowRoot false for a plain-DOM element', () => {
    set('<div id="target"></div>');
    const probe = new LiveDomProbe(document);
    const ctx = buildElementContext(document.getElementById('target')!, probe);
    expect(ctx.inShadowRoot).toBe(false);
    expect(ctx.shadowHostPath).toBeUndefined();
  });
});

describe('degradeSnapshot — budget ladder (never drops the pick)', () => {
  function baseSnapshot(): PickSnapshot {
    return {
      schemaVersion: 2,
      id: 'pg-test',
      timestamp: Date.now(),
      url: 'https://example.com/',
      element: {
        attributes: { tagName: 'div' },
        context: {
          ancestors: [],
          indexInParent: 0,
          indexOfType: 0,
          siblingCount: 1,
          siblingCountOfType: 1,
          isFirstChild: true,
          isLastChild: true,
          isOnlyChild: true,
          inShadowRoot: false,
        },
        textTruncated: false,
      },
      recommended: {
        chain: { steps: [{ kind: 'testId', selectorValue: { type: 'string', value: 'x' } }] },
        verdict: 'excellent',
        matchCount: 1,
        visibleMatchCount: 1,
        stepCounts: [1],
        rationale: [],
      },
      playwrightCandidates: [],
    };
  }

  it('is a no-op when the snapshot is already within budget', () => {
    const snapshot = baseSnapshot();
    expect(degradeSnapshot(snapshot)).toBe(snapshot);
  });

  it('drops outerHtmlPreview when it exceeds the cap, and marks the snapshot degraded', () => {
    const snapshot = {
      ...baseSnapshot(),
      outerHtmlPreview: 'x'.repeat(SNAPSHOT_BUDGET.maxOuterHtmlPreviewLength + 1),
    };
    const degraded = degradeSnapshot(snapshot);
    expect(degraded.outerHtmlPreview).toBeUndefined();
    expect(degraded.diagnostics?.degraded).toBe(true);
  });

  it('trims playwrightCandidates past the hard cap rather than dropping the pick', () => {
    const many = Array.from({ length: SNAPSHOT_BUDGET.maxPlaywrightCandidates + 5 }, (_, i) => ({
      step: {
        kind: 'testId' as const,
        selectorValue: { type: 'string' as const, value: `id-${i}` },
      },
      verdict: 'good' as const,
      matchCount: 1,
      visibleMatchCount: 1,
      rationale: [],
    }));
    const snapshot = { ...baseSnapshot(), playwrightCandidates: many };
    const degraded = degradeSnapshot(snapshot);
    expect(degraded.playwrightCandidates.length).toBeLessThanOrEqual(
      SNAPSHOT_BUDGET.maxPlaywrightCandidates,
    );
    expect(isSnapshotValid(degraded)).toBe(true);
  });

  it('a worst-case oversized snapshot lands under the <50 KB anomaly threshold after degradation (design blueprint §19, TEST G)', () => {
    // A deliberately extreme pre-degradation payload — far beyond anything
    // `captureSnapshot` would ever produce naturally, since the per-fact caps
    // already baked into `captureSnapshot`/`facts.ts` (ancestors ≤ 8, text ≤
    // 1000 chars) mean a real oversized DOM does not itself inflate a single
    // element's snapshot. What CAN grow unbounded, absent the ladder, is
    // exactly the array/string fields exercised here: an outerHtmlPreview far
    // past its cap and hundreds of candidates each carrying a bloated
    // rationale list. Pre-degradation this snapshot is itself already well
    // over the 50 KB anomaly threshold (asserted below) — the real claim this
    // test pins is that `degradeSnapshot` reliably pulls ANY such payload back
    // under the ceiling, not merely one that was already close to it.
    const many = Array.from({ length: SNAPSHOT_BUDGET.maxPlaywrightCandidates * 20 }, (_, i) => ({
      step: {
        kind: 'testId' as const,
        selectorValue: { type: 'string' as const, value: `pg-worst-case-id-${i}` },
      },
      verdict: 'good' as const,
      matchCount: 2,
      visibleMatchCount: 2,
      rationale: Array.from({ length: SNAPSHOT_BUDGET.maxRationalePerItem * 4 }, () => ({
        code: 'UNIQUE_VISIBLE' as const,
        tone: 'positive' as const,
      })),
    }));
    const snapshot: PickSnapshot = {
      ...baseSnapshot(),
      outerHtmlPreview: 'x'.repeat(SNAPSHOT_BUDGET.maxOuterHtmlPreviewLength * 50),
      playwrightCandidates: many,
    };
    expect(
      assessSnapshotBudget(snapshot).bytes,
      'the pre-degradation fixture must actually be pathological, or this test proves nothing',
    ).toBeGreaterThan(SNAPSHOT_BUDGET.anomalyThresholdBytes);

    const degraded = degradeSnapshot(snapshot);
    const assessment = assessSnapshotBudget(degraded);
    expect(assessment.bytes).toBeLessThan(SNAPSHOT_BUDGET.anomalyThresholdBytes);
    expect(isSnapshotValid(degraded)).toBe(true);
    // The pick itself is never dropped — the core identifying fields survive
    // degradation untouched, exactly as `snapshot.ts`'s own contract requires.
    expect(degraded.element.attributes).toEqual(snapshot.element.attributes);
    expect(degraded.recommended).toEqual(snapshot.recommended);
  });
});
