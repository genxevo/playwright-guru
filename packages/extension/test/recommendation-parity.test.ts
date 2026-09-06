/**
 * WS6 — recommendation integration audit (§15).
 * ================================================================
 *
 * The instruction for this closure pass was to inspect every recommendation
 * consumer and verify there is no duplicated ranking logic in the Side Panel,
 * DevTools, content/runtime, or utility modules — centralizing it if there
 * was. Inspection found there already is exactly one: both panels call the
 * same `recommendLocator()` export from `@playwright-guru/locator-engine`
 * against the same ranked `pick.candidates`, and neither panel branches on a
 * locally re-derived order. This file turns that one-time finding into a
 * permanent, enforced guarantee — matching the existing `capturePick` parity
 * guard in `devtools-architecture.test.ts` — so a second scorer/ranker
 * cannot creep back into either surface unnoticed.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
const readEngine = (rel: string): string =>
  readFileSync(resolve(HERE, '../../locator-engine', rel), 'utf8');

const PANEL = read('entrypoints/devtools-panel/Panel.tsx');
const SIDE_PANEL = read('entrypoints/sidepanel/SidePanel.tsx');
const RECOMMENDATION = readEngine('src/recommendation.ts');

const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('WS6 — a single recommendation authority, not two', () => {
  it('both panels import recommendLocator from the shared package, not a local copy', () => {
    for (const [name, source] of [
      ['Panel.tsx', PANEL],
      ['SidePanel.tsx', SIDE_PANEL],
    ] as const) {
      expect(source, `${name} must import recommendLocator`).toMatch(
        /import\s*\{[^}]*recommendLocator[^}]*\}\s*from\s*'@playwright-guru\/locator-engine'/,
      );
      expect(source, `${name} must not declare its own recommendLocator`).not.toMatch(
        /function\s+recommendLocator/,
      );
    }
  });

  it('both call sites read the SAME ranked field, pick.candidates, with no re-sort of their own', () => {
    // WS5 — one shared derivation hook now performs this call for BOTH
    // surfaces, so "the same ranked field, no re-sort" is structural rather
    // than a coincidence maintained in two files.
    for (const source of [code(PANEL), code(SIDE_PANEL)]) {
      expect(source).toMatch(/recommendLocator\((pick\?\.candidates\s*\?\?\s*\[\]|candidates)\)/);
      expect(source).toMatch(
        /candidates\s*=\s*useMemo\(\(\)\s*=>\s*pick\?\.candidates\s*\?\?\s*\[\]/,
      );
    }
  });

  it('neither panel re-derives a strategy order (no local .sort()/scoring on candidates)', () => {
    for (const source of [code(PANEL), code(SIDE_PANEL)]) {
      expect(source).not.toMatch(/candidates\s*\.\s*sort\(/);
      expect(source).not.toMatch(/\bscoreCandidate\b/);
      expect(source).not.toMatch(/\brankCandidates\b/);
    }
  });

  it('exactly one recommendLocator is exported from the engine', () => {
    expect((RECOMMENDATION.match(/export function recommendLocator/g) ?? []).length).toBe(1);
  });
});
