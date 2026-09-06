/**
 * Playwright Guru — Locator expression parser (WS6.2).
 * ---------------------------------------------------------------------------
 * Parses a user-typed STRING — e.g. `getByRole('button', { name: 'Save' })`
 * or `page.getByText('Continue').nth(0)` — into the same `LocatorChain` AST
 * `types.ts` already defines and `resolver.ts` already knows how to resolve.
 * This file adds no new locator representation; it is purely the inverse of
 * what `@playwright-guru/codegen` renders.
 *
 * SCOPE — a Playwright SUBSET, not a JavaScript parser
 * ------------------------------------------------------
 * Supported: the seven `getBy*` factory methods (`RECOMMENDABLE_KINDS` in
 * `recommendation.ts` — role/text/label/placeholder/altText/title/testId),
 * chained left-to-right, each step's options object (name/exact/checked/
 * pressed/selected/expanded/disabled/level — mirrors `LocatorStepOptions`),
 * string and regex literal arguments, and a trailing `.nth(n)`.
 *
 * Deliberately NOT supported (matches MASTER-ROADMAP §WS6.2 "Out of scope:
 * CSS/XPath generation · recording · assertions · full Playwright grammar"):
 *   - `.locator(...)` (CSS/XPath) — a different, already-shipped Verify
 *     feature (`VERIFY_SELECTOR`) owns raw CSS/XPath strings; this parser's
 *     job is Playwright semantic locators, not a second selector engine.
 *   - `.filter(...)` and `page.frameLocator(...)` — both exist in the locked
 *     `LocatorChain`/`LocatorFilter` AST, but `resolver.ts`'s `resolveChain`
 *     does not implement filter or frame-scoped resolution (confirmed by
 *     reading its body: neither field is read). Parsing them into a chain
 *     the resolver would then silently ignore is exactly the "fabricated
 *     verification" this feature exists to prevent — see `verifier.ts`'s own
 *     doc comment. They are rejected here, at the syntax boundary, with an
 *     honest `UNSUPPORTED_METHOD` error, rather than accepted and only
 *     discovered to be unverifiable later.
 *   - `.first()` / `.last()` / `.and()` / `.or()` / arbitrary chaining —
 *     "full Playwright grammar" is explicitly out of scope.
 *
 * SECURITY
 * --------
 * The input string is never handed to any dynamic code-execution or dynamic-
 * import facility JavaScript exposes — this is a hand-rolled character
 * scanner (`tokenize`) plus a recursive-descent reader over the resulting
 * token list, deterministic and bounded by the input length (the only
 * recursion is the options-object reader, which cannot recurse itself). The
 * "security guard" describe block in `test/parser.test.ts` greps this file
 * for those forbidden forms as a standing check, not just a one-time review.
 */

import type {
  LocatorChain,
  LocatorKind,
  LocatorStateOptions,
  LocatorStep,
  LocatorStepOptions,
  MatcherValue,
} from './types';

// ─── Errors ─────────────────────────────────────────────────────────────────

/**
 * Every way a source string can fail to become a `LocatorChain`.
 *
 * Codes only — DOMAIN PROSE EXCLUSION (see `rationale.ts`'s doc comment)
 * applies here exactly as it does to `Rationale`: this module never returns a
 * human sentence. `ui/copy/verification.ts` owns the code→prose mapping.
 */
export type ParseErrorCode =
  | 'EMPTY_EXPRESSION'
  | 'UNEXPECTED_TOKEN'
  | 'UNTERMINATED_STRING'
  | 'UNTERMINATED_CALL'
  | 'MISSING_ARGUMENT'
  | 'INVALID_ARGUMENT'
  | 'UNSUPPORTED_METHOD'
  | 'UNKNOWN_OPTION';

export interface ParseError {
  code: ParseErrorCode;
  /** Character offset into the source string — the caret position (§WS6.2). */
  position: number;
  /** Machine-oriented detail (the offending token). Never UI copy. */
  detail?: string;
}

export type ParseResult = { ok: true; chain: LocatorChain } | { ok: false; error: ParseError };

function fail(code: ParseErrorCode, position: number, detail?: string): ParseResult {
  return {
    ok: false,
    error: detail === undefined ? { code, position } : { code, position, detail },
  };
}

// ─── Tokenizer ──────────────────────────────────────────────────────────────

type TokenType = 'ident' | 'string' | 'regex' | 'number' | 'boolean' | 'punct' | 'eof';

interface Token {
  type: TokenType;
  /** For string/regex tokens, the DECODED value (escapes already resolved). */
  value: string;
  /** For regex tokens only. */
  flags?: string;
  /** Start offset in the source — always what error positions point at. */
  pos: number;
}

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/**
 * A total scanner: every character is consumed by exactly one token (never
 * skipped, never looped on), so `tokenize` always terminates and every
 * position in the source is addressable by some token's `pos`. Characters
 * this grammar has no use for (`;`, `` ` ``, `[`, `=`, ...) still become a
 * one-character `punct` token — the PARSER decides they are illegal, with an
 * exact position, rather than the tokenizer guessing.
 */
function tokenize(source: string): { tokens: Token[] } | { error: ParseError } {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i]!;

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // ── String literal ──────────────────────────────────────────────────
    if (ch === "'" || ch === '"') {
      const start = i;
      const quote = ch;
      let value = '';
      i++;
      let closed = false;
      while (i < n) {
        const c = source[i]!;
        if (c === quote) {
          closed = true;
          i++;
          break;
        }
        if (c === '\\' && i + 1 < n) {
          const next = source[i + 1]!;
          const decoded: Record<string, string> = {
            "'": "'",
            '"': '"',
            '\\': '\\',
            n: '\n',
            t: '\t',
            r: '\r',
          };
          value += decoded[next] ?? next;
          i += 2;
          continue;
        }
        value += c;
        i++;
      }
      if (!closed) {
        return { error: { code: 'UNTERMINATED_STRING', position: start } };
      }
      tokens.push({ type: 'string', value, pos: start });
      continue;
    }

    // ── Regex literal — unambiguous here: this grammar has no division ───
    if (ch === '/') {
      const start = i;
      let value = '';
      i++;
      let closed = false;
      while (i < n) {
        const c = source[i]!;
        if (c === '/') {
          closed = true;
          i++;
          break;
        }
        if (c === '\\' && i + 1 < n) {
          value += c + source[i + 1]!;
          i += 2;
          continue;
        }
        if (c === '\n') break; // regex literals cannot span lines
        value += c;
        i++;
      }
      if (!closed) {
        return { error: { code: 'UNTERMINATED_STRING', position: start } };
      }
      let flags = '';
      while (i < n && /[a-z]/i.test(source[i]!)) {
        flags += source[i]!;
        i++;
      }
      tokens.push({ type: 'regex', value, flags, pos: start });
      continue;
    }

    // ── Number literal (bounded — non-negative integers only; this
    //    grammar's one numeric use, `.nth(n)`, never needs more) ─────────
    if (ch >= '0' && ch <= '9') {
      const start = i;
      let value = '';
      while (i < n && source[i]! >= '0' && source[i]! <= '9') {
        value += source[i]!;
        i++;
      }
      tokens.push({ type: 'number', value, pos: start });
      continue;
    }

    // ── Identifier / keyword ──────────────────────────────────────────────
    if (IDENT_START.test(ch)) {
      const start = i;
      let value = '';
      while (i < n && IDENT_PART.test(source[i]!)) {
        value += source[i]!;
        i++;
      }
      if (value === 'true' || value === 'false') {
        tokens.push({ type: 'boolean', value, pos: start });
      } else {
        tokens.push({ type: 'ident', value, pos: start });
      }
      continue;
    }

    // ── Punctuation this grammar uses (and everything else, as a single
    //    illegal-but-positioned token) ────────────────────────────────────
    tokens.push({ type: 'punct', value: ch, pos: i });
    i++;
  }

  tokens.push({ type: 'eof', value: '', pos: n });
  return { tokens };
}

// ─── Grammar ────────────────────────────────────────────────────────────────

/** The seven supported `getBy*` factory methods, mapped to `LocatorKind`. */
const METHOD_TO_KIND: Readonly<Record<string, LocatorKind>> = {
  getByRole: 'role',
  getByText: 'text',
  getByLabel: 'label',
  getByPlaceholder: 'placeholder',
  getByAltText: 'altText',
  getByTitle: 'title',
  getByTestId: 'testId',
};

const OPTION_KEYS = new Set([
  'name',
  'exact',
  'checked',
  'pressed',
  'selected',
  'expanded',
  'disabled',
  'level',
]);

class Reader {
  private idx = 0;
  constructor(private readonly tokens: Token[]) {}
  peek(): Token {
    return this.tokens[this.idx]!;
  }
  next(): Token {
    const t = this.tokens[this.idx]!;
    if (t.type !== 'eof') this.idx++;
    return t;
  }
  atEnd(): boolean {
    return this.peek().type === 'eof';
  }
}

function matcherFromToken(token: Token): MatcherValue | null {
  if (token.type === 'string') return { type: 'string', value: token.value };
  if (token.type === 'regex')
    return token.flags
      ? { type: 'regex', value: token.value, flags: token.flags }
      : { type: 'regex', value: token.value };
  return null;
}

/** Reads `{ key: value, ... }`. Returns `null` options when there is none. */
function readOptions(r: Reader): LocatorStepOptions | ParseError {
  const open = r.peek();
  if (!(open.type === 'punct' && open.value === '{')) {
    return {};
  }
  r.next(); // consume '{'
  const options: LocatorStepOptions & LocatorStateOptions = {};

  if (r.peek().type === 'punct' && r.peek().value === '}') {
    r.next();
    return options;
  }

  for (;;) {
    const keyTok = r.next();
    if (keyTok.type !== 'ident') {
      return {
        code: 'UNEXPECTED_TOKEN',
        position: keyTok.pos,
        detail: keyTok.value || keyTok.type,
      };
    }
    if (!OPTION_KEYS.has(keyTok.value)) {
      return { code: 'UNKNOWN_OPTION', position: keyTok.pos, detail: keyTok.value };
    }
    const colon = r.next();
    if (!(colon.type === 'punct' && colon.value === ':')) {
      return { code: 'UNEXPECTED_TOKEN', position: colon.pos, detail: colon.value || colon.type };
    }
    const valueTok = r.next();

    switch (keyTok.value) {
      case 'name': {
        const matcher = matcherFromToken(valueTok);
        if (!matcher) {
          return { code: 'INVALID_ARGUMENT', position: valueTok.pos };
        }
        options.name = matcher;
        break;
      }
      case 'level': {
        if (valueTok.type !== 'number') {
          return { code: 'INVALID_ARGUMENT', position: valueTok.pos };
        }
        options.level = Number(valueTok.value);
        break;
      }
      case 'exact':
      case 'checked':
      case 'pressed':
      case 'selected':
      case 'expanded':
      case 'disabled': {
        if (valueTok.type !== 'boolean') {
          return { code: 'INVALID_ARGUMENT', position: valueTok.pos };
        }
        (options as Record<string, boolean>)[keyTok.value] = valueTok.value === 'true';
        break;
      }
    }

    const after = r.next();
    if (after.type === 'punct' && after.value === ',') continue;
    if (after.type === 'punct' && after.value === '}') break;
    return { code: 'UNEXPECTED_TOKEN', position: after.pos, detail: after.value || after.type };
  }

  return options;
}

function isParseError<T>(v: T | ParseError): v is ParseError {
  const candidate = v as Partial<ParseError>;
  return typeof candidate.code === 'string' && typeof candidate.position === 'number';
}

/** Reads one `getByX(...)` call. `r` is positioned just past the method name. */
function readStep(
  r: Reader,
  kind: LocatorKind,
  methodName: string,
  methodPos: number,
): LocatorStep | ParseError {
  const open = r.next();
  if (!(open.type === 'punct' && open.value === '(')) {
    return { code: 'UNEXPECTED_TOKEN', position: open.pos, detail: open.value || open.type };
  }

  if (r.peek().type === 'eof') {
    return { code: 'UNTERMINATED_CALL', position: r.peek().pos, detail: methodName };
  }
  if (r.peek().type === 'punct' && r.peek().value === ')') {
    return { code: 'MISSING_ARGUMENT', position: r.peek().pos, detail: methodName };
  }

  const primaryTok = r.next();
  let selectorValue: MatcherValue;

  if (kind === 'role') {
    // Real Playwright: the role is always a plain string, never a regex.
    if (primaryTok.type !== 'string') {
      return { code: 'INVALID_ARGUMENT', position: primaryTok.pos };
    }
    selectorValue = { type: 'string', value: primaryTok.value };
  } else if (kind === 'testId') {
    const matcher = matcherFromToken(primaryTok);
    if (!matcher) {
      return { code: 'INVALID_ARGUMENT', position: primaryTok.pos };
    }
    selectorValue = matcher;
  } else {
    const matcher = matcherFromToken(primaryTok);
    if (!matcher) {
      return { code: 'INVALID_ARGUMENT', position: primaryTok.pos };
    }
    selectorValue = matcher;
  }

  let options: LocatorStepOptions | undefined;
  const afterPrimary = r.peek();
  if (afterPrimary.type === 'punct' && afterPrimary.value === ',') {
    r.next(); // consume ','
    if (kind === 'testId') {
      return { code: 'UNSUPPORTED_METHOD', position: afterPrimary.pos };
    }
    const parsedOptions = readOptions(r);
    if (isParseError(parsedOptions)) return parsedOptions;
    if (kind !== 'role') {
      // Non-role steps only ever accept `exact` in real Playwright; anything
      // else parsed above is silently out of place here.
      const keys = Object.keys(parsedOptions);
      const illegal = keys.find((k) => k !== 'exact');
      if (illegal) {
        return { code: 'UNKNOWN_OPTION', position: afterPrimary.pos, detail: illegal };
      }
    }
    options = Object.keys(parsedOptions).length > 0 ? parsedOptions : undefined;
  }

  const close = r.next();
  if (!(close.type === 'punct' && close.value === ')')) {
    return { code: 'UNTERMINATED_CALL', position: close.pos, detail: methodName };
  }

  return options ? { kind, selectorValue, options } : { kind, selectorValue };
}

/**
 * Parses a Playwright locator expression string into a `LocatorChain`.
 *
 * Never throws, never evaluates the input as code — every branch is either a
 * successful `LocatorChain` or a positioned `ParseError`.
 */
export function parseLocatorExpression(source: string): ParseResult {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return fail('EMPTY_EXPRESSION', 0);
  }

  const tokenized = tokenize(source);
  if ('error' in tokenized) return { ok: false, error: tokenized.error };
  const r = new Reader(tokenized.tokens);

  // Optional leading `page.` — consumed, contributes nothing to the chain.
  if (r.peek().type === 'ident' && r.peek().value === 'page') {
    const pageTok = r.next();
    const dot = r.next();
    if (!(dot.type === 'punct' && dot.value === '.')) {
      return fail('UNEXPECTED_TOKEN', dot.pos, dot.value || dot.type);
    }
    void pageTok;
  }

  const steps: LocatorStep[] = [];
  let nth: number | undefined;

  for (;;) {
    const methodTok = r.next();
    if (methodTok.type !== 'ident') {
      return fail('UNEXPECTED_TOKEN', methodTok.pos, methodTok.value || methodTok.type);
    }

    if (methodTok.value === 'nth') {
      const open = r.next();
      if (!(open.type === 'punct' && open.value === '(')) {
        return fail('UNEXPECTED_TOKEN', open.pos, open.value || open.type);
      }
      const arg = r.next();
      if (arg.type !== 'number') {
        return fail('INVALID_ARGUMENT', arg.pos);
      }
      const close = r.next();
      if (!(close.type === 'punct' && close.value === ')')) {
        return fail('UNTERMINATED_CALL', close.pos, 'nth');
      }
      nth = Number(arg.value);
      // `.nth()` is the terminal call in this grammar — nothing legally
      // follows it (Playwright itself returns a Locator, not a further
      // getBy* scope, from `.nth()`).
      if (!r.atEnd()) {
        const trailing = r.peek();
        return fail('UNEXPECTED_TOKEN', trailing.pos, trailing.value || trailing.type);
      }
      break;
    }

    const kind = METHOD_TO_KIND[methodTok.value];
    if (!kind) {
      // Same code whether the method is a KNOWN-but-out-of-scope Playwright
      // API (`.filter()`, `.locator()`, ...) or simply not a method this
      // grammar recognises at all — both are honestly "unsupported", not a
      // syntax error, so a user pasting real Playwright code is told what
      // actually happened rather than shown a generic parse failure.
      return fail('UNSUPPORTED_METHOD', methodTok.pos, methodTok.value);
    }

    const stepOrError = readStep(r, kind, methodTok.value, methodTok.pos);
    if (isParseError(stepOrError)) return { ok: false, error: stepOrError };
    steps.push(stepOrError);

    if (r.atEnd()) break;

    const dot = r.next();
    if (!(dot.type === 'punct' && dot.value === '.')) {
      return fail('UNEXPECTED_TOKEN', dot.pos, dot.value || dot.type);
    }
    // loop continues to read the next chained call (another getBy* or nth)
  }

  if (steps.length === 0) {
    return fail('EMPTY_EXPRESSION', 0);
  }

  const chain: LocatorChain = nth === undefined ? { steps } : { steps, nth };
  return { ok: true, chain };
}
