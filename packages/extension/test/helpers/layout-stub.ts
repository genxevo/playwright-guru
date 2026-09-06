/**
 * happy-dom has no layout engine: `getBoundingClientRect()` always returns a
 * zero box, which would make every WS3 live-probe test report zero VISIBLE
 * matches regardless of what the fixture actually looks like (real total/
 * visible distinctions are the whole point of `LiveDomProbe`).
 *
 * This is a disclosed, deliberate stand-in, not a fabrication of real-browser
 * evidence: it approximates layout using only what happy-dom CAN compute
 * correctly (computed `display`/`visibility` from inline styles), matching
 * the same `display:none` collapses descendants / zero box rule
 * `visibility.ts`'s conformance-verified predicate documents. It does not,
 * and cannot, prove real Chromium layout — that remains a
 * `test/conformance` (real Playwright) concern.
 */
export function stubLayout(): void {
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    let node: Element | null = this;
    while (node) {
      const style = window.getComputedStyle(node as HTMLElement);
      if (style.display === 'none') return rect(0, 0);
      node = node.parentElement;
    }
    return rect(10, 10);
  };
}

function rect(width: number, height: number): DOMRect {
  return {
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON() {
      return this;
    },
  } as DOMRect;
}
