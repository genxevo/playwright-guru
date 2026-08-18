/**
 * WS0 — architectural seam tests.
 *
 * These do not test locator quality; that is WS1's job. They test that the
 * SEAMS hold: that the domain can be handed a probe, that one resolver serves
 * every consumer, that rationale is structured rather than prose, and that a
 * snapshot cannot smuggle runtime state across the serialisation boundary.
 */

import { describe, expect, it } from 'vitest';

import {
  createScopeHandle,
  isScopeHandle,
  measuredCount,
  unknownCount,
  UNKNOWN_MATCH_COUNT,
} from '../src/probe';
import { resolveChain, resolveStep } from '../src/resolver';
import {
  areRationales,
  isRationale,
  rationale,
  RATIONALE_CODES,
  verdictFor,
} from '../src/rationale';
import {
  assessSnapshotBudget,
  containsScopeHandle,
  estimateSnapshotBytes,
  isSnapshotValid,
  SNAPSHOT_BUDGET,
  validateSnapshot,
} from '../src/snapshot';
import type { PickSnapshot } from '../src/snapshot';
import { boundList, boundText, FACT_LIMITS, toElementFactsLite } from '../src/facts';
import type { ElementFacts } from '../src/facts';
import type { LocatorChain, LocatorStep } from '../src/types';
import { FakeDomProbe } from './fakes/FakeDomProbe';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const roleStep: LocatorStep = {
  kind: 'role',
  selectorValue: { type: 'string', value: 'button' },
  options: { name: { type: 'string', value: 'Save' } },
};

function facts(overrides: Partial<ElementFacts> = {}): ElementFacts {
  return {
    attributes: { tagName: 'button', innerText: 'Save' },
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
    ...overrides,
  };
}

function snapshot(overrides: Partial<PickSnapshot> = {}): PickSnapshot {
  return {
    schemaVersion: 2,
    id: 'pick-1',
    timestamp: 1_700_000_000_000,
    url: 'https://example.test/checkout',
    element: facts(),
    recommended: {
      chain: { steps: [roleStep] },
      verdict: 'excellent',
      matchCount: 1,
      visibleMatchCount: 1,
      stepCounts: [1],
      rationale: [rationale('ROLE_BASED', 'positive')],
    },
    playwrightCandidates: [],
    ...overrides,
  };
}

// ─── DomProbe: dependency injection ─────────────────────────────────────────

describe('DomProbe is injectable (R3 — the domain never touches a DOM)', () => {
  it('answers domain questions without any browser present', () => {
    const probe = new FakeDomProbe({ 'role:button:Save': measuredCount(1, 1) });
    const result = resolveStep(roleStep, probe);

    expect(result.visibleMatchCount).toBe(1);
    expect(result.verdict).toBe('excellent');
    expect(probe.calls).toEqual([{ method: 'countByRole', args: ['button', 'Save'] }]);
  });

  it('runs in an environment with no document or window', () => {
    expect(typeof globalThis.document).toBe('undefined');
    expect(typeof globalThis.window).toBe('undefined');
  });

  it('reports an unmeasurable count as unknown rather than guessing', () => {
    const probe = new FakeDomProbe(
      { 'css:[title="x"]': unknownCount({ code: 'INVALID_SELECTOR' }) },
      unknownCount({ code: 'UNSUPPORTED' }),
    );
    const step: LocatorStep = { kind: 'title', selectorValue: { type: 'string', value: 'x' } };
    const result = resolveStep(step, probe);

    expect(result.verdict).toBe('unknown');
    expect(result.matchCount).toBe(UNKNOWN_MATCH_COUNT);
    expect(result.error?.code).toBe('PROBE_ERROR');
  });
});

// ─── LocatorResolver: one abstraction, every consumer ───────────────────────

describe('LocatorResolver is the single verification abstraction', () => {
  it('routes every locator kind through the probe', () => {
    const probe = new FakeDomProbe({}, measuredCount(1, 1));
    const kinds: LocatorStep[] = [
      { kind: 'role', selectorValue: { type: 'string', value: 'button' } },
      { kind: 'text', selectorValue: { type: 'string', value: 'Save' } },
      { kind: 'label', selectorValue: { type: 'string', value: 'Email' } },
      { kind: 'placeholder', selectorValue: { type: 'string', value: 'Search' } },
      { kind: 'altText', selectorValue: { type: 'string', value: 'Logo' } },
      { kind: 'title', selectorValue: { type: 'string', value: 'Close' } },
      { kind: 'testId', selectorValue: { type: 'string', value: 'submit' } },
    ];

    for (const step of kinds) {
      const result = resolveStep(step, probe);
      expect(result.error, `kind=${step.kind} must resolve`).toBeUndefined();
    }
    expect(probe.calls).toHaveLength(kinds.length);
  });

  it('escapes CSS string literals rather than misusing identifier escaping', () => {
    const probe = new FakeDomProbe({}, measuredCount(0, 0));
    resolveStep(
      { kind: 'placeholder', selectorValue: { type: 'string', value: 'say "hi"\\now' } },
      probe,
    );
    expect(probe.calls[0]?.args[0]).toBe('[placeholder="say \\"hi\\"\\\\now"]');
  });

  it('records per-step observed counts, measured independently in WS0', () => {
    const probe = new FakeDomProbe({
      'role:row:Jane Doe': measuredCount(1, 1),
      'role:button:Edit': measuredCount(3, 3),
    });
    const chain: LocatorChain = {
      steps: [
        {
          kind: 'role',
          selectorValue: { type: 'string', value: 'row' },
          options: { name: { type: 'string', value: 'Jane Doe' } },
        },
        {
          kind: 'role',
          selectorValue: { type: 'string', value: 'button' },
          options: { name: { type: 'string', value: 'Edit' } },
        },
      ],
    };

    const result = resolveChain(chain, probe);

    // Each step is measured independently against the whole document, so the
    // sequence is NOT a narrowing curve — note the second value is larger than
    // the first. Scoped resolution arrives in WS3.
    expect(result.stepCounts).toEqual([1, 3]);

    // And the chain result is the terminal step's own count, which for a
    // multi-step chain may exceed the true scoped count. Asserted explicitly so
    // this limitation cannot be forgotten or silently "fixed" by a later change
    // that does not actually implement scoping.
    expect(result.visibleMatchCount).toBe(3);
    expect(result.verdict).toBe('ambiguous');
  });

  it('treats .nth() as resolving to a single element when it is in range', () => {
    const probe = new FakeDomProbe({ 'role:button:Edit': measuredCount(3, 3) });
    const chain: LocatorChain = {
      steps: [
        {
          kind: 'role',
          selectorValue: { type: 'string', value: 'button' },
          options: { name: { type: 'string', value: 'Edit' } },
        },
      ],
      nth: 1,
    };
    expect(resolveChain(chain, probe).visibleMatchCount).toBe(1);
  });

  it('rejects an empty chain instead of reporting a match', () => {
    const result = resolveChain({ steps: [] }, new FakeDomProbe());
    expect(result.error?.code).toBe('EMPTY_CHAIN');
    expect(result.verdict).toBe('unknown');
  });
});

// ─── Verdicts ───────────────────────────────────────────────────────────────

describe('verdicts translate measurements into language', () => {
  it.each([
    [1, 'role', 'excellent'],
    [1, 'label', 'excellent'],
    [1, 'testId', 'excellent'],
    [1, 'title', 'good'],
    [1, undefined, 'good'],
    [4, 'role', 'ambiguous'],
    [0, 'role', 'no-match'],
    [UNKNOWN_MATCH_COUNT, 'role', 'unknown'],
  ])('%i visible matches on kind=%s → %s', (count, kind, expected) => {
    expect(verdictFor(count as number, kind as string | undefined)).toBe(expected);
  });
});

// ─── Rationale: structured, never prose (R4 / mechanism E-4) ────────────────

describe('rationale is structured, not prose', () => {
  it('accepts a well-formed rationale', () => {
    expect(isRationale(rationale('SCOPED_BY_ANCESTOR', 'positive', { ancestorRole: 'row' }))).toBe(
      true,
    );
  });

  it('rejects any field that could carry a sentence', () => {
    expect(
      isRationale({
        code: 'ROLE_BASED',
        tone: 'positive',
        message: 'This locator is recommended because it is role-based.',
      }),
    ).toBe(false);
  });

  it('rejects unknown codes and tones', () => {
    expect(isRationale({ code: 'NOT_A_CODE', tone: 'positive' })).toBe(false);
    expect(isRationale({ code: 'ROLE_BASED', tone: 'enthusiastic' })).toBe(false);
  });

  it('rejects non-primitive parameters', () => {
    expect(isRationale({ code: 'ROLE_BASED', tone: 'positive', params: { x: { y: 1 } } })).toBe(
      false,
    );
    expect(isRationale({ code: 'ROLE_BASED', tone: 'positive', params: { x: [1, 2] } })).toBe(
      false,
    );
  });

  it('validates whole collections', () => {
    expect(
      areRationales([rationale('NO_MATCH', 'negative'), rationale('TEST_ID', 'positive')]),
    ).toBe(true);
  });

  it('declares every code exactly once', () => {
    expect(new Set(RATIONALE_CODES).size).toBe(RATIONALE_CODES.length);
  });
});

// ─── Facts: bounded by construction ─────────────────────────────────────────

describe('ElementFacts are bounded', () => {
  it('truncates over-long text and reports that it did', () => {
    const long = 'x'.repeat(FACT_LIMITS.maxInnerTextLength + 500);
    const bounded = boundText(long, FACT_LIMITS.maxInnerTextLength);
    expect(bounded.truncated).toBe(true);
    expect(bounded.value).toHaveLength(FACT_LIMITS.maxInnerTextLength);
  });

  it('leaves short text untouched and omits empty text entirely', () => {
    expect(boundText('Save', 100)).toEqual({ value: 'Save', truncated: false });
    expect(boundText('', 100)).toEqual({ value: undefined, truncated: false });
    expect(boundText(undefined, 100)).toEqual({ value: undefined, truncated: false });
  });

  it('caps list lengths', () => {
    expect(boundList([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3]);
  });

  it('reduces to a lite fact set small enough for 100 recorded actions', () => {
    const many = Array.from({ length: 8 }, (_, depth) => ({
      tagName: 'div',
      classList: [],
      indexInParent: 0,
      depth: depth + 1,
      isUnique: false,
    }));
    const lite = toElementFactsLite(facts({ context: { ...facts().context, ancestors: many } }));
    expect(lite.ancestors).toHaveLength(FACT_LIMITS.maxLiteAncestors);
  });
});

// ─── PickSnapshot: compact fact model, not a DOM snapshot ───────────────────

describe('PickSnapshot protections', () => {
  it('is serialisable and comfortably inside the normal budget', () => {
    const s = snapshot();
    expect(() => JSON.parse(JSON.stringify(s))).not.toThrow();
    const assessment = assessSnapshotBudget(s);
    expect(assessment.status).toBe('ok');
    expect(assessment.bytes).toBeLessThan(SNAPSHOT_BUDGET.normalTargetBytes);
  });

  it('detects a ScopeHandle nested anywhere in the payload', () => {
    const handle = createScopeHandle(7);
    expect(isScopeHandle(handle)).toBe(true);
    expect(containsScopeHandle({ a: { b: [{ c: handle }] } })).toBe(true);
    expect(containsScopeHandle(snapshot())).toBe(false);
  });

  it('survives a cyclic object without hanging', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic['self'] = cyclic;
    expect(containsScopeHandle(cyclic)).toBe(false);
  });

  it('reports a ScopeHandle that reached a snapshot as a violation', () => {
    const contaminated = snapshot({
      diagnostics: { probeCalls: 3 },
    }) as PickSnapshot & { leaked?: unknown };
    contaminated.leaked = createScopeHandle(1);

    const violations = validateSnapshot(contaminated);
    expect(violations.map((v) => v.code)).toContain('SCOPE_HANDLE_PRESENT');
    expect(isSnapshotValid(contaminated)).toBe(false);
  });

  it('flags an over-cap candidate list', () => {
    const tooMany = snapshot({
      playwrightCandidates: Array.from(
        { length: SNAPSHOT_BUDGET.maxPlaywrightCandidates + 1 },
        () => ({
          step: roleStep,
          verdict: 'good' as const,
          matchCount: 1,
          visibleMatchCount: 1,
          rationale: [],
        }),
      ),
    });
    expect(validateSnapshot(tooMany).map((v) => v.code)).toContain('CANDIDATE_CAP_EXCEEDED');
  });

  it('flags an over-long outerHTML preview and URL', () => {
    const bloated = snapshot({
      outerHtmlPreview: 'x'.repeat(SNAPSHOT_BUDGET.maxOuterHtmlPreviewLength + 1),
      url: `https://example.test/${'y'.repeat(SNAPSHOT_BUDGET.maxUrlLength)}`,
    });
    const codes = validateSnapshot(bloated).map((v) => v.code);
    expect(codes).toContain('PREVIEW_TOO_LONG');
    expect(codes).toContain('URL_TOO_LONG');
  });

  it('flags a body-sized text payload as an anomaly rather than accepting it', () => {
    // The failure mode this guard exists for: picking <body> on a content-heavy
    // page and serialising the whole document's text.
    const wholePageText = 'lorem ipsum dolor sit amet '.repeat(4_000); // ~108 KB
    const bloated = snapshot({
      element: facts({
        attributes: { tagName: 'body', innerText: wholePageText },
        textTruncated: false,
      }),
    });

    expect(estimateSnapshotBytes(bloated)).toBeGreaterThan(SNAPSHOT_BUDGET.anomalyThresholdBytes);
    expect(validateSnapshot(bloated).map((v) => v.code)).toContain('OVER_ANOMALY_THRESHOLD');

    // Applying the documented cap brings the same pick back inside budget.
    const bounded = boundText(wholePageText, FACT_LIMITS.maxInnerTextLength);
    const repaired = snapshot({
      element: facts({
        attributes: { tagName: 'body', innerText: bounded.value },
        textTruncated: bounded.truncated,
      }),
    });
    expect(bounded.truncated).toBe(true);
    expect(assessSnapshotBudget(repaired).status).toBe('ok');
    expect(isSnapshotValid(repaired)).toBe(true);
  });
});
