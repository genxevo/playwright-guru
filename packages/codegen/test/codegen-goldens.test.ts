/**
 * WS1 — codegen golden runner (item 3).
 *
 * Expands the golden table (`fixtures/locator-goldens.ts`) — 14 scenarios × the
 * 7 `TargetLanguage` targets = **98 goldens** — and asserts each renders exactly.
 * Failures are diagnostic: each case is named `<scenario> → <language>`.
 *
 * Supplementary characterisation follows the 98 goldens: the language-equivalence
 * contract (js≡ts, python_sync≡python_async, csharp_sync≡csharp_async), string
 * escaping, regex forward-slash escaping, kind exhaustiveness, and the
 * unsupported-language guard.
 *
 * These are CODEGEN-behaviour tests (AST → source). No locator is resolved
 * against a DOM; this is not browser evidence.
 */

import { describe, expect, it } from 'vitest';

import { generateLocatorCode, type LocatorChain, type TargetLanguage } from '../src/index';
import { GOLDENS, type GoldenExpected } from './fixtures/locator-goldens';

const str = (value: string) => ({ type: 'string' as const, value });

// Which authored output each of the 7 targets must equal.
const TARGETS: readonly [TargetLanguage, keyof GoldenExpected][] = [
  ['typescript', 'ts'],
  ['javascript', 'ts'],
  ['python_sync', 'python'],
  ['python_async', 'python'],
  ['java', 'java'],
  ['csharp_sync', 'csharp'],
  ['csharp_async', 'csharp'],
];

const ALL_LANGS = TARGETS.map(([lang]) => lang);

// ─── The 98 goldens ─────────────────────────────────────────────────────────

const cases = GOLDENS.flatMap((scenario) =>
  TARGETS.map(([lang, key]) => ({
    title: `${scenario.name} → ${lang}`,
    chain: scenario.chain,
    lang,
    expected: scenario.expected[key],
  })),
);

describe('codegen goldens (generateLocatorCode)', () => {
  it('has exactly 98 goldens (14 scenarios × 7 targets)', () => {
    expect(cases).toHaveLength(98);
  });

  it.each(cases)('$title', ({ chain, lang, expected }) => {
    expect(generateLocatorCode(chain, lang)).toBe(expected);
  });
});

// ─── Language-equivalence contract ──────────────────────────────────────────

describe('language aliases render identically', () => {
  it.each(GOLDENS)(
    '$name — js ≡ ts, python_sync ≡ python_async, csharp_sync ≡ csharp_async',
    ({ chain }) => {
      expect(generateLocatorCode(chain, 'javascript')).toBe(
        generateLocatorCode(chain, 'typescript'),
      );
      expect(generateLocatorCode(chain, 'python_async')).toBe(
        generateLocatorCode(chain, 'python_sync'),
      );
      expect(generateLocatorCode(chain, 'csharp_async')).toBe(
        generateLocatorCode(chain, 'csharp_sync'),
      );
    },
  );
});

// ─── String escaping (asserted by property, not by fragile reconstruction) ───

describe('string escaping', () => {
  // value contains: a backslash, a double-quote, a single-quote, and a newline.
  const raw = 'a\\b"c\'d\ne';
  const chain: LocatorChain = { steps: [{ kind: 'text', selectorValue: str(raw) }] };

  it('never emits a real newline — it becomes the two-char escape \\n', () => {
    for (const lang of ALL_LANGS) {
      const code = generateLocatorCode(chain, lang);
      expect(code).not.toContain('\n');
      expect(code).toContain('\\n');
    }
  });

  it('doubles a backslash in every language', () => {
    for (const lang of ALL_LANGS) {
      expect(generateLocatorCode(chain, lang)).toContain('\\\\');
    }
  });

  it('escapes the single-quote in the single-quoted (TS/JS) output only', () => {
    expect(generateLocatorCode(chain, 'typescript')).toContain("\\'");
    // double-quoted languages leave the apostrophe bare
    expect(generateLocatorCode(chain, 'python_sync')).toContain("'d");
    expect(generateLocatorCode(chain, 'python_sync')).not.toContain("\\'");
  });

  it('escapes the double-quote in the double-quoted (Python/Java/C#) output', () => {
    for (const lang of ['python_sync', 'java', 'csharp_sync'] as const) {
      expect(generateLocatorCode(chain, lang)).toContain('\\"');
    }
    // TS single-quoted leaves the double-quote bare
    expect(generateLocatorCode(chain, 'typescript')).toContain('"c');
  });
});

// ─── Regex forward-slash escaping (TS literal) ──────────────────────────────

describe('regex matcher rendering', () => {
  const chain: LocatorChain = {
    steps: [{ kind: 'text', selectorValue: { type: 'regex', value: 'a/b', flags: '' } }],
  };

  it('escapes / inside a TS regex literal so it does not terminate early', () => {
    expect(generateLocatorCode(chain, 'typescript')).toBe(`page.getByText(/a\\/b/)`);
  });

  it('does not need slash escaping in Python re.compile', () => {
    expect(generateLocatorCode(chain, 'python_sync')).toBe(`page.get_by_text(re.compile(r"a/b"))`);
  });
});

// ─── Kind exhaustiveness ────────────────────────────────────────────────────

describe('every LocatorKind renders in every language', () => {
  const KINDS = ['role', 'text', 'label', 'placeholder', 'altText', 'title', 'testId'] as const;

  it.each(KINDS)('kind %s produces a rooted expression in all 7 languages', (kind) => {
    const chain: LocatorChain = { steps: [{ kind, selectorValue: str('x') }] };
    for (const lang of ALL_LANGS) {
      const code = generateLocatorCode(chain, lang);
      const root = lang.startsWith('csharp') ? 'Page.' : 'page.';
      expect(code.startsWith(root)).toBe(true);
      expect(code.length).toBeGreaterThan(root.length);
    }
  });
});

// ─── Unsupported-language guard ─────────────────────────────────────────────

describe('unsupported language', () => {
  it('throws rather than silently producing wrong code', () => {
    const chain: LocatorChain = { steps: [{ kind: 'role', selectorValue: str('button') }] };
    expect(() => generateLocatorCode(chain, 'cobol' as TargetLanguage)).toThrow();
  });
});
