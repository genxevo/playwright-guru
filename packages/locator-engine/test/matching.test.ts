/**
 * Playwright's text-matching semantics (E2).
 *
 * Guru's live label counting used `===` on raw text. Playwright's default is a
 * case-insensitive SUBSTRING over whitespace-normalised text. The consequence
 * was not cosmetic: on a page with a label "Email Address", asking for "Email"
 * reported **zero** matches, so a perfectly good locator was displayed as
 * broken.
 *
 * The expectations below are not invented — each mirrors a row recorded from
 * real Playwright in `conformance/playwright-golden.json`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PLAYWRIGHT_TEXT_MATCH_JS,
  matchesPlaywrightText,
  normalizeMatchText,
} from '../src/matching';

const golden = JSON.parse(
  readFileSync(resolve(__dirname, 'conformance/playwright-golden.json'), 'utf8'),
) as {
  labels: Record<
    string,
    { label: string; query: string; matchesDefault: boolean; matchesExact: boolean }
  >;
};

describe('normalizeMatchText', () => {
  it('trims and collapses, matching how Playwright normalises before comparing', () => {
    expect(normalizeMatchText('  Email   Address  ')).toBe('Email Address');
    expect(normalizeMatchText('Email\n\tAddress')).toBe('Email Address');
    expect(normalizeMatchText('')).toBe('');
  });
});

describe('matchesPlaywrightText reproduces recorded Playwright behaviour', () => {
  for (const [name, record] of Object.entries(golden.labels)) {
    it(`${name} — default matching`, () => {
      expect(
        matchesPlaywrightText(record.label, record.query),
        `label ${JSON.stringify(record.label)} vs query ${JSON.stringify(record.query)}`,
      ).toBe(record.matchesDefault);
    });

    it(`${name} — exact matching`, () => {
      expect(matchesPlaywrightText(record.label, record.query, { exact: true })).toBe(
        record.matchesExact,
      );
    });
  }
});

describe('the specific defect', () => {
  it('E2 — a substring query finds the label; equality would not', () => {
    expect(matchesPlaywrightText('Email Address', 'Email')).toBe(true);
    expect('Email Address' === 'Email').toBe(false); // what the shipped code did
  });

  it('E2 — case is ignored by default and honoured under exact', () => {
    expect(matchesPlaywrightText('Email Address', 'email address')).toBe(true);
    expect(matchesPlaywrightText('Email Address', 'email address', { exact: true })).toBe(false);
  });

  it('handles absent text without throwing', () => {
    expect(matchesPlaywrightText(null, 'x')).toBe(false);
    expect(matchesPlaywrightText(undefined, 'x')).toBe(false);
  });
});

// ─── Substring matching has consequences, and they are Playwright's ─────────

describe('accessible-name substring matching — the traps it creates', () => {
  it('“Female” matches a query of “Male”, because it contains it', () => {
    // Found against a real gender radio group: getByRole('radio', { name: 'Male' })
    // resolves to TWO elements. This is not a Guru defect and must not be
    // "fixed" — it is Playwright's documented default, and a tool claiming
    // Playwright fidelity has to reproduce it.
    expect(matchesPlaywrightText('Female', 'Male')).toBe(true);
    expect(matchesPlaywrightText('Male', 'Male')).toBe(true);
  });

  it('exact: true separates them, which is the fix a user needs', () => {
    expect(matchesPlaywrightText('Female', 'Male', { exact: true })).toBe(false);
    expect(matchesPlaywrightText('Male', 'Male', { exact: true })).toBe(true);
  });

  it('“Passenger Name” matches “Name” by default but not exactly', () => {
    // The same trap on a text input: a second field named "Passenger Name"
    // makes getByRole('textbox', { name: 'Name' }) ambiguous the moment its
    // container becomes visible.
    expect(matchesPlaywrightText('Passenger Name', 'Name')).toBe(true);
    expect(matchesPlaywrightText('Passenger Name', 'Name', { exact: true })).toBe(false);
    expect(matchesPlaywrightText('Name', 'Name', { exact: true })).toBe(true);
  });

  it('“Practice Playground” matches “Practice” by default but not exactly', () => {
    expect(matchesPlaywrightText('Practice Playground', 'Practice')).toBe(true);
    expect(matchesPlaywrightText('Practice Playground', 'Practice', { exact: true })).toBe(false);
  });
});

// ─── One rule, two consumers ────────────────────────────────────────────────

describe('the DevTools eval payload is derived from the function, not copied', () => {
  it('emits the same rule, generated rather than rewritten', () => {
    // The panel evaluates a string inside the inspected page and cannot import.
    // The string is produced by serialising the one implementation, so the two
    // consumers cannot drift — which is the failure mode that produced E2 and
    // E4. No eval here: the guarantee is structural, so it needs no execution.
    expect(PLAYWRIGHT_TEXT_MATCH_JS).toContain('__pgMatchText');
    expect(PLAYWRIGHT_TEXT_MATCH_JS).toMatch(/toLowerCase\(\)/);
    expect(PLAYWRIGHT_TEXT_MATCH_JS).toMatch(/replace\(/);
    expect(PLAYWRIGHT_TEXT_MATCH_JS).toMatch(/exact\s*===\s*true/);
  });

  it('closes over nothing, so it runs standalone in the page', () => {
    // Anything captured from module scope would be undefined inside the eval.
    const body = PLAYWRIGHT_TEXT_MATCH_JS;
    expect(body).not.toContain('normalizeMatchText');
    expect(body).not.toContain('import');
    expect(body).not.toContain('require');
  });
});
