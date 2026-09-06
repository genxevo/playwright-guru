/**
 * WS9 FINALIZATION — exit validation, and the one defect it closes.
 * ============================================================================
 * THE SLICE'S PURPOSE WAS TO FIND OUT WHAT IS ACTUALLY LEFT, NOT TO ADD.
 *
 * WS9-FINAL-01…24 were checked against the existing suites first. Twenty-three
 * were already covered — by `ws9-action-count-refusal`, `ws9-navigation-tab-frame`,
 * `ws9-recording-persistence`, `ws9-recording-reconcile`, `ws9-recording-runtime`,
 * `ws9-recording-workflow`, `preview-gate` and `storage-consumers` — so they are
 * NOT duplicated here. Re-asserting a covered claim in a second file is how a
 * suite grows without gaining evidence, and how two guards start disagreeing.
 *
 * ═══ THE ONE REAL DEFECT: THE LANGUAGE PREFERENCE NEVER PERSISTED ═══
 *
 * The product has TWO language vocabularies and they do not match:
 *
 *   `TargetLanguage`  (codegen)      typescript · javascript · python_sync ·
 *                                    python_async · java · csharp_sync ·
 *                                    csharp_async
 *   `StoredLanguage`  (WS4 PW_LANG)  typescript · javascript · python · java ·
 *                                    csharp
 *
 * `LANGS` offers `python_sync` and `csharp_async`. `useLanguage`
 * writes them with `next as StoredLanguage` — a cast, so the compiler never saw
 * the mismatch — and `writeGlobal` validates on the way IN and returns
 * `INVALID_VALUE`. So **choosing Python or C# silently did not persist**: the
 * panel showed the new language until it was reopened, then fell back to
 * TypeScript. Nothing surfaced the failure, because `useLanguage` voids the
 * write result.
 *
 * It is a WS9 concern and not merely a WS5 one: `RecordingWorkspace` renders
 * `renderSpecFile(workflow, panel.lang)` and `ExportControl` names its file from
 * the same value, so the recording surfaces inherit a preference that could not
 * be kept.
 *
 * ═══ THE FIX IS ONE VOCABULARY, NOT A MIGRATION ═══
 *
 * `StoredLanguage` becomes `TargetLanguage` — the same "no second source of
 * truth" rule the rest of this repository follows. The WS4-era spellings
 * `python` and `csharp` are still ACCEPTED and NORMALISED forward on read, so an
 * existing install's saved preference is upgraded rather than silently reset to
 * TypeScript. No schema version moves, no migration entry is added, no new
 * descriptor exists, and `pg_pw_lang`'s v1 migration path keeps working because
 * it already writes whatever `validate` returns.
 */
import { describe, expect, it } from 'vitest';

import { LANGS } from '../src/ui/panel/constants';
import { PW_LANG, WS4_DESCRIPTORS } from '../src/storage/state';
import { STORAGE_SCHEMA_VERSION, isWs4Key } from '../src/storage/gateway';
import { LEGACY_KEYS } from '../src/storage/migration';
import { RECORDING_ENABLED } from '../src/config/recording';

import { createStorageGateway } from '../src/storage/gateway';
import { FakeChangeSource, FakeStorageArea } from './helpers/fake-storage';
import { readExtFile, stripComments } from './helpers/surface-source';

const code = (rel: string): string => stripComments(readExtFile(rel));

function build() {
  const local = new FakeStorageArea();
  const session = new FakeStorageArea();
  const changes = new FakeChangeSource();
  const gateway = createStorageGateway({ local, session, changes });
  return { gateway, local };
}

// ═══ THE DEFECT ════════════════════════════════════════════════════════════

describe('WS9-FINAL — the language the panel offers is the language it can store', () => {
  it('every option the picker offers survives a write and a read', async () => {
    // The claim in one line: an option a user can CHOOSE must be an option the
    // product can KEEP. Before this slice, two of the five could not be.
    const { gateway } = build();
    for (const option of LANGS) {
      const write = await gateway.writeGlobal(PW_LANG, option.value);
      expect(write.ok, `${option.label} (${option.value}) must be storable`).toBe(true);
      const read = await gateway.readGlobal(PW_LANG);
      expect(read.valid, `${option.label} must read back as valid`).toBe(true);
      expect(read.value, `${option.label} must read back unchanged`).toBe(option.value);
    }
  });

  it('the validator accepts the vocabulary the product actually generates', () => {
    for (const option of LANGS) {
      expect(PW_LANG.validate(option.value), `${option.value} must validate`).toBe(option.value);
    }
  });

  it('and still refuses anything that is not a language', () => {
    for (const rubbish of ['', 'ruby', 'PYTHON', 42, null, undefined, {}, ['typescript']]) {
      expect(PW_LANG.validate(rubbish), `${String(rubbish)} is not a language`).toBeNull();
    }
  });
});

describe('WS9-FINAL — an existing install does not lose its saved preference', () => {
  it('normalises the WS4-era spellings forward instead of resetting to the default', async () => {
    // `python` and `csharp` are what WS4 could store, so they are on real disks.
    // Rejecting them would make `readGlobal` return the descriptor default and a
    // user's saved choice would silently become TypeScript — the same class of
    // silent loss this fix exists to remove, arriving from the other direction.
    expect(PW_LANG.validate('python')).toBe('python_sync');
    expect(PW_LANG.validate('csharp')).toBe('csharp_async');
    expect(PW_LANG.validate('typescript')).toBe('typescript');
    expect(PW_LANG.validate('java')).toBe('java');
    expect(PW_LANG.validate('javascript')).toBe('javascript');
  });

  it('a stored legacy value reads back as its modern equivalent', async () => {
    const { gateway, local } = build();
    await local.set({
      [`pg:v${STORAGE_SCHEMA_VERSION}:pw-lang`]: { v: STORAGE_SCHEMA_VERSION, data: 'python' },
    });
    const read = await gateway.readGlobal(PW_LANG);
    expect(read.valid).toBe(true);
    expect(read.value, 'upgraded on read, never discarded').toBe('python_sync');
  });

  it('the v1 migration path is unchanged and still works for this key', () => {
    // `migrateToV2` writes whatever `validate` RETURNS, so a v1 `pg_pw_lang` of
    // `python` migrates to `python_sync` and its read-back comparison still
    // matches. No mapping entry was added and none was removed.
    expect(LEGACY_KEYS).toContain('pg_pw_lang');
    const migration = code('src/storage/migration.ts');
    expect(migration, 'the migration still writes the validated value').toContain(
      'gateway.writeGlobal(descriptor, validated)',
    );
  });
});

describe('WS9-FINAL — the fix adds no storage architecture', () => {
  it('no descriptor was added, removed or re-scoped', () => {
    expect(WS4_DESCRIPTORS).toHaveLength(6);
    expect(PW_LANG.key).toBe('pw-lang');
    expect(PW_LANG.area).toBe('local');
    expect(PW_LANG.scope).toBe('global');
    expect(PW_LANG.defaultValue).toBe('typescript');
    expect(isWs4Key(`pg:v${STORAGE_SCHEMA_VERSION}:pw-lang`)).toBe(true);
  });

  it('and the hook no longer casts its way past the type system', () => {
    // The cast was the reason a compiler could not see this. Its absence is what
    // stops the defect coming back the same way.
    const hook = code('src/hooks/useLanguage.ts');
    expect(hook, 'no cast to a second language vocabulary').not.toMatch(/as StoredLanguage/);
    expect(hook, 'and no cast on the way out either').not.toMatch(/as PwLang/);
  });

  it('there is ONE language vocabulary, and storage speaks it', () => {
    const state = code('src/storage/state.ts');
    expect(state, 'StoredLanguage is TargetLanguage, not a second list').toMatch(
      /StoredLanguage\s*=\s*TargetLanguage/,
    );
    expect(state, 'the legacy spellings are named as legacy, not as members').toMatch(
      /LEGACY_LANGUAGE/,
    );
  });
});

// ═══ WS9 EXIT — what this slice did NOT change ═════════════════════════════

describe('WS9-FINAL-24 — the preview gate is untouched', () => {
  it('RECORDING_ENABLED is still false', () => {
    // The E2E exit criterion ("an E2E test that kills the content script proves
    // the RECORDING banner cannot appear") has no infrastructure to satisfy it,
    // so the flag stays closed. This assertion is the flag's last line of
    // defence and is deliberately duplicated across suites.
    expect(RECORDING_ENABLED).toBe(false);
  });
});

describe('WS9-FINAL — the recording surfaces still consume the preference they render', () => {
  it('the workspace and export both read the panel language rather than a copy', () => {
    const panel = code('entrypoints/sidepanel/SidePanel.tsx');
    expect(panel).toMatch(/useExport\(panel\.lang/);
    expect(panel).toMatch(/useRecordingWorkspace\(panel\.lang/);
    // And the recording CONTROL still takes none — DL-82 removed it, because a
    // lifecycle is not language-shaped.
    expect(panel).toMatch(/useRecording\(bound\)/);
    expect(panel, 'a lifecycle is not language-shaped').not.toMatch(/useRecording\(panel\.lang/);
  });
});
