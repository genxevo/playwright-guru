/**
 * WS9 slice 4 — the recording RENDERERS: `renderAction` + `renderSpecFile`.
 * ============================================================================
 * WHAT AUTHORISES THIS SLICE. The WS9 discovery gate's §14 sequences it
 * directly: after the handshake and heartbeat, "**`renderAction`/
 * `renderSpecFile`**, the export menu and the structured workspace follow".
 * Slices 1–3 built the model, the lifecycle and the runtime; this projects what
 * they captured into Playwright source.
 *
 * ═══ THE ONE ARCHITECTURAL STATEMENT THIS FILE EXISTS TO PROVE ═══
 *
 *     Recording determines WHAT was verified.
 *     Rendering determines HOW that verified action is expressed.
 *
 * The renderer is a **pure projection**. It never decides whether a locator is
 * trustworthy — Slice 3's admission rule already did, at capture time, with a
 * live probe. By the time a step reaches here the question is settled, so the
 * renderer has no probe, no resolver, no DOM and no opinion.
 *
 * IT ADDS NO CODE GENERATOR. `generateLocatorCode` (WS1, 7 languages, 98
 * goldens) already renders a `LocatorChain` into a Playwright locator
 * expression. `renderAction` is a thin adapter: it asks codegen for the locator
 * and appends the action call. There is no second locator renderer, no second
 * escaping policy, and no second language table.
 *
 * ═══ WHAT IT MUST NEVER DO ═══
 *
 * The legacy `src/ui/recording/test-code.ts` shows the failure precisely. Its
 * `attrsToLocatorCode` rebuilds a locator from **raw `ElementAttributes` with
 * no DOM uniqueness check** — its own comment says "recording is captured
 * without context" — and when that throws it returns
 *
 *     page.locator('<tagName>')
 *
 * a fabricated, plausible-looking, entirely unverified locator. That is exactly
 * what this renderer must not do: it renders the verified chain the recording
 * already holds, or it refuses. **Invalid code that looks valid is worse than a
 * refusal**, because a refusal is visible and a bad locator is not.
 *
 * REDACTION SURVIVES RENDERING. Slice 1 removes a sensitive value from the
 * model outright, so the renderer has nothing to leak — but it must not invent
 * one either, and it must not silently drop the step, which would misrepresent
 * what the user did. It refuses that one action and says so in the output.
 *
 * EVIDENCE BOUNDARY: pure unit tests at R3's `environment: 'node'`. No DOM, no
 * browser, no timers. **Real Chromium is not run and nothing here claims it.**
 */
import { describe, expect, it } from 'vitest';

import { appendStep, createWorkflow } from '../src/recording/workflow';
import { renderAction, renderSpecFile } from '../src/recording/render';

import type { RecordedStep, RecordedTarget, RecordedWorkflow } from '../src/recording/workflow';
import type { LocatorChain, LocatorStep } from '@playwright-guru/locator-engine';
import type { TargetLanguage } from '@playwright-guru/codegen';

// ─── Fixtures — real model objects, never pseudo-types ─────────────────────

const str = (value: string) => ({ type: 'string' as const, value });

/** A verified target, in the exact shape Slice 3's admission rule admits. */
function target(chain: LocatorChain): RecordedTarget {
  return {
    locator: {
      chain,
      verdict: 'excellent',
      matchCount: 1,
      visibleMatchCount: 1,
      stepCounts: [1],
      rationale: [],
    },
    facts: {
      attributes: { tagName: 'button' },
      ancestors: [],
      indexInParent: 0,
      inShadowRoot: false,
    },
  };
}

const chainOf = (...steps: LocatorStep[]): LocatorChain => ({ steps });

const role = (value: string, name?: string): LocatorStep => ({
  kind: 'role',
  selectorValue: str(value),
  ...(name ? { options: { name: str(name) } } : {}),
});

const kindStep = (kind: LocatorStep['kind'], value: string): LocatorStep => ({
  kind,
  selectorValue: str(value),
});

function step(partial: Partial<RecordedStep> & { kind: RecordedStep['kind'] }): RecordedStep {
  return { timestamp: 0, ...partial };
}

const clickOn = (chain: LocatorChain) => step({ kind: 'click', target: target(chain) });

/** A workflow built through the REAL model, so limits and rules still apply. */
function workflowOf(...steps: RecordedStep[]): RecordedWorkflow {
  let wf = createWorkflow({ id: 'wf-1', url: 'https://example.test/', startedAt: 0 });
  for (const s of steps) wf = appendStep(wf, s).workflow;
  return wf;
}

const ok = (result: ReturnType<typeof renderAction>): string => {
  expect(result.ok, `expected a rendered action, got: ${JSON.stringify(result)}`).toBe(true);
  return result.ok ? result.code : '';
};

const ALL_LANGS: readonly TargetLanguage[] = [
  'typescript',
  'javascript',
  'python_sync',
  'python_async',
  'java',
  'csharp_sync',
  'csharp_async',
];

// ─── 1. The locator comes from codegen, never from the renderer ────────────

describe('WS9 · renderAction delegates the locator to the existing codegen', () => {
  it('renders a verified role click as a Playwright statement', () => {
    const code = ok(renderAction(clickOn(chainOf(role('button', 'Save'))), 'typescript'));
    expect(code).toBe("await page.getByRole('button', { name: 'Save' }).click();");
  });

  it('produces exactly what `generateLocatorCode` produces for the locator half', async () => {
    // The point of the slice: ONE locator renderer. If these ever disagree,
    // a second generator has appeared.
    const { generateLocatorCode } = await import('@playwright-guru/codegen');
    const chain = chainOf(role('button', 'Save'));

    for (const lang of ALL_LANGS) {
      const expected = generateLocatorCode(chain, lang);
      const code = ok(renderAction(clickOn(chain), lang));
      expect(code, `${lang} must embed codegen's own locator`).toContain(expected);
    }
  });

  it('renders every supported strategy through codegen', () => {
    const cases: [LocatorStep, string][] = [
      [role('button', 'Save'), "getByRole('button', { name: 'Save' })"],
      [kindStep('text', 'Save'), "getByText('Save')"],
      [kindStep('label', 'Email'), "getByLabel('Email')"],
      [kindStep('placeholder', 'you@example.com'), "getByPlaceholder('you@example.com')"],
      [kindStep('altText', 'Logo'), "getByAltText('Logo')"],
      [kindStep('title', 'Close'), "getByTitle('Close')"],
      [kindStep('testId', 'save'), "getByTestId('save')"],
    ];
    for (const [locStep, expected] of cases) {
      const code = ok(renderAction(clickOn(chainOf(locStep)), 'typescript'));
      expect(code, `${locStep.kind} must render through codegen`).toContain(expected);
    }
  });

  it('renders a multi-step chain in order', () => {
    const code = ok(
      renderAction(clickOn(chainOf(role('row', 'Jane Doe'), role('button', 'Edit'))), 'typescript'),
    );
    expect(code).toBe(
      "await page.getByRole('row', { name: 'Jane Doe' }).getByRole('button', { name: 'Edit' }).click();",
    );
  });
});

// ─── 2. Every action kind, in every language ───────────────────────────────

describe('WS9 · action kinds', () => {
  const chain = chainOf(kindStep('testId', 't'));

  it('click / dblclick / check / uncheck in TypeScript', () => {
    for (const [kind, suffix] of [
      ['click', '.click();'],
      ['dblclick', '.dblclick();'],
      ['check', '.check();'],
      ['uncheck', '.uncheck();'],
    ] as const) {
      const code = ok(renderAction(step({ kind, target: target(chain) }), 'typescript'));
      expect(code).toBe(`await page.getByTestId('t')${suffix}`);
    }
  });

  it('fill carries the value', () => {
    const s = step({ kind: 'fill', target: target(chain), value: 'hello' });
    expect(ok(renderAction(s, 'typescript'))).toBe("await page.getByTestId('t').fill('hello');");
  });

  it('selectOption carries the value, with per-language method naming', () => {
    const s = step({ kind: 'selectOption', target: target(chain), value: 'b' });
    expect(ok(renderAction(s, 'typescript'))).toContain(".selectOption('b');");
    expect(ok(renderAction(s, 'python_sync'))).toContain('.select_option("b")');
    expect(ok(renderAction(s, 'java'))).toContain('.selectOption("b");');
    expect(ok(renderAction(s, 'csharp_async'))).toContain('.SelectOptionAsync("b");');
  });

  it('goto uses each language’s navigation call and needs no target', () => {
    const s = step({ kind: 'goto', url: 'https://example.test/checkout' });
    expect(ok(renderAction(s, 'typescript'))).toBe(
      "await page.goto('https://example.test/checkout');",
    );
    expect(ok(renderAction(s, 'python_sync'))).toBe('page.goto("https://example.test/checkout")');
    expect(ok(renderAction(s, 'java'))).toBe('page.navigate("https://example.test/checkout");');
    expect(ok(renderAction(s, 'csharp_async'))).toBe(
      'await Page.GotoAsync("https://example.test/checkout");',
    );
  });

  it('await and statement terminators follow each language', () => {
    const s = clickOn(chain);
    expect(ok(renderAction(s, 'typescript')).startsWith('await ')).toBe(true);
    expect(ok(renderAction(s, 'javascript')).startsWith('await ')).toBe(true);
    expect(ok(renderAction(s, 'python_sync')).startsWith('await ')).toBe(false);
    expect(ok(renderAction(s, 'python_async')).startsWith('await ')).toBe(true);
    expect(ok(renderAction(s, 'java')).startsWith('await ')).toBe(false);
    // Playwright .NET exposes only async APIs, so BOTH C# targets await.
    expect(ok(renderAction(s, 'csharp_sync')).startsWith('await ')).toBe(true);
    expect(ok(renderAction(s, 'csharp_async')).startsWith('await ')).toBe(true);

    expect(ok(renderAction(s, 'python_sync')).endsWith(')')).toBe(true);
    expect(ok(renderAction(s, 'java')).endsWith(';')).toBe(true);
  });

  it('renders in ALL seven languages without dropping any', () => {
    // The legacy renderer silently produced '' for python_async and
    // csharp_sync. Every target must produce real code.
    for (const lang of ALL_LANGS) {
      const code = ok(renderAction(clickOn(chain), lang));
      expect(code.length, `${lang} must render`).toBeGreaterThan(10);
    }
  });
});

// ─── 3. Escaping — one policy, codegen's ───────────────────────────────────

describe('WS9 · escaping reuses codegen’s single policy', () => {
  it('escapes quotes, backslashes, newlines and tabs in a fill value', () => {
    const nasty = `it's "quoted" \\ back\nnew\ttab`;
    const s = step({
      kind: 'fill',
      target: target(chainOf(kindStep('testId', 't'))),
      value: nasty,
    });

    const ts = ok(renderAction(s, 'typescript'));
    expect(ts).toContain("\\'");
    expect(ts).toContain('\\\\');
    expect(ts).toContain('\\n');
    expect(ts).toContain('\\t');
    expect(ts, 'a raw newline would break the statement').not.toContain('\n');

    const py = ok(renderAction(s, 'python_sync'));
    expect(py).toContain('\\"');
    expect(py).not.toContain('\n');
  });

  it('escapes the same way codegen escapes a locator value — not a second policy', () => {
    // The legacy renderer's own escaper only replaced quotes, leaving
    // backslashes and newlines to break the output. This must match codegen.
    const value = `a'b"c\\d`;
    const viaAction = ok(
      renderAction(
        step({ kind: 'fill', target: target(chainOf(kindStep('testId', 't'))), value }),
        'typescript',
      ),
    );
    const viaCodegen = ok(renderAction(clickOn(chainOf(kindStep('text', value))), 'typescript'));

    // Both must contain the identically-escaped literal.
    const escaped = viaCodegen.slice(viaCodegen.indexOf("getByText('") + 'getByText('.length);
    const literal = escaped.slice(0, escaped.indexOf("')") + 1);
    expect(viaAction).toContain(literal);
  });

  it('passes Unicode through unharmed', () => {
    const value = 'Grüße 日本語 🎯';
    const code = ok(
      renderAction(
        step({ kind: 'fill', target: target(chainOf(kindStep('testId', 't'))), value }),
        'typescript',
      ),
    );
    expect(code).toContain(value);
  });

  it('escapes a URL in goto', () => {
    const s = step({ kind: 'goto', url: "https://example.test/a'b" });
    expect(ok(renderAction(s, 'typescript'))).toContain("\\'");
  });
});

// ─── 4. THE TRUST BOUNDARY — the renderer is not a second gate ─────────────

describe('WS9 · the renderer projects; it does not judge', () => {
  it('renders `.nth` faithfully when the model carries it', () => {
    // Slice 3 REFUSES an nth chain at capture, so one should never reach here.
    // But if it does, the renderer must not quietly drop `.nth` and present a
    // positional locator as an unqualified one — that would be the renderer
    // inventing confidence the recording never had.
    const chain: LocatorChain = { ...chainOf(role('button', 'Go')), nth: 0 };
    const code = ok(renderAction(clickOn(chain), 'typescript'));
    expect(code).toContain('.nth(0)');
  });

  it('does NOT re-implement Slice 3’s admission rule', () => {
    // The renderer has no probe and no counts to judge with. Admission is a
    // capture-time decision made against a live DOM; re-deciding it here from
    // stored numbers would be a second, weaker gate pretending to be the first.
    const chain: LocatorChain = { ...chainOf(role('button', 'Go')), nth: 0 };
    const ambiguousLooking: RecordedStep = {
      kind: 'click',
      timestamp: 0,
      target: {
        locator: {
          chain,
          verdict: 'ambiguous',
          matchCount: 2,
          visibleMatchCount: 2,
          stepCounts: [2],
          rationale: [],
        },
        facts: {
          attributes: { tagName: 'button' },
          ancestors: [],
          indexInParent: 0,
          inShadowRoot: false,
        },
      },
    };
    const result = renderAction(ambiguousLooking, 'typescript');
    expect(result.ok, 'the renderer renders what it is given').toBe(true);
  });

  it('the admission rule still lives at capture time, not here', async () => {
    // WS9 DL-84 — REPAIRED, and strengthened.
    //
    // This located "capture time" by looking for the `chain.nth` clause inside
    // `src/runtime/recording.ts`. DL-84 moved that clause into
    // `src/recording/admission.ts` so the reason a refusal happened could be
    // reported instead of discarded, and the runtime now DELEGATES to it. The
    // guard broke on where the clause lives, never on whether the claim holds.
    //
    // The claim — the renderer projects and does not judge — is now asserted
    // directly, together with the delegation that makes "one admission
    // authority" true. That is more than the original checked, not less.
    const { readExtFile } = await import('./helpers/surface-source');
    const admission = readExtFile('src/recording/admission.ts');
    const runtime = readExtFile('src/runtime/recording.ts');
    const render = readExtFile('src/recording/render.ts');

    expect(admission, 'the clauses live in the admission module').toMatch(
      /chain\.nth !== undefined/,
    );
    expect(runtime, 'and the runtime asks it rather than repeating it').toMatch(
      /refusalFor\(target\) === null/,
    );
    expect(render, 'the renderer must not gate on counts').not.toMatch(
      /visibleMatchCount|isTrustworthy|refusalFor|verdict ===/,
    );
  });
});

// ─── 5. HONEST REFUSAL — never fabricate Playwright code ───────────────────

describe('WS9 · an unrenderable action is refused, never faked', () => {
  it('refuses a non-goto step with no target instead of guessing a locator', () => {
    const result = renderAction(step({ kind: 'click' }), 'typescript');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('no-target');
  });

  it('never emits `page.locator(...)` — the legacy fabrication', () => {
    const result = renderAction(step({ kind: 'click' }), 'typescript');
    expect(JSON.stringify(result)).not.toContain('page.locator');
  });

  it('refuses a redacted value rather than inventing a secret', () => {
    const s = step({
      kind: 'fill',
      target: target(chainOf(kindStep('testId', 'pw'))),
      redacted: 'password',
    });
    const result = renderAction(s, 'typescript');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toBe('redacted-value');
      expect(result.note).toMatch(/password/);
      expect(result.note).not.toMatch(/hunter2|\.fill\('/);
    }
  });

  it('refuses a goto with no url', () => {
    const result = renderAction(step({ kind: 'goto' }), 'typescript');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('missing-url');
  });

  it('never returns an empty string as if it succeeded', () => {
    for (const s of [step({ kind: 'click' }), step({ kind: 'goto' })]) {
      const result = renderAction(s, 'typescript');
      expect(result.ok).toBe(false);
    }
  });
});

// ─── 6. renderSpecFile ─────────────────────────────────────────────────────

describe('WS9 · renderSpecFile', () => {
  const wf = () =>
    workflowOf(
      step({ kind: 'goto', url: 'https://example.test/', timestamp: 0 }),
      step({ kind: 'click', target: target(chainOf(role('button', 'Save'))), timestamp: 10_000 }),
      step({
        kind: 'fill',
        target: target(chainOf(kindStep('label', 'Email'))),
        value: 'a@b.test',
        timestamp: 20_000,
      }),
    );

  it('emits the established TypeScript spec scaffolding', () => {
    const spec = renderSpecFile(wf(), 'typescript');
    expect(spec).toContain("import { test, expect } from '@playwright/test';");
    expect(spec).toContain("test('recorded test', async ({ page }) => {");
    expect(spec.trimEnd().endsWith('});')).toBe(true);
  });

  it('preserves action order exactly, with none dropped or duplicated', () => {
    const spec = renderSpecFile(wf(), 'typescript');
    const gotoAt = spec.indexOf('page.goto');
    const clickAt = spec.indexOf('.click()');
    const fillAt = spec.indexOf('.fill(');

    expect(gotoAt).toBeGreaterThan(-1);
    expect(clickAt).toBeGreaterThan(gotoAt);
    expect(fillAt).toBeGreaterThan(clickAt);
    expect(spec.split('.click()').length - 1, 'no duplication').toBe(1);
  });

  it('indents the body', () => {
    const spec = renderSpecFile(wf(), 'typescript');
    expect(spec).toContain("  await page.getByRole('button', { name: 'Save' }).click();");
  });

  it('emits per-language scaffolding for every target', () => {
    expect(renderSpecFile(wf(), 'python_sync')).toContain('def test_recorded(page):');
    expect(renderSpecFile(wf(), 'python_async')).toContain('async def test_recorded(page):');
    expect(renderSpecFile(wf(), 'java')).toContain('public void recordedTest() {');
    expect(renderSpecFile(wf(), 'csharp_async')).toContain('public async Task RecordedTestAsync()');
  });

  it('an empty workflow renders nothing, per the established convention', () => {
    const empty = createWorkflow({ id: 'e', url: 'https://example.test/', startedAt: 0 });
    for (const lang of ALL_LANGS) expect(renderSpecFile(empty, lang)).toBe('');
  });

  it('marks a refused action as a comment — never dropped, never faked', () => {
    const wfWithSecret = workflowOf(
      step({ kind: 'click', target: target(chainOf(role('button', 'Login'))), timestamp: 0 }),
      step({
        kind: 'fill',
        target: target(chainOf(kindStep('label', 'Password'))),
        redacted: 'password',
        timestamp: 10_000,
      }),
    );
    const spec = renderSpecFile(wfWithSecret, 'typescript');

    expect(spec, 'the step must still be visible in the flow').toContain('//');
    expect(spec).toMatch(/password/i);
    expect(spec, 'and no value may be invented').not.toMatch(/\.fill\(/);
    // Python comments use a different marker.
    expect(renderSpecFile(wfWithSecret, 'python_sync')).toContain('#');
  });

  it('renders 100 actions in order without exceeding the model’s limits', () => {
    const many: RecordedStep[] = [];
    for (let i = 0; i < 120; i++) {
      many.push(
        step({
          kind: 'click',
          target: target(chainOf(kindStep('testId', `t${i}`))),
          timestamp: i * 10_000,
        }),
      );
    }
    const wfMany = workflowOf(...many);
    expect(wfMany.steps).toHaveLength(100); // Slice 1's hard stop still governs

    const spec = renderSpecFile(wfMany, 'typescript');
    expect(spec.split('.click()').length - 1).toBe(100);
    expect(spec.indexOf("getByTestId('t0')")).toBeLessThan(spec.indexOf("getByTestId('t99')"));
  });
});

// ─── 7. Determinism and purity ─────────────────────────────────────────────

describe('WS9 · the renderer is a pure, deterministic projection', () => {
  it('renderAction is byte-identical across repeated calls', () => {
    const s = step({ kind: 'fill', target: target(chainOf(role('textbox', 'Email'))), value: 'x' });
    for (const lang of ALL_LANGS) {
      expect(ok(renderAction(s, lang))).toBe(ok(renderAction(s, lang)));
    }
  });

  it('renderSpecFile is byte-identical across repeated calls', () => {
    const wf = workflowOf(
      step({ kind: 'goto', url: 'https://example.test/', timestamp: 0 }),
      step({ kind: 'click', target: target(chainOf(role('button', 'Go'))), timestamp: 10_000 }),
    );
    for (const lang of ALL_LANGS) {
      const a = renderSpecFile(wf, lang);
      const b = renderSpecFile(wf, lang);
      expect(a).toBe(b);
      expect(Buffer.byteLength(a, 'utf8')).toBe(Buffer.byteLength(b, 'utf8'));
    }
  });

  it('carries no timestamp, id, url-of-recording or other run-specific value into the output', () => {
    const wf = workflowOf(
      step({
        kind: 'click',
        target: target(chainOf(role('button', 'Go'))),
        timestamp: 1_726_000_000,
      }),
    );
    const spec = renderSpecFile(wf, 'typescript');
    expect(spec).not.toContain('1726000000');
    expect(spec).not.toContain('wf-1');
  });

  it('does not mutate the workflow it renders', () => {
    const wf = workflowOf(
      step({ kind: 'click', target: target(chainOf(role('button', 'Go'))), timestamp: 0 }),
    );
    const before = JSON.stringify(wf);
    renderSpecFile(wf, 'typescript');
    expect(JSON.stringify(wf)).toBe(before);
  });
});

// ─── 8. Architecture guards ────────────────────────────────────────────────

describe('WS9 · the renderer has no runtime, DOM or engine dependency', () => {
  it('imports no DOM, probe, resolver, storage, browser or UI', async () => {
    const { readExtFile } = await import('./helpers/surface-source');
    const code = readExtFile('src/recording/render.ts').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

    expect(code).not.toMatch(/document|window|querySelector|HTMLElement|\bEvent\b/);
    expect(code).not.toMatch(/LiveDomProbe|DomProbe|resolveChain|resolveStep|captureSnapshot/);
    expect(code).not.toMatch(/wxt\/browser|browser\.runtime|browser\.tabs|chrome\./);
    expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB|StorageGateway/);
    expect(code).not.toMatch(/from 'react'|\.tsx|src\/ui\//);
    expect(code).not.toMatch(/\beval\b|new Function|innerHTML|outerHTML/);
    expect(code).not.toMatch(/Date\.now|Math\.random/);
  });

  it('synthesises no selector of its own — codegen owns that', async () => {
    const { readExtFile } = await import('./helpers/surface-source');
    const code = readExtFile('src/recording/render.ts').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    // No hand-built CSS/XPath, no ranking, no scoring, no attribute reading.
    expect(code).not.toMatch(
      /buildCandidateSteps|rankCandidates|scoreCandidate|PLAYWRIGHT_STRATEGY_ORDER/,
    );
    expect(code).not.toMatch(/page\.locator\(/);
    expect(code).not.toMatch(/\[data-|xpath|\/\/\*\[/i);
    // It DOES delegate to the one existing generator.
    expect(code).toMatch(/generateLocatorCode/);
  });

  it('the legacy attribute-based renderer no longer exists at all', async () => {
    // WS9 V1 raw-line migration (DL-82) — STRENGTHENED from coexistence to
    // absence.
    //
    // This used to assert that `src/ui/recording/test-code.ts` still existed,
    // still contained its `page.locator('<tag>')` fabrication, and knew nothing
    // of the verified model — the strongest claim available while deleting it
    // was out of scope. DL-82 measured it dead (`generateTestCode`'s only
    // caller was a panel function with no consumer, fed an array set only to
    // `[]`) and deleted it. "Separate from the fabrication" is now "the
    // fabrication is not in the product", which is strictly stronger and which
    // a future edit cannot undo by quietly re-importing the file.
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { readExtFile, EXT_ROOT } = await import('./helpers/surface-source');

    expect(
      existsSync(join(EXT_ROOT, 'src/ui/recording/test-code.ts')),
      'the legacy fabrication must be gone, not merely unused',
    ).toBe(false);

    // Comments stripped: the claim is about code. This module's own doc comment
    // still cites the legacy generator by name as the cautionary example that
    // explains why the rule exists, and testing prose would test the wrong
    // thing in either direction.
    const renderCode = readExtFile('src/recording/render.ts').replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      '',
    );
    expect(renderCode, 'the new renderer does not import the legacy one').not.toMatch(/test-code/);
    expect(renderCode, 'and never fabricates a locator from a tag name').not.toMatch(
      /page\.locator\(/,
    );
  });
});
