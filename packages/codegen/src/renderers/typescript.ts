import type {
  LocatorChain,
  LocatorStep,
  LocatorStepOptions,
} from '@playwright-guru/locator-engine';
import { renderJsLiteral, singleQuoted } from '../internal/format';

const METHOD_NAME: Record<LocatorStep['kind'], string> = {
  role: 'getByRole',
  text: 'getByText',
  label: 'getByLabel',
  placeholder: 'getByPlaceholder',
  altText: 'getByAltText',
  title: 'getByTitle',
  testId: 'getByTestId',
};

/**
 * Renders a step's options object, e.g. `{ name: 'Add', exact: true }`.
 * `name` and the state options (`checked`/`pressed`/etc.) are only valid
 * alongside `role` in Playwright's actual typed API — `getByText`,
 * `getByLabel`, `getByPlaceholder`, `getByAltText`, and `getByTitle` only
 * accept `exact`, and `getByTestId` accepts no options object at all.
 */
function renderOptionsObject(kind: LocatorStep['kind'], options: LocatorStepOptions | undefined): string {
  if (!options || kind === 'testId') return '';
  const entries: string[] = [];
  if (kind === 'role') {
    if (options.name) entries.push(`name: ${renderJsLiteral(options.name)}`);
    if (options.checked !== undefined) entries.push(`checked: ${options.checked}`);
    if (options.pressed !== undefined) entries.push(`pressed: ${options.pressed}`);
    if (options.selected !== undefined) entries.push(`selected: ${options.selected}`);
    if (options.expanded !== undefined) entries.push(`expanded: ${options.expanded}`);
    if (options.disabled !== undefined) entries.push(`disabled: ${options.disabled}`);
    if (options.level !== undefined) entries.push(`level: ${options.level}`);
  }
  if (options.exact !== undefined) entries.push(`exact: ${options.exact}`);
  if (entries.length === 0) return '';
  return `, { ${entries.join(', ')} }`;
}

/** Renders a single step, e.g. `getByRole('button', { name: 'Add' })` or `getByTestId('cart-icon')`. */
function renderStep(step: LocatorStep): string {
  const method = METHOD_NAME[step.kind];
  if (step.kind === 'role') {
    // The role token itself is always a bare string, never a regex.
    const roleArg = singleQuoted(step.selectorValue.value);
    return `${method}(${roleArg}${renderOptionsObject('role', step.options)})`;
  }
  const valueArg = renderJsLiteral(step.selectorValue);
  const opts = renderOptionsObject(step.kind, step.options);
  return `${method}(${valueArg}${opts})`;
}

/** Renders a `.filter({ hasText / hasNotText })` suffix, or '' if no filter is set. */
function renderFilter(chain: LocatorChain): string {
  if (!chain.filter) return '';
  const { hasText, hasNotText } = chain.filter;
  const parts: string[] = [];
  if (hasText) parts.push(`hasText: ${renderJsLiteral(hasText)}`);
  if (hasNotText) parts.push(`hasNotText: ${renderJsLiteral(hasNotText)}`);
  if (parts.length === 0) return '';
  return `.filter({ ${parts.join(', ')} })`;
}

/**
 * Renders a full LocatorChain as a TypeScript/JavaScript expression rooted
 * at `page`, e.g.:
 *
 *   page.getByRole('row', { name: 'Jane Doe' }).getByRole('button', { name: 'Edit' }).nth(0)
 */
export function renderTypeScript(chain: LocatorChain): string {
  const steps = chain.steps.map(renderStep).join('.');
  const filter = renderFilter(chain);
  const nth = chain.nth !== undefined ? `.nth(${chain.nth})` : '';
  return `page.${steps}${filter}${nth}`;
}
