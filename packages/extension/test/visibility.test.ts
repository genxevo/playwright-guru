/**
 * Visibility conformance.
 *
 * Guru reports match counts as "N visible". That verdict is only meaningful if
 * "visible" means what it means to Playwright — and it did not. The shipped
 * predicate was wrong in both directions at once:
 *
 *   over-counting  a child of a display:none container passed, because
 *                  `display` is not inherited. A unique locator was reported
 *                  as matching 2 elements and flagged ambiguous.
 *   under-counting  opacity:0 was treated as hidden, which Playwright never
 *                  does, discarding real matches.
 *
 * The expectations here are not written by hand. `conformance/refresh-visibility-golden.mjs`
 * drives a real Playwright against a real Chromium, asks it about each fixture,
 * and records the answers. This suite reads only that file, so it needs no
 * browser and stays fast — while the evidence behind it is Playwright's own
 * behaviour.
 *
 * The golden also records the predicate source it was verified against. If the
 * rule is edited without regenerating, the last test in this file fails, so the
 * evidence can never quietly go stale.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(HERE, rel), 'utf8');

interface Row {
  html: string;
  why: string;
  playwrightVisible: boolean;
  guruVisible: boolean;
  playwrightRoleMatches: boolean;
  guruRoleEligible: boolean;
}

const golden = JSON.parse(read('conformance/visibility-golden.json')) as {
  playwrightVersion: string;
  predicateSource: string;
  visibility: Record<string, Row>;
};

const rows = Object.entries(golden.visibility);

describe('the golden is real recorded evidence', () => {
  it('came from a real Playwright release', () => {
    expect(golden.playwrightVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('covers every branch of the rule', () => {
    expect(rows.length).toBeGreaterThanOrEqual(12);
  });
});

// ─── Guru must agree with Playwright, fixture by fixture ────────────────────

describe('Guru’s visibility predicate matches Playwright’s isVisible()', () => {
  for (const [name, row] of rows) {
    it(`${name} — ${row.playwrightVisible ? 'visible' : 'hidden'}`, () => {
      expect(row.guruVisible, row.why).toBe(row.playwrightVisible);
    });
  }
});

describe('Guru’s role eligibility matches what getByRole actually finds', () => {
  for (const [name, row] of rows) {
    it(`${name} — ${row.playwrightRoleMatches ? 'matched' : 'not matched'}`, () => {
      expect(row.guruRoleEligible, row.why).toBe(row.playwrightRoleMatches);
    });
  }
});

// ─── The two defects, pinned individually ───────────────────────────────────

describe('regression — the shipped defects', () => {
  it('A: an element inside a display:none ancestor is NOT visible', () => {
    // The bug that made getByRole('textbox', { name: 'Name' }) report 2
    // matches where Playwright resolves 1, flagging a good locator ambiguous.
    for (const key of ['display-none-ancestor', 'display-none-grandancestor']) {
      const row = golden.visibility[key]!;
      expect(row.playwrightVisible, `${key} — Playwright must call this hidden`).toBe(false);
      expect(row.guruVisible, `${key} — Guru must agree`).toBe(false);
    }
  });

  it('B: an opacity:0 element with a box IS still eligible', () => {
    // The transparent <input type="checkbox"> behind a CSS toggle switch.
    // Playwright locates it; Guru used to discard it.
    const row = golden.visibility['opacity-zero-with-box']!;
    expect(row.playwrightVisible).toBe(true);
    expect(row.guruVisible, 'opacity is not a Playwright visibility criterion').toBe(true);
    expect(row.guruRoleEligible).toBe(true);
  });

  it('C: an off-screen transformed element stays visible', () => {
    // The closed off-canvas mobile drawer. Treating transforms as hidden would
    // suppress a REAL strict-mode violation rather than report it.
    for (const key of ['offscreen-transform', 'offscreen-absolute', 'scrolled-out-of-viewport']) {
      const row = golden.visibility[key]!;
      expect(row.playwrightVisible, key).toBe(true);
      expect(row.guruVisible, `${key} — position must never be a visibility test`).toBe(true);
    }
  });

  it('D: the two rules genuinely differ, so one predicate cannot serve both', () => {
    // aria-hidden: rendered, but out of the accessibility tree.
    const ariaHidden = golden.visibility['aria-hidden-target']!;
    expect(ariaHidden.playwrightVisible).toBe(true);
    expect(ariaHidden.playwrightRoleMatches).toBe(false);

    // zero-size: not rendered, but still in the accessibility tree.
    const zeroSize = golden.visibility['zero-size']!;
    expect(zeroSize.playwrightVisible).toBe(false);
    expect(zeroSize.playwrightRoleMatches).toBe(true);
  });
});

// ─── The evidence cannot go stale ───────────────────────────────────────────

describe('the recorded evidence stays tied to the shipped rule', () => {
  const normalise = (s: string): string => s.replace(/\s+/g, ' ').trim();

  it('was recorded against the predicate that is in the source today', () => {
    // Editing the rule without regenerating would leave this suite asserting
    // the behaviour of code that no longer exists. Rather than let that pass
    // silently, fail and say what to run.
    const ts = read('../utils/visibility.ts');
    const extract = (name: string): string => {
      const m = ts.match(
        new RegExp(`function ${name}\\(el: Element\\): boolean \\{[\\s\\S]*?\\n\\}`),
      );
      expect(m, `${name}() must exist in utils/visibility.ts`).toBeTruthy();
      return m![0]
        .replace(/\(el: Element\): boolean/, '(el)')
        .replace(/let node: Element \| null = el;/, 'let node = el;')
        .replace(/ as HTMLElement/g, '');
    };
    const current =
      `var __pgVisible = ${extract('playwrightVisible')};\n` +
      `var __pgRoleEligible = ${extract('playwrightRoleEligible')};`;

    expect(
      normalise(golden.predicateSource),
      'utils/visibility.ts changed since the golden was recorded. Re-verify against ' +
        'Playwright:  cd packages/extension/test/conformance && node refresh-visibility-golden.mjs',
    ).toBe(normalise(current));
  });

  it('is derived from the one definition, never written out twice', () => {
    const source = read('../utils/visibility.ts');
    expect(source).toContain('${playwrightVisible.toString()}');
    expect(source).toContain('${playwrightRoleEligible.toString()}');
  });
});

// ─── The content script must use it ─────────────────────────────────────────

describe('the live probe consumes the shared rule (WS3: moved from content.ts into src/runtime/probe.ts)', () => {
  // WS3 made content.ts a thin entrypoint with no visibility logic of its own;
  // measuring now happens in LiveDomProbe, so that is where these guarantees
  // are pinned. content.ts itself is checked below to confirm it defines none
  // of this itself either.
  const probe = read('../src/runtime/probe.ts');
  const content = read('../entrypoints/content.ts');

  it('imports the predicates rather than defining its own', () => {
    expect(probe).toMatch(
      /import \{[^}]*isElementVisible[^}]*isRoleEligible[^}]*\} from '\.\.\/\.\.\/utils\/visibility'/,
    );
    expect(probe).not.toMatch(/function isVisible\(el: Element\): boolean \{/);
    expect(content).not.toMatch(/function isVisible\(el: Element\): boolean \{/);
  });

  it('no longer rejects elements for being transparent', () => {
    expect(probe).not.toMatch(/parseFloat\(\s*s\.opacity\s*\)\s*===\s*0/);
    expect(content).not.toMatch(/parseFloat\(\s*s\.opacity\s*\)\s*===\s*0/);
  });

  it('counts role matches with the accessibility-tree rule, not plain visibility', () => {
    expect(probe).toMatch(/candidates\s*\.filter\(isRoleEligible\)/);
  });
});
