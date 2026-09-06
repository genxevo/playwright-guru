/**
 * Visible vs total match counts.
 *
 * Only `getByRole` filters hidden elements — measured against real Playwright
 * 1.62.1. The other six `getBy*` strategies match hidden elements too, so a
 * locator can be uniquely *visible* while Playwright resolves several and
 * throws a strict-mode violation.
 *
 * The real case that motivated this, found on playwrightautomation.com:
 *
 *     getByPlaceholder('mm/dd/yyyy')
 *     Guru        → ✓ 1 visible — unique
 *     Playwright  → resolves 2
 *     .fill()     → strict mode violation
 *
 * What these tests pin: the visible count is unchanged and still leads, the
 * total is disclosed only when it differs, and "unique" is never claimed when
 * Playwright would resolve more.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { hasHiddenMatches, isSafelyUnique, totalSuffix } from '../src/ui/match-badge';

import { denseCode, readComposed } from './helpers/surface-source';

const HERE = dirname(fileURLToPath(import.meta.url));
/**
 * WS5 — a surface is a COMPOSITION, not a file.
 *
 * `readComposed` resolves a panel entrypoint path to everything that surface
 * actually imports (see `helpers/surface-source.ts`). Every assertion below is
 * unchanged; what changed is that they now follow the code when WS5 moves it,
 * instead of silently passing because the string they look for went to another
 * file. Any other path still reads exactly that one file.
 */
const read = (rel: string): string => readComposed(rel);

// ─── The five required cases ────────────────────────────────────────────────

describe('badge behaviour by (visible, total)', () => {
  it('1 · visible=1, total=1 — unchanged, still safely unique', () => {
    expect(isSafelyUnique(1, 1)).toBe(true);
    expect(hasHiddenMatches(1, 1)).toBe(false);
    expect(totalSuffix(1, 1), 'no suffix when the counts agree').toBe('');
  });

  it('2 · visible=1, total=2 — exposes both, and is NOT unique', () => {
    expect(isSafelyUnique(1, 2), 'one visible match is not unique if Playwright finds two').toBe(
      false,
    );
    expect(hasHiddenMatches(1, 2)).toBe(true);
    expect(totalSuffix(1, 2)).toBe(' · 2 total');
  });

  it('3 · visible=0, total=1 — exposes the discrepancy', () => {
    // Guru counts nothing; Playwright resolves one. The user needs to know the
    // locator is not broken, just not visible.
    expect(isSafelyUnique(0, 1)).toBe(false);
    expect(hasHiddenMatches(0, 1)).toBe(true);
    expect(totalSuffix(0, 1)).toBe(' · 1 total');
  });

  it('4 · visible=2, total=2 — existing ambiguous behaviour unchanged', () => {
    expect(isSafelyUnique(2, 2)).toBe(false);
    expect(hasHiddenMatches(2, 2)).toBe(false);
    expect(totalSuffix(2, 2), 'nothing new to say').toBe('');
  });

  it('5 · the real case — getByPlaceholder("mm/dd/yyyy")', () => {
    const visible = 1; // unchanged by this work
    const total = 2; // what Playwright resolves
    expect(visible, 'the visible count must not change').toBe(1);
    expect(isSafelyUnique(visible, total), 'must not be presented as safely unique').toBe(false);
    expect(totalSuffix(visible, total)).toBe(' · 2 total');
  });
});

// ─── Backward compatibility ─────────────────────────────────────────────────

describe('surfaces that do not measure a total are unaffected', () => {
  it('treats an absent total as "not measured", never as zero', () => {
    // Any surface may omit the total; `undefined` must never be read as zero.
    // (WS5 gave DevTools a real total by routing it through the content
    // script, so both shipped surfaces now supply one — this guarantee is what
    // lets a future surface arrive without one.)
    expect(isSafelyUnique(1, undefined)).toBe(true);
    expect(hasHiddenMatches(1, undefined)).toBe(false);
    expect(totalSuffix(1, undefined)).toBe('');
  });

  it('treats -1 as unmeasured on either side', () => {
    expect(isSafelyUnique(1, -1)).toBe(true);
    expect(hasHiddenMatches(1, -1)).toBe(false);
    expect(totalSuffix(1, -1)).toBe('');
    expect(totalSuffix(-1, 2), 'an unmeasured visible count renders no number').toBe('');
  });

  it('never claims uniqueness for a count that is not exactly one', () => {
    for (const visible of [-1, 0, 2, 5]) {
      expect(isSafelyUnique(visible, visible)).toBe(false);
    }
  });
});

// ─── The wiring, at the seams ───────────────────────────────────────────────

describe('the content script measures and forwards both counts (WS3: via the shared resolver + LiveDomProbe)', () => {
  // WS3 moved this measuring/forwarding out of content.ts's own ad-hoc
  // counting and into `runtime/capture.ts` (which candidate wins) and
  // `runtime/probe.ts` (how a count is actually measured against the live
  // DOM) — content.ts is now a thin entrypoint that calls into them. The
  // guarantees these tests pin are unchanged; only where they live is.
  const capture = read('src/runtime/capture.ts');
  const probe = read('src/runtime/probe.ts');

  it('every candidate carries both a visible (uniqueCount) and total (totalCount) figure, not a bare number', () => {
    expect(capture).toMatch(
      /uniqueCount: result\.visibleMatchCount, totalCount: result\.matchCount/,
    );
  });

  it('forwards the visible count as uniqueCount, unchanged', () => {
    // Ranking still reads uniqueCount only, so scoring cannot shift.
    expect(capture).toMatch(/uniqueCount: result\.visibleMatchCount/);
  });

  it('keeps ancestor scoping on the visible count, as before', () => {
    expect(capture).toMatch(/resolveStep\(step, probe\)\.visibleMatchCount === 1/);
  });

  it('reports total === visible for role, where Playwright itself filters', () => {
    // WS6.2 (D2) added a third `measuredCount` argument (the scope handle for a
    // unique match), so the call is now multi-line. The claim this pins is
    // untouched: BOTH figures are `matched.length`.
    expect(probe).toMatch(/measuredCount\(\s*matched\.length,\s*matched\.length,/);
  });
});

describe('the side panel consumes both counts', () => {
  const panel = denseCode(read('entrypoints/sidepanel/SidePanel.tsx'));

  it('passes the total to the badge', () => {
    expect(panel).toMatch(/matchBadge\(candidate\.uniqueCount,\s*candidate\.totalCount\)/);
  });

  it('gates the green "unique" styling on isSafelyUnique, not on the count alone', () => {
    expect(panel).toMatch(
      /const unique=isSafelyUnique\(candidate\.uniqueCount,candidate\.totalCount\)/,
    );
    expect(panel, 'a bare ===1 uniqueness claim must not return').not.toMatch(
      /const unique\s*=\s*candidate\.uniqueCount\s*===\s*1/,
    );
  });

  it('counts the header total by the same rule, so the card cannot contradict itself', () => {
    // Prettier parenthesises a single arrow parameter, so the dense form is
    // `filter((c)=>…` rather than `filter(c=>…`. The rule being guarded — the
    // header total is counted by isSafelyUnique, not by the raw count — is
    // unchanged, so the parentheses are optional in the pattern.
    expect(panel).toMatch(/filter\(\(?c\)?=>isSafelyUnique\(c\.uniqueCount,c\.totalCount\)\)/);
  });
});

describe('the engine carries the total without scoring on it', () => {
  const scorer = readFileSync(resolve(HERE, '../../locator-engine/src/scorer.ts'), 'utf8');

  it('declares totalCount as optional, so unmeasured surfaces still typecheck', () => {
    expect(scorer).toMatch(/totalCount\?: number;/);
  });

  it('scores on uniqueCount alone — ranking is untouched by this change', () => {
    expect(scorer).toMatch(
      /export function scoreCandidate\(step: LocatorStep, uniqueCount: number\): number \{\s*return scoreForRanking\(step\.kind, uniqueCount\);/,
    );
    expect(scorer).not.toMatch(/scoreForRanking\([^)]*totalCount/);
  });
});
