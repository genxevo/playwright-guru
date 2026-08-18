import type {
  LocatorChain,
  LocatorStep,
  LocatorStepOptions,
} from '@playwright-guru/locator-engine';
import { renderPythonLiteral, doubleQuoted } from '../internal/format';

const METHOD_NAME: Record<LocatorStep['kind'], string> = {
  role: 'get_by_role',
  text: 'get_by_text',
  label: 'get_by_label',
  placeholder: 'get_by_placeholder',
  altText: 'get_by_alt_text',
  title: 'get_by_title',
  testId: 'get_by_test_id',
};

/** Python booleans are `True`/`False`, not JS's lowercase `true`/`false`. */
function pyBool(value: boolean): string {
  return value ? 'True' : 'False';
}

/**
 * Renders a step's keyword arguments, e.g. `name="Add", exact=True`.
 * `name` and the state options only apply alongside `role` in Playwright's
 * real API; other kinds only accept `exact`, and `get_by_test_id` accepts
 * no keyword options at all.
 */
function renderKeywordArgs(kind: LocatorStep['kind'], options: LocatorStepOptions | undefined): string {
  if (!options || kind === 'testId') return '';
  const entries: string[] = [];
  if (kind === 'role') {
    if (options.name) entries.push(`name=${renderPythonLiteral(options.name)}`);
    if (options.checked !== undefined) entries.push(`checked=${pyBool(options.checked)}`);
    if (options.pressed !== undefined) entries.push(`pressed=${pyBool(options.pressed)}`);
    if (options.selected !== undefined) entries.push(`selected=${pyBool(options.selected)}`);
    if (options.expanded !== undefined) entries.push(`expanded=${pyBool(options.expanded)}`);
    if (options.disabled !== undefined) entries.push(`disabled=${pyBool(options.disabled)}`);
    if (options.level !== undefined) entries.push(`level=${options.level}`);
  }
  if (options.exact !== undefined) entries.push(`exact=${pyBool(options.exact)}`);
  return entries.join(', ');
}

/** Renders a single step, e.g. `get_by_role("button", name="Add")` or `get_by_test_id("cart-icon")`. */
function renderStep(step: LocatorStep): string {
  const method = METHOD_NAME[step.kind];
  if (step.kind === 'role') {
    const roleArg = doubleQuoted(step.selectorValue.value);
    const kwargs = renderKeywordArgs('role', step.options);
    return `${method}(${roleArg}${kwargs ? `, ${kwargs}` : ''})`;
  }
  const valueArg = renderPythonLiteral(step.selectorValue);
  const kwargs = renderKeywordArgs(step.kind, step.options);
  return `${method}(${valueArg}${kwargs ? `, ${kwargs}` : ''})`;
}

/** Renders a `.filter(has_text=... / has_not_text=...)` suffix, or '' if no filter is set. */
function renderFilter(chain: LocatorChain): string {
  if (!chain.filter) return '';
  const { hasText, hasNotText } = chain.filter;
  const parts: string[] = [];
  if (hasText) parts.push(`has_text=${renderPythonLiteral(hasText)}`);
  if (hasNotText) parts.push(`has_not_text=${renderPythonLiteral(hasNotText)}`);
  if (parts.length === 0) return '';
  return `.filter(${parts.join(', ')})`;
}

/**
 * Renders a full LocatorChain as a Python expression rooted at `page`.
 *
 * The `isAsync` parameter is accepted for API symmetry with the other
 * renderers and to satisfy `TargetLanguage`'s python_sync/python_async
 * split, but it does not change the output: in both Playwright Python
 * APIs, locator-creation calls (`get_by_role`, `.filter()`, `.nth()`,
 * etc.) are synchronous — only the *action* chained after the locator
 * (e.g. `.click()`) needs `await` in the async API, and actions are
 * out of scope for a locator generator.
 */
export function renderPython(chain: LocatorChain, _isAsync: boolean): string {
  const steps = chain.steps.map(renderStep).join('.');
  const filter = renderFilter(chain);
  const nth = chain.nth !== undefined ? `.nth(${chain.nth})` : '';
  return `page.${steps}${filter}${nth}`;
}
