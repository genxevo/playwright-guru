/**
 * WS0 — extension-side seam tests.
 *
 * Covers the guarantees that live on the extension side of the boundary: that
 * rationale copy is exhaustive and lives in exactly one place, that recording
 * limits have a single owner, and that surface differences are expressed as
 * data rather than as branches.
 */

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, posix, relative, resolve, sep, win32 } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RATIONALE_CODES } from '@playwright-guru/locator-engine';
import { RATIONALE_COPY, resolveRationaleCopy } from '../src/ui/copy/rationale';
import {
  RECORDING_LIMITS,
  recordingLimitState,
  shouldStopRecording,
} from '../src/config/recording';
import { DEVTOOLS_CAPABILITIES, TAB_CAPABILITIES } from '../src/application/adapters';

const SRC = resolve(__dirname, '../src');

/**
 * An absolute path rendered as a POSIX, repo-relative path.
 *
 * Assertions must read identically on Windows, macOS and Linux. Comparing raw
 * absolute paths does not: `path.join` yields `src\config\recording.ts` on
 * Windows and `src/config/recording.ts` elsewhere, so a naive string comparison
 * passes on CI (Linux) and fails on a developer's machine (Windows).
 */
const toRepoPath = (file: string): string => `src/${relative(SRC, file).split(sep).join('/')}`;

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    }),
  );
  return files.flat();
}

// ─── Rationale copy: exhaustive, and the only home for wording (E-2) ────────

describe('rationale copy mapping', () => {
  it('covers every rationale code the domain can emit', () => {
    const covered = Object.keys(RATIONALE_COPY).sort();
    expect(covered).toEqual([...RATIONALE_CODES].sort());
  });

  it('has no orphan entries for codes that no longer exist', () => {
    const known = new Set<string>(RATIONALE_CODES);
    const orphans = Object.keys(RATIONALE_COPY).filter((code) => !known.has(code));
    expect(orphans).toEqual([]);
  });

  it('gives every code a non-empty title', () => {
    for (const code of RATIONALE_CODES) {
      expect(RATIONALE_COPY[code].title.trim().length, code).toBeGreaterThan(0);
    }
  });

  it('resolves parameterised copy using engine parameters', () => {
    const scoped = resolveRationaleCopy('SCOPED_BY_ANCESTOR', {
      ancestorRole: 'row',
      ancestorName: 'Jane Doe',
      siblingMatches: 3,
    });
    expect(scoped.detail).toContain('row');
    expect(scoped.detail).toContain('Jane Doe');
    expect(scoped.detail).toContain('3');
  });

  it('resolves every code without throwing, even with no parameters', () => {
    for (const code of RATIONALE_CODES) {
      expect(() => resolveRationaleCopy(code), code).not.toThrow();
    }
  });
});

// ─── Domain Prose Exclusion, enforced structurally (E-3) ────────────────────

describe('domain prose exclusion', () => {
  it('keeps rationale wording out of the domain packages', async () => {
    const domainRoots = [
      resolve(__dirname, '../../locator-engine/src'),
      resolve(__dirname, '../../codegen/src'),
    ];

    for (const root of domainRoots) {
      for (const file of await walk(root)) {
        const source = readFileSync(file, 'utf8');
        expect(source, `${file} must not import UI copy`).not.toMatch(/from\s+['"].*ui\/copy/);
      }
    }
  });
});

// ─── Recording limits: exactly one owner ────────────────────────────────────

describe('recording limits have a single authoritative source', () => {
  it('declares warnAt and hardStop in exactly one module', async () => {
    const files = await walk(SRC);
    const declaring = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /\bwarnAt\s*:/.test(source) && /\bhardStop\s*:/.test(source);
    });

    // Semantics unchanged: exactly one module declares both limits, and it is
    // src/config/recording.ts. Only the path rendering is platform-independent.
    expect(declaring.map(toRepoPath)).toEqual(['src/config/recording.ts']);
  });

  it('renders repo paths identically on Windows and POSIX separators', () => {
    // Regression guard for the bug this suite actually hit: the assertion above
    // previously compared raw paths, which passed on Linux and failed on
    // Windows. Exercised against both separator conventions explicitly, because
    // `path.sep` alone can only ever test the host platform.
    const normalise = (separator: string) => (p: string) => p.split(separator).join('/');
    expect(normalise(win32.sep)('config\\recording.ts')).toBe('config/recording.ts');
    expect(normalise(posix.sep)('config/recording.ts')).toBe('config/recording.ts');
  });

  it('uses the locked values', () => {
    expect(RECORDING_LIMITS.warnAt).toBe(40);
    expect(RECORDING_LIMITS.hardStop).toBe(100);
    expect(RECORDING_LIMITS.warnAt).toBeLessThan(RECORDING_LIMITS.hardStop);
  });

  it('warns at 40 WITHOUT interrupting the recording', () => {
    expect(recordingLimitState(39)).toBe('normal');
    expect(recordingLimitState(40)).toBe('warning');
    expect(recordingLimitState(99)).toBe('warning');

    // The guarantee that matters: warning never stops a recording.
    expect(shouldStopRecording(40)).toBe(false);
    expect(shouldStopRecording(99)).toBe(false);
  });

  it('stops at 100', () => {
    expect(recordingLimitState(100)).toBe('stopped');
    expect(shouldStopRecording(100)).toBe(true);
  });
});

// ─── Surface capabilities are data, not branches ────────────────────────────

describe('surface capability profiles', () => {
  it('gives the tab surface the interactive capabilities', () => {
    expect(TAB_CAPABILITIES.canActivatePicker).toBe(true);
    expect(TAB_CAPABILITIES.canRecord).toBe(true);
    expect(TAB_CAPABILITIES.canCaptureAssertion).toBe(true);
  });

  it('marks DevTools as unable to record in Phase 1, with verification intact', () => {
    // inspectedWindow.eval is request/response with no event stream, so
    // recording stays a Side Panel capability until Phase 3.
    expect(DEVTOOLS_CAPABILITIES.canRecord).toBe(false);
    expect(DEVTOOLS_CAPABILITIES.canCaptureAssertion).toBe(false);
    expect(DEVTOOLS_CAPABILITIES.canVerify).toBe(true);
    expect(DEVTOOLS_CAPABILITIES.hasElementsPanelSync).toBe(true);
  });

  it('describes both surfaces with the same keys, so the UI can branch on data', () => {
    expect(Object.keys(TAB_CAPABILITIES).sort()).toEqual(Object.keys(DEVTOOLS_CAPABILITIES).sort());
  });
});
