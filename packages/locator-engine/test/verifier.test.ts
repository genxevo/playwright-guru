/**
 * WS6.2 — verifyLocatorExpression / classifyVerification.
 * ================================================================
 * Runs the parser + `resolveChain` + `FixtureDomProbe` end to end, proving
 * the six verification states are reachable and never conflated — 0 matches
 * is not "verified", an unmeasured probe error is not "not found", and an
 * ambiguous winner is never silently narrowed to one.
 */
import { describe, expect, it } from 'vitest';
import { classifyVerification, verifyLocatorExpression } from '../src/verifier';
import { FixtureDomProbe } from './fakes/FixtureDomProbe';
import { createFixture } from './fixtures/dom';

const FIXTURE = `
  <button id="save" data-testid="save-btn">Save</button>
  <button id="save2">Save</button>
  <label for="name">Name</label>
  <input id="name" placeholder="Full name" />
  <img id="logo" src="l.png" alt="Company logo" />
`;

const probeFor = (html: string) => new FixtureDomProbe(createFixture(html).document);

describe('verifyLocatorExpression — status classification', () => {
  it('verified — exactly one visible match', () => {
    const result = verifyLocatorExpression(`getByTestId('save-btn')`, probeFor(FIXTURE));
    expect(result.status).toBe('verified');
    expect(result.visibleMatchCount).toBe(1);
    expect(result.chain).toBeDefined();
  });

  it('not-found — zero matches, never confused with unverifiable', () => {
    const result = verifyLocatorExpression(`getByTestId('does-not-exist')`, probeFor(FIXTURE));
    expect(result.status).toBe('not-found');
    expect(result.visibleMatchCount).toBe(0);
  });

  it('ambiguous — multiple matches are reported, never narrowed to one', () => {
    const result = verifyLocatorExpression(`getByText('Save')`, probeFor(FIXTURE));
    expect(result.status).toBe('ambiguous');
    expect(result.visibleMatchCount).toBeGreaterThan(1);
  });

  it('invalid — a syntax error surfaces the parser error, not a resolve attempt', () => {
    const result = verifyLocatorExpression(`getByRole(`, probeFor(FIXTURE));
    expect(result.status).toBe('invalid');
    expect(result.parseError?.code).toBe('UNTERMINATED_CALL');
    expect(result.parseError?.position).toBeGreaterThanOrEqual(0);
    expect(result.chain).toBeUndefined();
  });

  it('unsupported — a resolver refusal is never reported as not-found', () => {
    // The resolver itself refuses a regex matcher on a non-role kind
    // (`resolveStep`'s own guard) — this must surface as an honest
    // 'unsupported', never silently read as "zero matches".
    const result = verifyLocatorExpression(`getByText(/Save/)`, probeFor(FIXTURE));
    expect(result.status).toBe('unsupported');
    expect(result.resolveError?.code).toBe('UNSUPPORTED_STEP');
  });

  it('a resolvable getByLabel resolves through the label→control relationship', () => {
    const result = verifyLocatorExpression(`getByLabel('Name')`, probeFor(FIXTURE));
    expect(result.status).toBe('verified');
  });

  it('nth() narrows honestly, using the resolver’s own nth semantics', () => {
    const result = verifyLocatorExpression(`getByText('Save').nth(0)`, probeFor(FIXTURE));
    expect(result.status).toBe('verified');
    expect(result.visibleMatchCount).toBe(1);
  });

  it('echoes the original expression unmodified', () => {
    const expr = `  getByTestId('save-btn')  `;
    expect(verifyLocatorExpression(expr, probeFor(FIXTURE)).expression).toBe(expr);
  });
});

describe('classifyVerification — the single classification rule', () => {
  it('negative visibleMatchCount is always unverifiable, regardless of matchCount', () => {
    expect(classifyVerification({ matchCount: 5, visibleMatchCount: -1 })).toBe('unverifiable');
  });

  it('zero is not-found', () => {
    expect(classifyVerification({ matchCount: 0, visibleMatchCount: 0 })).toBe('not-found');
  });

  it('exactly one is verified', () => {
    expect(classifyVerification({ matchCount: 1, visibleMatchCount: 1 })).toBe('verified');
  });

  it('more than one is ambiguous, never collapsed to verified', () => {
    expect(classifyVerification({ matchCount: 4, visibleMatchCount: 4 })).toBe('ambiguous');
    expect(classifyVerification({ matchCount: 100, visibleMatchCount: 2 })).toBe('ambiguous');
  });
});
