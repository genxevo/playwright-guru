/**
 * WS4 — v1 → v2 migration.
 * ============================================================================
 *
 * The riskiest thing WS4 does: existing installs may hold a populated
 * `pg_code_buffer` — code the user wrote and would not get back (roadmap §25
 * Unknown #3), which is why the owner ruled this CRITICAL (O3).
 *
 * THE ORDER MATTERS, AND IT IS THE WHOLE DESIGN
 *
 *   1. detect legacy state structurally — v1 has no version marker to read
 *   2. validate each legacy value
 *   3. write the v2 envelope
 *   4. READ IT BACK and compare
 *   5. only then retire the legacy key
 *
 * Nothing is deleted before step 4 succeeds. If the write fails, the quota is
 * full, or the value that comes back is not the value that went in, the legacy
 * key is still there and the next run tries again — that is what makes
 * "failure leaves v1 intact" true rather than aspirational.
 *
 * MALFORMED LEGACY DATA IS NEVER SILENTLY DISCARDED
 * A legacy value that fails validation is not migrated and not deleted. A
 * bounded quarantine record is written beside it describing *that* it could
 * not be read — its type and size, never its content. The original stays
 * exactly where it is, which is what preserves recoverability; if even the
 * quarantine record cannot be written (quota), the migration reports failure
 * and still leaves the original alone.
 *
 * WHAT IS NOT MIGRATED, AND WHY
 *   `pg_recording_active`, `pg_recorded_actions` — WS9-owned (O2). Not read,
 *       not written, not deleted by WS4.
 *   `pg_picker_active`, `pg_last_pick` — transient state that is global in v1
 *       and tab-scoped in v2. There is no tab identity at install time, so
 *       migrating them would mean inventing one. They are left untouched
 *       rather than fabricated into a tab; "Clear data" can retire them later.
 */

import type {
  StateDescriptor,
  StorageFailureCode,
  StorageGateway,
} from '../application/ports/StorageGateway';
import type { StorageAreaLike } from './gateway';
import { STORAGE_NAMESPACE, STORAGE_SCHEMA_VERSION } from './gateway';
import { CODE_BUFFER, PW_LANG } from './state';

/** Where the migration records what it did. Metadata only — never content. */
export const MIGRATION_RECORD_KEY = `${STORAGE_NAMESPACE}:v${STORAGE_SCHEMA_VERSION}:__migration`;

/** `pg:v2:__quarantine:<legacy key>` */
export function quarantineKey(legacyKey: string): string {
  return `${STORAGE_NAMESPACE}:v${STORAGE_SCHEMA_VERSION}:__quarantine:${legacyKey}`;
}

interface LegacyMapping {
  readonly legacyKey: string;
  readonly descriptor: StateDescriptor<never>;
}

/**
 * The durable v1 keys WS4 owns. Deliberately short: recording keys are WS9's,
 * and the two transient keys are explained in the header above.
 */
const MAPPINGS: readonly LegacyMapping[] = [
  { legacyKey: 'pg_code_buffer', descriptor: CODE_BUFFER as unknown as StateDescriptor<never> },
  { legacyKey: 'pg_pw_lang', descriptor: PW_LANG as unknown as StateDescriptor<never> },
];

/** The legacy keys this migration will ever touch. */
export const LEGACY_KEYS: readonly string[] = MAPPINGS.map((m) => m.legacyKey);

export interface MigrationResult {
  readonly ok: boolean;
  /** Legacy keys whose content is now safely in v2 and has been retired. */
  readonly migrated: string[];
  /** Legacy keys that could not be understood and were quarantined in place. */
  readonly quarantined: string[];
  readonly code?: StorageFailureCode | 'VERIFY_FAILED';
}

/** Structural equality for the small, JSON-shaped values WS4 persists. */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function byteLengthOf(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return -1;
  }
}

/**
 * Migrate legacy v1 state into the v2 schema.
 *
 * Idempotent: a second run finds no legacy keys and reports no work, and it
 * never re-writes v2 state the user has changed since — the legacy key is gone
 * by then, so there is nothing to copy over the top of their edits.
 *
 * `local` is the raw area, needed because v1 keys live outside the gateway's
 * namespace and so are invisible to its typed surface by design.
 */
export async function migrateToV2(
  gateway: StorageGateway,
  local: StorageAreaLike,
): Promise<MigrationResult> {
  const migrated: string[] = [];
  const quarantined: string[] = [];

  let existing: Record<string, unknown>;
  try {
    existing = await local.get([...LEGACY_KEYS, ...LEGACY_KEYS.map(quarantineKey)]);
  } catch {
    return { ok: false, migrated, quarantined, code: 'READ_FAILED' };
  }

  for (const { legacyKey, descriptor } of MAPPINGS) {
    if (!(legacyKey in existing)) continue;
    const legacyValue = existing[legacyKey];
    const validated = descriptor.validate(legacyValue);

    if (validated === null) {
      // Unreadable. Record that it existed — type and size only — and leave
      // the original untouched so it stays recoverable.
      if (quarantineKey(legacyKey) in existing) {
        quarantined.push(legacyKey);
        continue;
      }
      try {
        await local.set({
          [quarantineKey(legacyKey)]: {
            key: legacyKey,
            at: Date.now(),
            valueType: Array.isArray(legacyValue) ? 'array' : typeof legacyValue,
            byteLength: byteLengthOf(legacyValue),
            reason: 'failed v2 validation',
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          migrated,
          quarantined,
          code: /quota/i.test(message) ? 'QUOTA_EXCEEDED' : 'WRITE_FAILED',
        };
      }
      quarantined.push(legacyKey);
      continue;
    }

    const write = await gateway.writeGlobal(descriptor, validated);
    if (!write.ok) {
      return { ok: false, migrated, quarantined, code: write.code ?? 'WRITE_FAILED' };
    }

    // Verify before retiring. A write that "succeeded" but did not land is the
    // one case where deleting v1 would lose the user's work for good.
    const readBack = await gateway.readGlobal(descriptor);
    if (!readBack.valid || !sameValue(readBack.value, validated)) {
      return { ok: false, migrated, quarantined, code: 'VERIFY_FAILED' };
    }

    try {
      await local.remove(legacyKey);
    } catch (error) {
      // v2 is correct and verified; the legacy copy simply outlived it. Not a
      // data-loss failure — the next run will retire it.
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        migrated,
        quarantined,
        code: /quota/i.test(message) ? 'QUOTA_EXCEEDED' : 'WRITE_FAILED',
      };
    }
    migrated.push(legacyKey);
  }

  try {
    await local.set({
      [MIGRATION_RECORD_KEY]: {
        version: STORAGE_SCHEMA_VERSION,
        at: Date.now(),
        migratedCount: migrated.length,
        quarantinedCount: quarantined.length,
      },
    });
  } catch {
    // The data is migrated and verified; only the bookkeeping failed. Report
    // it rather than claiming a clean run, but do not undo good work.
    return { ok: false, migrated, quarantined, code: 'WRITE_FAILED' };
  }

  return { ok: true, migrated, quarantined };
}
