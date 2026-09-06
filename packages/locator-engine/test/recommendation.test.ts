/**
 * DL-21 — the recommendation, and the honesty rules around it.
 *
 * `recommendLocator` is the ONE place that decides which locator Guru
 * recommends. These tests pin what it selects, what it refuses to select, and
 * — as importantly — that it does not rank: it reads the order
 * `rankCandidates` produced and never re-derives it.
 *
 * The engine-level tests here are pure. The architectural claim that the UI
 * cannot second-guess this lives in `extension/test/recommendation-ui.test.ts`,
 * where panel source can be read without inverting the dependency direction.
 */

import { describe, expect, it } from 'vitest';

import { recommendLocator, resolvesUniquely } from '../src/recommendation';
import { rankCandidates, scoreCandidate } from '../src/scorer';
import type { LocatorKind, LocatorStep, ScoredCandidate } from '../src/types';
import type { ScoredCandidate as SC } from '../src/scorer';

const step = (kind: LocatorKind, value = 'x'): LocatorStep => ({
  kind,
  selectorValue: { type: 'string', value },
});

/** Builds a candidate the way the content script does: score from uniqueCount. */
const cand = (kind: LocatorKind, uniqueCount: number, totalCount?: number): SC => ({
  step: step(kind),
  uniqueCount,
  ...(totalCount === undefined ? {} : { totalCount }),
  score: scoreCandidate(step(kind), uniqueCount),
});

const ranked = (...cs: SC[]): SC[] => rankCandidates(cs);

// ─── The uniqueness rule, shared with the badge ─────────────────────────────

describe('resolvesUniquely — one definition of safe uniqueness', () => {
  it('requires exactly one visible match', () => {
    expect(resolvesUniquely(1)).toBe(true);
    expect(resolvesUniquely(0)).toBe(false);
    expect(resolvesUniquely(2)).toBe(false);
    expect(resolvesUniquely(-1)).toBe(false);
  });

  it('refuses when Playwright would resolve more than Guru sees', () => {
    expect(resolvesUniquely(1, 1)).toBe(true);
    expect(resolvesUniquely(1, 2), 'a hidden duplicate makes it not unique').toBe(false);
  });

  it('treats an unmeasured total as unmeasured, never as zero', () => {
    expect(resolvesUniquely(1, undefined)).toBe(true);
    expect(resolvesUniquely(1, -1)).toBe(true);
  });
});

// ─── Edge cases 1–9, as required by the milestone ───────────────────────────

describe('recommendLocator', () => {
  it('1 · recommends a clear unique candidate', () => {
    const rec = recommendLocator(ranked(cand('role', 1, 1)));
    expect(rec.candidate?.step.kind).toBe('role');
    expect(rec.verdict).toBe('excellent');
    expect(rec.reasonUnavailable).toBeUndefined();
  });

  it('2 · follows the ranked order rather than re-deciding', () => {
    // testId outranks role under PLAYWRIGHT_STRATEGY_ORDER; both are unique.
    const rec = recommendLocator(ranked(cand('role', 1, 1), cand('testId', 1, 1)));
    expect(rec.candidate?.step.kind).toBe('testId');
  });

  it('3 · recommends nothing when every candidate is ambiguous', () => {
    const rec = recommendLocator(ranked(cand('role', 3, 3), cand('text', 2, 2)));
    expect(rec.candidate).toBeNull();
    expect(rec.reasonUnavailable).toBe('all-ambiguous');
    expect(rec.verdict).toBe('ambiguous');
    expect(rec.rationales.map((r) => r.code)).toContain('AMBIGUOUS_MATCHES');
  });

  it('4 · recommends nothing when nothing matches, and says so', () => {
    const rec = recommendLocator(ranked(cand('role', 0, 0), cand('testId', 0, 0)));
    expect(rec.candidate).toBeNull();
    expect(rec.reasonUnavailable).toBe('no-match');
    expect(rec.rationales.map((r) => r.code)).toContain('NO_MATCH');
  });

  it('5 · refuses a candidate with visible 1 but total 2', () => {
    // The getByPlaceholder('mm/dd/yyyy') case: one visible, two resolved,
    // .fill() would throw. It must not be recommended.
    const rec = recommendLocator(ranked(cand('placeholder', 1, 2)));
    expect(rec.candidate).toBeNull();
    expect(rec.reasonUnavailable).toBe('all-ambiguous');
  });

  it('5b · skips the unsafe candidate and recommends a safe one behind it', () => {
    const rec = recommendLocator(ranked(cand('testId', 1, 2), cand('role', 1, 1)));
    expect(rec.candidate?.step.kind, 'testId is unsafe here despite ranking first').toBe('role');
  });

  it('6 · accepts a candidate whose total was never measured', () => {
    const rec = recommendLocator(ranked(cand('label', 1)));
    expect(rec.candidate?.step.kind).toBe('label');
  });

  it('6b · recommends nothing when no count was measured at all', () => {
    const rec = recommendLocator(ranked(cand('role', -1), cand('testId', -1)));
    expect(rec.candidate).toBeNull();
    expect(rec.reasonUnavailable).toBe('unmeasured');
    expect(rec.verdict).toBe('unknown');
    expect(rec.rationales, 'nothing measured means nothing to claim').toHaveLength(0);
  });

  it('7 · getByTestId is a legitimate recommendation under the locked policy', () => {
    const rec = recommendLocator(ranked(cand('testId', 1, 1), cand('role', 1, 1)));
    expect(rec.candidate?.step.kind).toBe('testId');
    expect(rec.rationales.map((r) => r.code)).toContain('TEST_ID');
    // And it says WHY, rather than asserting it.
    expect(rec.rationales.map((r) => r.code)).toContain('PLAYWRIGHT_PREFERRED');
  });

  it('8 · offers the unique role locator as the user-facing alternative', () => {
    const rec = recommendLocator(ranked(cand('testId', 1, 1), cand('role', 1, 1)));
    expect(rec.alternative?.step.kind).toBe('role');
  });

  it('8b · does NOT offer an ambiguous role locator as the alternative', () => {
    const rec = recommendLocator(ranked(cand('testId', 1, 1), cand('role', 3, 3)));
    expect(rec.alternative, 'an ambiguous role locator helps nobody').toBeNull();
  });

  it('8c · does NOT offer an alternative with hidden duplicates', () => {
    const rec = recommendLocator(ranked(cand('testId', 1, 1), cand('role', 1, 2)));
    expect(rec.alternative).toBeNull();
  });

  it('8d · never offers the recommendation to itself as its own alternative', () => {
    const rec = recommendLocator(ranked(cand('role', 1, 1)));
    expect(rec.candidate?.step.kind).toBe('role');
    expect(rec.alternative).toBeNull();
  });

  it('9 · only the seven getBy* strategies may be recommended', () => {
    // A kind outside the seven — a raw CSS/XPath locator, were one ever added
    // (E8/DL-26 keeps that deferred) — must never become the recommendation.
    const raw = {
      step: {
        kind: 'css' as unknown as LocatorKind,
        selectorValue: { type: 'string' as const, value: '#id' },
      },
      uniqueCount: 1,
      totalCount: 1,
      score: 999_999_999,
    };
    const rec = recommendLocator([raw as ScoredCandidate, cand('role', 1, 1)]);
    expect(
      rec.candidate?.step.kind,
      'a raw locator outranked everything and was still skipped',
    ).toBe('role');
  });

  it('handles an empty candidate list without inventing one', () => {
    const rec = recommendLocator([]);
    expect(rec.candidate).toBeNull();
    expect(rec.reasonUnavailable).toBe('no-candidates');
    expect(rec.rationales).toHaveLength(0);
  });
});

// ─── It reads the ranking; it does not perform one ──────────────────────────

describe('the recommendation does not re-rank', () => {
  it('respects the order it is given, even a deliberately wrong one', () => {
    // Passed in reverse of the real policy. If recommendLocator sorted, it
    // would "fix" this and pick testId — proving it had its own opinion.
    const rec = recommendLocator([cand('title', 1, 1), cand('testId', 1, 1)]);
    expect(rec.candidate?.step.kind, 'it took the first safe candidate, as handed').toBe('title');
  });

  it('leaves scoring entirely to scoreCandidate', () => {
    const cs = ranked(cand('testId', 1, 1), cand('role', 1, 1), cand('title', 1, 1));
    const before = cs.map((c) => c.score);
    recommendLocator(cs);
    expect(
      cs.map((c) => c.score),
      'recommendLocator must not mutate or recompute scores',
    ).toEqual(before);
  });
});

// ─── Rationale discipline ───────────────────────────────────────────────────

describe('the recommendation explains itself with codes, never prose', () => {
  it('emits only well-formed rationale codes', () => {
    const rec = recommendLocator(ranked(cand('role', 1, 1)));
    for (const r of rec.rationales) {
      expect(Object.keys(r).sort()).toEqual(expect.arrayContaining(['code', 'tone']));
      expect(typeof r.code).toBe('string');
      expect(r.code, 'a code is a SCREAMING_SNAKE token, not a sentence').toMatch(/^[A-Z_]+$/);
    }
  });

  it('claims UNIQUE_VISIBLE only when it measured exactly one', () => {
    const rec = recommendLocator(ranked(cand('role', 1, 1)));
    expect(rec.rationales.map((r) => r.code)).toContain('UNIQUE_VISIBLE');
  });

  it('claims PLAYWRIGHT_PREFERRED only for the top-ranked strategy', () => {
    // role is recommended here only because testId is unsafe — so Playwright's
    // generator would NOT have chosen it, and the claim must not be made.
    const rec = recommendLocator(ranked(cand('testId', 1, 2), cand('role', 1, 1)));
    expect(rec.candidate?.step.kind).toBe('role');
    expect(rec.rationales.map((r) => r.code)).not.toContain('PLAYWRIGHT_PREFERRED');
  });

  it('does not call getByTitle user-facing', () => {
    const rec = recommendLocator(ranked(cand('title', 1, 1)));
    expect(
      rec.rationales.map((r) => r.code),
      'title is poorly surfaced by assistive tech',
    ).not.toContain('USER_FACING');
  });
});
