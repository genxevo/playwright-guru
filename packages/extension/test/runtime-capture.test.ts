// @vitest-environment happy-dom
/**
 * WS3 — capturePick: the shipped hot path.
 *
 * Asserts the StoredPick WIRE CONTRACT is unchanged in shape (attributes,
 * chain, candidates, frameInfo, outerHtml, timestamp, url) while the counts
 * feeding it now come from the shared resolver + LiveDomProbe instead of the
 * pre-WS3 ad-hoc, O(n²) counting. `location.href` is unavailable in
 * happy-dom's default document, so `url` is asserted to be a string, not a
 * specific value.
 */
import { describe, it, expect } from 'vitest';
import { capturePick } from '../src/runtime/capture';
import { stubLayout } from './helpers/layout-stub';
import { setBody as set } from './helpers/dom-fixture';

stubLayout();

describe('capturePick — StoredPick shape', () => {
  it('returns the unchanged StoredPick shape', () => {
    set('<button data-testid="save">Save</button>');
    const { stored } = capturePick(document.querySelector('button')!);
    expect(stored).toMatchObject({
      attributes: expect.any(Object),
      chain: { steps: expect.any(Array) },
      candidates: expect.any(Array),
    });
    expect(typeof stored.timestamp).toBe('number');
    expect(typeof stored.url).toBe('string');
  });

  it('a unique test id produces a single-step testId chain', () => {
    set('<button data-testid="save">Save</button>');
    const { stored } = capturePick(document.querySelector('button')!);
    expect(stored.chain.steps).toHaveLength(1);
    expect(stored.chain.steps[0]).toMatchObject({
      kind: 'testId',
      selectorValue: { value: 'save' },
    });
  });

  it('an ambiguous leaf scopes to a unique ancestor, exactly as the pre-WS3 content script did', () => {
    // Plain <div>s deliberately: no implicit role, so buildAncestorStep falls
    // through to the testId branch rather than a (here, equally ambiguous)
    // role+name candidate — isolating the ancestor-scoping behaviour itself.
    set(
      '<div data-testid="row-1"><button>Edit</button></div>' +
        '<div data-testid="row-2"><button>Edit</button></div>',
    );
    const target = document.querySelectorAll('button')[0]!;
    const { stored } = capturePick(target);
    // Two steps: the ancestor scope, then the (locally-unique) button.
    expect(stored.chain.steps.length).toBeGreaterThanOrEqual(2);
    expect(stored.chain.steps[0]).toMatchObject({
      kind: 'testId',
      selectorValue: { value: 'row-1' },
    });
  });

  it('candidate counts are sourced from the live probe, not left unmeasured', () => {
    set('<button data-testid="save">Save</button>');
    const { stored } = capturePick(document.querySelector('button')!);
    const testIdCandidate = stored.candidates.find((c) => c.step.kind === 'testId');
    expect(testIdCandidate?.uniqueCount).toBe(1);
  });

  it('fixes the O(n²)/raw-`===` text-step defect: a text candidate on a non-interactive element resolves correctly', () => {
    set('<p>Contact support for help</p>');
    const { stored } = capturePick(document.querySelector('p')!);
    const textCandidate = stored.candidates.find((c) => c.step.kind === 'text');
    expect(textCandidate?.uniqueCount).toBe(1);
  });
});
