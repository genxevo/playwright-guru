/**
 * WS1 — R4 structural guard (item 4 of the remaining WS1 sequence).
 *
 * R4 is Domain Prose Exclusion: engines emit rationale CODES, the UI maps codes
 * to prose (see `src/rationale.ts`). R4 already has substantial structural
 * enforcement, and this file deliberately does NOT duplicate it:
 *
 *   • E-1 (closed `Rationale` shape)          — the type itself.
 *   • E-2 (copy map exhaustive, zero orphans) — `RATIONALE_COPY` is declared
 *     `satisfies Record<RationaleCode, …>` (compile-time) AND proven at runtime
 *     by `extension/test/ws0-seams.test.ts` ("rationale copy mapping").
 *   • E-3 (domain never imports UI copy)      — the ESLint R4 rule, plus the
 *     source scan in `ws0-seams.test.ts` ("domain prose exclusion").
 *   • E-4 (`isRationale` rejects prose/shape)  — `contracts.test.ts`, on
 *     hand-built values.
 *
 * THE GAP THIS FILE CLOSES. The E-4 guard's own doc comment promises "a WS0 test
 * applies it to engine output so a bypassed type is still caught" — but no test
 * did: `recommendation.test.ts` checks emitted codes with a loose
 * `/^[A-Z_]+$/` regex, which would accept a well-shaped but NON-CATALOG code
 * (e.g. `PROSE_SENTENCE`). This guard runs the real `recommendLocator` across
 * every emit branch and applies the ACTUAL `areRationales` guard to its output,
 * asserts every emitted code is a catalog member, and pins `RATIONALE_KEYS` to
 * the `Rationale` closed shape so the guard's allow-list cannot drift from it.
 *
 * TRANSITIVE COPY GUARANTEE. Because every emitted code is proven a member of
 * `RATIONALE_CODES` here, and `ws0-seams` proves `RATIONALE_CODES` ≡ the copy
 * map's keys, every code the live engine emits necessarily has copy — without
 * this file importing extension code (WS1 is out of scope for that).
 *
 * No production code changes; every assertion pins current behaviour.
 */

import { describe, expect, it } from 'vitest';

import {
  areRationales,
  isRationale,
  rationale,
  RATIONALE_CODES,
  RATIONALE_KEYS,
  type Rationale,
} from '../src/rationale';
import { recommendLocator } from '../src/recommendation';
import { rankCandidates, scoreCandidate } from '../src/scorer';
import type { LocatorKind, LocatorStep } from '../src/types';
import type { ScoredCandidate } from '../src/scorer';

const step = (kind: LocatorKind, value = 'x'): LocatorStep => ({
  kind,
  selectorValue: { type: 'string', value },
});

const cand = (kind: LocatorKind, uniqueCount: number, totalCount?: number): ScoredCandidate => ({
  step: step(kind),
  uniqueCount,
  ...(totalCount === undefined ? {} : { totalCount }),
  score: scoreCandidate(step(kind), uniqueCount),
});

const recFor = (...cs: ScoredCandidate[]) => recommendLocator(rankCandidates(cs));

/**
 * Real recommendation outputs spanning every branch that emits rationales:
 * testId / role / label / other-kind winners (positive + PLAYWRIGHT_PREFERRED +
 * UNIQUE_VISIBLE), plus the ambiguous and no-match no-winner branches.
 */
const LIVE_RATIONALE_SETS: Record<string, Rationale[]> = {
  testIdUnique: recFor(cand('testId', 1, 1)).rationales,
  roleUnique: recFor(cand('role', 1, 1)).rationales,
  labelUnique: recFor(cand('label', 1, 1)).rationales,
  placeholderUnique: recFor(cand('placeholder', 1, 1)).rationales,
  ambiguous: recFor(cand('role', 3, 3), cand('text', 2, 2)).rationales,
  noMatch: recFor(cand('role', 0, 0)).rationales,
};

const CODE_SET = new Set<string>(RATIONALE_CODES);

// ─── E-4 applied to REAL engine output (the gap) ────────────────────────────

describe('R4 · the E-4 guard holds on real recommendation output', () => {
  it.each(Object.entries(LIVE_RATIONALE_SETS))(
    '%s — every emitted rationale passes areRationales',
    (_name, rationales) => {
      expect(areRationales(rationales)).toBe(true);
    },
  );

  it.each(Object.entries(LIVE_RATIONALE_SETS))(
    '%s — every emitted code is a catalog member (stricter than a SCREAMING_SNAKE regex)',
    (_name, rationales) => {
      for (const r of rationales) {
        expect(CODE_SET.has(r.code), `${r.code} must be a declared RationaleCode`).toBe(true);
      }
    },
  );

  it('actually emits a spread of codes (the guard is not vacuous)', () => {
    const emitted = new Set(
      Object.values(LIVE_RATIONALE_SETS)
        .flat()
        .map((r) => r.code),
    );
    // A representative spread across positive / preferred / caution / negative.
    for (const code of [
      'TEST_ID',
      'ROLE_BASED',
      'USER_FACING',
      'UNIQUE_VISIBLE',
      'AMBIGUOUS_MATCHES',
      'NO_MATCH',
    ]) {
      expect(emitted.has(code), `expected the live engine to emit ${code}`).toBe(true);
    }
  });
});

// ─── The guard is stricter than the existing shape regex ────────────────────

describe('R4 · membership, not just shape', () => {
  it('rejects a well-SHAPED but non-catalog code that /^[A-Z_]+$/ would accept', () => {
    const fake = { code: 'PROSE_SENTENCE', tone: 'positive' as const };
    expect(/^[A-Z_]+$/.test(fake.code)).toBe(true); // the old, weaker check would pass this
    expect(isRationale(fake)).toBe(false); // the real guard rejects it — not a catalog code
  });
});

// ─── RATIONALE_KEYS cannot drift from the closed Rationale shape ─────────────

describe('R4 · the E-4 allow-list stays in sync with the Rationale type', () => {
  it('RATIONALE_KEYS is exactly the keys of a fully-populated Rationale', () => {
    // `Required<Rationale>` forces every field present; if a field is added to
    // `Rationale`, this literal stops compiling until it (and RATIONALE_KEYS)
    // are updated — pinning the allow-list to the shape at compile + run time.
    const maximal: Required<Rationale> = { code: 'ROLE_BASED', tone: 'positive', params: {} };
    expect(Object.keys(maximal).sort()).toEqual([...RATIONALE_KEYS].sort());
  });

  it('every allow-listed key is accepted, and one outside it is rejected', () => {
    expect(isRationale(rationale('ROLE_BASED', 'positive', { role: 'button' }))).toBe(true);
    expect(isRationale({ code: 'ROLE_BASED', tone: 'positive', note: 'x' })).toBe(false);
  });
});
