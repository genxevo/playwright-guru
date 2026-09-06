/**
 * WS9 — the `RecordedWorkflow` model: limits, coalescing, truncation, redaction.
 * ============================================================================
 * WHAT THIS SLICE IS, AND WHAT AUTHORISES IT.
 *
 * The WS9 discovery gate's own §14 ("Recommended Implementation Boundary")
 * names the first honest slice once D1–D3 are answered:
 *
 *   "the `RecordedWorkflow` data model (verified chains + `ElementFactsLite`),
 *    the `runtime/recorder` with coalescing driven by `RECORDING_LIMITS`,
 *    redaction and truncation, and the limit behaviour at 40/100 … and
 *    `RECORDING_ENABLED` left off until the handshake and heartbeat exist."
 *
 * D1/D2/D3 were answered by DL-64, and D2's condition — "WS4 is implemented
 * first" — was discharged when WS4 closed (DL-66). This file covers the model
 * half of that slice; `ws9-recorder-capture.test.ts` covers the runtime half.
 *
 * WHAT IT IS NOT. No activation handshake, no heartbeat, no persistence, no
 * `renderAction`/`renderSpecFile`, no export menu, no UI, no `content.ts`
 * wiring, and `RECORDING_ENABLED` stays `false`. Those are later slices by
 * §14's own sequencing, and none of them is implemented or stubbed here.
 *
 * THE DEFECTS THIS MODEL EXISTS TO PREVENT, all measured in the legacy recorder
 * that DL-63 found unreachable in `entrypoints/content.ts` and DL-64/D3 ruled is
 * REPLACED rather than extended:
 *
 *   • it appends with `[...prev, action]` — an UNBOUNDED array, so `hardStop`
 *     never fires and a runaway page can grow the workflow without limit;
 *   • it stores `attrs: extractAttributes(el)` — RAW ATTRIBUTES, not a verified
 *     `LocatorChain`, which is exactly what §18 forbids ("stores the verified
 *     chain, not a rendered string");
 *   • it never truncates a captured value against `maxValueLength`;
 *   • its input filter excludes `checkbox,radio,file,button,submit,reset` and
 *     **does not exclude `password`**.
 *
 * Each of those is a property of the MODEL, so each is pinned here rather than
 * left to the recorder that feeds it. Defence in depth is deliberate: the
 * runtime never reads a secret (proven in the sibling file), and the model
 * refuses to hold one even if a future caller hands it over.
 */
import { describe, expect, it } from 'vitest';

import {
  RECORDING_LIMITS,
  recordingLimitState,
  shouldStopRecording,
} from '../src/config/recording';
import {
  appendStep,
  assessWorkflowBudget,
  createWorkflow,
  estimateWorkflowBytes,
  type RecordedStep,
  type RecordedTarget,
  type RecordedWorkflow,
} from '../src/recording/workflow';
import { redactionReasonFor } from '../src/recording/redaction';

import type { LocatorChain } from '@playwright-guru/locator-engine';

// ─── Fixtures ───────────────────────────────────────────────────────────────

/**
 * A target in the shape the runtime produces: a VERIFIED locator (the existing
 * `RecommendedLocator` — chain + verdict + counts + rationale codes) plus
 * `ElementFactsLite`. Deliberately the existing types, so there is provably no
 * second representation of a locator anywhere in recording.
 */
function target(id: string, chain?: LocatorChain): RecordedTarget {
  return {
    locator: {
      chain: chain ?? { steps: [{ kind: 'testId', selectorValue: { type: 'string', value: id } }] },
      verdict: 'excellent',
      matchCount: 1,
      visibleMatchCount: 1,
      stepCounts: [1],
      rationale: [],
    },
    facts: {
      attributes: { tagName: 'input', testId: id },
      ancestors: [],
      indexInParent: 0,
      inShadowRoot: false,
    },
  };
}

const at = (ms: number) => ms;

function step(partial: Partial<RecordedStep> & { kind: RecordedStep['kind'] }): RecordedStep {
  return { timestamp: 0, ...partial };
}

function workflow(): RecordedWorkflow {
  return createWorkflow({ id: 'wf-1', url: 'https://example.test/', startedAt: 0 });
}

/** Appends many steps, returning the final workflow. */
function withSteps(count: number, make: (i: number) => RecordedStep): RecordedWorkflow {
  let wf = workflow();
  for (let i = 0; i < count; i++) wf = appendStep(wf, make(i)).workflow;
  return wf;
}

// ─── 1. The limits, from the single constant ────────────────────────────────

describe('WS9 · the limit behaviour at 40 and 100', () => {
  it('40 warns and DOES NOT interrupt — the recording continues', () => {
    // `RECORDING_LIMITS`' own doc: "`warnAt` is a teaching signal, not a gate.
    // It must never pause, modal, or otherwise interrupt a recording."
    let wf = withSteps(RECORDING_LIMITS.warnAt - 1, (i) =>
      step({ kind: 'click', target: target(`t${i}`), timestamp: at(i * 10_000) }),
    );
    expect(wf.steps).toHaveLength(39);

    const result = appendStep(
      wf,
      step({ kind: 'click', target: target('t39'), timestamp: 400_000 }),
    );
    expect(result.outcome, 'the 40th action must still be recorded').toBe('appended');
    expect(result.state).toBe('warning');
    expect(result.workflow.steps).toHaveLength(40);
    expect(result.workflow.stopped, 'warning must never stop a recording').toBeUndefined();

    // …and it keeps going well past the warning.
    wf = result.workflow;
    for (let i = 40; i < 99; i++) {
      const r = appendStep(
        wf,
        step({ kind: 'click', target: target(`t${i}`), timestamp: i * 10_000 }),
      );
      expect(r.outcome).toBe('appended');
      wf = r.workflow;
    }
    expect(wf.steps).toHaveLength(99);
    expect(wf.stopped).toBeUndefined();
  });

  it('100 stops, and every captured action is PRESERVED', () => {
    const wf = withSteps(RECORDING_LIMITS.hardStop, (i) =>
      step({ kind: 'click', target: target(`t${i}`), timestamp: i * 10_000 }),
    );
    expect(wf.steps).toHaveLength(100);
    expect(wf.stopped?.reason).toBe('limit');

    const refused = appendStep(
      wf,
      step({ kind: 'click', target: target('t100'), timestamp: 1_000_000 }),
    );
    expect(refused.outcome).toBe('refused-stopped');
    expect(refused.state).toBe('stopped');
    expect(refused.workflow.steps, 'the captured work must survive the stop').toHaveLength(100);
    expect(refused.workflow.steps[0]).toEqual(wf.steps[0]);
    expect(refused.workflow.steps[99]).toEqual(wf.steps[99]);
  });

  it('reads the numbers from the single constant, never its own copy', () => {
    // The regression this closes is DL-4: the legacy recorder hard-codes 600 ms
    // where `RECORDING_LIMITS.fillDebounceMs` says 500.
    expect(recordingLimitState(RECORDING_LIMITS.warnAt)).toBe('warning');
    expect(shouldStopRecording(RECORDING_LIMITS.hardStop)).toBe(true);
    expect(shouldStopRecording(RECORDING_LIMITS.warnAt)).toBe(false);
  });
});

// ─── 2. Coalescing, driven by the same constant ─────────────────────────────

describe('WS9 · coalescing', () => {
  it('consecutive fills on the SAME field collapse into one, keeping the last value', () => {
    let wf = workflow();
    wf = appendStep(
      wf,
      step({ kind: 'fill', target: target('email'), value: 'a', timestamp: 0 }),
    ).workflow;
    const second = appendStep(
      wf,
      step({ kind: 'fill', target: target('email'), value: 'ab', timestamp: 200 }),
    );

    expect(second.outcome).toBe('coalesced');
    expect(second.workflow.steps).toHaveLength(1);
    expect(second.workflow.steps[0]?.value).toBe('ab');
  });

  it('a fill on a DIFFERENT field is a new step, not a coalesce', () => {
    let wf = workflow();
    wf = appendStep(
      wf,
      step({ kind: 'fill', target: target('email'), value: 'a', timestamp: 0 }),
    ).workflow;
    const other = appendStep(
      wf,
      step({ kind: 'fill', target: target('password-name'), value: 'b', timestamp: 100 }),
    );
    expect(other.outcome).toBe('appended');
    expect(other.workflow.steps).toHaveLength(2);
  });

  it('a fill after the debounce window is a new step', () => {
    let wf = workflow();
    wf = appendStep(
      wf,
      step({ kind: 'fill', target: target('email'), value: 'a', timestamp: 0 }),
    ).workflow;
    const late = appendStep(
      wf,
      step({
        kind: 'fill',
        target: target('email'),
        value: 'ab',
        timestamp: RECORDING_LIMITS.fillDebounceMs + 1,
      }),
    );
    expect(late.outcome).toBe('appended');
    expect(late.workflow.steps).toHaveLength(2);
  });

  it('a second click on the same target inside the dblclick window becomes ONE dblclick', () => {
    let wf = workflow();
    wf = appendStep(wf, step({ kind: 'click', target: target('row'), timestamp: 0 })).workflow;
    const second = appendStep(
      wf,
      step({
        kind: 'click',
        target: target('row'),
        timestamp: RECORDING_LIMITS.dblclickWindowMs - 1,
      }),
    );

    expect(second.outcome).toBe('coalesced');
    expect(second.workflow.steps).toHaveLength(1);
    expect(second.workflow.steps[0]?.kind).toBe('dblclick');
  });

  it('two clicks outside the window stay two clicks', () => {
    let wf = workflow();
    wf = appendStep(wf, step({ kind: 'click', target: target('row'), timestamp: 0 })).workflow;
    const second = appendStep(
      wf,
      step({
        kind: 'click',
        target: target('row'),
        timestamp: RECORDING_LIMITS.dblclickWindowMs + 1,
      }),
    );
    expect(second.outcome).toBe('appended');
    expect(second.workflow.steps.map((s) => s.kind)).toEqual(['click', 'click']);
  });

  it('a third click does not collapse a dblclick further', () => {
    let wf = workflow();
    wf = appendStep(wf, step({ kind: 'click', target: target('row'), timestamp: 0 })).workflow;
    wf = appendStep(wf, step({ kind: 'click', target: target('row'), timestamp: 100 })).workflow;
    const third = appendStep(wf, step({ kind: 'click', target: target('row'), timestamp: 200 }));
    expect(third.workflow.steps.map((s) => s.kind)).toEqual(['dblclick', 'click']);
  });

  it('coalescing never lets the workflow exceed the hard stop', () => {
    // A coalesce must not be a way around the cap, and must not be counted as
    // one either — the invariant is simply that length never passes hardStop.
    const wf = withSteps(200, (i) =>
      step({ kind: 'fill', target: target(`f${i}`), value: 'x', timestamp: i * 10_000 }),
    );
    expect(wf.steps.length).toBeLessThanOrEqual(RECORDING_LIMITS.hardStop);
  });
});

// ─── 3. Truncation ──────────────────────────────────────────────────────────

describe('WS9 · captured values are truncated against the single constant', () => {
  it('a long value is cut to `maxValueLength`', () => {
    const long = 'x'.repeat(RECORDING_LIMITS.maxValueLength + 500);
    const result = appendStep(
      workflow(),
      step({ kind: 'fill', target: target('bio'), value: long }),
    );
    const stored = result.workflow.steps[0]?.value ?? '';
    expect(stored).toHaveLength(RECORDING_LIMITS.maxValueLength);
    expect(stored.length, 'the legacy recorder stored the whole value').toBeLessThan(long.length);
  });

  it('a short value is stored unchanged', () => {
    const result = appendStep(
      workflow(),
      step({ kind: 'fill', target: target('bio'), value: 'hi' }),
    );
    expect(result.workflow.steps[0]?.value).toBe('hi');
  });

  it('truncation applies to a coalesced value too', () => {
    let wf = workflow();
    wf = appendStep(
      wf,
      step({ kind: 'fill', target: target('bio'), value: 'a', timestamp: 0 }),
    ).workflow;
    const long = 'y'.repeat(RECORDING_LIMITS.maxValueLength + 10);
    const merged = appendStep(
      wf,
      step({ kind: 'fill', target: target('bio'), value: long, timestamp: 100 }),
    );
    expect(merged.workflow.steps[0]?.value).toHaveLength(RECORDING_LIMITS.maxValueLength);
  });
});

// ─── 4. Redaction — the model refuses a secret even if handed one ───────────

describe('WS9 · a redacted step can never carry a value', () => {
  it('drops the value outright when a redaction reason is present', () => {
    const result = appendStep(
      workflow(),
      step({ kind: 'fill', target: target('pw'), value: 'hunter2', redacted: 'password' }),
    );
    const stored = result.workflow.steps[0];
    expect(stored?.value, 'a redacted step must hold no value at all').toBeUndefined();
    expect(stored?.redacted).toBe('password');
    // And the secret is nowhere in the serialised workflow, under any key.
    expect(JSON.stringify(result.workflow)).not.toContain('hunter2');
  });

  it('records THAT a value was withheld, so the workflow is not silently wrong', () => {
    // Dropping the step entirely would misrepresent the user's flow; dropping
    // only the value keeps the shape honest and the secret out.
    const result = appendStep(
      workflow(),
      step({ kind: 'fill', target: target('pw'), value: 'hunter2', redacted: 'password' }),
    );
    expect(result.outcome).toBe('appended');
    expect(result.workflow.steps).toHaveLength(1);
    expect(result.workflow.steps[0]?.kind).toBe('fill');
  });

  it('applies to every redaction reason, not only passwords', () => {
    for (const reason of ['password', 'file', 'payment'] as const) {
      const result = appendStep(
        workflow(),
        step({ kind: 'fill', target: target('x'), value: 'SECRET', redacted: reason }),
      );
      expect(result.workflow.steps[0]?.value, `${reason} must carry no value`).toBeUndefined();
      expect(JSON.stringify(result.workflow)).not.toContain('SECRET');
    }
  });

  it('a redacted fill never coalesces a value back in', () => {
    let wf = workflow();
    wf = appendStep(
      wf,
      step({ kind: 'fill', target: target('pw'), value: 'a', redacted: 'password', timestamp: 0 }),
    ).workflow;
    const merged = appendStep(
      wf,
      step({
        kind: 'fill',
        target: target('pw'),
        value: 'hunter2',
        redacted: 'password',
        timestamp: 100,
      }),
    );
    expect(merged.workflow.steps[0]?.value).toBeUndefined();
    expect(JSON.stringify(merged.workflow)).not.toContain('hunter2');
  });
});

describe('WS9 · redactionReasonFor classifies a field without ever seeing its value', () => {
  it('password inputs, by type', () => {
    expect(redactionReasonFor({ type: 'password' })).toBe('password');
    expect(redactionReasonFor({ type: 'PASSWORD' })).toBe('password');
  });

  it('file inputs, by type', () => {
    // A file input's value is a local path — PII, and not replayable by
    // Playwright's `fill` anyway.
    expect(redactionReasonFor({ type: 'file' })).toBe('file');
  });

  it('payment fields, by the autocomplete contract the platform already defines', () => {
    for (const token of ['cc-number', 'cc-csc', 'cc-exp', 'cc-name', 'cc-exp-month']) {
      expect(redactionReasonFor({ type: 'text', autocomplete: token }), token).toBe('payment');
    }
  });

  it('payment fields, by conventional field naming when autocomplete is absent', () => {
    expect(redactionReasonFor({ type: 'text', name: 'cardNumber' })).toBe('payment');
    expect(redactionReasonFor({ type: 'text', id: 'credit-card' })).toBe('payment');
    expect(redactionReasonFor({ type: 'text', placeholder: 'CVV' })).toBe('payment');
    expect(redactionReasonFor({ type: 'text', labelText: 'Security code' })).toBe('payment');
  });

  it('current-password / new-password autocomplete, even on a text input', () => {
    expect(redactionReasonFor({ type: 'text', autocomplete: 'current-password' })).toBe('password');
    expect(redactionReasonFor({ type: 'text', autocomplete: 'new-password' })).toBe('password');
  });

  it('leaves ordinary fields alone — the feature must stay useful', () => {
    expect(redactionReasonFor({ type: 'text', name: 'email' })).toBeNull();
    expect(redactionReasonFor({ type: 'email', name: 'email' })).toBeNull();
    expect(redactionReasonFor({ type: 'search', placeholder: 'Search' })).toBeNull();
    expect(redactionReasonFor({ type: 'text', name: 'discardReason' })).toBeNull();
    expect(redactionReasonFor({})).toBeNull();
  });
});

// ─── 5. The byte budget — "≤500 KB at 100 actions" ─────────────────────────

describe('WS9 · a full workflow stays inside its byte budget', () => {
  it('100 realistic actions fit well under the limit', () => {
    const chain: LocatorChain = {
      steps: [
        {
          kind: 'role',
          selectorValue: { type: 'string', value: 'button' },
          options: { name: { type: 'string', value: 'Add to cart' } },
        },
      ],
    };
    const wf = withSteps(RECORDING_LIMITS.hardStop, (i) =>
      step({
        kind: 'click',
        target: target(`product-${i}`, chain),
        timestamp: i * 1_000,
      }),
    );
    expect(wf.steps).toHaveLength(100);

    const assessment = assessWorkflowBudget(wf);
    expect(assessment.status).toBe('ok');
    expect(assessment.bytes).toBeLessThan(RECORDING_LIMITS.maxWorkflowBytes);
    // Not vacuous: a real workflow is substantial, not an empty shell.
    expect(assessment.bytes).toBeGreaterThan(10_000);
  });

  it('reports over-budget honestly rather than silently truncating', () => {
    const fat = 'z'.repeat(RECORDING_LIMITS.maxValueLength);
    const wf = withSteps(RECORDING_LIMITS.hardStop, (i) =>
      step({
        kind: 'fill',
        target: target(`field-${i}`),
        value: fat,
        timestamp: i * 10_000,
      }),
    );
    const assessment = assessWorkflowBudget(wf);
    expect(['ok', 'over-budget']).toContain(assessment.status);
    expect(assessment.bytes).toBe(estimateWorkflowBytes(wf));
  });

  it('the budget number lives in the single constant, not in the model', () => {
    expect(RECORDING_LIMITS.maxWorkflowBytes).toBe(500 * 1024);
  });
});

// ─── 6. The model stores a VERIFIED chain, never a rendered string ──────────

describe('WS9 · §18 — a recorded target holds the verified chain, not a string', () => {
  it('carries the chain, its verdict and its measured counts', () => {
    const result = appendStep(workflow(), step({ kind: 'click', target: target('save') }));
    const stored = result.workflow.steps[0]?.target;
    expect(stored?.locator.chain.steps).toHaveLength(1);
    expect(stored?.locator.verdict).toBe('excellent');
    expect(stored?.locator.visibleMatchCount).toBe(1);
    expect(stored?.facts.attributes.tagName).toBe('input');
  });

  it('holds no rendered locator expression anywhere', () => {
    // The legacy recorder stored raw `attrs` and left rendering to the panel;
    // §18 requires the opposite — store what was verified, render later.
    const result = appendStep(workflow(), step({ kind: 'click', target: target('save') }));
    const serialised = JSON.stringify(result.workflow);
    expect(serialised).not.toContain('page.getBy');
    expect(serialised).not.toContain('await page');
  });

  it('is serialisable — no ScopeHandle, no DOM node, no function', async () => {
    const { containsScopeHandle } = await import('@playwright-guru/locator-engine');
    const result = appendStep(workflow(), step({ kind: 'click', target: target('save') }));
    expect(containsScopeHandle(result.workflow)).toBe(false);
    expect(() => structuredClone(result.workflow)).not.toThrow();
  });

  it('a goto step carries a url and no target', () => {
    const result = appendStep(
      workflow(),
      step({ kind: 'goto', url: 'https://example.test/checkout' }),
    );
    expect(result.workflow.steps[0]?.url).toBe('https://example.test/checkout');
    expect(result.workflow.steps[0]?.target).toBeUndefined();
  });
});
