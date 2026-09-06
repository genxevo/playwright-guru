/**
 * WS6.2 trust correction — V-3: the six ARIA STATE options are refused, not
 * ignored.
 * ============================================================================
 * THE DEFECT THIS PINS SHUT.
 *
 * `parser.ts` accepts eight option keys on a `getByRole` step — `name`, `exact`,
 * and the six state qualifiers `checked`, `pressed`, `selected`, `expanded`,
 * `disabled`, `level`. `resolveStep` read exactly two of them. The other six
 * were parsed, stored on the step, and then never looked at again, so
 *
 *     page.getByRole('checkbox', { checked: true })
 *
 * was measured as `page.getByRole('checkbox')` — every checkbox on the page,
 * checked or not. On a form with six checkboxes and one ticked, the panel
 * answered "ambiguous — 6 matches" for a locator Playwright resolves to one;
 * and where the page had a single checkbox that was NOT ticked, it answered
 * "verified — 1 match" for a locator Playwright resolves to zero. The second is
 * the worse one, and it is the same class of failure as D2: a green result for a
 * question nobody asked.
 *
 * THE RULE, WHICH IS ALREADY THE RULE. An option the resolver cannot evaluate
 * makes the STEP unsupported; it never makes the query broader. That is V-2's
 * rule for a regex `name`, stated in `resolver.ts` since WS6.2, and the six
 * state options are the remaining place it was not applied. `UNSUPPORTED_STEP`
 * and the six-state verifier's `unsupported` are used exactly as they already
 * exist — no new error code, no new verification status, no seventh state.
 *
 * WHAT THIS IS NOT. ARIA state matching is NOT implemented here and is not
 * approximated. `unsupported` is the honest answer, not a placeholder for one.
 * The options remain parseable — refusing them at the parser would report them
 * as a SYNTAX error, which is a different and untrue claim: the expression is
 * valid Playwright, this verifier simply cannot evaluate it.
 */
import { describe, expect, it } from 'vitest';

import { parseLocatorExpression } from '../src/parser';
import { resolveChain, resolveStep } from '../src/resolver';
import { verifyLocatorExpression } from '../src/verifier';

import type { DomProbe, ProbeCount, ProbeOpts, TextMatchMode } from '../src/probe';
import type { LocatorStep, LocatorStepOptions } from '../src/types';

/** Records every question asked. An unanswerable one must not be asked at all. */
class RecordingProbe implements DomProbe {
  readonly calls: string[] = [];
  constructor(private readonly count = 6) {}

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

/** The six, with an expression that exercises each. */
const STATE_OPTIONS = [
  ['checked', "page.getByRole('checkbox', { checked: true })"],
  ['pressed', "page.getByRole('button', { pressed: true })"],
  ['selected', "page.getByRole('option', { selected: true })"],
  ['expanded', "page.getByRole('button', { expanded: true })"],
  ['disabled', "page.getByRole('button', { disabled: true })"],
  ['level', "page.getByRole('heading', { level: 2 })"],
] as const;

// ─── A. Each of the six is refused, and the probe is never asked ────────────

describe('V-3 · an ARIA state option makes the step unsupported', () => {
  for (const [option, expression] of STATE_OPTIONS) {
    it(`${option} · reports UNSUPPORTED_STEP instead of counting the role unfiltered`, () => {
      const probe = new RecordingProbe();
      const result = resolveChain(parse(expression), probe);

      expect(result.error?.code).toBe('UNSUPPORTED_STEP');
      expect(result.verdict).toBe('unknown');
    });

    it(`${option} · never asks the probe the broader question`, () => {
      const probe = new RecordingProbe();
      resolveChain(parse(expression), probe);
      // The pre-fix behaviour was exactly one call, for the role alone.
      expect(probe.calls, 'an unanswerable question must not be asked at all').toEqual([]);
    });

    it(`${option} · names itself in the error detail, for the log and nothing else`, () => {
      const probe = new RecordingProbe();
      const result = resolveChain(parse(expression), probe);
      expect(result.error?.detail).toContain(option);
    });

    it(`${option} · surfaces as \`unsupported\`, never \`verified\` or \`not-found\``, () => {
      const verification = verifyLocatorExpression(expression, new RecordingProbe());
      expect(verification.status).toBe('unsupported');
      expect(verification.status).not.toBe('verified');
      expect(verification.status).not.toBe('not-found');
      expect(verification.status).not.toBe('ambiguous');
      // No count is offered, because none was measured.
      expect(verification.matchCount).toBeUndefined();
      expect(verification.visibleMatchCount).toBeUndefined();
    });
  }

  it('reports non-counts, not a number that could be read as evidence', () => {
    const result = resolveChain(
      parse("page.getByRole('checkbox', { checked: true })"),
      new RecordingProbe(),
    );
    expect(result.matchCount).toBe(-1);
    expect(result.visibleMatchCount).toBe(-1);
  });
});

// ─── B. `false` is a filter too — the presence of the key is what matters ───

describe('V-3 · a `false` state is a filter, not an absent one', () => {
  it('refuses { checked: false }, which selects UNCHECKED boxes in Playwright', () => {
    // Reading `false` as "no filter" would be the same defect wearing a
    // different hat: `getByRole('checkbox', { checked: false })` matches the
    // boxes that are NOT ticked, which is not the same set as every checkbox.
    const probe = new RecordingProbe();
    const result = resolveChain(parse("page.getByRole('checkbox', { checked: false })"), probe);
    expect(result.error?.code).toBe('UNSUPPORTED_STEP');
    expect(probe.calls).toEqual([]);
  });

  it('refuses { disabled: false } for the same reason', () => {
    const probe = new RecordingProbe();
    expect(
      resolveChain(parse("page.getByRole('button', { disabled: false })"), probe).error?.code,
    ).toBe('UNSUPPORTED_STEP');
    expect(probe.calls).toEqual([]);
  });

  it('refuses { level: 1 }, the lowest heading level, not just larger ones', () => {
    const probe = new RecordingProbe();
    expect(resolveChain(parse("page.getByRole('heading', { level: 1 })"), probe).error?.code).toBe(
      'UNSUPPORTED_STEP',
    );
    expect(probe.calls).toEqual([]);
  });
});

// ─── C. A state option alongside a supported one still refuses ─────────────

describe('V-3 · one unsupported option is enough to refuse the step', () => {
  it('a supported `name` does not license ignoring `checked`', () => {
    const probe = new RecordingProbe();
    const result = resolveChain(
      parse("page.getByRole('checkbox', { name: 'Terms', checked: true })"),
      probe,
    );
    expect(result.error?.code).toBe('UNSUPPORTED_STEP');
    // The tempting wrong answer: measure the name and drop the state.
    expect(probe.calls).not.toContain('role:checkbox:name=Terms');
    expect(probe.calls).toEqual([]);
  });

  it('names every unsupported option present, not merely the first', () => {
    const result = resolveChain(
      parse("page.getByRole('button', { pressed: true, expanded: false })"),
      new RecordingProbe(),
    );
    expect(result.error?.detail).toContain('pressed');
    expect(result.error?.detail).toContain('expanded');
  });
});

// ─── D. It applies inside a chain, at whatever position it appears ──────────

describe('V-3 · a state option anywhere in a chain refuses the chain', () => {
  it('refuses when the FIRST step carries one, before any query', () => {
    const probe = new RecordingProbe(1);
    const result = resolveChain(
      parse("page.getByRole('list', { expanded: true }).getByText('Save')"),
      probe,
    );
    expect(result.error?.code).toBe('UNSUPPORTED_STEP');
    expect(probe.calls).toEqual([]);
  });

  it('refuses when a LATER step carries one, having measured only what it must', () => {
    const probe = new RecordingProbe(1);
    const result = resolveChain(
      parse("page.getByRole('list').getByRole('checkbox', { checked: true })"),
      probe,
    );
    expect(result.error?.code).toBe('UNSUPPORTED_STEP');
    // The parent was legitimately measured; the child was never asked.
    expect(probe.calls).toEqual(['role:list:name=undefined']);
  });

  it('surfaces through the verifier as `unsupported`, with no counts', () => {
    const verification = verifyLocatorExpression(
      "page.getByRole('list').getByRole('checkbox', { checked: true })",
      new RecordingProbe(1),
    );
    expect(verification.status).toBe('unsupported');
    expect(verification.visibleMatchCount).toBeUndefined();
  });
});

// ─── E. THE NARROWNESS GUARD — nothing that worked stops working ───────────

describe('V-3 · the refusal touches only the six options it is about', () => {
  it('D3 is preserved: a STRING name is still supported', () => {
    const probe = new RecordingProbe(1);
    const result = resolveChain(parse("page.getByRole('button', { name: 'Save' })"), probe);
    expect(result.error).toBeUndefined();
    expect(probe.calls).toEqual(['role:button:name=Save']);
    expect(result.visibleMatchCount).toBe(1);
    expect(result.verdict).toBe('excellent');
  });

  it('D3 is preserved: a REGEX name is still unsupported', () => {
    const probe = new RecordingProbe();
    const result = resolveChain(parse("page.getByRole('button', { name: /Save/ })"), probe);
    expect(result.error?.code).toBe('UNSUPPORTED_STEP');
    expect(result.error?.detail).toMatch(/regex/i);
    expect(probe.calls).toEqual([]);
  });

  it('`exact` is still honoured wherever it was, and never refused', () => {
    for (const [expression, expected] of [
      ["page.getByText('Save', { exact: true })", 'text:Save:exact'],
      ["page.getByText('Save')", 'text:Save:substring'],
      ["page.getByLabel('Email', { exact: true })", 'label:Email:exact'],
      ["page.getByRole('button', { name: 'Save', exact: true })", 'role:button:name=Save'],
    ] as const) {
      const probe = new RecordingProbe(1);
      const result = resolveChain(parse(expression), probe);
      expect(result.error, `${expression} must still resolve`).toBeUndefined();
      expect(probe.calls, `${expression} must ask its own question`).toEqual([expected]);
    }
  });

  it('a role with no options at all is untouched', () => {
    const probe = new RecordingProbe(4);
    const result = resolveChain(parse("page.getByRole('button')"), probe);
    expect(result.error).toBeUndefined();
    expect(probe.calls).toEqual(['role:button:name=undefined']);
    expect(result.visibleMatchCount).toBe(4);
  });

  it('every non-role kind still resolves normally', () => {
    for (const expression of [
      "page.getByText('Save')",
      "page.getByLabel('Email')",
      "page.getByPlaceholder('you@example.com')",
      "page.getByAltText('Logo')",
      "page.getByTitle('Close')",
      "page.getByTestId('save')",
    ]) {
      const probe = new RecordingProbe(1);
      expect(
        resolveChain(parse(expression), probe).error,
        `${expression} must still resolve`,
      ).toBeUndefined();
      expect(probe.calls.length, `${expression} must ask exactly one question`).toBe(1);
    }
  });
});

// ─── F. The rule lives at the step level, and adds no new state ────────────

describe('V-3 · the refusal is a step-level rule using the existing machinery', () => {
  it('applies to a step built by hand, not only to a parsed one', () => {
    const probe = new RecordingProbe();
    const step: LocatorStep = {
      kind: 'role',
      selectorValue: { type: 'string', value: 'checkbox' },
      options: { checked: true },
    };
    const result = resolveStep(step, probe);
    expect(result.error?.code).toBe('UNSUPPORTED_STEP');
    expect(probe.calls).toEqual([]);
  });

  it('introduces no seventh verification status', async () => {
    const statuses = new Set<string>();
    for (const [, expression] of STATE_OPTIONS) {
      statuses.add(verifyLocatorExpression(expression, new RecordingProbe()).status);
    }
    statuses.add(verifyLocatorExpression("page.getByRole('button')", new RecordingProbe(1)).status);
    statuses.add(verifyLocatorExpression('page.', new RecordingProbe()).status);
    const SIX: readonly string[] = [
      'verified',
      'not-found',
      'ambiguous',
      'invalid',
      'unsupported',
      'unverifiable',
    ];
    for (const status of statuses) expect(SIX).toContain(status);

    // And no new resolve error code either.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/resolver.ts', import.meta.url), 'utf8'),
    );
    const codes = source.match(/export type ResolveErrorCode =[^;]+;/)?.[0] ?? '';
    expect(codes).toContain('UNSUPPORTED_STEP');
    expect(codes.match(/'/g)?.length).toBe(8); // four codes, unchanged
  });

  it('covers exactly the option keys the parser accepts but cannot be evaluated', () => {
    // If a future option is added to `LocatorStepOptions`, this test is where
    // the omission shows up: every key that is neither `name` nor `exact` must
    // be refused, so a new one cannot be silently ignored the way these were.
    const supported = new Set(['name', 'exact']);
    const everyKey: (keyof LocatorStepOptions)[] = [
      'name',
      'exact',
      'checked',
      'pressed',
      'selected',
      'expanded',
      'disabled',
      'level',
    ];
    for (const key of everyKey) {
      if (supported.has(key)) continue;
      const value = key === 'level' ? 2 : true;
      const step: LocatorStep = {
        kind: 'role',
        selectorValue: { type: 'string', value: 'button' },
        options: { [key]: value } as LocatorStepOptions,
      };
      const probe = new RecordingProbe();
      expect(resolveStep(step, probe).error?.code, `${key} must be refused`).toBe(
        'UNSUPPORTED_STEP',
      );
      expect(probe.calls, `${key} must not be asked`).toEqual([]);
    }
  });
});
