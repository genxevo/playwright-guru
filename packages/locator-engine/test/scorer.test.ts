/**
 * WS1 — Domain / Contract Tests · scorer.ts (canonical SECOND sub-item).
 *
 * `ranking.test.ts` already pins `scoreCandidate` / `rankCandidates` ORDER and
 * DIRECTION via the ranking policy. These tests cover the two functions that had
 * NO direct coverage: `buildCandidateSteps` (which of the seven getBy* strategies
 * are generated, for which element) and `pickBestUnique` (the unique-winner
 * selector the engine relies on).
 *
 * Every assertion PINS current behaviour; no source is changed.
 */

import { describe, expect, it } from 'vitest';

import {
  buildCandidateSteps,
  pickBestUnique,
  rankCandidates,
  scoreCandidate,
  type ScoredCandidate,
} from '../src/scorer';
import type { ElementAttributes, LocatorKind, LocatorStep } from '../src/types';

const el = (attrs: Partial<ElementAttributes> & { tagName: string }): ElementAttributes => attrs;
const kinds = (steps: LocatorStep[]): LocatorKind[] => steps.map((s) => s.kind);

// ─── buildCandidateSteps — which strategies are generated ───────────────────

describe('buildCandidateSteps · getByRole generation', () => {
  it('emits a role step with a name, then a role step without a name, when a name exists', () => {
    const steps = buildCandidateSteps(el({ tagName: 'button', innerText: 'Submit' }));
    expect(kinds(steps)).toEqual(['role', 'role']);
    expect(steps[0]).toEqual({
      kind: 'role',
      selectorValue: { type: 'string', value: 'button' },
      options: { name: { type: 'string', value: 'Submit' } },
    });
    // the second role step drops the name constraint (dynamic/empty-name fallback)
    expect(steps[1]).toEqual({
      kind: 'role',
      selectorValue: { type: 'string', value: 'button' },
    });
    expect(steps[1].options).toBeUndefined();
  });

  it('emits a single nameless role step when there is a role but no accessible name', () => {
    // select with no label/aria/name source → role combobox, no name
    const steps = buildCandidateSteps(el({ tagName: 'select' }));
    expect(kinds(steps)).toEqual(['role']);
    expect(steps[0].options).toBeUndefined();
  });

  it('emits NO role step when the element has no resolvable role', () => {
    const steps = buildCandidateSteps(el({ tagName: 'div' }));
    expect(kinds(steps)).not.toContain('role');
  });
});

describe('buildCandidateSteps · the other six strategies are presence-gated', () => {
  it('adds getByLabel only when labelText is present', () => {
    expect(kinds(buildCandidateSteps(el({ tagName: 'input', labelText: 'Email' })))).toContain(
      'label',
    );
    expect(kinds(buildCandidateSteps(el({ tagName: 'input' })))).not.toContain('label');
  });

  it('adds getByPlaceholder only when placeholder is present', () => {
    expect(
      kinds(buildCandidateSteps(el({ tagName: 'input', placeholder: 'mm/dd/yyyy' }))),
    ).toContain('placeholder');
    expect(kinds(buildCandidateSteps(el({ tagName: 'input' })))).not.toContain('placeholder');
  });

  it('adds getByAltText only when alt is present', () => {
    expect(kinds(buildCandidateSteps(el({ tagName: 'img', alt: 'Logo' })))).toContain('altText');
  });

  it('adds getByTitle only when title is present', () => {
    expect(kinds(buildCandidateSteps(el({ tagName: 'span', title: 'Tip' })))).toContain('title');
  });

  it('adds getByTestId only when testId is present', () => {
    expect(
      kinds(buildCandidateSteps(el({ tagName: 'button', innerText: 'X', testId: 'btn-x' }))),
    ).toContain('testId');
    const testIdStep = buildCandidateSteps(
      el({ tagName: 'button', innerText: 'X', testId: 'btn-x' }),
    ).find((s) => s.kind === 'testId');
    expect(testIdStep?.selectorValue).toEqual({ type: 'string', value: 'btn-x' });
  });
});

describe('buildCandidateSteps · getByText is restricted to non-interactive tags', () => {
  it('emits an EXACT getByText for a non-interactive tag with innerText', () => {
    const steps = buildCandidateSteps(el({ tagName: 'p', innerText: 'Terms and conditions' }));
    const text = steps.find((s) => s.kind === 'text');
    expect(text).toEqual({
      kind: 'text',
      selectorValue: { type: 'string', value: 'Terms and conditions' },
      options: { exact: true },
    });
  });

  it('does NOT emit getByText for an interactive tag even when it has innerText', () => {
    // Playwright recommends getByText only for non-interactive elements; a button
    // gets its text via getByRole name instead.
    const steps = buildCandidateSteps(el({ tagName: 'button', innerText: 'Click me' }));
    expect(kinds(steps)).not.toContain('text');
  });

  it('does NOT emit getByText when a non-interactive tag has no innerText', () => {
    expect(kinds(buildCandidateSteps(el({ tagName: 'div' })))).not.toContain('text');
  });
});

describe('buildCandidateSteps · full strategy set, in generation order', () => {
  it('generates every applicable strategy for a rich form control', () => {
    const steps = buildCandidateSteps(
      el({
        tagName: 'input',
        type: 'text',
        labelText: 'Name',
        placeholder: 'Your name',
        alt: 'n/a',
        title: 'Full name',
        testId: 'input-name',
      }),
    );
    // role(+name), role(bare), label, placeholder, altText, title, testId
    // (no getByText — <input> is interactive)
    expect(kinds(steps)).toEqual([
      'role',
      'role',
      'label',
      'placeholder',
      'altText',
      'title',
      'testId',
    ]);
  });
});

// ─── pickBestUnique — the unique-winner contract ────────────────────────────

const scored = (kind: LocatorKind, uniqueCount: number): ScoredCandidate => {
  const step: LocatorStep = { kind, selectorValue: { type: 'string', value: 'x' } };
  return { step, uniqueCount, score: scoreCandidate(step, uniqueCount) };
};

describe('pickBestUnique', () => {
  it('returns the first candidate whose uniqueCount is exactly 1', () => {
    const list = [scored('role', 3), scored('testId', 1), scored('label', 1)];
    expect(pickBestUnique(list)?.step.kind).toBe('testId'); // first 1 in array order
  });

  it('returns undefined when no candidate resolves uniquely', () => {
    expect(
      pickBestUnique([scored('role', 0), scored('label', 2), scored('testId', -1)]),
    ).toBeUndefined();
  });

  it('treats 0, >1 and unknown (-1) as NOT unique', () => {
    expect(pickBestUnique([scored('role', 0)])).toBeUndefined();
    expect(pickBestUnique([scored('role', 2)])).toBeUndefined();
    expect(pickBestUnique([scored('role', -1)])).toBeUndefined();
  });

  it('honours the array order it is given — pairs with rankCandidates to pick the best unique', () => {
    // rankCandidates sorts by score desc; pickBestUnique then finds the first
    // unique in that ranked order. Here testId (score-first) and label are both
    // unique; the ranked winner must be testId.
    const ranked = rankCandidates([scored('label', 1), scored('testId', 1)]);
    expect(pickBestUnique(ranked)?.step.kind).toBe('testId');
  });
});
