/**
 * WS6.2 trust correction — V-2: an option the resolver cannot honour must be
 * REFUSED, never silently dropped.
 * ============================================================================
 * THE DEFECT THIS PINS SHUT.
 *
 * `resolveStep`'s role branch read the accessible-name option as
 *
 *     const nameValue = name && name.type === 'string' ? name.value : undefined;
 *
 * so a REGEX name became `undefined` and the probe was asked for the role with
 * no name filter at all. Measured before the fix, against an instrumented
 * probe, these two expressions produced the IDENTICAL probe call and the
 * IDENTICAL verdict:
 *
 *     page.getByRole('button', { name: 'Save' })   → role:button name=Save
 *     page.getByRole('button', { name: /Sav/ })    → role:button name=undefined
 *
 * On a page with nine buttons and one matching `/Sav/`, the panel reported
 * "ambiguous — 9 matches" for a locator Playwright resolves to one. That is not
 * a missing feature; it is a confident answer to a question nobody asked, which
 * is the one thing this product exists not to do.
 *
 * THE RULE, STATED ONCE. A matcher the resolver cannot evaluate makes the STEP
 * unsupported. It never makes the query broader. `UNSUPPORTED_STEP` already
 * exists for exactly this — `resolver.ts` has used it since WS0 for a regex
 * matcher on a non-role kind — and the six-state verifier already maps it to
 * `unsupported`. Nothing new is introduced here; the existing rule is applied
 * to the one place that was missing it.
 *
 * WHAT THIS IS NOT. Regex accessible-name MATCHING is not implemented, and is
 * not attempted. `unsupported` is the honest answer, not a placeholder for one.
 */
import { describe, expect, it } from 'vitest';

import { parseLocatorExpression } from '../src/parser';
import { resolveChain, resolveStep } from '../src/resolver';
import { verifyLocatorExpression } from '../src/verifier';

import type { DomProbe, ProbeCount, ProbeOpts, TextMatchMode } from '../src/probe';
import type { LocatorStep } from '../src/types';

/**
 * A probe that RECORDS every call.
 *
 * Counting calls is the point: the defect was invisible in the return value
 * (both forms returned the same number) and visible only in the question asked.
 */
class RecordingProbe implements DomProbe {
  readonly calls: string[] = [];
  constructor(private readonly count = 9) {}

  private hit(label: string): ProbeCount {
    this.calls.push(label);
    return { total: this.count, visible: this.count };
  }
  countCss(selector: string, _opts?: ProbeOpts): ProbeCount {
    return this.hit(`css:${selector}`);
  }
  countXPath(expression: string, _opts?: ProbeOpts): ProbeCount {
    return this.hit(`xpath:${expression}`);
  }
  countByText(text: string, mode: TextMatchMode, _opts?: ProbeOpts): ProbeCount {
    return this.hit(`text:${text}:${mode}`);
  }
  countByRole(role: string, name?: string, _opts?: ProbeOpts): ProbeCount {
    return this.hit(`role:${role}:name=${String(name)}`);
  }
  countByLabel(text: string, mode: TextMatchMode, _opts?: ProbeOpts): ProbeCount {
    return this.hit(`label:${text}:${mode}`);
  }
  scopeOf(): null {
    return null;
  }
}

const parse = (expression: string) => {
  const result = parseLocatorExpression(expression);
  if (!result.ok) throw new Error(`fixture must parse: ${expression} (${result.error.code})`);
  return result.chain;
};

// ─── A. A regex name is refused, and the probe is never asked ───────────────

describe('V-2 · a regex accessible-name option is unsupported, not dropped', () => {
  it('reports UNSUPPORTED_STEP instead of counting the role unconstrained', () => {
    const probe = new RecordingProbe();
    const result = resolveChain(parse("page.getByRole('button', { name: /Sav/ })"), probe);

    expect(result.error?.code).toBe('UNSUPPORTED_STEP');
    expect(result.verdict).toBe('unknown');
  });

  it('NEVER calls the probe with name=undefined, which is the defect itself', () => {
    const probe = new RecordingProbe();
    resolveChain(parse("page.getByRole('button', { name: /Sav/ })"), probe);

    // The pre-fix behaviour was exactly one call: `role:button:name=undefined`.
    expect(probe.calls).not.toContain('role:button:name=undefined');
    expect(probe.calls, 'an unanswerable question must not be asked at all').toEqual([]);
  });

  it('names the reason in the error detail, for the log and nothing else', () => {
    const probe = new RecordingProbe();
    const result = resolveChain(parse("page.getByRole('button', { name: /Sav/ })"), probe);
    expect(result.error?.detail).toMatch(/regex/i);
    expect(result.error?.detail).toMatch(/name/i);
  });

  it('reports zero counts rather than a number that could be read as evidence', () => {
    const probe = new RecordingProbe();
    const result = resolveChain(parse("page.getByRole('button', { name: /Sav/ })"), probe);
    expect(result.matchCount).toBe(-1);
    expect(result.visibleMatchCount).toBe(-1);
  });

  it('surfaces through the six-state verifier as `unsupported`, never `not-found`', () => {
    const probe = new RecordingProbe();
    const verification = verifyLocatorExpression(
      "page.getByRole('button', { name: /Sav/ })",
      probe,
    );
    expect(verification.status).toBe('unsupported');
    expect(verification.status).not.toBe('not-found');
    expect(verification.status).not.toBe('verified');
    expect(verification.matchCount).toBeUndefined();
  });

  it('refuses a regex name with flags too', () => {
    const probe = new RecordingProbe();
    const result = resolveChain(parse("page.getByRole('button', { name: /save/i })"), probe);
    expect(result.error?.code).toBe('UNSUPPORTED_STEP');
    expect(probe.calls).toEqual([]);
  });
});

// ─── B/C. String names keep working, exactly as before ──────────────────────

describe('a string accessible-name option is unaffected', () => {
  it('passes the name straight through to the probe', () => {
    const probe = new RecordingProbe(1);
    const result = resolveChain(parse("page.getByRole('button', { name: 'Save' })"), probe);

    expect(probe.calls).toEqual(['role:button:name=Save']);
    expect(result.error).toBeUndefined();
    expect(result.visibleMatchCount).toBe(1);
    expect(result.verdict).toBe('excellent');
  });

  it('keeps working alongside `exact`', () => {
    const probe = new RecordingProbe(1);
    const result = resolveChain(
      parse("page.getByRole('button', { name: 'Save', exact: true })"),
      probe,
    );
    expect(probe.calls).toEqual(['role:button:name=Save']);
    expect(result.error).toBeUndefined();
  });

  it('a role with no name option at all is still an unconstrained role query', () => {
    const probe = new RecordingProbe(4);
    const result = resolveChain(parse("page.getByRole('button')"), probe);
    expect(probe.calls).toEqual(['role:button:name=undefined']);
    expect(result.visibleMatchCount).toBe(4);
  });
});

// ─── D. `exact`, the only other option the resolver honours, still works ────

describe('the `exact` option still selects the text match mode', () => {
  it('substring by default', () => {
    const probe = new RecordingProbe(2);
    resolveChain(parse("page.getByText('Save')"), probe);
    expect(probe.calls).toEqual(['text:Save:substring']);
  });

  it('exact when asked', () => {
    const probe = new RecordingProbe(2);
    resolveChain(parse("page.getByText('Save', { exact: true })"), probe);
    expect(probe.calls).toEqual(['text:Save:exact']);
  });
});

// ─── E. The refusal is narrow — it catches the name option and nothing else ─

describe('the refusal does not spread beyond the option it is about', () => {
  it('still refuses a regex SELECTOR value on a non-role kind, as it always did', () => {
    const probe = new RecordingProbe();
    const result = resolveChain(parse('page.getByText(/Save/)'), probe);
    expect(result.error?.code).toBe('UNSUPPORTED_STEP');
    expect(probe.calls).toEqual([]);
  });

  it('leaves every non-role kind with a string value working', () => {
    for (const [expression, expected] of [
      ["page.getByText('Save')", 'text:Save:substring'],
      ["page.getByLabel('Email')", 'label:Email:substring'],
      ["page.getByPlaceholder('you@example.com')", 'css:[placeholder="you@example.com"]'],
    ] as const) {
      const probe = new RecordingProbe(1);
      const result = resolveChain(parse(expression), probe);
      expect(result.error, `${expression} must still resolve`).toBeUndefined();
      expect(probe.calls[0], `${expression} must ask its own question`).toBe(expected);
    }
    // testId asks across the three accepted attributes, so it is matched loosely.
    const testIdProbe = new RecordingProbe(1);
    resolveChain(parse("page.getByTestId('save')"), testIdProbe);
    expect(testIdProbe.calls[0]).toMatch(/^css:\[data-testid="save"\]/);
  });

  it('a regex ROLE is still rejected by the parser, before the resolver sees it', () => {
    const parsed = parseLocatorExpression('page.getByRole(/butto/)');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.code).toBe('INVALID_ARGUMENT');
  });

  it('applies at the step level, so a step built by hand is refused identically', () => {
    const probe = new RecordingProbe();
    const step: LocatorStep = {
      kind: 'role',
      selectorValue: { type: 'string', value: 'button' },
      options: { name: { type: 'regex', value: 'Sav' } },
    };
    const result = resolveStep(step, probe);
    expect(result.error?.code).toBe('UNSUPPORTED_STEP');
    expect(probe.calls).toEqual([]);
  });
});
