/**
 * DL-21 — the UI surfaces the recommendation without deciding it.
 *
 * The product requirement has two halves. The engine half — what gets
 * recommended and why — is pinned in `locator-engine/test/recommendation.test.ts`.
 * This file pins the half that can only be checked against panel source:
 *
 *   - both surfaces call the SAME `recommendLocator`;
 *   - neither has a "best candidate" algorithm of its own;
 *   - the seven-strategy comparison survives untouched;
 *   - the card cannot claim verification the engine never measured.
 *
 * Source assertions rather than rendering tests: the extension suite has no DOM
 * environment, and what matters here is architectural — which module owns the
 * decision — not which pixels move.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ALTERNATIVE_LEAD,
  NO_RECOMMENDATION_COPY,
  RECOMMENDATION_TITLE,
  VERDICT_TONE,
} from '../src/ui/copy/recommendation';
import { isSafelyUnique } from '../src/ui/match-badge';

import { readComposed } from './helpers/surface-source';

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
const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const PANELS = {
  'Side Panel': strip(read('entrypoints/sidepanel/SidePanel.tsx')),
  DevTools: strip(read('entrypoints/devtools-panel/Panel.tsx')),
};

// ─── One decision, two surfaces ─────────────────────────────────────────────

describe('both surfaces consume the same recommendation', () => {
  for (const [name, source] of Object.entries(PANELS)) {
    it(`${name} calls recommendLocator on the ranked candidates`, () => {
      // WS5 — the call moved into the one shared `useLocatorDerivation` hook,
      // where `candidates` is the memoised `pick?.candidates ?? []`. The rule
      // is unchanged and is now enforced once instead of twice: the ranked
      // field is read as-is, and nothing re-sorts it.
      expect(source).toMatch(/recommendLocator\((pick\??\.?candidates\s*\?\?\s*\[\]|candidates)\)/);
      expect(source, 'the ranked field is memoised as given').toMatch(
        /candidates\s*=\s*useMemo\(\(\)\s*=>\s*pick\?\.candidates\s*\?\?\s*\[\]/,
      );
      expect(source, 'imported from the engine, not redefined').toContain('recommendLocator');
    });

    it(`${name} renders the recommendation rather than choosing one`, () => {
      // No local "best candidate" algorithm of any shape.
      expect(source).not.toMatch(/\.sort\(\s*\(a\s*,\s*b\)\s*=>\s*b\.score/);
      expect(source, 'ranking belongs to the engine').not.toContain('rankCandidates');
      expect(source).not.toContain('pickBestUnique');
      expect(source).not.toContain('scoreForRanking');
    });

    it(`${name} takes its code from the shared generator`, () => {
      expect(source).toMatch(
        /recommendation\.candidate\s*\?\s*genCode\(recommendation\.candidate\)/,
      );
      expect(source).toMatch(
        /recommendation\.alternative\s*\?\s*genCode\(recommendation\.alternative\)/,
      );
    });

    it(`${name} keeps the seven-strategy comparison`, () => {
      expect(source, 'the card is an addition, never a replacement').toContain(
        'ALL 7 PLAYWRIGHT LOCATOR TYPES',
      );
      expect(source).toContain('ALL_GETBY_KINDS');
      expect(source).toContain('LocatorRow');
      expect(source).toContain('NARow');
    });

    it(`${name} still applies the Stage 2 visible/total badge rules`, () => {
      expect(source).toMatch(/matchBadge\(candidate\.uniqueCount,\s*candidate\.totalCount\)/);
      expect(source).toMatch(/isSafelyUnique\(candidate\.uniqueCount,\s*candidate\.totalCount\)/);
    });
  }

  it('neither surface has its own recommendation component name', () => {
    // A SidePanelRecommendation / DevToolsRecommendation pair would mean two
    // selection paths, which is precisely what DL-21 must not produce.
    for (const source of Object.values(PANELS)) {
      expect(source).not.toContain('SidePanelRecommendation');
      expect(source).not.toContain('DevToolsRecommendation');
      expect(source, 'the card is named identically on both surfaces').toContain('RecommendedCard');
    }
  });

  it('both render the card from the one shared copy module', () => {
    for (const source of Object.values(PANELS)) {
      expect(source).toMatch(/from '[^']*copy\/recommendation'/);
      expect(source, 'rationales render through the existing code→copy resolver').toContain(
        'resolveRationaleCopy',
      );
    }
  });
});

// ─── Honesty of the wording ─────────────────────────────────────────────────

describe('the card never claims more than was measured', () => {
  const allCopy = [
    RECOMMENDATION_TITLE,
    ALTERNATIVE_LEAD,
    ...Object.values(NO_RECOMMENDATION_COPY),
    ...Object.values(VERDICT_TONE).map((v) => v.label),
  ].join(' ');

  it('uses no unearned confidence words', () => {
    // "Recommended" is a judgement Guru is entitled to make. "Verified",
    // "reliable", "guaranteed", "stable" are claims about a test run that has
    // not happened.
    for (const word of [
      'verified',
      'reliable',
      'guaranteed',
      'stable',
      'safe to use',
      'will work',
    ]) {
      expect(allCopy.toLowerCase(), `"${word}" overstates the evidence`).not.toContain(word);
    }
  });

  it('describes the measurement, not a feeling', () => {
    expect(VERDICT_TONE.excellent.label).toBe('resolves to 1 element');
    expect(VERDICT_TONE.good.label).toBe('resolves to 1 element');
  });

  it('has honest copy for every reason a recommendation is unavailable', () => {
    for (const [reason, text] of Object.entries(NO_RECOMMENDATION_COPY)) {
      expect(text.length, `${reason} must explain itself`).toBeGreaterThan(30);
      expect(text.toLowerCase(), `${reason} must not offer a locator anyway`).not.toMatch(
        /use (getby|page\.)/,
      );
    }
  });

  it('shows the empty state instead of a locator when none qualifies', () => {
    for (const source of Object.values(PANELS)) {
      expect(source).toContain('NO_RECOMMENDATION_COPY[rec.reasonUnavailable');
      // The green code block is gated on there being a candidate.
      expect(source).toMatch(/has\s*&&\s*code\s*&&/);
    }
  });
});

// ─── The uniqueness rule is not duplicated ──────────────────────────────────

describe('safe uniqueness has one definition', () => {
  it('the badge helper delegates to the engine', () => {
    const badge = read('src/ui/match-badge.ts');
    expect(badge).toContain('resolvesUniquely');
    expect(badge, 'no second implementation of the rule').not.toMatch(
      /export function isSafelyUnique/,
    );
  });

  it('behaves identically through either name', () => {
    expect(isSafelyUnique(1, 1)).toBe(true);
    expect(isSafelyUnique(1, 2)).toBe(false);
    expect(isSafelyUnique(2, 2)).toBe(false);
    expect(isSafelyUnique(1, undefined)).toBe(true);
  });
});
