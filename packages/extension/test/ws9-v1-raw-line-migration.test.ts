/**
 * WS9 — V1 RAW-LINE MIGRATION.
 * ============================================================================
 * WHAT THIS SLICE ACTUALLY DECIDED, and what these guards hold in place.
 *
 * There were two separate things wearing the same name, and conflating them is
 * how a "cleanup" turns into data loss:
 *
 *   THE V1 CODE PATH  — the unreachable recorder in `entrypoints/content.ts`,
 *       the permanently-empty `recordedActions` state in `RecordingControl`,
 *       and `src/ui/recording/test-code.ts`, which rebuilt a locator from raw
 *       attributes and fell back to `page.locator('<tagName>')`. Measured dead:
 *       no message routes to it, no component consumes it, no caller calls it.
 *       RETIRED here.
 *
 *   THE V1 STORED DATA — the two flat keys `pg_recording_active` and
 *       `pg_recorded_actions` in `browser.storage.local`, whose value shape is
 *       `RecordedAction[]`. NOT retired, NOT migrated, NOT read, NOT deleted.
 *
 * WHY THE STORED DATA IS NOT MIGRATED, stated as structure rather than opinion.
 *
 * A V2 `RecordedStep.target` is `{ locator: RecommendedLocator, facts:
 * ElementFactsLite }`. `RecommendedLocator` carries `verdict`, `matchCount`,
 * `visibleMatchCount`, `stepCounts[]` and `rationale[]` — five fields that are
 * MEASUREMENTS against a live DOM. `ElementFactsLite` additionally carries
 * `ancestors[]`, `indexInParent` and `inShadowRoot`. A V1 `RecordedAction`
 * carries `{ kind, attrs?, value?, url?, timestamp }` and NONE of those. There
 * is therefore no function from V1 to V2 that does not invent the evidence, and
 * re-resolution is not available to a stored-data migration by construction —
 * the data is on disk, the page it was captured from is gone. Writing
 * `verdict: 'unique'` next to a locator nobody measured would be a fabricated
 * verification, which is the one thing this product may never ship.
 *
 * So the honest outcome is: PRESERVE IN PLACE. The keys are left exactly where
 * they are, byte for byte. What this slice removes is the ability to write any
 * MORE of them, and every code path that pretended to be able to read them.
 *
 * Quarantining was considered and is NOT available: WS4's quarantine writes a
 * metadata record for a key the migration READS, and DL-66/O2 rules that these
 * two keys are "neither migrated, cleared nor read by WS4". Quarantine would
 * require reading them, which would overturn an owner decision this slice was
 * not given. Recorded as deferred rather than done.
 *
 * M1..M20 below are the twenty claims this slice must prove. Each `it()` names
 * the one it holds.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RECORDING_ENABLED, RECORDING_LIMITS } from '../src/config/recording';
import { LEGACY_KEYS } from '../src/storage/migration';
import { isWs4Key } from '../src/storage/gateway';

import {
  EXT_ROOT,
  SURFACE_NAMES,
  eachSurfaceCode,
  readExtFile,
  stripComments,
  surfaceSource,
  withoutFile,
} from './helpers/surface-source';

/** The two V1 flat keys. Named once; every guard below reuses these. */
const V1_KEYS = ['pg_recording_active', 'pg_recorded_actions'] as const;

/**
 * Every PRODUCTION source file in this package.
 *
 * `test/**` is excluded because a guard must be allowed to name what it
 * forbids — this very file names all of it. `.wxt/**` is excluded because it
 * is generated output, regenerated from `utils/messaging.ts` on every build,
 * so asserting on it would be asserting on a build artifact.
 */
function productionFiles(): string[] {
  const roots = ['src', 'entrypoints', 'utils'];
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = join(EXT_ROOT, rel);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs)) {
      const childRel = `${rel}/${name}`;
      const childAbs = join(EXT_ROOT, childRel);
      if (statSync(childAbs).isDirectory()) {
        if (name === 'node_modules') continue;
        walk(childRel);
      } else if (/\.tsx?$/.test(name)) {
        out.push(childRel);
      }
    }
  };
  for (const root of roots) walk(root);
  return out.sort();
}

const PRODUCTION = productionFiles();

/** Production source with comments stripped: a claim about behaviour. */
function productionCode(): Array<[string, string]> {
  return PRODUCTION.map((rel) => [rel, stripComments(readFileSync(join(EXT_ROOT, rel), 'utf8'))]);
}

const CODE = productionCode();

// ═══ M1 — the flag ══════════════════════════════════════════════════════════

describe('M1 — the preview gate is untouched by this slice', () => {
  it('RECORDING_ENABLED is still false', () => {
    expect(RECORDING_ENABLED).toBe(false);
  });
});

// ═══ M2..M7 — the V1 STORED DATA is preserved, not touched ══════════════════

describe('M2 — no production code writes a V1 key', () => {
  it('nothing can create new V1 raw-line data', () => {
    for (const [rel, source] of CODE) {
      for (const key of V1_KEYS) {
        // A write is `storage.<area>.set({ ...key... })`. The key appearing at
        // all in code is the stronger and simpler thing to forbid, and after
        // this slice nothing in production needs to name one.
        expect(source, `${rel} must not name the V1 key ${key}`).not.toContain(key);
      }
    }
  });
});

describe('M3 — no production code reads a V1 key', () => {
  it('nothing claims to be able to interpret V1 raw-line data', () => {
    // Implied by M2 (a read must also name the key), asserted separately so a
    // future change that reintroduces one direction is caught by the guard that
    // names that direction.
    const named = CODE.filter(([, source]) => V1_KEYS.some((k) => source.includes(k)));
    expect(
      named.map(([rel]) => rel),
      'no production file may name a V1 key',
    ).toEqual([]);
  });
});

describe('M4 — the V1 stored data is never deleted', () => {
  it('no production code removes or clears a V1 key', () => {
    for (const [rel, source] of CODE) {
      expect(source, `${rel} must not remove a V1 key`).not.toMatch(/\.remove\(\s*['"`]pg_record/);
      expect(source, `${rel} must not clear a V1 key`).not.toMatch(
        /pg_recorded_actions\s*:\s*\[\s*\]/,
      );
    }
  });

  it('the retirement removed only WRITERS and READERS, never the data', () => {
    // The distinction this whole slice rests on. `storage.local.clear()` would
    // destroy the preserved keys as collateral, so it is forbidden outright —
    // WS4's own "Clear data" acts on the `pg:v2:` namespace by enumeration,
    // never by clearing the area.
    for (const [rel, source] of CODE) {
      expect(source, `${rel} must not clear a whole storage area`).not.toMatch(
        /storage\.(local|session|sync)\.clear\(/,
      );
    }
  });
});

describe('M5 — WS4 still never migrates a V1 recording key (DL-66/O2)', () => {
  it('LEGACY_KEYS excludes both', () => {
    for (const key of V1_KEYS) expect(LEGACY_KEYS).not.toContain(key);
  });
});

describe('M6 — Clear data and the orphan sweep cannot reach a V1 key', () => {
  it('neither key is a WS4 key', () => {
    for (const key of V1_KEYS) expect(isWs4Key(key)).toBe(false);
  });
});

describe('M7 — the WS4 storage modules still never name a V1 key', () => {
  it('holds on gateway, state and migration', () => {
    for (const rel of [
      'src/storage/gateway.ts',
      'src/storage/state.ts',
      'src/storage/migration.ts',
    ]) {
      const source = stripComments(readExtFile(rel));
      expect(source, `${rel} must not name a V1 key in code`).not.toMatch(
        /pg_recording_active|pg_recorded_actions/,
      );
    }
  });
});

// ═══ M8..M10 — the content script's V1 recorder is gone ═════════════════════

describe('M8 — the unreachable legacy recorder is retired', () => {
  const CONTENT = stripComments(readExtFile('entrypoints/content.ts'));

  it('declares none of its functions or its module-level flag', () => {
    for (const symbol of [
      'function startRecording(',
      'function stopRecording(',
      'function appendRecAction(',
      'function flushRecFill(',
      'function onRecClick(',
      'function onRecInput(',
      'function onRecChange(',
      'recordingActive',
      'recFillTimer',
      'recFillEl',
      'recFillVal',
    ]) {
      expect(CONTENT, `content.ts must no longer declare ${symbol}`).not.toContain(symbol);
    }
  });

  it('keeps the WS9 lifecycle session handlers, which are a different thing', () => {
    // The names are one word apart, so this is asserted rather than assumed:
    // retiring the V1 recorder must not touch the WS9 runtime the message
    // switch actually routes to.
    expect(CONTENT).toContain('function startRecordingSession(');
    expect(CONTENT).toContain('function stopRecordingSession(');
    expect(CONTENT).toContain('createRecordingRuntime');
  });
});

describe('M9 — the content script touches no storage API at all', () => {
  it('has zero direct browser.storage calls, not merely none outside a block', () => {
    // STRENGTHENED. The previous form sliced the file at the `// -- Recording`
    // marker and asserted only the part BEFORE it. That marker is gone with the
    // block, and slicing on a marker that no longer exists is how a guard
    // silently starts asserting nothing. The whole file is now in scope, which
    // is strictly stronger than the half that was.
    const CONTENT = stripComments(readExtFile('entrypoints/content.ts'));
    expect([...CONTENT.matchAll(/browser\.storage\./g)]).toHaveLength(0);
    for (const api of ['chrome.storage', 'localStorage', 'sessionStorage', 'indexedDB']) {
      expect(CONTENT, `content.ts must not touch ${api}`).not.toContain(api);
    }
  });

  it('still persists through the background seam instead', () => {
    const CONTENT = stripComments(readExtFile('entrypoints/content.ts'));
    expect(CONTENT).toContain('PERSIST_RECORDING_STATE');
  });
});

describe('M10 — DL-4 is closed in the content script', () => {
  it('holds no hand-written recording timing literal', () => {
    // DL-4: "`RECORDING_LIMITS` is the single source of truth is true, yet the
    // legacy recorder bypasses it — content.ts hard-codes 600 ms where the
    // constant says 500." That literal lived in `onRecInput`'s debounce and
    // went with the block.
    const CONTENT = stripComments(readExtFile('entrypoints/content.ts'));
    expect(CONTENT, 'the 600 ms fill debounce must be gone').not.toMatch(
      /setTimeout\([^)]*,\s*600\)/,
    );
    expect(RECORDING_LIMITS.fillDebounceMs, 'and the constant is what remains').toBe(500);
  });
});

// ═══ M11..M14 — the V1 renderer and its fabrication are gone ════════════════

describe('M11 — the legacy attribute renderer no longer exists', () => {
  it('src/ui/recording/test-code.ts is deleted', () => {
    expect(existsSync(join(EXT_ROOT, 'src/ui/recording/test-code.ts'))).toBe(false);
  });
});

describe('M12 — the tagName fabrication exists nowhere in production', () => {
  it('no production file builds a locator out of an element tag name', () => {
    for (const [rel, source] of CODE) {
      expect(source, `${rel} must not fabricate a locator from tagName`).not.toMatch(
        /page\.locator\(\s*[`'"]\$\{[^}]*tagName/,
      );
      expect(source, `${rel} must not fabricate a locator from raw attributes`).not.toMatch(
        /locator\(\s*[`'"]\$\{\s*attrs\./,
      );
    }
  });
});

describe('M13 — nothing imports the retired renderer', () => {
  it('no production file imports test-code', () => {
    for (const [rel, source] of CODE) {
      expect(source, `${rel} must not import the retired renderer`).not.toMatch(
        /from\s+['"][^'"]*recording\/test-code['"]/,
      );
    }
  });
});

describe('M14 — the V1 generator symbols exist nowhere in production', () => {
  it('generateTestCode, actionToCodeLine and attrsToLocatorCode are gone', () => {
    for (const [rel, source] of CODE) {
      for (const symbol of ['generateTestCode', 'actionToCodeLine', 'attrsToLocatorCode']) {
        expect(source, `${rel} must not reference ${symbol}`).not.toContain(symbol);
      }
    }
  });
});

// ═══ M15..M17 — the panel's V1 state is gone ════════════════════════════════

describe('M15 — the permanently-empty panel state is retired', () => {
  const CONTROL = stripComments(readExtFile('entrypoints/sidepanel/RecordingControl.tsx'));

  it('holds no recordedActions, copyTestCode or clearRecording', () => {
    for (const symbol of ['recordedActions', 'copyTestCode', 'clearRecording']) {
      expect(CONTROL, `RecordingControl must not hold ${symbol}`).not.toContain(symbol);
    }
  });

  it('keeps the WS9 lifecycle surface it actually has a consumer for', () => {
    for (const symbol of ['recordButtonModel', 'resolveRecordingView', 'readDurableObservation']) {
      expect(CONTROL, `${symbol} is live and must survive`).toContain(symbol);
    }
  });
});

describe('M16 — the panel touches no storage API directly', () => {
  it('has zero browser.storage calls, where it used to have exactly one', () => {
    // STRENGTHENED from `toHaveLength(1)`. The one call was
    // `clearRecording`'s `pg_recorded_actions: []` reset — a WRITE to preserved
    // V1 data from a function with no caller. Zero is both a stronger
    // architectural claim and the thing that makes M4 true.
    const CONTROL = stripComments(readExtFile('entrypoints/sidepanel/RecordingControl.tsx'));
    expect([...CONTROL.matchAll(/browser\.storage/g)]).toHaveLength(0);
    for (const api of ['chrome.storage', 'localStorage', 'sessionStorage', 'indexedDB']) {
      expect(CONTROL, `the panel must not touch ${api}`).not.toContain(api);
    }
  });
});

describe('M17 — no composed surface makes any raw storage call', () => {
  it('the one documented WS4 exception is now zero exceptions', () => {
    // The pre-existing guards permitted exactly one direct call, on the
    // documented `pg_recorded_actions` exception. That exception was the panel
    // WRITE this slice removed, so the permitted set is now empty — a strictly
    // stronger claim than the one it replaces.
    //
    // `src/browser/storage.ts` is the WS4 gateway; calling the storage API is
    // its entire job, so it is cut out of the composition rather than
    // exempted by a looser pattern.
    for (const name of SURFACE_NAMES) {
      const composed = withoutFile(surfaceSource(name), 'src/browser/storage.ts');
      const calls = [...stripComments(composed).matchAll(/browser\.storage\.\w+\.\w+\(/g)].map(
        (m) => m[0],
      );
      expect(calls, `${name} must reach storage only through the WS4 gateway`).toEqual([]);
    }
  });

  it('and no surface reaches a non-gateway storage API either', () => {
    for (const [name, source] of eachSurfaceCode()) {
      for (const api of ['chrome.storage', 'localStorage', 'sessionStorage', 'indexedDB']) {
        expect(source, `${name} must not touch ${api}`).not.toContain(api);
      }
    }
  });
});

// ═══ M18 — the V1 data contract survives as documentation only ══════════════

describe('M18 — RecordedAction is kept as the frozen V1 on-disk contract', () => {
  const MESSAGING = readExtFile('utils/messaging.ts');

  it('still describes the shape of the data we are preserving', () => {
    // Deleting the only description of data we deliberately keep would make the
    // preservation unreadable. The type is erased at compile time, so it costs
    // zero bundle bytes, and DL-82 records it as DOCUMENTATION-ONLY.
    expect(MESSAGING).toContain('RecordedActionKind');
    expect(MESSAGING).toContain('interface RecordedAction');
  });

  it('is imported by no production module', () => {
    for (const [rel, source] of CODE) {
      if (rel === 'utils/messaging.ts') continue;
      expect(source, `${rel} must not import the frozen V1 type`).not.toMatch(/\bRecordedAction\b/);
    }
  });

  it('is documented as V1, retired and unreachable', () => {
    const at = MESSAGING.indexOf('RecordedActionKind');
    const preceding = MESSAGING.slice(Math.max(0, at - 2500), at);
    expect(preceding, 'the frozen contract must say what it is').toMatch(/V1/);
    expect(preceding, 'and that nothing reads it').toMatch(/retired|unreachable|no reader/i);
  });
});

// ═══ M19..M20 — nothing fabricates a migration ══════════════════════════════

describe('M19 — no V1 to V2 transformation exists', () => {
  it('nothing converts a RecordedAction into a RecordedStep or a RecordedWorkflow', () => {
    // `utils/messaging.ts` is EXCLUDED, and the exclusion is the point rather
    // than a hole: it is the shared type-declaration module, so it necessarily
    // names both models. Declaring two shapes is not converting between them,
    // and the next assertion holds that distinction directly. Every OTHER
    // production file must know at most one of the two.
    for (const [rel, source] of CODE) {
      if (rel === 'utils/messaging.ts') continue;
      const mentionsV1 = /\bRecordedAction\b/.test(source);
      const mentionsV2 = /\bRecordedStep\b|\bRecordedWorkflow\b|\bRecordedTarget\b/.test(source);
      expect(
        mentionsV1 && mentionsV2,
        `${rel} must not know about both the V1 and the V2 recording models`,
      ).toBe(false);
    }
  });

  it('the shared type module declares the two models and joins them nowhere', () => {
    const source = stripComments(readExtFile('utils/messaging.ts'));
    // No function anywhere takes a V1 action. `normalizeAck` is the module's
    // only function and its signature is an acknowledgement.
    const signatures = [...source.matchAll(/function\s+\w+\s*\(([^)]*)\)/g)].map((m) => m[1]);
    for (const params of signatures) {
      expect(params, 'no function in the type module may accept a V1 action').not.toMatch(
        /\bRecordedAction\b/,
      );
    }
    // And no declaration mentions both, which is what a converter's type would
    // have to do.
    expect(source, 'no type may map V1 onto V2').not.toMatch(
      /RecordedAction[^;{]{0,200}(RecordedStep|RecordedWorkflow|RecordedTarget)/,
    );
  });

  it('no module is named as a recording migration', () => {
    // A file that does not exist cannot fabricate. If a future slice is
    // authorised to migrate, this guard is the thing it must consciously
    // replace, rather than something it can quietly slip past.
    for (const rel of PRODUCTION) {
      expect(rel, 'no V1 recording migration module may exist').not.toMatch(
        /recording[-/]migrat|migrat.*recording/i,
      );
    }
  });
});

describe('M20 — no verification is fabricated for stored data', () => {
  it('nothing builds a RecommendedLocator outside a measured resolve path', () => {
    // The five measured fields. A production file that writes a `verdict`
    // literal next to counts it did not measure is the failure mode this whole
    // product exists to avoid, and after this slice the recording code contains
    // no such construction at all.
    for (const [rel, source] of CODE) {
      if (!/\bRecordedTarget\b/.test(source)) continue;
      expect(source, `${rel} must not assign a verdict literal`).not.toMatch(
        /verdict\s*:\s*['"](unique|multiple|none|ambiguous)['"]/,
      );
      expect(source, `${rel} must not assign a match count literal`).not.toMatch(
        /(matchCount|visibleMatchCount)\s*:\s*\d/,
      );
    }
  });

  it('the recording modules never resolve, probe or re-rank stored data', () => {
    for (const rel of PRODUCTION.filter((f) => f.startsWith('src/recording/'))) {
      const source = stripComments(readExtFile(rel));
      for (const forbidden of ['DomProbe', 'LocatorResolver', 'resolveLocator', 'document.']) {
        expect(source, `${rel} must not reach for ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
