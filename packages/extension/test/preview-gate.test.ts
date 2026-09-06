/**
 * Pre-v0.1.0 Reliability Gate — P0-1.
 *
 * Two guarantees, both regression tests for a defect that shipped:
 *
 *   P0-1B  An unhandled runtime message must never be reported as success.
 *          The background relay used to `return response ?? { ok: true }`, so a
 *          message the content script had no case for resolved as `undefined`
 *          and was converted into a successful acknowledgement.
 *
 *   P0-1A  The Developer Preview build must not advertise recording.
 *          Recording is WS9. The control existed and — because of P0-1B — its
 *          failure was invisible, so the panel showed a RECORDING banner while
 *          nothing was captured.
 *
 * Together these are the "never lie about recording" guarantee (blueprint
 * §12.3) reduced to the smallest form that fits the current architecture.
 * Neither is recording infrastructure, and neither anticipates WS9's design.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizeAck } from '../utils/messaging';
import { RECORDING_ENABLED } from '../src/config/recording';

import { readComposed } from './helpers/surface-source';

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

// ─── P0-1B: an unhandled message cannot succeed ─────────────────────────────

describe('P0-1B — unhandled messages never acknowledge success', () => {
  it('converts an absent response into an explicit NO_HANDLER failure', () => {
    // `browser.tabs.sendMessage` resolves with `undefined` when the receiver
    // registered a listener but had no case for this message type. That is the
    // exact shape that used to become `{ ok: true }`.
    expect(normalizeAck(undefined)).toEqual({
      ok: false,
      code: 'NO_HANDLER',
      error: 'The page did not handle this request.',
    });
  });

  it('passes a real acknowledgement through unchanged', () => {
    const ack = { ok: true, count: 3 } as const;
    expect(normalizeAck(ack)).toBe(ack);
  });

  it('passes a real failure through unchanged', () => {
    const ack = { ok: false, error: 'Invalid selector' } as const;
    expect(normalizeAck(ack)).toBe(ack);
  });

  it('treats null like undefined, not like a response', () => {
    expect(normalizeAck(null as unknown as undefined).ok).toBe(false);
  });

  it('leaves no synthetic-success fallback anywhere in the background relay', () => {
    const source = read('entrypoints/background.ts');
    // The literal defect, in the two places it appeared.
    expect(source).not.toMatch(/\?\?\s*\{\s*ok:\s*true\s*\}/);
    // And the correction is actually wired in, not merely deleted.
    expect(source).toContain('normalizeAck');
  });
});

// ─── P0-1A: the preview does not advertise recording ────────────────────────

describe('P0-1A — the Developer Preview does not advertise recording', () => {
  it('keeps the recording feature flag off', () => {
    expect(RECORDING_ENABLED).toBe(false);
  });

  it('renders no recording control while the flag is off', () => {
    // WS5 moved the recording control into `entrypoints/sidepanel/
    // RecordingControl.tsx` — moved, not changed: the toggle, its message and
    // its banner went together precisely so that flipping RECORDING_ENABLED
    // restores the previous behaviour rather than a button that renders and
    // does nothing. The composed surface still contains all of it.
    const source = read('entrypoints/sidepanel/SidePanel.tsx');
    expect(source).toContain('RECORDING_ENABLED');

    const controls = source.match(/onClick=\{onToggle\}|onClick=\{toggleRecording\}/g) ?? [];
    expect(controls.length, 'the recording control must still exist, gated').toBeGreaterThan(0);

    // The gate is now an early return in the control itself — strictly stronger
    // than a JSX guard, because the control cannot render ANY markup while the
    // flag is off. Assert exactly that, and that the banner is gated too.
    const control = read('entrypoints/sidepanel/RecordingControl.tsx');
    expect(control, 'the button must refuse to render while the flag is off').toMatch(
      /if\s*\(!RECORDING_ENABLED\)\s*return null;/,
    );

    // WS9 slice 5A — STRENGTHENED, not relaxed.
    //
    // This used to assert `{RECORDING_ENABLED && recording &&` on the banner.
    // Two things about that shape had to change. `recording` was a local
    // boolean the panel set on a START acknowledgement — the exact lie slice 5A
    // exists to remove, so the identifier is gone by design. And the `&&` form
    // was the WEAKER gate: it still rendered the banner's `<style>` sibling
    // while the flag was off. The assertion below requires the same early
    // return the button already uses, for EVERY component in this file, so the
    // banner can emit no markup at all — a strictly stronger claim than the one
    // it replaces, and one no future component here can quietly skip.
    // A React component is capitalised; `useRecording` is a hook and renders
    // nothing, so it is not something the flag can gate.
    const components = [...control.matchAll(/^export function ([A-Z]\w+)\(/gm)].map((m) => m[1]);
    expect(components, 'the button and the banner are both components here').toEqual(
      expect.arrayContaining(['RecordButton', 'RecordingBanner']),
    );
    const gates = [...control.matchAll(/if\s*\(!RECORDING_ENABLED\)\s*return null;/g)];
    expect(
      gates.length,
      'every rendering component must refuse to render while the flag is off',
    ).toBe(components.length);

    // WS9 export — WIDENED to a second file, protecting the same claim.
    //
    // Export exists only because recording does, so an export control that
    // rendered while the flag is off would advertise recording just as loudly
    // as the record button would — and, with `rt.start()` refusing, it would be
    // permanently stuck in its empty state, which is the dead affordance DL-76
    // refused to ship. The identical early-return rule therefore applies here.
    const exportControl = read('entrypoints/sidepanel/ExportControl.tsx');
    const exportComponents = [...exportControl.matchAll(/^export function ([A-Z]\w+)\(/gm)].map(
      (m) => m[1],
    );
    expect(exportComponents, 'the export button and its status line are components').toEqual(
      expect.arrayContaining(['ExportButton', 'ExportStatus']),
    );
    const exportGates = [...exportControl.matchAll(/if\s*\(!RECORDING_ENABLED\)\s*return null;/g)];
    expect(
      exportGates.length,
      'every export component must refuse to render while the flag is off',
    ).toBe(exportComponents.length);

    // WS9 workspace — WIDENED again, for the same reason and by the same rule.
    //
    // The recorded-spec review surface is a third recording affordance: with
    // the flag off no recording can exist, so it would render a permanently
    // empty "Recorded test" section. Rather than repeat the check a third time
    // by hand, every recording-surface file is now held to one rule — each
    // capitalised component in it must refuse to render while the flag is off.
    const RECORDING_SURFACES = ['entrypoints/sidepanel/RecordingWorkspace.tsx'] as const;
    for (const rel of RECORDING_SURFACES) {
      const surface = read(rel);
      const surfaceComponents = [...surface.matchAll(/^export function ([A-Z]\w+)\(/gm)].map(
        (m) => m[1],
      );
      expect(surfaceComponents.length, `${rel} must declare a component`).toBeGreaterThan(0);
      const surfaceGates = [...surface.matchAll(/if\s*\(!RECORDING_ENABLED\)\s*return null;/g)];
      expect(
        surfaceGates.length,
        `every component in ${rel} must refuse to render while the flag is off`,
      ).toBe(surfaceComponents.length);
    }

    // And no recording control may appear anywhere without that flag nearby.
    for (const control of controls) {
      const at = source.indexOf(control);
      const preceding = source.slice(Math.max(0, at - 600), at);
      expect(preceding, 'recording control must be behind RECORDING_ENABLED').toContain(
        'RECORDING_ENABLED',
      );
    }
  });
});
