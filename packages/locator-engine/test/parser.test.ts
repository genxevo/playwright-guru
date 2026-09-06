/**
 * WS6.2 — locator expression parser.
 * ================================================================
 * Failure-first coverage for `parser.ts`: every supported form, every
 * deliberately-out-of-scope form, every malformed-syntax case, and a
 * standing security guard (no `eval`/`new Function` anywhere in the module).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLocatorExpression } from '../src/parser';
import type { LocatorChain } from '../src/types';

function chainOf(source: string): LocatorChain {
  const r = parseLocatorExpression(source);
  if (!r.ok) throw new Error(`expected ok, got error ${r.error.code} @ ${r.error.position}`);
  return r.chain;
}

function errorOf(source: string) {
  const r = parseLocatorExpression(source);
  if (r.ok) throw new Error(`expected a parse error, got a chain: ${JSON.stringify(r.chain)}`);
  return r.error;
}

// ─── Positive cases — every supported getBy* form ──────────────────────────

describe('parseLocatorExpression — supported forms', () => {
  it('getByRole with a name option', () => {
    const chain = chainOf(`getByRole('button', { name: 'Save' })`);
    expect(chain.steps).toEqual([
      {
        kind: 'role',
        selectorValue: { type: 'string', value: 'button' },
        options: { name: { type: 'string', value: 'Save' } },
      },
    ]);
  });

  it('getByRole with no options', () => {
    const chain = chainOf(`getByRole('heading')`);
    expect(chain.steps).toEqual([
      { kind: 'role', selectorValue: { type: 'string', value: 'heading' } },
    ]);
  });

  it('getByText', () => {
    expect(chainOf(`getByText('Continue')`).steps[0]).toEqual({
      kind: 'text',
      selectorValue: { type: 'string', value: 'Continue' },
    });
  });

  it('getByLabel', () => {
    expect(chainOf(`getByLabel('Email Address')`).steps[0]?.kind).toBe('label');
  });

  it('getByPlaceholder', () => {
    expect(chainOf(`getByPlaceholder('mm/dd/yyyy')`).steps[0]?.kind).toBe('placeholder');
  });

  it('getByAltText', () => {
    expect(chainOf(`getByAltText('Company logo')`).steps[0]?.kind).toBe('altText');
  });

  it('getByTitle', () => {
    expect(chainOf(`getByTitle('Close')`).steps[0]?.kind).toBe('title');
  });

  it('getByTestId', () => {
    expect(chainOf(`getByTestId('cart-icon')`).steps[0]).toEqual({
      kind: 'testId',
      selectorValue: { type: 'string', value: 'cart-icon' },
    });
  });

  it('optional leading page.', () => {
    expect(chainOf(`page.getByRole('button')`)).toEqual(chainOf(`getByRole('button')`));
  });

  it('chained locator — ancestor-scoped', () => {
    const chain = chainOf(
      `getByRole('row', { name: 'Jane Doe' }).getByRole('button', { name: 'Edit' })`,
    );
    expect(chain.steps).toHaveLength(2);
    expect(chain.steps[0]?.selectorValue).toEqual({ type: 'string', value: 'row' });
    expect(chain.steps[1]?.selectorValue).toEqual({ type: 'string', value: 'button' });
  });

  it('trailing .nth(n)', () => {
    const chain = chainOf(`getByText('Item').nth(2)`);
    expect(chain.nth).toBe(2);
    expect(chain.steps).toHaveLength(1);
  });

  it('nth(0) is honoured exactly as typed — never fabricated, only echoed', () => {
    expect(chainOf(`getByRole('option').nth(0)`).nth).toBe(0);
  });

  it('regex text matcher', () => {
    const chain = chainOf(`getByText(/^Save/i)`);
    expect(chain.steps[0]?.selectorValue).toEqual({ type: 'regex', value: '^Save', flags: 'i' });
  });

  it('regex without flags', () => {
    const chain = chainOf(`getByLabel(/Email/)`);
    expect(chain.steps[0]?.selectorValue).toEqual({ type: 'regex', value: 'Email' });
  });

  it('exact option on a non-role step', () => {
    const chain = chainOf(`getByText('Save', { exact: true })`);
    expect(chain.steps[0]?.options).toEqual({ exact: true });
  });

  it('full role option set', () => {
    const chain = chainOf(
      `getByRole('heading', { name: 'Title', exact: true, level: 2, checked: false, pressed: true, selected: false, expanded: true, disabled: false })`,
    );
    expect(chain.steps[0]?.options).toEqual({
      name: { type: 'string', value: 'Title' },
      exact: true,
      level: 2,
      checked: false,
      pressed: true,
      selected: false,
      expanded: true,
      disabled: false,
    });
  });

  it('double-quoted strings', () => {
    expect(chainOf(`getByRole("button", { name: "Save" })`).steps[0]?.selectorValue).toEqual({
      type: 'string',
      value: 'button',
    });
  });

  it('escaped quotes inside a string do not terminate it early', () => {
    const chain = chainOf(`getByText('It\\'s here')`);
    expect(chain.steps[0]?.selectorValue).toEqual({ type: 'string', value: "It's here" });
  });

  it('a comma inside a quoted name does not split the argument list', () => {
    const chain = chainOf(`getByRole('button', { name: 'Save, Continue' })`);
    expect(chain.steps[0]?.options?.name).toEqual({ type: 'string', value: 'Save, Continue' });
  });

  it('a comma inside a quoted attribute-like string does not split the argument list', () => {
    // Not a CSS call (out of scope) — but the same quoting hazard applies to
    // any string argument, so it is exercised directly here.
    const chain = chainOf(`getByText('button[data-test="a,b"]')`);
    expect(chain.steps[0]?.selectorValue).toEqual({
      type: 'string',
      value: 'button[data-test="a,b"]',
    });
  });

  it('whitespace around tokens is insignificant', () => {
    expect(chainOf(`  getByRole( 'button' , { name : 'Save' } )  `)).toEqual(
      chainOf(`getByRole('button',{name:'Save'})`),
    );
  });
});

// ─── Negative cases — malformed syntax ─────────────────────────────────────

describe('parseLocatorExpression — malformed syntax', () => {
  it('empty expression', () => {
    expect(errorOf('').code).toBe('EMPTY_EXPRESSION');
    expect(errorOf('   ').code).toBe('EMPTY_EXPRESSION');
  });

  it('missing closing parenthesis', () => {
    expect(errorOf(`getByRole('button'`).code).toBe('UNTERMINATED_CALL');
  });

  it('unbalanced quotes', () => {
    const err = errorOf(`getByRole('button)`);
    expect(err.code).toBe('UNTERMINATED_STRING');
    expect(err.position).toBe(10); // points at the opening quote
  });

  it('invalid method syntax — no parens at all', () => {
    expect(errorOf(`getByRole`).code).toBe('UNEXPECTED_TOKEN');
  });

  it('call opened but never closed, with no argument at all', () => {
    expect(errorOf(`getByRole(`).code).toBe('UNTERMINATED_CALL');
  });

  it('invalid method syntax — bracket instead of call', () => {
    expect(errorOf(`getByRole['button']`).code).toBe('UNEXPECTED_TOKEN');
  });

  it('empty locator argument', () => {
    expect(errorOf(`getByRole()`).code).toBe('MISSING_ARGUMENT');
  });

  it('malformed chained call — trailing dot with nothing after', () => {
    expect(errorOf(`getByRole('button').`).code).toBe('UNEXPECTED_TOKEN');
  });

  it('unsupported method — CSS/XPath locator()', () => {
    expect(errorOf(`locator('button')`).code).toBe('UNSUPPORTED_METHOD');
  });

  it('unsupported method — filter()', () => {
    expect(errorOf(`getByRole('row').filter({ hasText: 'Jane' })`).code).toBe('UNSUPPORTED_METHOD');
  });

  it('malformed frame expression — frameLocator is unsupported regardless of well-formedness', () => {
    expect(errorOf(`page.frameLocator('#f').getByRole('button')`).code).toBe('UNSUPPORTED_METHOD');
    expect(errorOf(`page.frameLocator(`).code).toBe('UNSUPPORTED_METHOD');
  });

  it('malformed nth expression — missing argument', () => {
    expect(errorOf(`getByRole('button').nth()`).code).toBe('INVALID_ARGUMENT');
  });

  it('malformed nth expression — non-numeric argument', () => {
    expect(errorOf(`getByRole('button').nth('a')`).code).toBe('INVALID_ARGUMENT');
  });

  it('unknown option key', () => {
    expect(errorOf(`getByRole('button', { color: 'red' })`).code).toBe('UNKNOWN_OPTION');
  });

  it('malformed chained call — dot then an unsupported method', () => {
    expect(errorOf(`getByRole('row').first()`).code).toBe('UNSUPPORTED_METHOD');
  });

  it('getByTestId rejects an options object', () => {
    expect(errorOf(`getByTestId('x', { exact: true })`).code).toBe('UNSUPPORTED_METHOD');
  });

  it('getByRole rejects a regex role', () => {
    expect(errorOf(`getByRole(/button/)`).code).toBe('INVALID_ARGUMENT');
  });

  it('unsafe expression forms are simply not valid tokens — never executed', () => {
    // None of these forms are ever evaluated as code (parser.ts contains no
    // eval/new Function — see the security guard test below); each is
    // rejected as a ParseError with SOME code, never accepted as a chain.
    expect(errorOf(`eval('getByRole')`).code).toBe('UNSUPPORTED_METHOD');
    expect(errorOf('`getByRole(`button`)`').code).toBe('UNEXPECTED_TOKEN');
    expect(errorOf(`getByRole('button'); alert(1)`).code).toBe('UNEXPECTED_TOKEN');
    // `${1+1}` — a template-literal interpolation pasted as a bare argument.
    // Rejected as an invalid getByRole argument (not a string literal),
    // never interpolated or executed.
    expect(parseLocatorExpression(`getByRole(\${1+1})`).ok).toBe(false);
  });
});

// ─── Security guard — standing, not a one-time review ──────────────────────

describe('parser.ts — security guard', () => {
  const SOURCE = readFileSync(resolve(__dirname, '../src/parser.ts'), 'utf8');

  it('never calls eval', () => {
    expect(SOURCE).not.toMatch(/\beval\s*\(/);
  });

  it('never constructs a Function', () => {
    expect(SOURCE).not.toMatch(/\bnew\s+Function\b/);
    expect(SOURCE).not.toMatch(/\bFunction\s*\(/);
  });

  it('never dynamically imports based on input', () => {
    expect(SOURCE).not.toMatch(/\bimport\s*\(/);
  });
});
