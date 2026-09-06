/**
 * WS5 — everything derived from a pick, derived once.
 *
 * THIS HOOK DECIDES NOTHING. Every candidate, every count and the
 * recommendation itself arrived on the `StoredPick`, already built, scored and
 * ranked by the engine in the content script. What happens here is grouping,
 * filtering and code generation — the presentation-side arithmetic both panels
 * were performing separately, with the standing risk that one of them would
 * start doing it slightly differently.
 *
 * `recommendLocator` is called on the candidates AS RANKED; it reads that order
 * and does not re-derive it (DL-21, guarded by `recommendation-parity.test.ts`).
 */
import { useMemo } from 'react';

import { generateLocatorCode } from '@playwright-guru/codegen';
import { recommendLocator } from '@playwright-guru/locator-engine';

import {
  generateAllCSSVariants,
  generateAllXPathVariants,
  generateCSS,
  generateXPath,
} from '../../utils/css-xpath';

import type { Recommendation, ScoredCandidate } from '@playwright-guru/locator-engine';
import type { CSSVariant, XPathVariant } from '../../utils/css-xpath';
import type { StoredPick } from '../../utils/messaging';
import type { PwLang } from '../ui/panel/types';

export interface DerivedLocators {
  byKind: Map<string, ScoredCandidate[]>;
  cssVariants: CSSVariant[];
  xpathVariants: XPathVariant[];
  cssSuggested: string | null;
  xpathSuggested: string | null;
  recommendation: Recommendation;
  recCode: string | null;
  altCode: string | null;
  genCode: (c: ScoredCandidate) => string;
}

export function useLocatorDerivation(pick: StoredPick | null, lang: PwLang): DerivedLocators {
  const candidates = useMemo(() => pick?.candidates ?? [], [pick]);

  const byKind = useMemo(() => {
    const m = new Map<string, ScoredCandidate[]>();
    for (const c of candidates) {
      if (!m.has(c.step.kind)) m.set(c.step.kind, []);
      m.get(c.step.kind)!.push(c);
    }
    return m;
  }, [candidates]);

  const genCode = useMemo(
    () => (c: ScoredCandidate) => {
      try {
        return generateLocatorCode({ steps: [c.step] }, lang);
      } catch {
        return '// error';
      }
    },
    [lang],
  );

  const attributes = pick?.attributes ?? null;

  const cssVariants = useMemo(
    () => (attributes ? generateAllCSSVariants(attributes) : []),
    [attributes],
  );
  const xpathVariants = useMemo(
    () => (attributes ? generateAllXPathVariants(attributes) : []),
    [attributes],
  );
  const cssSuggested = useMemo(
    () => (attributes ? generateCSS(attributes).selector : null),
    [attributes],
  );
  const xpathSuggested = useMemo(
    () => (attributes ? generateXPath(attributes).xpath : null),
    [attributes],
  );

  // DL-21. The engine decides; the panel only renders.
  const recommendation = useMemo(() => recommendLocator(candidates), [candidates]);
  const recCode = recommendation.candidate ? genCode(recommendation.candidate) : null;
  const altCode = recommendation.alternative ? genCode(recommendation.alternative) : null;

  return {
    byKind,
    cssVariants,
    xpathVariants,
    cssSuggested,
    xpathSuggested,
    recommendation,
    recCode,
    altCode,
    genCode,
  };
}
