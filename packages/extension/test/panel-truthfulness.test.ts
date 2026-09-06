/**
 * What the panels tell the user must be true.
 *
 * These are source-text and pure-function tests, matching the existing
 * extension test architecture (no DOM environment is available, and adding one
 * would mean a new repo dependency for no gain here).
 *
 * Three things are pinned:
 *
 *   1. The "No visible text" falsehood cannot come back.
 *   2. The Playwright tab and the CSS/XPath tabs stay on separate code paths,
 *      so `+ Code` on a getBy* row can never emit a `page.locator(...)` CSS
 *      selector.
 *   3. Strategy preference has exactly one definition.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { NA_REASON_COPY, naReasonFor } from '../src/ui/copy/na-reason';

import { EXT_ROOT, denseCode, readComposed, withoutFile } from './helpers/surface-source';

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
const PANELS = ['entrypoints/sidepanel/SidePanel.tsx', 'entrypoints/devtools-panel/Panel.tsx'];

/**
 * Every production source file in the package (DL-82).
 *
 * The strategy-order guard below used to protect one file, because one file
 * held the risk. With that file retired, the honest scope for "there is exactly
 * one definition of strategy preference" is every file that could hold a second
 * one.
 */
const PRODUCTION_SOURCES: string[] = (() => {
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = join(EXT_ROOT, rel);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs)) {
      if (name === 'node_modules') continue;
      const childRel = `${rel}/${name}`;
      if (statSync(join(EXT_ROOT, childRel)).isDirectory()) walk(childRel);
      else if (/\.tsx?$/.test(name)) out.push(childRel);
    }
  };
  for (const root of ['src', 'entrypoints', 'utils']) walk(root);
  return out.sort();
})();

// ─── 1. The getByText message ───────────────────────────────────────────────

describe('the panel never claims an element has no text when it has text', () => {
  it('says the strategy was not offered, and why', () => {
    const reason = naReasonFor('text', {
      generatedCount: 0,
      innerText: 'Submit',
      absent: 'No visible text to match on.',
    });
    expect(reason).toBe(NA_REASON_COPY.TEXT_NOT_OFFERED);
    expect(reason).not.toMatch(/no visible text/i);
    // It must still teach the actual guidance, which was the point of the
    // original message.
    expect(reason).toMatch(/getByRole/);
  });

  it('still says "no visible text" when there really is none', () => {
    const absent = 'No visible text to match on.';
    expect(naReasonFor('text', { generatedCount: 0, innerText: '', absent })).toBe(absent);
    expect(naReasonFor('text', { generatedCount: 0, absent })).toBe(absent);
    // Whitespace is not text.
    expect(naReasonFor('text', { generatedCount: 0, innerText: '   \n ', absent })).toBe(absent);
  });

  it('distinguishes "found nothing" from "never looked"', () => {
    // The quieter falsehood: a placeholder that exists but matched nothing used
    // to be reported as "No placeholder attribute".
    const reason = naReasonFor('placeholder', {
      generatedCount: 1,
      absent: 'No placeholder attribute — only available on <input> and <textarea>.',
    });
    expect(reason).toBe(NA_REASON_COPY.MATCHED_NOTHING);
    expect(reason).not.toMatch(/No placeholder attribute/);
  });

  it('is wired into both panels, with no leftover copy of the old wording', () => {
    for (const panel of PANELS) {
      const source = read(panel);
      expect(source, `${panel} must resolve its N/A copy through naReasonFor`).toContain(
        'naReasonFor(',
      );
      expect(
        source,
        `${panel} still asserts "No visible text" about interactive elements`,
      ).not.toMatch(/No visible text\s*—\s*(use|for interactive)/);
    }
  });
});

// ─── 2. Playwright rows vs CSS rows ─────────────────────────────────────────

describe('the Playwright tab cannot emit a CSS locator', () => {
  it('renders getBy* rows through the codegen package, not toLocatorCode', () => {
    for (const panel of PANELS) {
      const source = read(panel);
      // genCode is what LocatorRow receives; it must come from codegen. Match
      // on the declaration loosely — both panels format it differently — but
      // insist the body reaches generateLocatorCode and nothing else.
      // WS5 moved `genCode` into the shared `useLocatorDerivation` hook, where
      // prettier wraps it over several lines; densifying restores the shape
      // this guard was written against. What it asserts is unchanged.
      const decl = denseCode(source).match(
        /genCode=(useMemo\(\(\)=>)?\(c:ScoredCandidate\)=>\{[\s\S]*?\}/,
      );
      expect(decl, `${panel} must declare genCode`).toBeTruthy();
      expect(decl![0], `${panel} genCode must render via codegen`).toContain(
        'generateLocatorCode({steps:[c.step]}',
      );
      expect(decl![0], `${panel} genCode must not build a CSS locator`).not.toContain(
        'toLocatorCode',
      );
    }
  });

  it('keeps page.locator() generation confined to the CSS/XPath helper', () => {
    // If toLocatorCode ever leaks into the getBy* path, a `+ Code` click on a
    // getByRole row could silently produce page.locator('#id') instead. It is
    // reachable only from CSSRow / XPathRow.
    const helper = read('utils/css-xpath.ts');
    expect(helper).toMatch(/export function toLocatorCode/);

    for (const panel of PANELS) {
      // The composed surface now contains the helper itself, so its own
      // declaration and its internal use are cut away: the question is where
      // CONSUMERS call it, which is the leak this guard exists to catch.
      const source = withoutFile(read(panel), 'utils/css-xpath.ts');
      const usages = [...source.matchAll(/toLocatorCode\(/g)];
      for (const m of usages) {
        const line = source.slice(0, m.index).split('\n').length;
        const context = source.split('\n')[line - 1]!;
        expect(
          /CSSRow|XPathRow|variant\.code|toXPathLocatorCode/.test(context),
          `${panel}:${line} calls toLocatorCode outside a CSS/XPath row: ${context.trim()}`,
        ).toBe(true);
      }
    }
  });
});

// ─── 3. One definition of strategy preference ───────────────────────────────

describe('strategy preference has a single source of truth', () => {
  it('is not re-declared as a literal array in the panels', () => {
    for (const panel of PANELS) {
      const source = read(panel);
      expect(
        source,
        `${panel} must not hand-write a strategy order — use PLAYWRIGHT_STRATEGY_ORDER`,
      ).not.toMatch(/\[\s*'role'\s*,\s*'label'\s*,\s*'placeholder'\s*,\s*'text'/);
    }
  });

  it('has no recording fallback left to sort', () => {
    // WS9 V1 raw-line migration (DL-82) — STRENGTHENED by deletion.
    //
    // WS5 moved the WS9 recording code generator into
    // `src/ui/recording/test-code.ts`, and this guard followed it there: the
    // fallback had to sort by PLAYWRIGHT_STRATEGY_ORDER rather than by a second
    // hand-written copy of the old, inverted order. DL-82 measured that
    // generator dead and deleted it, so there is no second sort to keep honest.
    // The surviving half of the claim — that the inverted order exists nowhere
    // in production — is asserted across EVERY production file instead of the
    // one file that used to hold the risk.
    expect(
      existsSync(join(EXT_ROOT, 'src/ui/recording/test-code.ts')),
      'the recording fallback generator is retired',
    ).toBe(false);

    for (const rel of PRODUCTION_SOURCES) {
      expect(read(rel), `${rel} must not hand-write the old inverted order`).not.toMatch(
        /\[\s*'role'\s*,\s*'label'\s*,\s*'placeholder'/,
      );
    }
  });
});
