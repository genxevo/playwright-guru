// @vitest-environment happy-dom
/**
 * WS2 item 5 — dev-only primitive showcase (?showcase=1).
 * ======================================================
 *
 * Two guarantees:
 *
 *   1. DEMONSTRATION. The `Showcase` renders every shared primitive so a
 *      developer can review appearance + accessibility (real happy-dom render).
 *
 *   2. ISOLATION (failure-first). The showcase must never reach the shipped
 *      product. The side-panel entrypoint gates its dynamic import behind BOTH
 *      `import.meta.env.DEV` (→ Vite drops it from the production build) and the
 *      `?showcase=1` query param (→ normal panel behaviour is untouched). This
 *      source guard was RED before the gate was added and GREEN after; a
 *      complementary one-time check confirms the production `.output` carries no
 *      showcase code (recorded in the item-5 report, not as a build-coupled
 *      test).
 */
import { StrictMode, createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Showcase } from '../src/ui/showcase';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EXT = resolve(__dirname, '..');

// ─── 1. The showcase demonstrates every primitive ────────────────────────────

describe('Showcase renders the shared primitives for review', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows the buttons, the notice, an N/A row and the accessible Tabs', () => {
    act(() => root.render(createElement(StrictMode, null, createElement(Showcase))));

    // Interactive primitives (CopyButton, AddButton) + the Tabs tablist buttons.
    expect(container.querySelectorAll('button').length).toBeGreaterThanOrEqual(2);
    // The Tabs primitive is present with its full role set.
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="tab"]').length).toBe(3);
    expect(container.querySelector('[role="tabpanel"]')).not.toBeNull();
    // The unverified notice text reached the page (verbatim from the constant).
    expect(container.textContent).toContain('Verify Selector');
    // The N/A row label.
    expect(container.textContent).toContain('getByRole');
  });
});

// ─── 2. The showcase is dev-only and cannot leak into the product ────────────

describe('the showcase is gated so it never ships', () => {
  const mainSrc = readFileSync(join(EXT, 'entrypoints/sidepanel/main.tsx'), 'utf8');

  it('the side-panel entrypoint gates the showcase behind import.meta.env.DEV', () => {
    expect(mainSrc, 'the dev gate is what lets Vite drop the showcase from production').toMatch(
      /import\.meta\.env\.DEV/,
    );
  });

  it('the gate also requires the ?showcase=1 query param', () => {
    expect(mainSrc).toMatch(/showcase/);
    expect(mainSrc, 'must read the query string, not always render').toMatch(
      /location\.search|URLSearchParams/,
    );
  });

  it('the showcase is loaded lazily (dynamic import), never statically', () => {
    expect(mainSrc, 'a static top-level import would bundle it into production').not.toMatch(
      /^import\s+\{[^}]*Showcase[^}]*\}\s+from/m,
    );
    expect(mainSrc).toMatch(/import\(\s*['"][^'"]*showcase['"]\s*\)/);
  });
});
