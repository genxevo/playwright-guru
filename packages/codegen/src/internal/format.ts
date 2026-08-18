import type { MatcherValue } from '@playwright-guru/locator-engine';

/**
 * Escapes a raw string for safe embedding inside a quoted string literal.
 * The backslash-escape rules below (\\, \n, \r, \t, plus the quote
 * character itself) are shared syntax across JS/TS, Python, Java, and C#,
 * so one implementation covers all four renderers.
 */
export function escapeForQuotedString(raw: string, quote: '"' | "'"): string {
  const quoteRe = quote === '"' ? /"/g : /'/g;
  return raw
    .replace(/\\/g, '\\\\')
    .replace(quoteRe, '\\' + quote)
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/** Wraps a raw string in single quotes, escaping as needed. Used by the TS/JS renderer. */
export function singleQuoted(raw: string): string {
  return `'${escapeForQuotedString(raw, "'")}'`;
}

/** Wraps a raw string in double quotes, escaping as needed. Used by Python/Java/C#. */
export function doubleQuoted(raw: string): string {
  return `"${escapeForQuotedString(raw, '"')}"`;
}

/**
 * Renders a MatcherValue as a TS/JS literal: a quoted string, or a native
 * `/pattern/flags` regex literal (forward slashes inside the pattern are
 * escaped since they'd otherwise terminate the literal early).
 */
export function renderJsLiteral(matcher: MatcherValue): string {
  if (matcher.type === 'string') return singleQuoted(matcher.value);
  const escapedPattern = matcher.value.replace(/\//g, '\\/');
  return `/${escapedPattern}/${matcher.flags ?? ''}`;
}

/**
 * Renders a MatcherValue as a Python literal: a double-quoted string, or
 * `re.compile(r"pattern", re.IGNORECASE)` for regex (only emits the flags
 * argument when an "i" flag is present — that's the only flag Playwright's
 * matching cares about here). Callers must `import re` themselves.
 */
export function renderPythonLiteral(matcher: MatcherValue): string {
  if (matcher.type === 'string') return doubleQuoted(matcher.value);
  const pattern = `r"${matcher.value.replace(/"/g, '\\"')}"`;
  return matcher.flags?.includes('i')
    ? `re.compile(${pattern}, re.IGNORECASE)`
    : `re.compile(${pattern})`;
}

/**
 * Renders a MatcherValue as a Java literal: a double-quoted String, or
 * `Pattern.compile("pattern", Pattern.CASE_INSENSITIVE)` for regex.
 * Callers must `import java.util.regex.Pattern`.
 */
export function renderJavaLiteral(matcher: MatcherValue): string {
  if (matcher.type === 'string') return doubleQuoted(matcher.value);
  const pattern = doubleQuoted(matcher.value);
  return matcher.flags?.includes('i')
    ? `Pattern.compile(${pattern}, Pattern.CASE_INSENSITIVE)`
    : `Pattern.compile(${pattern})`;
}

/**
 * Renders a MatcherValue as a C# literal: a double-quoted string, or
 * `new Regex("pattern", RegexOptions.IgnoreCase)` for regex.
 * Callers must `using System.Text.RegularExpressions;`.
 */
export function renderCSharpLiteral(matcher: MatcherValue): string {
  if (matcher.type === 'string') return doubleQuoted(matcher.value);
  const pattern = doubleQuoted(matcher.value);
  return matcher.flags?.includes('i')
    ? `new Regex(${pattern}, RegexOptions.IgnoreCase)`
    : `new Regex(${pattern})`;
}

/**
 * Maps an ARIA role string to the token Playwright's typed AriaRole enums
 * (Java's `AriaRole.X`, C#'s `AriaRole.X`) expect. All standard ARIA roles
 * are single words with no separators, so a plain uppercase is correct —
 * there is no special-casing needed (e.g. "menuitem" -> "MENUITEM").
 */
export function toAriaRoleEnumToken(role: string): string {
  return role.toUpperCase();
}

/**
 * Maps an ARIA role string to PascalCase for C#'s `AriaRole.X` enum,
 * which (unlike Java) uses PascalCase tokens, e.g. "button" -> "Button",
 * "menuitem" -> "Menuitem".
 */
export function toAriaRolePascalToken(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}
