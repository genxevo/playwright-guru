/**
 * The ranking policy, pinned.
 *
 * Guru shipped a strategy table whose order was the inverse of Playwright's on
 * the most common case in real applications: an element with a `data-testid`.
 * Guru ranked `getByTestId` last; Playwright's generator ranks it first. The
 * numbers were magic and untested, so nothing noticed.
 *
 * These tests exist so that cannot happen again. They assert the ORDER and the
 * DIRECTION, not the arithmetic — the magnitudes may be retuned, but a
 * strategy cannot be silently demoted and "higher is better" cannot silently
 * invert.
 */

import { describe, expect, it } from 'vitest';

import {
  PLAYWRIGHT_STRATEGY_ORDER,
  isUserFacingAlternative,
  resolutionTier,
  scoreForRanking,
  strategyBonus,
} from '../src/ranking';
import { rankCandidates, scoreCandidate } from '../src/scorer';
import type { LocatorKind, LocatorStep } from '../src/types';

const step = (kind: LocatorKind, value = 'x'): LocatorStep => ({
  kind,
  selectorValue: { type: 'string', value },
});

const candidate = (kind: LocatorKind, uniqueCount: number) => ({
  step: step(kind),
  uniqueCount,
  score: scoreCandidate(step(kind), uniqueCount),
});

// ─── The order itself ───────────────────────────────────────────────────────

describe('strategy order follows Playwright’s generator', () => {
  it('is exactly the generator’s preference', () => {
    // Derived from selectorGenerator.ts: testId 1, role+name 105,
    // placeholder 125, label 145, alt 165, text 185, title 205.
    expect([...PLAYWRIGHT_STRATEGY_ORDER]).toEqual([
      'testId',
      'role',
      'placeholder',
      'label',
      'altText',
      'text',
      'title',
    ]);
  });

  it('puts testId FIRST — the inversion that made Guru disagree with codegen', () => {
    expect(PLAYWRIGHT_STRATEGY_ORDER[0]).toBe('testId');
    expect(PLAYWRIGHT_STRATEGY_ORDER.indexOf('testId')).toBeLessThan(
      PLAYWRIGHT_STRATEGY_ORDER.indexOf('role'),
    );
  });

  it('prefers placeholder over label, and altText over text', () => {
    // Both pairs were the wrong way round before.
    const at = (k: LocatorKind) => PLAYWRIGHT_STRATEGY_ORDER.indexOf(k);
    expect(at('placeholder')).toBeLessThan(at('label'));
    expect(at('altText')).toBeLessThan(at('text'));
  });

  it('gives every strategy a distinct bonus, decreasing with preference', () => {
    const bonuses = PLAYWRIGHT_STRATEGY_ORDER.map(strategyBonus);
    expect(new Set(bonuses).size).toBe(bonuses.length);
    for (let i = 1; i < bonuses.length; i++) {
      expect(bonuses[i]!, `${PLAYWRIGHT_STRATEGY_ORDER[i]}`).toBeLessThan(bonuses[i - 1]!);
    }
  });
});

// ─── Direction, stated and enforced ─────────────────────────────────────────

describe('score direction cannot silently invert', () => {
  it('is HIGHER IS BETTER', () => {
    expect(scoreForRanking('role', 1)).toBeGreaterThan(scoreForRanking('role', 5));
    expect(scoreForRanking('role', 5)).toBeGreaterThan(scoreForRanking('role', 0));
  });

  it('sorts best-first', () => {
    const ranked = rankCandidates([
      candidate('title', 3),
      candidate('testId', 1),
      candidate('role', 1),
    ]);
    expect(ranked.map((c) => c.step.kind)).toEqual(['testId', 'role', 'title']);
  });
});

// ─── Resolution dominates strategy ──────────────────────────────────────────

describe('how well a locator resolves outranks which strategy it uses', () => {
  it('classifies counts into tiers', () => {
    expect(resolutionTier(1)).toBe('unique');
    expect(resolutionTier(4)).toBe('ambiguous');
    expect(resolutionTier(0)).toBe('no-match');
    expect(resolutionTier(-1)).toBe('unmeasured');
  });

  it('prefers a unique title over an ambiguous testId', () => {
    // Playwright itself only accepts a candidate that resolves uniquely, so a
    // preferred strategy that matches three elements is not the better locator.
    expect(scoreForRanking('title', 1)).toBeGreaterThan(scoreForRanking('testId', 3));
  });

  it('prefers a measured ambiguous locator over an unmeasured one', () => {
    expect(scoreForRanking('title', 2)).toBeGreaterThan(scoreForRanking('testId', -1));
  });

  it('ranks a broken locator last, whatever its strategy', () => {
    expect(scoreForRanking('testId', 0)).toBeLessThan(scoreForRanking('title', -1));
  });

  it('prefers fewer matches when both are ambiguous', () => {
    expect(scoreForRanking('role', 2)).toBeGreaterThan(scoreForRanking('role', 9));
  });

  it('never lets an ambiguity penalty reach into the tier below', () => {
    expect(scoreForRanking('title', 10_000)).toBeGreaterThan(scoreForRanking('testId', -1));
  });
});

// ─── The case the product must be able to explain ───────────────────────────

describe('an element with BOTH a test id and a unique role', () => {
  const ranked = rankCandidates([candidate('role', 1), candidate('testId', 1)]);

  it('recommends the test id, as Playwright’s generator would', () => {
    expect(ranked[0]!.step.kind).toBe('testId');
  });

  it('keeps the role locator immediately behind it, not buried', () => {
    expect(ranked[1]!.step.kind).toBe('role');
  });

  it('marks the role locator as the user-facing alternative', () => {
    // This is the product decision: follow the generator, but do not hide the
    // locator Playwright's documentation tells humans to prefer.
    expect(isUserFacingAlternative('role', 1)).toBe(true);
    expect(isUserFacingAlternative('testId', 1)).toBe(false);
  });

  it('does not offer an ambiguous role locator as the alternative', () => {
    expect(isUserFacingAlternative('role', 3)).toBe(false);
  });
});

// ─── Regression: the exact inversion that shipped ───────────────────────────

describe('regression — the shipped inversion', () => {
  it('no longer ranks testId below every other strategy', () => {
    const kinds: LocatorKind[] = ['role', 'label', 'placeholder', 'text', 'altText', 'title'];
    for (const kind of kinds) {
      expect(
        scoreForRanking('testId', 1),
        `testId must not rank below ${kind} at equal uniqueness`,
      ).toBeGreaterThan(scoreForRanking(kind, 1));
    }
  });
});
