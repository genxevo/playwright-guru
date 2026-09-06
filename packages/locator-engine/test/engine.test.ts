/**
 * WS1 — Domain / Contract Tests · engine.ts (canonical THIRD sub-item).
 *
 * Before this file NO test imported from `../src/engine` — the orchestration
 * layer had zero direct coverage (F-8). These tests pin the public contract of
 * `buildLocatorChain`, `buildLocatorChainFromAttributes`, `getElementDescription`
 * and the `fallbackChain` reached through an empty candidate list.
 *
 * On E9 ("buildLocatorChain calls pickBestUnique twice"): the two calls are on
 * the same pure function over the same array, so the result is identical — a
 * redundant call, not a correctness defect. No source change is made; these
 * tests pin the OBSERVABLE contract (when `.nth(0)` is and is not appended) so
 * any future refactor of that redundancy stays behaviour-preserving.
 *
 * Every assertion PINS current behaviour.
 */

import { describe, expect, it } from 'vitest';

import {
  buildLocatorChain,
  buildLocatorChainFromAttributes,
  getElementDescription,
} from '../src/engine';
import type { ElementAttributes, LocatorKind, LocatorStep } from '../src/types';

const el = (attrs: Partial<ElementAttributes> & { tagName: string }): ElementAttributes => attrs;
const step = (kind: LocatorKind, value = 'x'): LocatorStep => ({
  kind,
  selectorValue: { type: 'string', value },
});
const cand = (kind: LocatorKind, uniqueCount: number, value = 'x') => ({
  step: step(kind, value),
  uniqueCount,
});

// ─── buildLocatorChain — winner selection ───────────────────────────────────

describe('buildLocatorChain · picks the best UNIQUE candidate', () => {
  it('chooses a uniquely-resolving candidate over a higher-listed ambiguous one', () => {
    const chain = buildLocatorChain(el({ tagName: 'button' }), [
      cand('role', 3, 'button'),
      cand('testId', 1, 'btn'),
    ]);
    expect(chain.steps).toHaveLength(1);
    expect(chain.steps[0].kind).toBe('testId');
    expect(chain.nth).toBeUndefined(); // unique → no positional escape hatch
  });

  it('prefers the higher-ranked strategy when several candidates are unique', () => {
    // testId outranks label in the Playwright generator order; both unique here.
    const chain = buildLocatorChain(el({ tagName: 'input' }), [
      cand('label', 1, 'Name'),
      cand('testId', 1, 'input-name'),
    ]);
    expect(chain.steps[0].kind).toBe('testId');
    expect(chain.nth).toBeUndefined();
  });
});

describe('buildLocatorChain · ambiguity handling (.nth)', () => {
  it('appends .nth(0) when no candidate is unique and the winner matches > 1', () => {
    const chain = buildLocatorChain(el({ tagName: 'a' }), [
      cand('role', 4, 'link'),
      cand('text', 2, 'Practice'),
    ]);
    expect(chain.nth).toBe(0);
    expect(chain.steps).toHaveLength(1);
  });

  it('does NOT append .nth(0) when the best candidate matches zero elements', () => {
    // winner.uniqueCount is 0, not > 1 → no positional access is added.
    const chain = buildLocatorChain(el({ tagName: 'div' }), [cand('role', 0, 'button')]);
    expect(chain.nth).toBeUndefined();
  });

  it('does NOT append .nth(0) when the counts are unknown (-1)', () => {
    const chain = buildLocatorChain(el({ tagName: 'div' }), [cand('role', -1, 'button')]);
    expect(chain.nth).toBeUndefined();
  });
});

describe('buildLocatorChain · frame and parent scoping', () => {
  it('carries the frameSelector onto the chain when provided', () => {
    const chain = buildLocatorChain(el({ tagName: 'button' }), [cand('testId', 1, 'b')], {
      frameInfo: { frameSelector: 'iframe#app' },
    });
    expect(chain.frameSelector).toBe('iframe#app');
  });

  it('prepends the parent chain steps before the winning child step', () => {
    const parent = { steps: [step('role', 'row')] };
    const chain = buildLocatorChain(el({ tagName: 'button' }), [cand('role', 1, 'button')], {
      parentChain: parent,
    });
    expect(chain.steps.map((s) => s.selectorValue)).toEqual([
      { type: 'string', value: 'row' },
      { type: 'string', value: 'button' },
    ]);
  });
});

// ─── buildLocatorChain → fallbackChain (empty candidate list) ────────────────

describe('buildLocatorChain · fallbackChain when there are no candidates', () => {
  it('falls back to a role step (with accessible name) when a role resolves', () => {
    const chain = buildLocatorChain(el({ tagName: 'button', innerText: 'Go' }), []);
    expect(chain.steps).toEqual([
      {
        kind: 'role',
        selectorValue: { type: 'string', value: 'button' },
        options: { name: { type: 'string', value: 'Go' } },
      },
    ]);
    expect(chain.nth).toBeUndefined();
  });

  it('falls back to getByText(innerText) for a role-less element with text', () => {
    const chain = buildLocatorChain(el({ tagName: 'div', innerText: 'Hello' }), []);
    expect(chain.steps[0]).toEqual({
      kind: 'text',
      selectorValue: { type: 'string', value: 'Hello' },
    });
  });

  it('falls back to getByTestId for a role-less, text-less element that has a testId', () => {
    const chain = buildLocatorChain(el({ tagName: 'div', testId: 't-1' }), []);
    expect(chain.steps[0]).toEqual({
      kind: 'testId',
      selectorValue: { type: 'string', value: 't-1' },
    });
  });

  it('last resort: getByText(tagName) when nothing else is available', () => {
    const chain = buildLocatorChain(el({ tagName: 'div' }), []);
    expect(chain.steps[0]).toEqual({
      kind: 'text',
      selectorValue: { type: 'string', value: 'div' },
    });
  });

  it('carries the frameSelector through the fallback path too', () => {
    const chain = buildLocatorChain(el({ tagName: 'div' }), [], {
      frameInfo: { frameSelector: 'iframe#f' },
    });
    expect(chain.frameSelector).toBe('iframe#f');
  });
});

// ─── buildLocatorChainFromAttributes — DOM-free convenience wrapper ─────────

describe('buildLocatorChainFromAttributes', () => {
  it('builds from attributes alone and never adds .nth (all counts unknown)', () => {
    const chain = buildLocatorChainFromAttributes(
      el({ tagName: 'input', type: 'text', labelText: 'Name', testId: 'input-name' }),
    );
    // testId ranks first in the generator order; with unknown counts it still wins.
    expect(chain.steps[0].kind).toBe('testId');
    expect(chain.nth).toBeUndefined();
  });

  it('produces a role fallback when the element has a role but no test id', () => {
    const chain = buildLocatorChainFromAttributes(
      el({ tagName: 'h2', innerText: 'Form Controls' }),
    );
    expect(chain.steps[0].kind).toBe('role');
  });

  it('passes the frame info through', () => {
    const chain = buildLocatorChainFromAttributes(el({ tagName: 'button', innerText: 'X' }), {
      frameSelector: 'iframe#x',
    });
    expect(chain.frameSelector).toBe('iframe#x');
  });
});

// ─── getElementDescription — history-pane label ─────────────────────────────

describe('getElementDescription', () => {
  it('formats tag + [type] + first available name, in priority order', () => {
    expect(getElementDescription(el({ tagName: 'input', type: 'text', labelText: 'Email' }))).toBe(
      'input[text]: Email',
    );
    expect(getElementDescription(el({ tagName: 'button', innerText: 'Save' }))).toBe(
      'button: Save',
    );
  });

  it('prefers ariaLabel over labelText/innerText', () => {
    expect(
      getElementDescription(
        el({ tagName: 'input', type: 'checkbox', ariaLabel: 'Agree', labelText: 'x' }),
      ),
    ).toBe('input[checkbox]: Agree');
  });

  it('omits the type hint and the name suffix when neither is present', () => {
    expect(getElementDescription(el({ tagName: 'div' }))).toBe('div');
  });

  it('truncates a long innerText name to 40 characters', () => {
    const long = 'x'.repeat(120);
    const desc = getElementDescription(el({ tagName: 'p', innerText: long }));
    expect(desc).toBe(`p: ${'x'.repeat(40)}`);
  });

  it('falls through to id, then testId, when no textual name exists', () => {
    expect(getElementDescription(el({ tagName: 'div', id: 'main' }))).toBe('div: main');
    expect(getElementDescription(el({ tagName: 'div', testId: 'tid' }))).toBe('div: tid');
  });
});
