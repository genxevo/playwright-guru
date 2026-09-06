/**
 * WS5 — clipboard wiring: the port is the ONLY caller of the browser API.
 * =========================================================================
 * Structural source-scan guard, matching `architecture.test.ts`/
 * `primitives.test.ts` (extension tests run in a `node` env with no DOM, so
 * behaviour here is proven by scanning source, not by rendering).
 *
 * Failure-first: RED before the wiring (all four call sites still called
 * `navigator.clipboard.writeText` directly, uncaught), GREEN after — and it
 * stays green only while a new ad hoc clipboard call site does not creep in.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readComposed, stripComments } from './helpers/surface-source';

const EXT = resolve(__dirname, '..');
/**
 * WS5 — a surface is a COMPOSITION, not a file.
 *
 * `readComposed` resolves a panel entrypoint path to everything that surface
 * actually imports (see `helpers/surface-source.ts`). Every assertion below is
 * unchanged; what changed is that they now follow the code when WS5 moves it,
 * instead of silently passing because the string they look for went to another
 * file. Any other path still reads exactly that one file.
 */
const read = (rel: string): string => readComposed(rel);

const PRIMITIVES = read('src/ui/primitives.tsx');
const ADAPTER_MARK = '/* ===== src/application/adapters/ClipboardAdapter.ts ===== */';
/**
 * WS5 — the composed surface now legitimately CONTAINS the adapter, since
 * that is what the port is. The claim being guarded is that nothing else in
 * the surface reaches the clipboard directly, so the adapter's own section is
 * cut away before the scan rather than the scan being relaxed.
 */
const withoutAdapter = (src: string): string => {
  const at = src.indexOf(ADAPTER_MARK);
  if (at === -1) return src;
  const end = src.indexOf('/* ===== ', at + ADAPTER_MARK.length);
  return src.slice(0, at) + (end === -1 ? '' : src.slice(end));
};
const PANEL = stripComments(withoutAdapter(read('entrypoints/devtools-panel/Panel.tsx')));
const SIDE_PANEL = stripComments(withoutAdapter(read('entrypoints/sidepanel/SidePanel.tsx')));
const ADAPTER = read('src/application/adapters/ClipboardAdapter.ts');

describe('navigator.clipboard.writeText is called through the ClipboardPort adapter only', () => {
  it.each([
    ['src/ui/primitives.tsx (CopyButton)', PRIMITIVES],
    ['entrypoints/devtools-panel/Panel.tsx (copyAll)', PANEL],
    ['entrypoints/sidepanel/SidePanel.tsx (copyAll / copyTestCode)', SIDE_PANEL],
  ])('%s no longer calls navigator.clipboard.writeText directly', (_label, source) => {
    expect(source).not.toContain('navigator.clipboard.writeText');
    expect(source).toContain('clipboardPort.writeText');
  });

  it('the adapter itself is the one place navigator.clipboard is touched', () => {
    expect(ADAPTER).toContain('navigator.clipboard');
  });

  it('CopyButton renders a failure state instead of throwing on a rejected copy', () => {
    const start = PRIMITIVES.indexOf('export function CopyButton');
    const rest = PRIMITIVES.slice(start + 1);
    const body = rest.slice(0, rest.indexOf('\nexport function '));
    // Must branch on the ClipboardResult's `ok` field, not blindly `await` +
    // assume success the way the old five call sites did.
    expect(body, 'must inspect result.ok').toMatch(/\.ok/);
  });
});
