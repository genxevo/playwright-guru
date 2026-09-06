/**
 * Playwright Guru — rendering a recording as Playwright source (WS9, slice 4).
 * ---------------------------------------------------------------------------
 * THE ARCHITECTURAL STATEMENT THIS MODULE MAKES TRUE:
 *
 *     Recording determines WHAT was verified.
 *     Rendering determines HOW that verified action is expressed.
 *
 * This is a **pure projection**. It has no probe, no resolver, no DOM, no
 * storage, no messages and no opinion about whether a locator is good. Slice 3
 * already settled that at capture time, against a live page, with the admission
 * rule; re-deciding it here from stored numbers would be a second and weaker
 * gate wearing the first one's clothes.
 *
 * IT ADDS NO CODE GENERATOR. `generateLocatorCode` (WS1 — seven languages, 98
 * goldens) already turns a `LocatorChain` into a Playwright locator expression.
 * This module asks it for the locator and appends the action call. There is no
 * second locator renderer, no second escaping policy (`singleQuoted` /
 * `doubleQuoted` come from codegen), and no second language table.
 *
 * ═══ WHAT IT MUST NEVER DO, AND WHY THAT IS NOT HYPOTHETICAL ═══
 *
 * The legacy `src/ui/recording/test-code.ts` showed the failure exactly, and it
 * is described here in the past tense because DL-82 deleted it. Its
 * `attrsToLocatorCode` rebuilt a locator from **raw `ElementAttributes` with
 * no DOM uniqueness check** — its own comment admitted "recording is captured
 * without context" — and when that threw it returned a fabricated,
 * plausible-looking, entirely unverified locator built from the element's tag
 * name alone. Code that looks valid and is wrong is worse than a refusal,
 * because a refusal is visible and a bad locator is discovered later, by
 * someone debugging a flaky test. That generator no longer exists anywhere in
 * production; this paragraph is kept as the reason the rule below exists.
 *
 * So this module renders the verified chain the recording already holds, or it
 * REFUSES — explicitly, with a reason. It never guesses a selector, never
 * substitutes CSS or XPath, never invents a value, and never returns `''` as
 * though it had succeeded.
 *
 * REDACTION SURVIVES RENDERING. Slice 1 removed sensitive values from the model
 * outright, so there is nothing here to leak. But the step must not be dropped
 * either — a recording that silently omits "the user typed a password here"
 * misrepresents the flow — so the action is refused and `renderSpecFile` marks
 * its position with a comment. Visible, inert, and honest.
 *
 * NOT IN THIS SLICE: the export menu, clipboard or download, the structured
 * code workspace, persistence, UI, and the v1 migration. `renderSpecFile`
 * produces a string; what anyone does with that string is a later slice.
 */

import { generateLocatorCode, doubleQuoted, singleQuoted } from '@playwright-guru/codegen';

import type { RecordedStep, RecordedStepKind, RecordedWorkflow } from './workflow';
import type { TargetLanguage } from '@playwright-guru/codegen';

// ─── Result ─────────────────────────────────────────────────────────────────

/** Why an action could not be rendered. Each is a fact about the model. */
export type RenderRefusal = 'no-target' | 'missing-url' | 'redacted-value';

export type RenderedAction =
  { ok: true; code: string } | { ok: false; refusal: RenderRefusal; note: string };

// ─── Language shapes ────────────────────────────────────────────────────────

type Family = 'js' | 'python' | 'java' | 'csharp';

function familyOf(lang: TargetLanguage): Family {
  switch (lang) {
    case 'typescript':
    case 'javascript':
      return 'js';
    case 'python_sync':
    case 'python_async':
      return 'python';
    case 'java':
      return 'java';
    case 'csharp_sync':
    case 'csharp_async':
      return 'csharp';
  }
}

/**
 * Whether the statement is awaited.
 *
 * Both C# targets await: Playwright .NET exposes only async APIs, so a
 * `csharp_sync` statement without `await` would not compile. The sync/async
 * distinction is real for Python, where both bindings exist.
 */
function awaits(lang: TargetLanguage): boolean {
  return (
    lang === 'typescript' ||
    lang === 'javascript' ||
    lang === 'python_async' ||
    lang === 'csharp_sync' ||
    lang === 'csharp_async'
  );
}

/** Python statements carry no terminator; the other three families use `;`. */
function terminator(family: Family): string {
  return family === 'python' ? '' : ';';
}

function quote(family: Family, raw: string): string {
  return family === 'js' ? singleQuoted(raw) : doubleQuoted(raw);
}

type ActionKind = Exclude<RecordedStepKind, 'goto'>;

/** The method each family calls. Playwright's own naming per binding. */
const METHOD: Record<Family, Record<ActionKind, string>> = {
  js: {
    click: 'click',
    dblclick: 'dblclick',
    fill: 'fill',
    check: 'check',
    uncheck: 'uncheck',
    selectOption: 'selectOption',
  },
  python: {
    click: 'click',
    dblclick: 'dblclick',
    fill: 'fill',
    check: 'check',
    uncheck: 'uncheck',
    selectOption: 'select_option',
  },
  java: {
    click: 'click',
    dblclick: 'dblclick',
    fill: 'fill',
    check: 'check',
    uncheck: 'uncheck',
    selectOption: 'selectOption',
  },
  csharp: {
    click: 'ClickAsync',
    dblclick: 'DblClickAsync',
    fill: 'FillAsync',
    check: 'CheckAsync',
    uncheck: 'UncheckAsync',
    selectOption: 'SelectOptionAsync',
  },
};

/** The kinds that carry a value argument. */
const TAKES_VALUE: ReadonlySet<ActionKind> = new Set<ActionKind>(['fill', 'selectOption']);

function navigation(family: Family, url: string): string {
  const arg = quote(family, url);
  switch (family) {
    case 'js':
      return `page.goto(${arg})`;
    case 'python':
      return `page.goto(${arg})`;
    case 'java':
      return `page.navigate(${arg})`;
    case 'csharp':
      return `Page.GotoAsync(${arg})`;
  }
}

// ─── renderAction ───────────────────────────────────────────────────────────

/**
 * Projects one recorded step into a single Playwright statement.
 *
 * The locator half is `generateLocatorCode`'s output, unmodified — including
 * `.nth(...)` when the model carries one. Dropping that would be the renderer
 * inventing confidence the recording never had: a positional locator presented
 * as an unqualified one. (Slice 3 refuses such chains at capture, so one should
 * not arrive here; if it does, it is rendered for what it is.)
 */
export function renderAction(action: RecordedStep, lang: TargetLanguage): RenderedAction {
  const family = familyOf(lang);
  const prefix = awaits(lang) ? 'await ' : '';
  const end = terminator(family);

  if (action.kind === 'goto') {
    if (!action.url) {
      return { ok: false, refusal: 'missing-url', note: 'a goto step carried no url' };
    }
    return { ok: true, code: `${prefix}${navigation(family, action.url)}${end}` };
  }

  if (action.redacted) {
    // The value was never read, so there is none to render — and inventing one
    // would put a fake secret into a test the user might actually run.
    return {
      ok: false,
      refusal: 'redacted-value',
      note: `value withheld (${action.redacted}) — supply it yourself`,
    };
  }

  if (!action.target) {
    return {
      ok: false,
      refusal: 'no-target',
      note: `a ${action.kind} step carried no verified locator`,
    };
  }

  const locator = generateLocatorCode(action.target.locator.chain, lang);
  const method = METHOD[family][action.kind];
  const arg = TAKES_VALUE.has(action.kind) ? quote(family, action.value ?? '') : '';
  return { ok: true, code: `${prefix}${locator}.${method}(${arg})${end}` };
}

// ─── renderSpecFile ─────────────────────────────────────────────────────────

interface Scaffold {
  header: readonly string[];
  footer: readonly string[];
  comment: string;
}

/**
 * The spec shapes, matching the conventions already established in the
 * repository's legacy generator so a reader sees one house style.
 */
function scaffoldFor(lang: TargetLanguage): Scaffold {
  switch (lang) {
    case 'typescript':
    case 'javascript':
      return {
        header: [
          `import { test, expect } from '@playwright/test';`,
          '',
          `test('recorded test', async ({ page }) => {`,
        ],
        footer: ['});'],
        comment: '//',
      };
    case 'python_sync':
      return { header: [`def test_recorded(page):`], footer: [], comment: '#' };
    case 'python_async':
      return { header: [`async def test_recorded(page):`], footer: [], comment: '#' };
    case 'java':
      return { header: [`@Test`, `public void recordedTest() {`], footer: ['}'], comment: '//' };
    case 'csharp_sync':
    case 'csharp_async':
      return {
        header: [`[Test]`, `public async Task RecordedTestAsync() {`],
        footer: ['}'],
        comment: '//',
      };
  }
}

const INDENT = '  ';

/**
 * Projects a whole recording into a Playwright spec file.
 *
 * ORDER IS PRESERVED EXACTLY, and no step is dropped or duplicated: a
 * recording that silently reordered or omitted an action would no longer
 * describe what the user did. A step that cannot be rendered becomes a marked
 * comment in its original position — visible, inert, and impossible to mistake
 * for working code.
 *
 * An empty workflow renders to the empty string, following the convention the
 * repository's existing generator already set. It produces a string and nothing
 * else: no file is written, nothing is copied, nothing is stored.
 */
export function renderSpecFile(workflow: RecordedWorkflow, lang: TargetLanguage): string {
  if (workflow.steps.length === 0) return '';

  const { header, footer, comment } = scaffoldFor(lang);
  const body = workflow.steps.map((step) => {
    const rendered = renderAction(step, lang);
    return rendered.ok
      ? `${INDENT}${rendered.code}`
      : `${INDENT}${comment} ${step.kind}: ${rendered.note}`;
  });

  return [...header, ...body, ...footer].join('\n');
}
