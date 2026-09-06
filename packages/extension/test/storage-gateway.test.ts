/**
 * WS4 — storage gateway contract, failure-first.
 * ============================================================================
 *
 * Written BEFORE the implementation, against the architecture WS4 is required
 * to produce: one namespaced, versioned, validated gateway with a global /
 * tab-scoped split across `local` and `session`.
 *
 * Evidence level: **UNIT** against a deterministic fake backend, plus the
 * structural guards in `storage-consumers.test.ts`. Real Chrome multi-tab,
 * real `onInstalled` and real quota behaviour are **DEFERRED / FUTURE
 * INFRASTRUCTURE** (owner decision O4) — nothing here is browser evidence and
 * nothing here claims to be.
 *
 * Failure coverage: F1 unavailable · F2 write failure · F3 read failure ·
 * F4 quota · F5 malformed · F6 unknown version · F8 partial object ·
 * F9 two-tab independence · F10 tab removal · F12 flush before close ·
 * F13 durable state survives reload · F15 empty/default · F16 stale tab state ·
 * F17 area filtering · F18 unknown extra fields.
 */

import { describe, expect, it } from 'vitest';

import {
  createStorageGateway,
  STORAGE_NAMESPACE,
  STORAGE_SCHEMA_VERSION,
  globalKey,
  tabKey,
  tabScopePrefix,
} from '../src/storage/gateway';
import { CODE_BUFFER, LAST_PICK, PICKER_ACTIVE, PW_LANG } from '../src/storage/state';
import { FakeChangeSource, FakeStorageArea } from './helpers/fake-storage';

/** The minimum shape LAST_PICK's validator recognises as a real pick. */
const FAKE_PICK = {
  attributes: { tagName: 'button' },
  chain: { steps: [] },
  candidates: [],
  timestamp: 0,
  url: 'https://example.test/',
} as unknown as import('../utils/messaging').StoredPick;

function build(seedLocal: Record<string, unknown> = {}, seedSession: Record<string, unknown> = {}) {
  const local = new FakeStorageArea(seedLocal);
  const session = new FakeStorageArea(seedSession);
  const changes = new FakeChangeSource();
  const gateway = createStorageGateway({ local, session, changes });
  return { local, session, changes, gateway };
}

// ─── Namespace, version, envelope ───────────────────────────────────────────

describe('WS4: every value is namespaced and versioned', () => {
  it('writes global state under a namespaced, versioned key', async () => {
    const { local, gateway } = build();
    await gateway.writeGlobal(PW_LANG, 'python');
    const key = globalKey(PW_LANG.key);
    expect(key.startsWith(`${STORAGE_NAMESPACE}:`)).toBe(true);
    expect(key).toContain(String(STORAGE_SCHEMA_VERSION));
    expect(local.has(key)).toBe(true);
  });

  it('stores a version envelope, not a bare value', async () => {
    const { local, gateway } = build();
    await gateway.writeGlobal(PW_LANG, 'python');
    expect(local.snapshot()[globalKey(PW_LANG.key)]).toEqual({
      v: STORAGE_SCHEMA_VERSION,
      data: 'python',
    });
  });

  it('never writes a legacy flat key', async () => {
    const { local, session, gateway } = build();
    await gateway.writeGlobal(CODE_BUFFER, ['a']);
    await gateway.writeTab(PICKER_ACTIVE, 101, true);
    for (const written of [...Object.keys(local.snapshot()), ...Object.keys(session.snapshot())]) {
      expect(written.startsWith('pg_')).toBe(false);
    }
  });
});

// ─── Storage area split (O2 / §8) ───────────────────────────────────────────

describe('WS4: global durable state and tab session state use different areas', () => {
  it('puts the language preference and the code buffer in local', async () => {
    const { local, session, gateway } = build();
    await gateway.writeGlobal(PW_LANG, 'java');
    await gateway.writeGlobal(CODE_BUFFER, ['line']);
    expect(Object.keys(local.snapshot())).toHaveLength(2);
    expect(Object.keys(session.snapshot())).toHaveLength(0);
  });

  it('puts picker state and the last pick in session', async () => {
    const { local, session, gateway } = build();
    await gateway.writeTab(PICKER_ACTIVE, 101, true);
    expect(Object.keys(session.snapshot())).toHaveLength(1);
    expect(Object.keys(local.snapshot())).toHaveLength(0);
  });

  it('declares the area on the descriptor, so scope cannot drift from area', () => {
    expect(PW_LANG.area).toBe('local');
    expect(CODE_BUFFER.area).toBe('local');
    expect(PICKER_ACTIVE.area).toBe('session');
    expect(LAST_PICK.area).toBe('session');
    expect(PW_LANG.scope).toBe('global');
    expect(CODE_BUFFER.scope).toBe('global');
    expect(PICKER_ACTIVE.scope).toBe('tab');
    expect(LAST_PICK.scope).toBe('tab');
  });
});

// ─── F9 — two tabs are independent ──────────────────────────────────────────

describe('WS4 / EXIT 4: two logical tabs keep independent state', () => {
  it('tab 101 and tab 202 do not share picker state', async () => {
    const { gateway } = build();
    await gateway.writeTab(PICKER_ACTIVE, 101, true);
    await gateway.writeTab(PICKER_ACTIVE, 202, false);
    expect((await gateway.readTab(PICKER_ACTIVE, 101)).value).toBe(true);
    expect((await gateway.readTab(PICKER_ACTIVE, 202)).value).toBe(false);
  });

  it('writes to one tab leave the other tab byte-for-byte alone', async () => {
    const { session, gateway } = build();
    await gateway.writeTab(PICKER_ACTIVE, 202, true);
    const before = session.snapshot()[tabKey(202, PICKER_ACTIVE.key)];
    await gateway.writeTab(PICKER_ACTIVE, 101, false);
    expect(session.snapshot()[tabKey(202, PICKER_ACTIVE.key)]).toEqual(before);
  });

  it('subscriptions are per tab — tab 202 is not notified about tab 101', () => {
    const { changes, gateway } = build();
    const seen: unknown[] = [];
    gateway.watch(PICKER_ACTIVE, 202, (v) => seen.push(v));
    changes.emit(
      { [tabKey(101, PICKER_ACTIVE.key)]: { newValue: { v: STORAGE_SCHEMA_VERSION, data: true } } },
      'session',
    );
    expect(seen).toEqual([]);
  });

  it('a tab-scoped descriptor cannot be read without a tab identity', async () => {
    const { gateway } = build();
    await expect(gateway.readGlobal(PICKER_ACTIVE as never)).rejects.toThrow();
  });

  it('a global descriptor cannot accidentally inherit a tab identity', async () => {
    const { gateway } = build();
    await expect(gateway.writeTab(CODE_BUFFER as never, 101, [])).rejects.toThrow();
  });
});

// ─── F10 / F16 — tab cleanup ────────────────────────────────────────────────

describe('WS4: closing one tab clears only that tab', () => {
  it('clearTab(101) removes 101 and leaves 202 intact', async () => {
    const { gateway, session } = build();
    await gateway.writeTab(PICKER_ACTIVE, 101, true);
    await gateway.writeTab(LAST_PICK, 101, FAKE_PICK);
    await gateway.writeTab(PICKER_ACTIVE, 202, true);
    await gateway.clearTab(101);
    expect(Object.keys(session.snapshot()).some((k) => k.startsWith(tabScopePrefix(101)))).toBe(
      false,
    );
    expect((await gateway.readTab(PICKER_ACTIVE, 202)).value).toBe(true);
  });

  it('reports a cleanup failure instead of silently succeeding', async () => {
    const { gateway, session } = build();
    await gateway.writeTab(PICKER_ACTIVE, 101, true);
    session.fail('write');
    await expect(gateway.clearTab(101)).resolves.toMatchObject({ ok: false });
  });

  it('the orphan sweep removes state for tabs that no longer exist', async () => {
    const { gateway, session } = build();
    await gateway.writeTab(PICKER_ACTIVE, 101, true);
    await gateway.writeTab(PICKER_ACTIVE, 202, true);
    await gateway.writeTab(PICKER_ACTIVE, 303, true);
    const result = await gateway.sweepOrphans([202]);
    expect(result.removedTabs.sort()).toEqual([101, 303]);
    expect(Object.keys(session.snapshot())).toEqual([tabKey(202, PICKER_ACTIVE.key)]);
  });

  it('the sweep leaves global state completely alone', async () => {
    const { gateway, local } = build();
    await gateway.writeGlobal(CODE_BUFFER, ['keep me']);
    await gateway.sweepOrphans([]);
    expect((await gateway.readGlobal(CODE_BUFFER)).value).toEqual(['keep me']);
    expect(Object.keys(local.snapshot())).toHaveLength(1);
  });
});

// ─── F5 / F6 / F8 / F15 / F18 — validation and safe degradation ─────────────

describe('WS4 / EXIT 5: corrupted persisted state degrades to the default', () => {
  it('F15 — absent state reads as the declared default, not undefined', async () => {
    const { gateway } = build();
    const result = await gateway.readGlobal(CODE_BUFFER);
    expect(result.value).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('F5 — a wrong-typed value degrades to the default instead of reaching the caller', async () => {
    const { gateway } = build({
      [globalKey(CODE_BUFFER.key)]: { v: STORAGE_SCHEMA_VERSION, data: 'not-an-array' },
    });
    const result = await gateway.readGlobal(CODE_BUFFER);
    expect(result.value).toEqual([]);
    expect(result.valid).toBe(false);
  });

  it('F5 — an array containing non-strings is rejected whole, not partially trusted', async () => {
    const { gateway } = build({
      [globalKey(CODE_BUFFER.key)]: { v: STORAGE_SCHEMA_VERSION, data: ['ok', 42, null] },
    });
    expect((await gateway.readGlobal(CODE_BUFFER)).valid).toBe(false);
  });

  it('F8 — a partially written envelope degrades safely', async () => {
    const { gateway } = build({ [globalKey(PW_LANG.key)]: { v: STORAGE_SCHEMA_VERSION } });
    const result = await gateway.readGlobal(PW_LANG);
    expect(result.value).toBe(PW_LANG.defaultValue);
    expect(result.valid).toBe(false);
  });

  it('F6 — an UNKNOWN FUTURE version is never interpreted as current data', async () => {
    const { gateway, local } = build({
      [globalKey(CODE_BUFFER.key)]: { v: STORAGE_SCHEMA_VERSION + 7, data: ['from the future'] },
    });
    const result = await gateway.readGlobal(CODE_BUFFER);
    expect(result.value).toEqual([]);
    expect(result.code).toBe('UNKNOWN_VERSION');
    // and it must not be overwritten or downgraded by the read
    expect(local.snapshot()[globalKey(CODE_BUFFER.key)]).toEqual({
      v: STORAGE_SCHEMA_VERSION + 7,
      data: ['from the future'],
    });
  });

  it('F18 — unknown extra fields are tolerated but never trusted as schema', async () => {
    // WS9 DL-85 — the literal moved, the CLAIM did not. This guard is about the
    // `surprise` field being ignored, not about how a language is spelled.
    // `PW_LANG` now maps the WS4-era `python` forward to `python_sync` (one
    // language vocabulary), so the expected value follows. Asserting the
    // envelope's own key set as well pins what this test is actually for.
    const { gateway } = build({
      [globalKey(PW_LANG.key)]: { v: STORAGE_SCHEMA_VERSION, data: 'python', surprise: 'ignored' },
    });
    const result = await gateway.readGlobal(PW_LANG);
    expect(result.value).toBe('python_sync');
    expect(result.valid).toBe(true);
    expect(
      Object.keys(result as object),
      'the extra field never becomes part of the read result',
    ).not.toContain('surprise');
  });

  it('rejects an invalid enum value rather than passing it through', async () => {
    const { gateway } = build({
      [globalKey(PW_LANG.key)]: { v: STORAGE_SCHEMA_VERSION, data: 'cobol' },
    });
    expect((await gateway.readGlobal(PW_LANG)).valid).toBe(false);
  });

  it('rejects an invalid tab id instead of writing a malformed key', async () => {
    const { gateway } = build();
    await expect(gateway.writeTab(PICKER_ACTIVE, Number.NaN, true)).rejects.toThrow();
    await expect(gateway.writeTab(PICKER_ACTIVE, -1, true)).rejects.toThrow();
  });

  it('refuses to write a value its own validator rejects', async () => {
    const { gateway, local } = build();
    const result = await gateway.writeGlobal(CODE_BUFFER, ['ok', 7 as unknown as string]);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_VALUE');
    expect(Object.keys(local.snapshot())).toHaveLength(0);
  });
});

// ─── F1 / F2 / F3 / F4 — failures are observable ────────────────────────────

describe('WS4: storage failures are observable, never swallowed', () => {
  it('F3 — a read failure degrades to the default and reports the failure', async () => {
    const { gateway, local } = build();
    local.fail('read');
    const result = await gateway.readGlobal(CODE_BUFFER);
    expect(result.value).toEqual([]);
    expect(result.code).toBe('READ_FAILED');
  });

  it('F1 — an unavailable area is reported, not thrown at the caller', async () => {
    const { gateway, local } = build();
    local.fail('unavailable');
    await expect(gateway.readGlobal(PW_LANG)).resolves.toMatchObject({ code: 'READ_FAILED' });
    await expect(gateway.writeGlobal(PW_LANG, 'python')).resolves.toMatchObject({ ok: false });
  });

  it('F2 — a write failure returns ok:false with a code', async () => {
    const { gateway, local } = build();
    local.fail('write');
    const result = await gateway.writeGlobal(PW_LANG, 'python');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('WRITE_FAILED');
  });

  it('F4 — a quota rejection is classified as QUOTA_EXCEEDED, not a generic failure', async () => {
    const { gateway, local } = build();
    local.fail('quota');
    expect((await gateway.writeGlobal(CODE_BUFFER, ['x'])).code).toBe('QUOTA_EXCEEDED');
  });

  it('F13 — a failed write leaves the previously valid persisted value intact', async () => {
    const { gateway, local } = build();
    await gateway.writeGlobal(CODE_BUFFER, ['first']);
    local.fail('write');
    await gateway.writeGlobal(CODE_BUFFER, ['second']);
    local.recover();
    expect((await gateway.readGlobal(CODE_BUFFER)).value).toEqual(['first']);
  });
});

// ─── F17 — subscriptions are area-filtered and validated ────────────────────

describe('WS4: subscriptions filter by area and validate before notifying', () => {
  it('F17 — a change in a DIFFERENT area never reaches a listener', () => {
    const { changes, gateway } = build();
    const seen: unknown[] = [];
    gateway.watch(CODE_BUFFER, null, (v) => seen.push(v));
    changes.emit(
      {
        [globalKey(CODE_BUFFER.key)]: {
          newValue: { v: STORAGE_SCHEMA_VERSION, data: ['wrong area'] },
        },
      },
      'session',
    );
    expect(seen).toEqual([]);
  });

  it('delivers a validated value for a change in the right area', () => {
    const { changes, gateway } = build();
    const seen: unknown[] = [];
    gateway.watch(CODE_BUFFER, null, (v) => seen.push(v));
    changes.emit(
      { [globalKey(CODE_BUFFER.key)]: { newValue: { v: STORAGE_SCHEMA_VERSION, data: ['ok'] } } },
      'local',
    );
    expect(seen).toEqual([['ok']]);
  });

  it('a malformed change degrades to the default rather than entering runtime state', () => {
    const { changes, gateway } = build();
    const seen: unknown[] = [];
    gateway.watch(CODE_BUFFER, null, (v) => seen.push(v));
    changes.emit(
      {
        [globalKey(CODE_BUFFER.key)]: {
          newValue: { v: STORAGE_SCHEMA_VERSION, data: { nope: true } },
        },
      },
      'local',
    );
    expect(seen).toEqual([[]]);
  });

  it('ignores changes to keys the listener did not ask for', () => {
    const { changes, gateway } = build();
    const seen: unknown[] = [];
    gateway.watch(CODE_BUFFER, null, (v) => seen.push(v));
    changes.emit({ 'pg:v2:something-else': { newValue: 1 } }, 'local');
    expect(seen).toEqual([]);
  });

  it('unsubscribing actually detaches the listener', () => {
    const { changes, gateway } = build();
    const stop = gateway.watch(CODE_BUFFER, null, () => undefined);
    expect(changes.listenerCount).toBe(1);
    stop();
    expect(changes.listenerCount).toBe(0);
  });
});

// ─── Clear data ─────────────────────────────────────────────────────────────

describe('WS4: Clear data removes WS4 state and nothing else', () => {
  it('clears both areas of WS4-owned state', async () => {
    const { gateway, local, session } = build();
    await gateway.writeGlobal(CODE_BUFFER, ['x']);
    await gateway.writeTab(PICKER_ACTIVE, 101, true);
    await gateway.clearAll();
    expect(Object.keys(local.snapshot())).toHaveLength(0);
    expect(Object.keys(session.snapshot())).toHaveLength(0);
  });

  it('leaves WS9-owned recording keys untouched — they are not WS4 state', async () => {
    const { gateway, local } = build({
      pg_recording_active: true,
      pg_recorded_actions: [{ kind: 'click' }],
    });
    await gateway.writeGlobal(CODE_BUFFER, ['x']);
    await gateway.clearAll();
    expect(local.has('pg_recording_active')).toBe(true);
    expect(local.has('pg_recorded_actions')).toBe(true);
  });

  it('leaves storage belonging to anything else alone', async () => {
    const { gateway, local } = build({ some_other_extension_key: 'keep' });
    await gateway.clearAll();
    expect(local.has('some_other_extension_key')).toBe(true);
  });

  it('reports failure rather than claiming a clear that did not happen', async () => {
    const { gateway, local } = build();
    await gateway.writeGlobal(CODE_BUFFER, ['x']);
    local.fail('write');
    expect((await gateway.clearAll()).ok).toBe(false);
  });
});

// ─── F12 / F13 — durability across a reload ─────────────────────────────────

describe('WS4: durable state survives a fresh gateway over the same backend', () => {
  it('F13 — a new gateway instance reads back what the previous one wrote', async () => {
    const local = new FakeStorageArea();
    const session = new FakeStorageArea();
    const changes = new FakeChangeSource();
    const first = createStorageGateway({ local, session, changes });
    await first.writeGlobal(CODE_BUFFER, ['survives']);

    const second = createStorageGateway({ local, session, changes });
    expect((await second.readGlobal(CODE_BUFFER)).value).toEqual(['survives']);
  });

  it('F12 — a write resolves before the caller continues, so a closing panel can await it', async () => {
    const { gateway, local } = build();
    const result = await gateway.writeGlobal(CODE_BUFFER, ['flushed']);
    expect(result.ok).toBe(true);
    expect(local.snapshot()[globalKey(CODE_BUFFER.key)]).toEqual({
      v: STORAGE_SCHEMA_VERSION,
      data: ['flushed'],
    });
  });
});
