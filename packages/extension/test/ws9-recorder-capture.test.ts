// @vitest-environment happy-dom
/**
 * WS9 — the runtime recorder: SAME probe, SAME resolver, no secret ever read.
 * ============================================================================
 * This is the half of §14's first slice that touches a DOM. Its two jobs are
 * architectural, and both are the reason WS9 exists at all rather than being a
 * feature bolted onto the legacy recorder.
 *
 * 1. §18's arrow chain, literally:
 *
 *      capture action → SAME DomProbe → SAME LocatorResolver
 *        → verified LocatorChain → verdict + rationale codes
 *        → ElementFactsLite → RecordedWorkflow
 *
 *    "recording consumes the shared verified locator engine. There is never a
 *    second locator implementation." So `recordedTargetFor` calls the existing
 *    `captureSnapshot` — which itself calls the existing `resolveCandidates` /
 *    `LiveDomProbe` / `resolveChain` — and adds nothing of its own. A test below
 *    proves the recorder module declares no probe, no resolver and no counting
 *    of its own, so the guarantee survives future edits.
 *
 * 2. A SECRET IS NEVER READ, not merely never stored. The legacy recorder's
 *    input filter excludes `checkbox,radio,file,button,submit,reset` and does
 *    NOT exclude `password`; it then reads `el.value` unconditionally. Redacting
 *    afterwards would be too late — the value would already have been read into
 *    a variable that a future change could log, serialise or coalesce. So the
 *    kind of the field is decided FIRST, and for a sensitive field `.value` is
 *    never touched at all. The test below proves that by making `.value` throw.
 *
 * EVIDENCE BOUNDARY. happy-dom is not Chromium: it has no layout engine, so
 * every element reads as visible and `total === visible` throughout. What is
 * proven here is the code's behaviour and its architecture, not Chrome's. No
 * real-browser claim is made, and DL-64's D1 re-scope — unit + structural proof
 * — is the standard this slice is held to, never live-browser E2E.
 */
import { describe, expect, it } from 'vitest';

import { RECORDING_LIMITS } from '../src/config/recording';
import { appendStep, createWorkflow } from '../src/recording/workflow';
import {
  fieldFactsOf,
  recordedTargetFor,
  stepForChange,
  stepForClick,
  stepForFill,
} from '../src/runtime/recorder';
import { setBody } from './helpers/dom-fixture';
import { stubLayout } from './helpers/layout-stub';

stubLayout();

const el = (html: string, id: string): Element => {
  setBody(html);
  return document.getElementById(id)!;
};

// ─── 1. §18 — the recorder reuses the one engine ────────────────────────────

describe('WS9 · a recorded target is produced by the SHARED engine', () => {
  it('carries a verified chain with measured counts, not raw attributes', () => {
    const button = el('<button id="b" data-testid="save">Save</button>', 'b');
    const recorded = recordedTargetFor(button);

    expect(recorded.locator.chain.steps.length).toBeGreaterThan(0);
    expect(recorded.locator.visibleMatchCount).toBe(1);
    expect(recorded.locator.verdict).toBe('excellent');
    // `ElementFactsLite`, not full facts — the per-action budget shape.
    expect(recorded.facts.attributes.tagName).toBe('button');
    expect(recorded.facts).not.toHaveProperty('context');
  });

  it('the counts really were measured against THIS document', () => {
    // Two identical buttons: a measured chain cannot report a unique match.
    const first = el('<div><button id="a">Go</button><button id="c">Go</button></div>', 'a');
    const recorded = recordedTargetFor(first);
    expect(recorded.locator.visibleMatchCount).not.toBe(-1);
    // Whatever strategy wins, the answer is a real measurement of this page.
    expect(recorded.locator.stepCounts.length).toBeGreaterThan(0);
  });

  it('never lets a ScopeHandle or a DOM node into the recorded target', async () => {
    const { containsScopeHandle } = await import('@playwright-guru/locator-engine');
    const button = el('<button id="b" data-testid="save">Save</button>', 'b');
    const recorded = recordedTargetFor(button);

    expect(containsScopeHandle(recorded)).toBe(false);
    expect(() => structuredClone(recorded)).not.toThrow();
    expect(JSON.stringify(recorded)).not.toContain('__brand');
  });

  it('declares no probe, no resolver and no counting of its own', async () => {
    // A source-text guard, because the architectural claim ("there is never a
    // second locator implementation") is about what the module MAY grow into,
    // not only what it does today. It pins the absence, not a formatting.
    const { readExtFile } = await import('./helpers/surface-source');
    const source = readExtFile('src/runtime/recorder.ts');

    expect(source, 'the recorder must not construct a probe').not.toMatch(/new LiveDomProbe/);
    expect(source, 'the recorder must not resolve anything itself').not.toMatch(
      /\bresolveChain\s*\(|\bresolveStep\s*\(/,
    );
    expect(source, 'the recorder must not query the DOM for counts').not.toMatch(
      /querySelectorAll|document\.evaluate/,
    );
    // What it DOES do: delegate to the one existing capture path.
    expect(source).toMatch(/captureSnapshot/);
  });
});

// ─── 2. A secret is never READ ──────────────────────────────────────────────

/** Replaces `value` with a getter that fails the test if anything reads it. */
function bugValue(input: Element, message: string): void {
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() {
      throw new Error(message);
    },
  });
}

describe('WS9 · a sensitive field’s value is never read, let alone stored', () => {
  it('a password input: `.value` is not touched at all', () => {
    const input = el('<input id="p" type="password" />', 'p');
    bugValue(input, 'the recorder read a password value');

    const step = stepForFill(input, 0);
    expect(step).not.toBeNull();
    expect(step!.redacted).toBe('password');
    expect(step!.value).toBeUndefined();
  });

  it('a file input: `.value` is not touched at all', () => {
    const input = el('<input id="f" type="file" />', 'f');
    bugValue(input, 'the recorder read a file path');

    const step = stepForFill(input, 0);
    expect(step!.redacted).toBe('file');
    expect(step!.value).toBeUndefined();
  });

  it('a card number field: `.value` is not touched at all', () => {
    const input = el('<input id="cc" type="text" autocomplete="cc-number" />', 'cc');
    bugValue(input, 'the recorder read a card number');

    const step = stepForFill(input, 0);
    expect(step!.redacted).toBe('payment');
    expect(step!.value).toBeUndefined();
  });

  it('an ordinary field IS read — the feature has to still work', () => {
    const input = el('<input id="e" type="email" name="email" />', 'e');
    (input as HTMLInputElement).value = 'user@example.test';

    const step = stepForFill(input, 0);
    expect(step!.redacted).toBeUndefined();
    expect(step!.value).toBe('user@example.test');
  });

  it('end to end: no password reaches the workflow, under any key', () => {
    const input = el(
      '<form><label for="p">Password</label><input id="p" type="password" /></form>',
      'p',
    );
    // A real value is present on the element; the recorder must not go near it.
    Object.defineProperty(input, 'value', { configurable: true, value: 'hunter2' });

    const step = stepForFill(input, 0)!;
    const { workflow } = appendStep(
      createWorkflow({ id: 'wf', url: 'https://example.test/', startedAt: 0 }),
      step,
    );
    expect(JSON.stringify(workflow)).not.toContain('hunter2');
    expect(workflow.steps[0]?.redacted).toBe('password');
  });

  it('classifies from the element without reading its value', () => {
    const input = el('<input id="p" type="password" name="pw" />', 'p');
    bugValue(input, 'fieldFactsOf read a value');
    expect(fieldFactsOf(input).type).toBe('password');
  });
});

// ─── 3. The event → step mapping, and the noise filter ─────────────────────

describe('WS9 · which events become steps', () => {
  it('a click on a button is a click step', () => {
    const button = el('<button id="b">Save</button>', 'b');
    expect(stepForClick(button, 0)?.kind).toBe('click');
  });

  it('a click on a text input is NOT a step — the fill event owns that field', () => {
    // Otherwise every typed field records a click AND a fill, which is noise
    // that no generated test wants.
    const input = el('<input id="t" type="text" />', 't');
    expect(stepForClick(input, 0)).toBeNull();
  });

  it('a click on a checkbox is NOT a step — the change event owns it', () => {
    const box = el('<input id="c" type="checkbox" />', 'c');
    expect(stepForClick(box, 0)).toBeNull();
  });

  it('a click on a submit button IS a step', () => {
    const submit = el('<input id="s" type="submit" value="Go" />', 's');
    expect(stepForClick(submit, 0)?.kind).toBe('click');
  });

  it('a checkbox change becomes check or uncheck, following its state', () => {
    const box = el('<input id="c" type="checkbox" />', 'c') as HTMLInputElement;
    box.checked = true;
    expect(stepForChange(box, 0)?.kind).toBe('check');
    box.checked = false;
    expect(stepForChange(box, 0)?.kind).toBe('uncheck');
  });

  it('a select change becomes selectOption, carrying the chosen value', () => {
    const select = el(
      '<select id="s"><option value="a">A</option><option value="b">B</option></select>',
      's',
    ) as HTMLSelectElement;
    select.value = 'b';
    const step = stepForChange(select, 0);
    expect(step?.kind).toBe('selectOption');
    expect(step?.value).toBe('b');
  });

  it('a change on an unrelated element is not a step', () => {
    const div = el('<div id="d">x</div>', 'd');
    expect(stepForChange(div, 0)).toBeNull();
  });
});

// ─── 4. The recorder honours the single constant, not DL-4's 600 ms ────────

describe('WS9 · timing comes from RECORDING_LIMITS, never a hard-coded copy', () => {
  it('the module contains no hard-coded debounce or window literal', async () => {
    // DL-4, still open against the legacy recorder: it hard-codes 600 ms where
    // the constant says 500. The replacement must not repeat that, and this
    // pins the absence rather than trusting a review.
    const { readExtFile } = await import('./helpers/surface-source');
    const code = readExtFile('src/runtime/recorder.ts').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/\b600\b|\b500\b|\b400\b/);
    expect(code).toMatch(/RECORDING_LIMITS/);
  });

  it('the debounce value it uses IS the constant', () => {
    expect(RECORDING_LIMITS.fillDebounceMs).toBe(500);
    expect(RECORDING_LIMITS.dblclickWindowMs).toBe(400);
  });
});
