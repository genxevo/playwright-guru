/**
 * WS1 — codegen golden table (item 3 of the remaining WS1 sequence).
 *
 * Characterisation/conformance coverage of `generateLocatorCode(chain, lang)`.
 * Each scenario is a deterministic `LocatorChain` input paired with the exact
 * expected source for each of the four DISTINCT renderers (TS/JS share output;
 * Python sync/async share output; C# sync/async share output). The runner
 * (`codegen-goldens.test.ts`) expands the four into the seven `TargetLanguage`
 * values, so every scenario yields 7 verified (input, language) → code goldens.
 *
 * ── PROVENANCE OF THE EXPECTED VALUES (evidence level) ────────────────────
 * The expected strings are authored from **Playwright's documented per-language
 * locator API** (TS/JS, Python, Java, C#) — NOT copied from the renderer output.
 * That is deliberate: a golden written from the contract catches a renderer that
 * drifts from idiomatic Playwright. These are **codegen-behaviour** goldens
 * (AST → source). They are NOT browser evidence: no locator here is resolved
 * against a DOM. DOM/visibility/real-Chromium fidelity lives in other suites
 * (FixtureDomProbe, the conformance golden), at their own evidence levels.
 *
 * No `FixtureDomProbe` / happy-dom dependency: the codegen contract is
 * `chain → code`, and several AST features covered here (regex matchers, state
 * options, `.filter()`, multi-step chains) are never emitted by the DOM
 * pipeline, so hand-authored chains are the only way to characterise the whole
 * surface. Keeping the goldens self-contained also avoids coupling the codegen
 * package's tests to locator-engine test internals.
 */

import type { LocatorChain } from '../../src/index';

/** The four distinct renderer outputs. The runner expands these to 7 targets. */
export interface GoldenExpected {
  /** typescript === javascript */
  ts: string;
  /** python_sync === python_async */
  python: string;
  java: string;
  /** csharp_sync === csharp_async */
  csharp: string;
}

export interface GoldenScenario {
  name: string;
  chain: LocatorChain;
  expected: GoldenExpected;
}

const str = (value: string) => ({ type: 'string' as const, value });

export const GOLDENS: readonly GoldenScenario[] = [
  {
    name: 'role + accessible name',
    chain: {
      steps: [{ kind: 'role', selectorValue: str('button'), options: { name: str('Add') } }],
    },
    expected: {
      ts: `page.getByRole('button', { name: 'Add' })`,
      python: `page.get_by_role("button", name="Add")`,
      java: `page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Add"))`,
      csharp: `Page.GetByRole(AriaRole.Button, new() { Name = "Add" })`,
    },
  },
  {
    name: 'role without a name (bare)',
    chain: { steps: [{ kind: 'role', selectorValue: str('button') }] },
    expected: {
      ts: `page.getByRole('button')`,
      python: `page.get_by_role("button")`,
      java: `page.getByRole(AriaRole.BUTTON)`,
      csharp: `Page.GetByRole(AriaRole.Button)`,
    },
  },
  {
    name: 'role heading with level',
    chain: {
      steps: [
        {
          kind: 'role',
          selectorValue: str('heading'),
          options: { name: str('Overview'), level: 2 },
        },
      ],
    },
    expected: {
      ts: `page.getByRole('heading', { name: 'Overview', level: 2 })`,
      python: `page.get_by_role("heading", name="Overview", level=2)`,
      java: `page.getByRole(AriaRole.HEADING, new Page.GetByRoleOptions().setName("Overview").setLevel(2))`,
      csharp: `Page.GetByRole(AriaRole.Heading, new() { Name = "Overview", Level = 2 })`,
    },
  },
  {
    name: 'role with a checked state option',
    chain: {
      steps: [
        {
          kind: 'role',
          selectorValue: str('checkbox'),
          options: { name: str('Agree'), checked: true },
        },
      ],
    },
    expected: {
      ts: `page.getByRole('checkbox', { name: 'Agree', checked: true })`,
      python: `page.get_by_role("checkbox", name="Agree", checked=True)`,
      java: `page.getByRole(AriaRole.CHECKBOX, new Page.GetByRoleOptions().setName("Agree").setChecked(true))`,
      csharp: `Page.GetByRole(AriaRole.Checkbox, new() { Name = "Agree", Checked = true })`,
    },
  },
  {
    name: 'role with exact name',
    chain: {
      steps: [
        { kind: 'role', selectorValue: str('button'), options: { name: str('OK'), exact: true } },
      ],
    },
    expected: {
      ts: `page.getByRole('button', { name: 'OK', exact: true })`,
      python: `page.get_by_role("button", name="OK", exact=True)`,
      java: `page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("OK").setExact(true))`,
      csharp: `Page.GetByRole(AriaRole.Button, new() { Name = "OK", Exact = true })`,
    },
  },
  {
    name: 'role with a case-insensitive regex name',
    chain: {
      steps: [
        {
          kind: 'role',
          selectorValue: str('button'),
          options: { name: { type: 'regex', value: 'log ?in', flags: 'i' } },
        },
      ],
    },
    expected: {
      ts: `page.getByRole('button', { name: /log ?in/i })`,
      python: `page.get_by_role("button", name=re.compile(r"log ?in", re.IGNORECASE))`,
      java: `page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName(Pattern.compile("log ?in", Pattern.CASE_INSENSITIVE)))`,
      csharp: `Page.GetByRole(AriaRole.Button, new() { Name = new Regex("log ?in", RegexOptions.IgnoreCase) })`,
    },
  },
  {
    name: 'getByText with exact',
    chain: { steps: [{ kind: 'text', selectorValue: str('Read more'), options: { exact: true } }] },
    expected: {
      ts: `page.getByText('Read more', { exact: true })`,
      python: `page.get_by_text("Read more", exact=True)`,
      java: `page.getByText("Read more", new Page.GetByTextOptions().setExact(true))`,
      csharp: `Page.GetByText("Read more", new() { Exact = true })`,
    },
  },
  {
    name: 'getByLabel',
    chain: { steps: [{ kind: 'label', selectorValue: str('E-mail') }] },
    expected: {
      ts: `page.getByLabel('E-mail')`,
      python: `page.get_by_label("E-mail")`,
      java: `page.getByLabel("E-mail")`,
      csharp: `Page.GetByLabel("E-mail")`,
    },
  },
  {
    name: 'getByPlaceholder',
    chain: { steps: [{ kind: 'placeholder', selectorValue: str('mm/dd/yyyy') }] },
    expected: {
      ts: `page.getByPlaceholder('mm/dd/yyyy')`,
      python: `page.get_by_placeholder("mm/dd/yyyy")`,
      java: `page.getByPlaceholder("mm/dd/yyyy")`,
      csharp: `Page.GetByPlaceholder("mm/dd/yyyy")`,
    },
  },
  {
    name: 'getByAltText with a single-quote (quote escaping)',
    chain: { steps: [{ kind: 'altText', selectorValue: str("O'Brien") }] },
    expected: {
      // TS single-quotes → the apostrophe is escaped; the double-quote langs are not affected.
      ts: `page.getByAltText('O\\'Brien')`,
      python: `page.get_by_alt_text("O'Brien")`,
      java: `page.getByAltText("O'Brien")`,
      csharp: `Page.GetByAltText("O'Brien")`,
    },
  },
  {
    name: 'getByTitle',
    chain: { steps: [{ kind: 'title', selectorValue: str('Close') }] },
    expected: {
      ts: `page.getByTitle('Close')`,
      python: `page.get_by_title("Close")`,
      java: `page.getByTitle("Close")`,
      csharp: `Page.GetByTitle("Close")`,
    },
  },
  {
    name: 'getByTestId (no options object in any language)',
    chain: { steps: [{ kind: 'testId', selectorValue: str('cart-icon') }] },
    expected: {
      ts: `page.getByTestId('cart-icon')`,
      python: `page.get_by_test_id("cart-icon")`,
      java: `page.getByTestId("cart-icon")`,
      csharp: `Page.GetByTestId("cart-icon")`,
    },
  },
  {
    name: 'multi-step chain with nth',
    chain: {
      steps: [
        { kind: 'role', selectorValue: str('row'), options: { name: str('Jane Doe') } },
        { kind: 'role', selectorValue: str('button'), options: { name: str('Edit') } },
      ],
      nth: 0,
    },
    expected: {
      ts: `page.getByRole('row', { name: 'Jane Doe' }).getByRole('button', { name: 'Edit' }).nth(0)`,
      python: `page.get_by_role("row", name="Jane Doe").get_by_role("button", name="Edit").nth(0)`,
      java: `page.getByRole(AriaRole.ROW, new Page.GetByRoleOptions().setName("Jane Doe")).getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Edit")).nth(0)`,
      csharp: `Page.GetByRole(AriaRole.Row, new() { Name = "Jane Doe" }).GetByRole(AriaRole.Button, new() { Name = "Edit" }).Nth(0)`,
    },
  },
  {
    name: 'frameLocator prefix + filter(hasText) + multi-word role',
    chain: {
      steps: [{ kind: 'role', selectorValue: str('listitem'), options: { name: str('Active') } }],
      filter: { hasText: str('unread') },
      frameSelector: 'iframe#app',
    },
    expected: {
      ts: `page.frameLocator('iframe#app').getByRole('listitem', { name: 'Active' }).filter({ hasText: 'unread' })`,
      python: `page.frame_locator("iframe#app").get_by_role("listitem", name="Active").filter(has_text="unread")`,
      java: `page.frameLocator("iframe#app").getByRole(AriaRole.LISTITEM, new Page.GetByRoleOptions().setName("Active")).filter(new Locator.FilterOptions().setHasText("unread"))`,
      csharp: `Page.FrameLocator("iframe#app").GetByRole(AriaRole.Listitem, new() { Name = "Active" }).Filter(new() { HasText = "unread" })`,
    },
  },
];
