/**
 * WS4 — v1 → v2 migration, failure-first.
 * ============================================================================
 *
 * The highest-risk part of WS4: real users may already have a populated
 * `pg_code_buffer` (roadmap §25 Unknown #3), so the owner ruled migration
 * CRITICAL (O3). These tests are written before the implementation and encode
 * the rules exactly:
 *
 *   • preserve valid existing user data
 *   • detect legacy state structurally (there is no v1 version marker)
 *   • never delete v1 before the v2 write has been written AND read back
 *   • be idempotent
 *   • on failure leave a recoverable v1 state intact
 *   • never silently discard malformed legacy data — quarantine it, bounded,
 *     local-only, non-executable, with no raw value copied into the record
 *
 * Evidence level: **UNIT** against the deterministic fake backend. Real
 * `onInstalled` firing in Chrome is DEFERRED (O4); `storage-consumers.test.ts`
 * proves only that the handler is registered.
 */

import { describe, expect, it } from 'vitest';

import { createStorageGateway, globalKey, STORAGE_SCHEMA_VERSION } from '../src/storage/gateway';
import {
  LEGACY_KEYS,
  MIGRATION_RECORD_KEY,
  migrateToV2,
  quarantineKey,
} from '../src/storage/migration';
import { CODE_BUFFER, PW_LANG } from '../src/storage/state';
import { FakeChangeSource, FakeStorageArea } from './helpers/fake-storage';

const V1_BUFFER = ["await page.getByRole('button', { name: 'Save' }).click();", '// second line'];

function build(seedLocal: Record<string, unknown> = {}) {
  const local = new FakeStorageArea(seedLocal);
  const session = new FakeStorageArea();
  const gateway = createStorageGateway({ local, session, changes: new FakeChangeSource() });
  return { local, session, gateway };
}

// ─── EXIT 1 — zero loss ─────────────────────────────────────────────────────

describe('WS4 / EXIT 1: a populated v1 install upgrades with zero loss', () => {
  it('migrates pg_code_buffer content byte-for-byte into v2', async () => {
    const { local, gateway } = build({ pg_code_buffer: V1_BUFFER });
    const result = await migrateToV2(gateway, local);
    expect(result.ok).toBe(true);
    expect(result.migrated).toContain('pg_code_buffer');
    expect((await gateway.readGlobal(CODE_BUFFER)).value).toEqual(V1_BUFFER);
  });

  it('migrates the language preference too, upgrading its spelling', async () => {
    // WS9 DL-85 — REPAIRED, and the repair is what "zero loss" now means.
    //
    // This expected `'python'` back, because that was the only spelling WS4
    // could store. `PW_LANG` now speaks the ONE `TargetLanguage` vocabulary the
    // product actually generates, and maps the WS4-era spellings forward, so a
    // v1 `python` migrates to `python_sync`.
    //
    // That is not a weakening of this exit criterion, it is the criterion being
    // met properly: keeping the literal `'python'` would have preserved a value
    // `LANGS` no longer offers and `generateLocatorCode` cannot render — a
    // preference the user could see but the product could not act on. The
    // assertion below therefore checks BOTH that the choice survived and that
    // what survived is usable.
    const { local, gateway } = build({ pg_pw_lang: 'python' });
    await migrateToV2(gateway, local);
    const read = await gateway.readGlobal(PW_LANG);
    expect(read.valid).toBe(true);
    expect(read.value, 'the choice survived, in the vocabulary the product uses').toBe(
      'python_sync',
    );
    expect(read.value, 'and it is not silently reset to the default').not.toBe(
      PW_LANG.defaultValue,
    );
  });

  it('retires the legacy key only AFTER the v2 value verifies', async () => {
    const { local, gateway } = build({ pg_code_buffer: V1_BUFFER });
    await migrateToV2(gateway, local);
    expect(local.has('pg_code_buffer')).toBe(false);
    expect((await gateway.readGlobal(CODE_BUFFER)).value).toEqual(V1_BUFFER);
  });

  it('leaves WS9-owned recording keys untouched — they are not WS4 state', async () => {
    const { local, gateway } = build({
      pg_code_buffer: V1_BUFFER,
      pg_recording_active: false,
      pg_recorded_actions: [{ kind: 'click' }],
    });
    await migrateToV2(gateway, local);
    expect(local.has('pg_recording_active')).toBe(true);
    expect(local.has('pg_recorded_actions')).toBe(true);
    expect(LEGACY_KEYS).not.toContain('pg_recording_active');
    expect(LEGACY_KEYS).not.toContain('pg_recorded_actions');
  });

  it('records what it did, without copying user content into the record', async () => {
    const { local, gateway } = build({ pg_code_buffer: V1_BUFFER });
    await migrateToV2(gateway, local);
    const record = JSON.stringify(local.snapshot()[MIGRATION_RECORD_KEY]);
    expect(record).toContain(String(STORAGE_SCHEMA_VERSION));
    expect(record).not.toContain('getByRole');
  });

  it('an empty v1 install initialises safely with no migration work', async () => {
    const { local, gateway } = build();
    const result = await migrateToV2(gateway, local);
    expect(result.ok).toBe(true);
    expect(result.migrated).toEqual([]);
    expect((await gateway.readGlobal(CODE_BUFFER)).value).toEqual([]);
  });
});

// ─── EXIT 2 — idempotence ───────────────────────────────────────────────────

describe('WS4 / EXIT 2: migration is idempotent', () => {
  it('running it three times leaves one stable, correct v2 state', async () => {
    const { local, gateway } = build({ pg_code_buffer: V1_BUFFER });
    await migrateToV2(gateway, local);
    const afterFirst = local.snapshot();
    await migrateToV2(gateway, local);
    await migrateToV2(gateway, local);
    expect((await gateway.readGlobal(CODE_BUFFER)).value).toEqual(V1_BUFFER);
    expect(Object.keys(local.snapshot()).sort()).toEqual(Object.keys(afterFirst).sort());
  });

  it('does not duplicate or append user content on a second run', async () => {
    const { local, gateway } = build({ pg_code_buffer: V1_BUFFER });
    await migrateToV2(gateway, local);
    await migrateToV2(gateway, local);
    expect((await gateway.readGlobal(CODE_BUFFER)).value).toHaveLength(V1_BUFFER.length);
  });

  it('does not overwrite v2 state a user has changed since migrating', async () => {
    const { local, gateway } = build({ pg_code_buffer: V1_BUFFER });
    await migrateToV2(gateway, local);
    await gateway.writeGlobal(CODE_BUFFER, ['edited since migration']);
    await migrateToV2(gateway, local);
    expect((await gateway.readGlobal(CODE_BUFFER)).value).toEqual(['edited since migration']);
  });

  it('reports a no-op second run rather than claiming it migrated again', async () => {
    const { local, gateway } = build({ pg_code_buffer: V1_BUFFER });
    await migrateToV2(gateway, local);
    const second = await migrateToV2(gateway, local);
    expect(second.ok).toBe(true);
    expect(second.migrated).toEqual([]);
  });
});

// ─── EXIT 3 — failure leaves v1 intact ──────────────────────────────────────

describe('WS4 / EXIT 3: a failed migration leaves v1 recoverable', () => {
  it('a v2 write failure preserves the legacy value', async () => {
    const { local, gateway } = build({ pg_code_buffer: V1_BUFFER });
    local.fail('write');
    const result = await migrateToV2(gateway, local);
    expect(result.ok).toBe(false);
    local.recover();
    expect(local.snapshot()['pg_code_buffer']).toEqual(V1_BUFFER);
  });

  it('a quota failure preserves the legacy value and is classified', async () => {
    const { local, gateway } = build({ pg_code_buffer: V1_BUFFER });
    local.fail('quota');
    const result = await migrateToV2(gateway, local);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('QUOTA_EXCEEDED');
    local.recover();
    expect(local.snapshot()['pg_code_buffer']).toEqual(V1_BUFFER);
  });

  it('a read-back verification failure does NOT retire the legacy key', async () => {
    const { local, gateway } = build({ pg_code_buffer: V1_BUFFER });
    // The write lands, but the value read back is not what was written.
    const realSet = local.set.bind(local);
    local.set = async (items: Record<string, unknown>) => {
      await realSet(items);
      if (Object.keys(items)[0] === globalKey(CODE_BUFFER.key)) {
        await realSet({
          [globalKey(CODE_BUFFER.key)]: { v: STORAGE_SCHEMA_VERSION, data: ['corrupted'] },
        });
      }
    };
    const result = await migrateToV2(gateway, local);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('VERIFY_FAILED');
    expect(local.snapshot()['pg_code_buffer']).toEqual(V1_BUFFER);
  });

  it('a failed migration can be retried successfully once storage recovers', async () => {
    const { local, gateway } = build({ pg_code_buffer: V1_BUFFER });
    local.fail('write');
    await migrateToV2(gateway, local);
    local.recover();
    const retry = await migrateToV2(gateway, local);
    expect(retry.ok).toBe(true);
    expect((await gateway.readGlobal(CODE_BUFFER)).value).toEqual(V1_BUFFER);
  });
});

// ─── Malformed legacy data — quarantine, never silent deletion ──────────────

describe('WS4: malformed legacy data is quarantined, never silently discarded', () => {
  it('does not delete a malformed legacy value', async () => {
    const { local, gateway } = build({ pg_code_buffer: 'this was never an array' });
    await migrateToV2(gateway, local);
    expect(local.has('pg_code_buffer')).toBe(true);
  });

  it('writes a bounded quarantine record describing it', async () => {
    const { local, gateway } = build({ pg_code_buffer: { unexpected: 'object' } });
    const result = await migrateToV2(gateway, local);
    expect(result.quarantined).toContain('pg_code_buffer');
    const record = local.snapshot()[quarantineKey('pg_code_buffer')] as Record<string, unknown>;
    expect(record).toBeDefined();
    expect(record['key']).toBe('pg_code_buffer');
    expect(typeof record['valueType']).toBe('string');
    expect(typeof record['byteLength']).toBe('number');
  });

  it('the quarantine record carries NO raw user content', async () => {
    const { local, gateway } = build({
      pg_code_buffer: ['SECRET_TOKEN_VALUE'] as unknown,
      pg_pw_lang: 42,
    });
    // pg_code_buffer above is valid; the malformed one here is pg_pw_lang.
    await migrateToV2(gateway, local);
    const record = local.snapshot()[quarantineKey('pg_pw_lang')] as Record<string, unknown>;

    // DL-82 — CORRECTED, and the correction is a strengthening.
    //
    // This asserted `JSON.stringify(record)` did not contain '42'. The record
    // carries `at: Date.now()`, and roughly a third of all wall-clock
    // milliseconds contain the digits '42' somewhere, so this guard failed on
    // the clock rather than on the code. (It failed during this slice's
    // validation for exactly that reason, with the migration source untouched.)
    // A guard that is right two times in three is not a guard.
    //
    // The claim it was making is that no FIELD of the record carries the user's
    // value, so that is what is asserted now — field by field, with the
    // timestamp excluded by name and its type checked instead. Stricter, and
    // deterministic.
    const { at, ...describing } = record;
    expect(typeof at, 'the record is stamped, and the stamp is all it is').toBe('number');
    for (const [field, value] of Object.entries(describing)) {
      expect(String(value), `the quarantine field ${field} must not carry the value`).not.toContain(
        '42',
      );
    }
    expect(Object.keys(record).sort(), 'metadata only, never content').toEqual(
      ['at', 'byteLength', 'key', 'reason', 'valueType'].sort(),
    );
    expect(JSON.stringify(local.snapshot())).toContain('SECRET_TOKEN_VALUE'); // the valid value was migrated, not lost
  });

  it('degrades the malformed key to its default while other keys still migrate', async () => {
    const { local, gateway } = build({
      pg_code_buffer: V1_BUFFER,
      pg_pw_lang: { not: 'a language' },
    });
    const result = await migrateToV2(gateway, local);
    expect(result.migrated).toContain('pg_code_buffer');
    expect(result.quarantined).toContain('pg_pw_lang');
    expect((await gateway.readGlobal(PW_LANG)).value).toBe(PW_LANG.defaultValue);
  });

  it('when quota prevents quarantine, the original is retained and the failure is reported', async () => {
    const { local, gateway } = build({ pg_pw_lang: { not: 'a language' } });
    local.fail('quota');
    const result = await migrateToV2(gateway, local);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('QUOTA_EXCEEDED');
    local.recover();
    expect(local.has('pg_pw_lang')).toBe(true);
    expect(local.has(quarantineKey('pg_pw_lang'))).toBe(false);
  });

  it('quarantining is idempotent — a second run does not stack records', async () => {
    const { local, gateway } = build({ pg_pw_lang: 999 });
    await migrateToV2(gateway, local);
    const first = local.snapshot()[quarantineKey('pg_pw_lang')];
    await migrateToV2(gateway, local);
    expect(local.snapshot()[quarantineKey('pg_pw_lang')]).toEqual(first);
  });
});

// ─── Legacy transient keys ──────────────────────────────────────────────────

describe('WS4: transient v1 keys are not fabricated into a tab scope', () => {
  it('does not migrate global picker state into an invented tab identity', async () => {
    const { local, gateway } = build({
      pg_picker_active: true,
      pg_last_pick: { tagName: 'button' },
    });
    const result = await migrateToV2(gateway, local);
    expect(result.migrated).not.toContain('pg_picker_active');
    expect(result.migrated).not.toContain('pg_last_pick');
    // Not migrated, but also not deleted: no user data is destroyed by WS4.
    expect(local.has('pg_picker_active')).toBe(true);
  });
});
