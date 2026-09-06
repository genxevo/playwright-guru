/**
 * WS4 — consumer wiring and the no-bypass guard.
 * ============================================================================
 *
 * `storage-gateway.test.ts` proves the gateway behaves. This file proves the
 * product actually goes through it — and keeps going through it. A gateway
 * nothing is obliged to use decays back into scattered `storage.local.set`
 * calls one convenient shortcut at a time, which is exactly the state WS4 was
 * created to end.
 *
 * Evidence level: **STRUCTURAL** (source scan) plus **UNIT** where behaviour
 * is importable. Registering a listener is not the same as Chrome firing it:
 * real `onInstalled`, real `tabs.onRemoved` and real multi-tab behaviour
 * remain **DEFERRED / FUTURE INFRASTRUCTURE** (O4). Nothing here is browser
 * evidence.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ERROR_STATES } from '../src/ui/copy/errors';
import { isWs4Key } from '../src/storage/gateway';
import { LEGACY_KEYS } from '../src/storage/migration';
import { WS4_DESCRIPTORS } from '../src/storage/state';

import {
  readComposed,
  stripComments,
  surfaceComposes,
  surfaceSourceExcluding,
} from './helpers/surface-source';

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

const SIDE_PANEL = stripComments(read('entrypoints/sidepanel/SidePanel.tsx'));
const CONTENT = read('entrypoints/content.ts');
const BACKGROUND = read('entrypoints/background.ts');
const DEVTOOLS_PANEL = stripComments(read('entrypoints/devtools-panel/Panel.tsx'));
/**
 * WS5 — the composed surface legitimately contains WS4's own storage
 * implementation. Questions of the form "does anything BYPASS the gateway"
 * therefore exclude the gateway and its browser adapter, so the guard keeps
 * asking about consumers rather than about the thing being consumed.
 */
const SIDE_PANEL_CONSUMERS = stripComments(
  surfaceSourceExcluding('Side Panel', ['src/storage/', 'src/browser/storage']),
);
const DEVTOOLS_CONSUMERS = stripComments(
  surfaceSourceExcluding('DevTools', ['src/storage/', 'src/browser/storage']),
);
const MESSAGING = read('utils/messaging.ts');

/** The WS4-owned legacy keys. WS9's recording keys are deliberately absent. */
const WS4_LEGACY_KEYS = ['pg_code_buffer', 'pg_pw_lang', 'pg_picker_active', 'pg_last_pick'];

// ─── The gateway is not bypassed ────────────────────────────────────────────

describe('WS4: no consumer touches WS4-owned storage directly', () => {
  it('the side panel never reads or writes a WS4 legacy key', () => {
    for (const key of WS4_LEGACY_KEYS) {
      expect(SIDE_PANEL, `SidePanel still touches ${key}`).not.toContain(key);
    }
  });

  it('the content script never reads or writes a WS4 legacy key', () => {
    for (const key of WS4_LEGACY_KEYS) {
      expect(CONTENT, `content.ts still touches ${key}`).not.toContain(key);
    }
  });

  it('the content script makes no direct browser.storage call at all', () => {
    // Its remaining storage work belongs to the unreachable WS9 recorder, which
    // WS4 must not touch (DL-64 D3) — so the guard is scoped to the picker and
    // pick paths by forbidding the WS4 keys above, and to this: no storage call
    // outside the legacy recorder block.
    // WS9 V1 raw-line migration (DL-82) — STRENGTHENED, and repaired.
    //
    // This sliced the file at the legacy recorder's marker comment and checked
    // only the part above it. DL-82 retired that block, so `indexOf` now
    // returns -1 and `slice(0, -1)` would silently have made this "the whole
    // file bar one character" — a guard that still passes while no longer
    // asserting what it says. The claim is now stated directly and covers the
    // whole file: nothing here reaches storage at all.
    expect(CONTENT).not.toMatch(/browser\.storage\./);
  });

  it('the side panel routes WS4 state through the gateway', () => {
    // WS5 — the entrypoint hands the gateway to the hooks and services rather
    // than calling it inline, so the call sites are named `gateway.…`. The
    // claim is unchanged: WS4 state is reached through the gateway, and the
    // surface composes the one production instance of it.
    expect(SIDE_PANEL).toMatch(
      /(storageGateway|gateway)\.(readGlobal|writeGlobal|readTab|writeTab|watch)/,
    );
    expect(surfaceComposes('Side Panel', 'src/browser/storage.ts')).toBe(true);
  });

  it('the side panel keeps no direct storage call for WS4 state', () => {
    // WS9 V1 raw-line migration (DL-82) — STRENGTHENED from one permitted
    // exception to none.
    //
    // The exception was the legacy `pg_recorded_actions` reset, WS9-owned state
    // O2 kept out of the WS4 architecture. DL-82 measured that call as having
    // no consumer and retired it, so the permitted set is empty. Asserting the
    // empty list rather than looping over it also means this cannot pass
    // vacuously if the matcher ever stops matching.
    const directCalls = [
      ...SIDE_PANEL_CONSUMERS.matchAll(/browser\.storage\.\w+\.\w+\(([^)]*)\)/g),
    ].map((m) => m[0]);
    expect(directCalls, 'the panel reaches storage only through the WS4 gateway').toEqual([]);
  });
});

// ─── content.ts stays lean (bundle discipline) ──────────────────────────────

describe('WS4: the storage implementation stays out of the content script', () => {
  it('content.ts does not import the gateway, the adapter or the descriptors', () => {
    expect(CONTENT).not.toMatch(/from '.*storage\/gateway'/);
    expect(CONTENT).not.toMatch(/from '.*StorageAdapter'/);
    expect(CONTENT).not.toMatch(/from '.*storage\/state'/);
    expect(CONTENT).not.toMatch(/from '.*storage\/migration'/);
  });

  it('content.ts persists by asking the background, over the existing seam', () => {
    expect(CONTENT).toMatch(/type: 'PERSIST_PICK'/);
    expect(CONTENT).toMatch(/type: 'PERSIST_PICKER_STATE'/);
    expect(CONTENT).toMatch(/browser\.runtime\s*\n?\s*\.sendMessage|browser\.runtime\.sendMessage/);
  });

  it('content.ts normalises the ack instead of assuming success', () => {
    expect(CONTENT).toMatch(/normalizeAck/);
  });

  it('no second message bus was introduced', () => {
    for (const source of [CONTENT, BACKGROUND, SIDE_PANEL, DEVTOOLS_PANEL]) {
      expect(source).not.toMatch(/CommandBus|commandBus/);
    }
  });
});

// ─── Background wiring ──────────────────────────────────────────────────────

describe('WS4: the background owns tab identity and the storage lifecycle', () => {
  it('declares the two content-origin message types as known', () => {
    expect(BACKGROUND).toMatch(/'PERSIST_PICK', 'PERSIST_PICKER_STATE'/);
    expect(MESSAGING).toMatch(/PersistPickMessage/);
    expect(MESSAGING).toMatch(/PersistPickerStateMessage/);
  });

  it('takes the tab identity from the sender, never from the message', () => {
    expect(BACKGROUND).toMatch(/contentSenderTabId/);
    expect(BACKGROUND).toMatch(/sender\.tab\?\.id/);
    // A PERSIST message must not carry its own target tab — that would let a
    // page choose which tab's state it writes.
    expect(MESSAGING).not.toMatch(/PersistPickMessage[^}]*targetTabId/);
    expect(MESSAGING).not.toMatch(/PersistPickerStateMessage[^}]*targetTabId/);
  });

  it('rejects a persistence message that did not come from a tab', () => {
    expect(BACKGROUND).toMatch(/UNTRUSTED_SENDER/);
  });

  it('keeps the WS3 sender guard for every extension-UI message', () => {
    expect(BACKGROUND).toMatch(/isFromExtensionUI\(sender\)/);
  });

  it('registers the migration on install and sweeps orphaned tab state', () => {
    expect(BACKGROUND).toMatch(/browser\.runtime\.onInstalled\.addListener/);
    expect(BACKGROUND).toMatch(/migrateToV2/);
    expect(BACKGROUND).toMatch(/sweepOrphans/);
  });

  it('turns tabs.onRemoved into real cleanup, not a log line', () => {
    const listener = BACKGROUND.slice(BACKGROUND.indexOf('browser.tabs.onRemoved.addListener'));
    expect(listener).toMatch(/clearTab\(tabId\)/);
  });

  it('logs counts and codes on migration, never user content', () => {
    const logLine = BACKGROUND.slice(
      BACKGROUND.indexOf('storage migration'),
      BACKGROUND.indexOf('storage migration') + 300,
    );
    expect(logLine).toMatch(/migrated: result\.migrated\.length/);
    expect(logLine).not.toMatch(/result\.migrated,|value|data/);
  });
});

// ─── Failure reaches the user ───────────────────────────────────────────────

describe('WS4: a storage write failure is surfaced, not swallowed', () => {
  it('a failed write raises the error-matrix state on BOTH surfaces', () => {
    // WS5 — the local `setStatusError('STORAGE_WRITE_FAILED')` became a derived
    // state in `usePanel` plus the notice the shared workspace renders, so the
    // rule now holds for DevTools too (O1). Same claim, wider reach.
    for (const [name, src] of [
      ['Side Panel', SIDE_PANEL],
      ['DevTools', DEVTOOLS_PANEL],
    ] as const) {
      expect(src, `${name} must map a failed write to the matrix code`).toMatch(
        /'STORAGE_WRITE_FAILED'|"STORAGE_WRITE_FAILED"/,
      );
    }
  });

  it('that state carries a title, a cause and an action like every other', () => {
    const state = ERROR_STATES.STORAGE_WRITE_FAILED;
    expect(state.title.trim()).not.toBe('');
    expect(state.cause.trim()).not.toBe('');
    expect(state.action.trim()).not.toBe('');
  });

  it('the copy tells the user their work is at risk rather than hiding it', () => {
    expect(ERROR_STATES.STORAGE_WRITE_FAILED.cause.toLowerCase()).toMatch(/not|refused/);
  });

  it('every code-buffer write checks its result — none is fire-and-forget', () => {
    // The pre-WS4 pattern was `void browser.storage.local.set({...})` with no
    // continuation at all. Whatever form the write takes, its result has to be
    // inspected: a bare call with nothing after it is the regression to catch.
    for (const call of [...SIDE_PANEL.matchAll(/writeGlobal\(CODE_BUFFER[\s\S]{0,160}/g)]) {
      expect(call[0], 'a code-buffer write ignores its result').toMatch(/\.then\(|await /);
    }
  });
});

// ─── Boundaries held ────────────────────────────────────────────────────────

describe('WS4: boundaries', () => {
  it('DevTools persistence now goes through the SAME gateway (superseded by WS5 O1)', () => {
    // WS4 (O5) deliberately left the DevTools panel with no persistence at all
    // and this guard pinned that boundary. WS5's O1 decision moved the line:
    // there is ONE user workspace, and DevTools joins it. The guard is not
    // deleted — it is inverted to protect what the owner actually decided, so
    // the panel still cannot grow a private storage path of its own.
    expect(surfaceComposes('DevTools', 'src/browser/storage.ts')).toBe(true);
    expect(surfaceComposes('DevTools', 'src/services/code-workspace.ts')).toBe(true);
    expect(DEVTOOLS_CONSUMERS, 'DevTools must not touch raw storage').not.toMatch(
      /browser\.storage|chrome\.storage/,
    );
  });

  it('the WS9 LEGACY recording keys are neither migrated, cleared nor read by WS4 (O2)', () => {
    // WS9 slice 5B — RE-SCOPED to O2's own words, and checked on all three of
    // its verbs instead of on one spelling.
    //
    // This used to assert that no WS4 descriptor key matched /record/i. DL-66's
    // O2 says something narrower and more precise: "`pg_recording_active` /
    // `pg_recorded_actions` remain WS9-owned and are neither migrated, cleared
    // nor read by WS4." That is a claim about two LEGACY FLAT KEYS, and it is
    // still true. What changed is that the owner authorised WS9 to describe its
    // OWN state through this architecture (DL-78) rather than beside it — the
    // alternative being a second persistence mechanism, which every rule here
    // forbids. So the guard now pins the decision instead of the wording: the
    // legacy keys stay outside WS4 on every path that could reach them.
    const keys = WS4_DESCRIPTORS.map((d) => d.key);
    for (const legacy of ['pg_recording_active', 'pg_recorded_actions']) {
      expect(keys, `${legacy} must not become a WS4 descriptor`).not.toContain(legacy);
      // Not migrated: the migration's own list of keys it will ever touch.
      expect(LEGACY_KEYS, `${legacy} must never be migrated`).not.toContain(legacy);
      // Not cleared: "Clear data" and the sweep act on the `pg:v2:` namespace,
      // and a flat legacy key is not in it.
      expect(isWs4Key(legacy), `${legacy} must be out of reach of Clear data`).toBe(false);
      // Not read: no storage module's CODE names it. Comments may — and do,
      // to explain the boundary — so prose must not be able to fail a guard
      // about behaviour, nor to satisfy one.
      for (const rel of [
        'src/storage/state.ts',
        'src/storage/migration.ts',
        'src/storage/gateway.ts',
      ]) {
        expect(stripComments(read(rel)), `${rel} must not touch ${legacy}`).not.toContain(legacy);
      }
    }
  });

  it('WS9 state that IS WS4-owned follows the WS4 pattern exactly (DL-78)', () => {
    const recording = WS4_DESCRIPTORS.filter((d) => d.key.startsWith('recording-'));
    expect(recording.map((d) => d.key)).toEqual(['recording-observation', 'recording-workflow']);
    for (const descriptor of recording) {
      // Tab-scoped session state, like every other transient per-tab value —
      // which is also what puts it inside the existing tab-close cleanup.
      expect(descriptor.scope).toBe('tab');
      expect(descriptor.area).toBe('session');
      expect(descriptor.defaultValue).toBeNull();
      expect(typeof descriptor.validate).toBe('function');
      expect(descriptor.validate({ nonsense: true })).toBeNull();
    }
  });

  it('no storage code reaches the network, eval or sync storage', () => {
    for (const rel of [
      'src/storage/gateway.ts',
      'src/storage/state.ts',
      'src/storage/migration.ts',
      'src/browser/storage.ts',
    ]) {
      const source = read(rel);
      expect(source).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
      expect(source).not.toMatch(/\beval\(|new Function/);
      expect(source).not.toMatch(/storage\s*\.\s*sync\b/);
    }
  });

  it('the gateway module itself never imports the browser — it is injected', () => {
    expect(read('src/storage/gateway.ts')).not.toMatch(/from 'wxt\/browser'/);
    expect(read('src/storage/migration.ts')).not.toMatch(/from 'wxt\/browser'/);
  });
});
