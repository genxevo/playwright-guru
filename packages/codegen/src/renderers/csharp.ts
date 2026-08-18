import type {
  LocatorChain,
  LocatorStep,
  LocatorStepOptions,
} from '@playwright-guru/locator-engine';
import { renderCSharpLiteral, toAriaRolePascalToken } from '../internal/format';

const METHOD_NAME: Record<LocatorStep['kind'], string> = {
  role: 'GetByRole',
  text: 'GetByText',
  label: 'GetByLabel',
  placeholder: 'GetByPlaceholder',
  altText: 'GetByAltText',
  title: 'GetByTitle',
  testId: 'GetByTestId',
};

/**
 * Renders a step's object initializer, e.g. `new() { Name = "Add", Exact = true }`.
 * `Name` and the state options only apply alongside `GetByRole` in the real
 * .NET API; the other Get* options classes only expose `Exact`.
 */
function renderOptionsObject(kind: LocatorStep['kind'], options: LocatorStepOptions | undefined): string {
  if (!options || kind === 'testId') return '';
  const entries: string[] = [];
  if (kind === 'role') {
    if (options.name) entries.push(`Name = ${renderCSharpLiteral(options.name)}`);
    if (options.checked !== undefined) entries.push(`Checked = ${options.checked}`);
    if (options.pressed !== undefined) entries.push(`Pressed = ${options.pressed}`);
    if (options.selected !== undefined) entries.push(`Selected = ${options.selected}`);
    if (options.expanded !== undefined) entries.push(`Expanded = ${options.expanded}`);
    if (options.disabled !== undefined) entries.push(`Disabled = ${options.disabled}`);
    if (options.level !== undefined) entries.push(`Level = ${options.level}`);
  }
  if (options.exact !== undefined) entries.push(`Exact = ${options.exact}`);
  if (entries.length === 0) return '';
  return `, new() { ${entries.join(', ')} }`;
}

/**
 * Renders a single step, e.g.
 * `GetByRole(AriaRole.Button, new() { Name = "Add", Exact = true })`
 * or `GetByTestId("cart-icon")`.
 */
function renderStep(step: LocatorStep): string {
  const method = METHOD_NAME[step.kind];
  if (step.kind === 'role') {
    const roleArg = `AriaRole.${toAriaRolePascalToken(step.selectorValue.value)}`;
    return `${method}(${roleArg}${renderOptionsObject('role', step.options)})`;
  }
  const valueArg = renderCSharpLiteral(step.selectorValue);
  const opts = renderOptionsObject(step.kind, step.options);
  return `${method}(${valueArg}${opts})`;
}

/** Renders a `.Filter(new() { HasText = ... })` suffix, or '' if no filter is set. */
function renderFilter(chain: LocatorChain): string {
  if (!chain.filter) return '';
  const { hasText, hasNotText } = chain.filter;
  const entries: string[] = [];
  if (hasText) entries.push(`HasText = ${renderCSharpLiteral(hasText)}`);
  if (hasNotText) entries.push(`HasNotText = ${renderCSharpLiteral(hasNotText)}`);
  if (entries.length === 0) return '';
  return `.Filter(new() { ${entries.join(', ')} })`;
}

/**
 * Renders a full LocatorChain as a C# expression rooted at `Page`, e.g.:
 *
 *   Page.GetByRole(AriaRole.Row, new() { Name = "Jane Doe" })
 *       .GetByRole(AriaRole.Button, new() { Name = "Edit" })
 *
 * Locator-creation methods in Playwright's .NET API are synchronous —
 * there is no `GetByRoleAsync`. Only the actions chained after a locator
 * (e.g. `.ClickAsync()`) are async, and actions are out of scope for a
 * locator generator. `csharp_sync` and `csharp_async` therefore render
 * identical locator code; the distinction only matters once the consumer
 * adds an action call of their own.
 */
export function renderCSharp(chain: LocatorChain): string {
  const steps = chain.steps.map(renderStep).join('.');
  const filter = renderFilter(chain);
  const nth = chain.nth !== undefined ? `.Nth(${chain.nth})` : '';
  return `Page.${steps}${filter}${nth}`;
}
