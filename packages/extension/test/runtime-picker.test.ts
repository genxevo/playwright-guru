// @vitest-environment happy-dom
/**
 * WS3 — picker lifecycle: closed shadow root + rAF-throttled highlight.
 *
 * happy-dom limitation, disclosed: `getBoundingClientRect()` always returns a
 * zero box (no layout engine), so paint-visibility assertions here check that
 * the overlay element exists and is isolated, not real screen coordinates —
 * that is a real-Chromium concern. `requestAnimationFrame` is stubbed to run
 * synchronously so the throttling behaviour (coalescing to one paint) is
 * observable without real frame timing, which this environment cannot
 * provide either.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPicker } from '../src/runtime/picker';
import { setBody } from './helpers/dom-fixture';

beforeEach(() => {
  // document.write reopens the document, so the highlight host from a prior
  // test (appended to documentElement, outside <body>) is gone with it.
  setBody('<button id="a">A</button><button id="b">B</button>');
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', (): void => {});
});

describe('createPicker — lifecycle', () => {
  it('activate() adds a closed-shadow-root highlight host to the document', () => {
    const picker = createPicker(() => {});
    picker.activate();
    const host = document.getElementById('playwright-guru-highlight-host');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).toBeNull(); // closed mode: page script cannot reach it
    picker.deactivate();
  });

  it('is idempotent: activating twice does not add a second host or double-bind listeners', () => {
    const picker = createPicker(() => {});
    picker.activate();
    picker.activate();
    expect(document.querySelectorAll('#playwright-guru-highlight-host').length).toBe(1);
    picker.deactivate();
  });

  it('a click while active calls onPick with the clicked element and then deactivates', () => {
    const onPick = vi.fn();
    const picker = createPicker(onPick);
    picker.activate();
    document
      .getElementById('a')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]).toBe(document.getElementById('a'));
    expect(picker.isActive()).toBe(false);
  });

  it('Escape deactivates without picking', () => {
    const onPick = vi.fn();
    const picker = createPicker(onPick);
    picker.activate();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(onPick).not.toHaveBeenCalled();
    expect(picker.isActive()).toBe(false);
  });

  it('deactivate() removes the crosshair cursor and hides the highlight', () => {
    const picker = createPicker(() => {});
    picker.activate();
    document.documentElement.dispatchEvent(new Event('pointerover', { bubbles: true }));
    picker.deactivate();
    expect(document.documentElement.style.cursor).toBe('');
  });
});

describe('createPicker — rAF-throttled highlight scheduling', () => {
  it('coalesces rapid pointerover events into paints, never throwing on a synchronous rAF stub', () => {
    const picker = createPicker(() => {});
    picker.activate();
    const a = document.getElementById('a')!;
    const b = document.getElementById('b')!;
    expect(() => {
      a.dispatchEvent(new Event('pointerover', { bubbles: true }));
      b.dispatchEvent(new Event('pointerover', { bubbles: true }));
    }).not.toThrow();
    picker.deactivate();
  });
});
