import type {
  LocatorChain,
  LocatorStep,
  LocatorStepOptions,
} from '@playwright-guru/locator-engine';
import { renderJavaLiteral, toAriaRoleEnumToken } from '../internal/format';

const METHOD_NAME: Record<LocatorStep['kind'], string> = {
  role: 'getByRole',
  text: 'getByText',
  label: 'getByLabel',
  placeholder: 'getByPlaceholder',
  altText: 'getByAltText',
  title: 'getByTitle',
  testId: 'getByTestId',
};

/** Maps a LocatorKind to its Java options-builder class name, e.g. `Page.GetByRoleOptions`. */
const OPTIONS_CLASS: Partial<Record<LocatorStep['kind'], string>> = {
  role: 'Page.GetByRoleOptions',
  text: 'Page.GetByTextOptions',
  label: 'Page.GetByLabelOptions',
  placeholder: 'Page.GetByPlaceholderOptions',
  altText: 'Page.GetByAltTextOptions',
  title: 'Page.GetByTitleOptions',
};

/**
 * Maps each option field to its Java builder setter method name.
 * `setName` and the state setters only exist on `Page.GetByRoleOptions`;
 * the other Get*Options classes (GetByTextOptions, GetByLabelOptions, etc.)
 * only expose `setExact`.
 */
function buildOptionsChain(kind: LocatorStep['kind'], options: LocatorStepOptions): string[] {
  const setters: string[] = [];
  if (kind === 'role') {
    if (options.name) setters.push(`.setName(${renderJavaLiteral(options.name)})`);
    if (options.checked !== undefined) setters.push(`.setChecked(${options.checked})`);
    if (options.pressed !== undefined) setters.push(`.setPressed(${options.pressed})`);
    if (options.selected !== undefined) setters.push(`.setSelected(${options.selected})`);
    if (options.expanded !== undefined) setters.push(`.setExpanded(${options.expanded})`);
    if (options.disabled !== undefined) setters.push(`.setDisabled(${options.disabled})`);
    if (options.level !== undefined) setters.push(`.setLevel(${options.level})`);
  }
  if (options.exact !== undefined) setters.push(`.setExact(${options.exact})`);
  return setters;
}

/** Renders a step's trailing options-builder argument, e.g. `, new Page.GetByRoleOptions().setName("Add")`. */
function renderOptionsArg(kind: LocatorStep['kind'], options: LocatorStepOptions | undefined): string {
  if (!options) return '';
  const optionsClass = OPTIONS_CLASS[kind];
  if (!optionsClass) return '';
  const setters = buildOptionsChain(kind, options);
  if (setters.length === 0) return '';
  return `, new ${optionsClass}()${setters.join('')}`;
}

/**
 * Renders a single step, e.g.
 * `getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Add"))`
 * or `getByTestId("cart-icon")`.
 */
function renderStep(step: LocatorStep): string {
  const method = METHOD_NAME[step.kind];
  if (step.kind === 'role') {
    const roleArg = `AriaRole.${toAriaRoleEnumToken(step.selectorValue.value)}`;
    return `${method}(${roleArg}${renderOptionsArg('role', step.options)})`;
  }
  const valueArg = renderJavaLiteral(step.selectorValue);
  if (step.kind === 'testId') return `${method}(${valueArg})`;
  return `${method}(${valueArg}${renderOptionsArg(step.kind, step.options)})`;
}

/** Renders a `.filter(new Locator.FilterOptions()...)` suffix, or '' if no filter is set. */
function renderFilter(chain: LocatorChain): string {
  if (!chain.filter) return '';
  const { hasText, hasNotText } = chain.filter;
  const setters: string[] = [];
  if (hasText) setters.push(`.setHasText(${renderJavaLiteral(hasText)})`);
  if (hasNotText) setters.push(`.setHasNotText(${renderJavaLiteral(hasNotText)})`);
  if (setters.length === 0) return '';
  return `.filter(new Locator.FilterOptions()${setters.join('')})`;
}

/**
 * Renders a full LocatorChain as a Java expression rooted at `page`, e.g.:
 *
 *   page.getByRole(AriaRole.ROW, new Page.GetByRoleOptions().setName("Jane Doe"))
 *       .getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Edit"))
 *
 * Java has no separate async API — all calls are synchronous from the
 * caller's perspective (Playwright Java drives the browser over its own
 * internal thread), so there is no sync/async toggle to thread through here.
 */
export function renderJava(chain: LocatorChain): string {
  const steps = chain.steps.map(renderStep).join('.');
  const filter = renderFilter(chain);
  const nth = chain.nth !== undefined ? `.nth(${chain.nth})` : '';
  return `page.${steps}${filter}${nth}`;
}
