/**
 * Playwright Guru — recording redaction (WS9).
 * ---------------------------------------------------------------------------
 * DECIDES WHETHER A FIELD'S VALUE MAY BE READ AT ALL.
 *
 * This module is deliberately pure and value-blind: it is handed the field's
 * DESCRIPTIVE facts — type, autocomplete, name, id, placeholder, label — and
 * never the value itself. That is the whole point. The runtime calls it BEFORE
 * touching `.value`, so a secret is never read rather than read-then-scrubbed;
 * a value that was never read cannot be logged, coalesced, serialised or
 * leaked by some later change that forgets why it mattered.
 *
 * The legacy recorder in `entrypoints/content.ts` shows the failure this
 * prevents: its input filter excludes `checkbox,radio,file,button,submit,reset`
 * and does NOT exclude `password`, and it then reads `el.value` unconditionally.
 *
 * WHAT IT CLASSIFIES, AND ON WHAT EVIDENCE
 *   password  `type="password"`, or the platform's own `autocomplete` contract
 *             (`current-password` / `new-password`) on any input type.
 *   file      `type="file"` — the value is a local path: personal, and not
 *             something Playwright's `fill` can replay anyway.
 *   payment   the `autocomplete` `cc-*` family, or conventional card field
 *             naming when a site declares no autocomplete.
 *
 * WHY NAME MATCHING IS TOKENISED, NOT `includes()`
 * `"discardReason".includes("card")` is true. A substring test would redact an
 * ordinary field and quietly make recording useless, so names are split on
 * camelCase and separators and matched as whole tokens. Precision matters in
 * both directions: over-redaction breaks the product, under-redaction leaks.
 *
 * This is a heuristic for the naming case and is honest about being one. The
 * `type` and `autocomplete` rules are structural and exact; the token rules are
 * a safety net for sites that declare neither.
 */

/** Redaction categories. Recorded on the step so nothing is silently missing. */
export type RedactionReason = 'password' | 'file' | 'payment';

/**
 * The descriptive facts a redaction decision may see.
 *
 * Note what is absent: the value. This type cannot carry one.
 */
export interface SensitiveFieldFacts {
  type?: string;
  autocomplete?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  labelText?: string;
}

/** Splits an identifier into lowercase word tokens: `cardNumber` → card, number. */
function tokenise(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Whole tokens that identify a payment field on their own. */
const PAYMENT_TOKENS = new Set(['card', 'cvv', 'cvc', 'ccv', 'creditcard', 'cardnumber']);

/** Token pairs that identify a payment field only together. */
const PAYMENT_PHRASES = [
  'security code',
  'card number',
  'credit card',
  'card verification',
  'expiry date',
];

function looksLikePayment(facts: SensitiveFieldFacts): boolean {
  for (const raw of [facts.name, facts.id, facts.placeholder, facts.labelText]) {
    const tokens = tokenise(raw);
    if (tokens.some((t) => PAYMENT_TOKENS.has(t))) return true;
    const phrase = tokens.join(' ');
    if (PAYMENT_PHRASES.some((p) => phrase.includes(p))) return true;
  }
  return false;
}

/**
 * The reason this field's value must not be read, or `null` if it may be.
 *
 * `null` is the answer for ordinary fields, and it has to be: a recorder that
 * redacts everything records nothing useful.
 */
export function redactionReasonFor(facts: SensitiveFieldFacts): RedactionReason | null {
  const type = facts.type?.toLowerCase();
  if (type === 'password') return 'password';
  if (type === 'file') return 'file';

  // The platform's own declaration, which a site opts into deliberately.
  const autocomplete = (facts.autocomplete ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (autocomplete.includes('current-password') || autocomplete.includes('new-password')) {
    return 'password';
  }
  if (autocomplete.some((token) => token.startsWith('cc-'))) return 'payment';

  if (looksLikePayment(facts)) return 'payment';
  return null;
}
