/**
 * Playwright Guru — Structured rationale and verdicts (WS0 contract).
 * ---------------------------------------------------------------------------
 * DOMAIN PROSE EXCLUSION
 *
 * Domain engines emit typed, machine-readable decisions: facts, locator
 * expressions, counts, verdicts, and rationale CODES with primitive parameters.
 * They do NOT emit user-facing explanatory prose. Human-readable rationale is
 * resolved by the presentation layer.
 *
 *   Domain:  { code: 'SCOPED_BY_ANCESTOR', tone: 'positive',
 *              params: { ancestorRole: 'row', ancestorName: 'Jane Doe' } }
 *
 *   UI:      "Scoped by a row ancestor."
 *
 * Note what this rule is NOT: it is not a length limit. Locator expressions,
 * XPath expressions and generated code are legitimate domain output and may be
 * any length. The constraint is about *kind*, not size — a sentence intended
 * for a human to read does not belong in an engine.
 *
 * FOUR ENFORCEMENT MECHANISMS
 *   E-1  `Rationale` is a closed shape with no free-text field. Prose has
 *        nowhere to live, and adding somewhere requires changing a shared type.
 *   E-2  The UI copy map is declared `satisfies Record<RationaleCode, ...>`, so
 *        a code with no copy is a COMPILE ERROR and copy exists in exactly one
 *        place.
 *   E-3  Lint (rule R4) forbids `packages/**` and `runtime/**` from importing
 *        `ui/copy/**`. The domain physically cannot reach the copy layer.
 *   E-4  `isRationale` rejects unknown keys and non-primitive params. A WS0 test
 *        applies it to engine output so a bypassed type is still caught.
 */

// ─── Codes ──────────────────────────────────────────────────────────────────

/**
 * Every reason the engine can give for a decision.
 *
 * Declared as a runtime tuple as well as a type so tests can iterate it and the
 * UI copy map can be proven exhaustive.
 */
export const RATIONALE_CODES = [
  // Positive — why this locator is trustworthy
  'ROLE_BASED',
  'ACCESSIBLE_NAME',
  'ASSOCIATED_LABEL',
  'TEST_ID',
  'UNIQUE_VISIBLE',
  'USER_FACING',
  'SEMANTIC_HTML',

  // Structural — what the engine had to do to make it unique
  'SCOPED_BY_ANCESTOR',
  'NTH_REQUIRED',
  'INSIDE_IFRAME',

  // Cautions — why this locator may not hold
  'AMBIGUOUS_MATCHES',
  'NO_MATCH',
  'TEXT_TRUNCATED',
  'DYNAMIC_ATTRIBUTE',
  'STYLING_CLASS',
  'POSITIONAL',
  'DEEP_STRUCTURE',
  'NOT_USER_FACING',
  'SHADOW_DOM_UNSUPPORTED',

  // Absence — drives the "strategy not available" teaching rows
  'NO_ROLE',
  'NO_LABEL',
  'NO_PLACEHOLDER',
  'NO_TEXT',
  'NO_ALT',
  'NO_TITLE',
  'NO_TEST_ID',
] as const;

export type RationaleCode = (typeof RATIONALE_CODES)[number];

export type RationaleTone = 'positive' | 'neutral' | 'caution' | 'negative';

/** Parameters are primitive tokens only — identifiers, role names, counts. */
export type RationaleParamValue = string | number | boolean;

/**
 * CLOSED SHAPE (mechanism E-1).
 *
 * There is deliberately no `message`, `text`, `description` or `explanation`
 * field. Adding one would require changing this type, which fails review.
 */
export interface Rationale {
  code: RationaleCode;
  tone: RationaleTone;
  params?: Readonly<Record<string, RationaleParamValue>>;
}

/** The only keys a Rationale may carry. Used by the structural guard. */
export const RATIONALE_KEYS = ['code', 'tone', 'params'] as const;

// ─── Verdicts ───────────────────────────────────────────────────────────────

/**
 * The user-facing quality judgement, derived from measured counts.
 *
 * Raw numeric scores stay internal. The UI shows language, not arithmetic —
 * a tester should not have to interpret a scoring function to know whether a
 * locator is safe to paste into a test.
 */
export type LocatorVerdict = 'excellent' | 'good' | 'ambiguous' | 'no-match' | 'unknown';

/** Strategies that earn `excellent` when unique: stable, user-facing contracts. */
const PREMIUM_KINDS = new Set(['role', 'label', 'testId']);

/**
 * Maps a measured visible-match count to a verdict.
 *
 * `kind` is optional: when the caller knows which locator strategy produced the
 * count, a unique match on a premium strategy is `excellent` rather than merely
 * `good`.
 */
export function verdictFor(visibleMatchCount: number, kind?: string): LocatorVerdict {
  if (visibleMatchCount < 0) return 'unknown';
  if (visibleMatchCount === 0) return 'no-match';
  if (visibleMatchCount > 1) return 'ambiguous';
  return kind !== undefined && PREMIUM_KINDS.has(kind) ? 'excellent' : 'good';
}

// ─── Construction + structural guard ────────────────────────────────────────

/** Builds a Rationale. Exists so call sites cannot invent extra fields. */
export function rationale(
  code: RationaleCode,
  tone: RationaleTone,
  params?: Readonly<Record<string, RationaleParamValue>>,
): Rationale {
  return params === undefined ? { code, tone } : { code, tone, params };
}

const CODE_SET: ReadonlySet<string> = new Set<string>(RATIONALE_CODES);

/**
 * Mechanism E-4 — a structural guard, not a length check.
 *
 * Accepts only: exactly the allowed keys, a known code, a known tone, and
 * params whose values are primitives. Anything sentence-shaped would have to
 * arrive in a field that does not exist, so it fails here.
 */
export function isRationale(value: unknown): value is Rationale {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(RATIONALE_KEYS as readonly string[]).includes(key)) return false;
  }

  if (typeof record['code'] !== 'string' || !CODE_SET.has(record['code'])) return false;

  const tone = record['tone'];
  if (tone !== 'positive' && tone !== 'neutral' && tone !== 'caution' && tone !== 'negative') {
    return false;
  }

  if (record['params'] !== undefined) {
    const params = record['params'];
    if (typeof params !== 'object' || params === null || Array.isArray(params)) return false;
    for (const paramValue of Object.values(params as Record<string, unknown>)) {
      const t = typeof paramValue;
      if (t !== 'string' && t !== 'number' && t !== 'boolean') return false;
    }
  }

  return true;
}

/** Convenience for validating a collection produced by an engine. */
export function areRationales(values: readonly unknown[]): values is Rationale[] {
  return values.every(isRationale);
}
