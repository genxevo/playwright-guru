/**
 * WS9 DECISION A — THE GUARDS THAT KEEP THE TEST-ONLY BUILD TEST-ONLY.
 * ============================================================================
 * WHAT WAS AUTHORISED, PRECISELY:
 *
 *   An isolated, E2E-ONLY artifact in which `RECORDING_ENABLED` is `true`, so
 *   that the WS9 exit criterion — "an E2E test that kills the content script
 *   proves the RECORDING banner cannot appear" — can be proven in its
 *   SUFFICIENT form. Proving a banner cannot appear is meaningless unless it
 *   can, and against the shipped artifact it never can.
 *
 * WHAT WAS NOT AUTHORISED, AND WHAT THIS FILE MAKES UNREPEATABLE:
 *
 *   • flipping the production constant
 *   • making the production constant environment-dependent
 *   • a runtime toggle, a URL switch, a storage switch, a debug switch
 *   • a production test hook of any kind
 *   • a test build that quietly acquires an extension permission
 *   • a half-enabled artifact (UI enabled, runtime disabled) — DL-87's
 *     feasibility experiment produced exactly one, and it is the specific
 *     failure several assertions below exist to prevent
 *
 * ═══ WHY SOURCE TEXT, AND NOT ONLY THE E2E SUITE ═══
 *
 * The E2E suite proves the two artifacts BEHAVE differently, but it needs a
 * real Chromium and an ad-hoc playwright install, so CI does not run it (DL-86,
 * still open). These assertions run in the ordinary vitest pass at R3's
 * `environment: 'node'`, on every commit, with no browser. They are the half of
 * the protection that is always on: the E2E suite proves the artifacts are what
 * we say, and this file proves nobody has rewired how they are produced.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RECORDING_ENABLED, RECORDING_LIMITS } from '../src/config/recording';

import { EXT_ROOT, readExtFile, stripComments } from './helpers/surface-source';

const read = (rel: string): string => readExtFile(rel);
const code = (rel: string): string => stripComments(readExtFile(rel));

const PRODUCTION_CONFIG = 'src/config/recording.ts';
const E2E_BUILD_CONFIG = 'wxt.e2e.config.ts';
const E2E_SUBSTITUTE = 'test/e2e/recording-enabled.config.ts';
const HARNESS = 'test/e2e/harness.mjs';
const PRODUCTION_SUITE = 'test/e2e/ws9-fail-closed.e2e.mjs';
const CLOSURE_SUITE = 'test/e2e/ws9-recording-enabled.e2e.mjs';

const extPackage = (): Record<string, string> =>
  JSON.parse(readExtFile('package.json')).scripts as Record<string, string>;

const rootPackage = (): Record<string, string> =>
  JSON.parse(readFileSync(resolve(EXT_ROOT, '../../package.json'), 'utf8')).scripts as Record<
    string,
    string
  >;

// ═══ A. PRODUCTION IS UNCONDITIONALLY DISABLED ═════════════════════════════

describe('WS9-DA-1 — the production flag is a literal with nothing to override', () => {
  it('is false, and says so in one exact, unconditional line', () => {
    expect(RECORDING_ENABLED).toBe(false);
    // The literal line matters as much as the value. A `false` computed from
    // anything at all would still be `false` today and would still satisfy the
    // assertion above, while having quietly become a second behaviour path in
    // the one module whose entire purpose is to be provably closed.
    expect(read(PRODUCTION_CONFIG)).toMatch(/^export const RECORDING_ENABLED = false;$/m);
  });

  it('reads no environment, no define, no global and no build mode', () => {
    const source = code(PRODUCTION_CONFIG);
    for (const forbidden of [
      /import\.meta\.env/,
      /process\.env/,
      /globalThis/,
      /__DEV__|__TEST__|__E2E__/,
      /NODE_ENV|MODE\b/,
    ]) {
      expect(
        source,
        `the production recording config must not read ${String(forbidden)} — DL-87 rejected ` +
          'making this constant environment-dependent, and the E2E build exists precisely so ' +
          'that it never has to be',
      ).not.toMatch(forbidden);
    }
  });

  it('offers no runtime toggle, no override parameter and no test hook', () => {
    const source = code(PRODUCTION_CONFIG);
    // `let`/`var` would make the flag assignable; an exported setter would make
    // it settable. Neither exists, and neither may be added.
    expect(source).not.toMatch(/\b(let|var)\s+RECORDING_ENABLED\b/);
    expect(source).not.toMatch(/setRecording|enableRecording|__setRecording|overrideRecording/i);
    expect(source).not.toMatch(/storage|chrome\.|browser\./);
  });
});

// ═══ B. THE TWO WORLDS DO NOT TOUCH ════════════════════════════════════════

describe('WS9-DA-2 — nothing shippable can reach the test-only build', () => {
  const shippedFiles = (): string[] => {
    // The composed surfaces plus the entrypoints ARE the shipped graph; walking
    // it here rather than listing files means a new module is covered the day
    // it is written.
    const walk = (dir: string): string[] =>
      readdirSync(resolve(EXT_ROOT, dir)).flatMap((name: string) => {
        const rel = `${dir}/${name}`;
        return statSync(resolve(EXT_ROOT, rel)).isDirectory()
          ? walk(rel)
          : /\.(ts|tsx)$/.test(name)
            ? [rel]
            : [];
      });
    return [...walk('src'), ...walk('entrypoints'), ...walk('utils')];
  };

  it('no shipped module imports anything from test/ or names the E2E build', () => {
    for (const file of shippedFiles()) {
      const source = code(file);
      expect(source, `${file} must not import from test/`).not.toMatch(/from\s+['"][^'"]*\btest\//);
      expect(source, `${file} must not reference the E2E substitute`).not.toContain(
        'recording-enabled.config',
      );
      expect(source, `${file} must not reference the E2E build config`).not.toContain(
        'wxt.e2e.config',
      );
      expect(source, `${file} must not reference the E2E artifact directory`).not.toContain(
        '.output-e2e',
      );
    }
  });

  it('the production wxt config knows nothing about the E2E build', () => {
    const source = read('wxt.config.ts');
    expect(source).not.toContain('e2e');
    expect(source).not.toContain('recording');
  });
});

// ═══ C. THE SUBSTITUTION IS KEYED ON THE RESOLVED PATH ═════════════════════

describe('WS9-DA-3 — the DL-87 half-enabled artifact cannot happen again', () => {
  it('resolves the module before deciding, rather than matching the specifier', () => {
    const source = code(E2E_BUILD_CONFIG);

    // THE REGRESSION GUARD. DL-87's experiment matched the import SPECIFIER
    // with `/^.*\/src\/config\/recording$/`, which caught
    // `'../../src/config/recording'` from the three sidepanel components and
    // MISSED `'../config/recording'` from the six modules under src/ —
    // including `runtime/recording.ts`, which owns the gate. The artifact
    // rendered a Record button over a runtime that refused to start.
    expect(source, 'the decision must be made on the RESOLVED module').toMatch(
      /this\.resolve\(\s*source/,
    );
    expect(source).toMatch(/resolved\.id/);

    // And it must not decide on the raw specifier text.
    expect(source, 'the specifier must never be the key').not.toMatch(
      /source\s*===|source\.endsWith|source\.includes|test\(\s*source\s*\)|exec\(\s*source\s*\)/,
    );
  });

  it('names the production module by a path derived from this file, never a literal', () => {
    const source = code(E2E_BUILD_CONFIG);
    expect(source).toMatch(/fileURLToPath\(import\.meta\.url\)/);
    expect(source).toMatch(/resolve\(ROOT, 'src\/config\/recording\.ts'\)/);
    expect(source, 'never cwd — the command may be run from the workspace root').not.toMatch(
      /process\.cwd\(\)/,
    );
  });
});

// ═══ D. THE BUILD FAILS LOUDLY, IT NEVER WARNS AND CONTINUES ═══════════════

describe('WS9-DA-4 — an artifact whose recording state is unknown cannot be produced', () => {
  const source = (): string => code(E2E_BUILD_CONFIG);

  it('throws when the substitution never fires', () => {
    expect(source()).toMatch(/'build:done'/);
    expect(source()).toMatch(/substitutions > 0/);
    // Bound to its OWN message, not merely to "a throw exists somewhere in the
    // file". A mutation that replaced this `throw` with `console.warn` was
    // caught only by the log-line assertion below, because another `throw` — the
    // manifest-inheritance guard — kept the loose version green. A guard that
    // passes for a reason unrelated to its claim is not a guard.
    expect(source(), 'the zero case must THROW, with this message').toMatch(
      /throw new Error\(\s*'E2E BUILD ABORTED — the recording-config substitution NEVER FIRED/,
    );
    expect(source(), 'and must remove the output rather than leave it to be trusted').toMatch(
      /rmSync\(/,
    );
  });

  it('throws when any module other than the substitute still imports production', () => {
    expect(source()).toMatch(/buildEnd/);
    expect(source()).toMatch(/importers/);
    expect(source()).toMatch(/this\.error\(/);
  });

  it('refuses to build at all if the production line ever stops saying false', () => {
    expect(source()).toMatch(/RECORDING_ENABLED = false/);
    expect(source()).toMatch(/readFileSync\(PRODUCTION_CONFIG/);
  });

  it('never downgrades any of those to a log line', () => {
    expect(source(), 'a warning is not a gate').not.toMatch(/console\.(warn|log|info|error)\s*\(/);
  });
});

// ═══ E. THE SUBSTITUTE IS A SUBSTITUTE, NOT A FORK ═════════════════════════

describe('WS9-DA-5 — the test-only module changes one thing and duplicates nothing', () => {
  it('declares only the flag, and re-exports everything else from the one owner', () => {
    const source = code(E2E_SUBSTITUTE);

    expect(source).toMatch(/^export const RECORDING_ENABLED = true;$/m);
    expect(source).toMatch(/from\s+'\.\.\/\.\.\/src\/config\/recording'/);
    for (const name of ['RECORDING_LIMITS', 'recordingLimitState', 'shouldStopRecording']) {
      expect(source, `${name} must be re-exported, never redefined`).toContain(name);
    }
  });

  it('duplicates no limit, and holds no application logic', () => {
    const source = code(E2E_SUBSTITUTE);
    // `src/config/recording.ts` states its own contract: "No other module may
    // define, hard-code or duplicate these numbers." A substitute that copied
    // them would put the E2E artifact under limits the product does not have,
    // and every count the closure suite asserts would be measuring a different
    // extension.
    expect(source).not.toMatch(/\bwarnAt\s*:/);
    expect(source).not.toMatch(/\bhardStop\s*:/);
    expect(source).not.toMatch(/\bheartbeat\w*\s*:/);
    // One `export const`, and nothing executable at all.
    expect(source.match(/\bexport const\b/g) ?? []).toHaveLength(1);
    expect(source).not.toMatch(/\bfunction\b|=>|\bclass\b|\bif\s*\(/);
  });

  it('is the only module in the repository that sets the flag true', () => {
    // The E2E build config asserts the production line by reading it, which is
    // a read of `= false`, so a naive repository-wide scan is not available
    // here. What matters is the narrow claim: no SHIPPED module says `true`,
    // and the substitute is where it is said.
    expect(code(PRODUCTION_CONFIG)).not.toMatch(/RECORDING_ENABLED = true/);
    expect(code(E2E_SUBSTITUTE)).toMatch(/RECORDING_ENABLED = true/);
  });
});

// ═══ F. NO PRODUCTION SCRIPT CAN BUILD OR SHIP THE E2E ARTIFACT ════════════

describe('WS9-DA-6 — the E2E build is unreachable from the release path', () => {
  it('is a script of its own, never part of build, verify, zip or package', () => {
    const ext = extPackage();
    const root = rootPackage();

    expect(ext['build:e2e']).toBe('wxt build -c wxt.e2e.config.ts');
    expect(root['build:e2e']).toContain('build:e2e');

    // The release path must not mention it. `clean` legitimately removes the
    // directory, so it is the one script allowed to name it.
    for (const [name, script] of [
      ['ext.build', ext.build],
      ['ext.zip', ext.zip],
      ['ext.package', ext.package],
      ['root.build', root.build],
      ['root.verify', root.verify],
    ] as Array<[string, string]>) {
      expect(script, `${name} must not build or reference the E2E artifact`).not.toMatch(
        /e2e|\.output-e2e/,
      );
    }
    expect(ext.clean, 'clean must remove the E2E artifact too').toContain('.output-e2e');
  });

  it('the package validator only ever looks at the shipped artifact', () => {
    const validator = code('scripts/validate-package.mjs');
    // It builds its path with `join(EXT_ROOT, '.output', 'chrome-mv3')` rather
    // than a slash-joined literal, so the assertion is on the SEGMENTS. A first
    // draft looked for `'.output/chrome-mv3'` and failed for that reason — a
    // guard that fails on a spelling teaches nothing about the claim.
    expect(validator).toMatch(/'\.output'/);
    expect(validator).toContain("'chrome-mv3'");
    expect(validator, 'the release path must never see the E2E artifact').not.toContain(
      'output-e2e',
    );
  });

  it('the E2E artifact directory is ignored by lint and by format', () => {
    // `.output` does not match `.output-e2e`; without its own entry the built
    // test artifact would be linted and format-checked, and a green `verify`
    // would then depend on whether someone had run `build:e2e` recently.
    const prettierignore = readFileSync(resolve(EXT_ROOT, '../../.prettierignore'), 'utf8');
    const eslintConfig = readFileSync(resolve(EXT_ROOT, '../../eslint.config.mjs'), 'utf8');
    const gitignore = readFileSync(resolve(EXT_ROOT, '../../.gitignore'), 'utf8');
    expect(prettierignore).toMatch(/^\.output-e2e$/m);
    expect(eslintConfig).toContain('**/.output-e2e/**');
    // CORRECTED AT THE FINAL RELEASE GATE (DL-90). This required the bare
    // `.output-e2e`, matching a `.gitignore` written at DL-88 on the false
    // premise that this repository had none. It has one — 1,799 bytes,
    // predating this session — in the owner's authoritative repository, and the
    // DL-88 file would have REPLACED it with a near-empty one, un-ignoring
    // `node_modules/`, `.output/`, `.env`, `*.pem` and `secrets.json`. The real
    // rules are now restored with `.output-e2e/` ADDED, and the directory form
    // (trailing slash) is the correct spelling for a directory rule.
    expect(gitignore).toMatch(/^\.output-e2e\/?$/m);
    // …and the restored file must still carry the rules that were nearly lost.
    for (const rule of ['node_modules/', '.output/', '.wxt/', 'secrets.json', '*.zip']) {
      expect(gitignore.split('\n'), `${rule} must not be lost again`).toContain(rule);
    }
  });
});

// ═══ G. NOTHING ANYWHERE HOLDS A PATH TO ONE MACHINE ═══════════════════════

describe('WS9-DA-7 — no absolute machine path survives in the E2E tooling', () => {
  it('every E2E file resolves its own paths at runtime', () => {
    for (const file of [E2E_BUILD_CONFIG, E2E_SUBSTITUTE, HARNESS, PRODUCTION_SUITE, CLOSURE_SUITE])
      for (const literal of [/\/home\//, /\/Users\//, /[A-Z]:\\\\/, /\.npm-global/]) {
        expect(
          code(file),
          `${file} must not embed an absolute path — a literal path works exactly once, on ` +
            'the machine it was written on (the mistake DL-86 corrected in this same harness)',
        ).not.toMatch(literal);
      }
  });
});

// ═══ H. THE ARTIFACTS THE SUITES ASSERT ON ARE THE ONES THE BUILDS MAKE ════

describe('WS9-DA-8 — artifact identity is stated once and agreed everywhere', () => {
  it('the E2E name in the harness is the name the E2E build writes', () => {
    const configured = /E2E_EXTENSION_NAME = '([^']+)'/.exec(read(E2E_BUILD_CONFIG))?.[1];
    const expected = /E2E_EXTENSION_NAME = '([^']+)'/.exec(read(HARNESS))?.[1];
    expect(configured, 'the E2E build config must name the artifact').toBeTruthy();
    expect(expected).toBe(configured);
    // And it must not be the product's name, or the suites could not tell the
    // two artifacts apart at all.
    expect(expected).not.toBe('Playwright Guru');
  });

  it('the production name in the harness is the name the production build writes', () => {
    const shipped = /name: '([^']+)'/.exec(read('wxt.config.ts'))?.[1];
    const expected = /PRODUCTION_EXTENSION_NAME = '([^']+)'/.exec(read(HARNESS))?.[1];
    expect(shipped).toBe('Playwright Guru');
    expect(expected).toBe(shipped);
  });

  it('the E2E artifact is written beside the shipped one, never over it', () => {
    const source = code(E2E_BUILD_CONFIG);
    expect(source).toMatch(/E2E_OUT_DIR = '\.output-e2e'/);
    expect(source).toMatch(/outDir: E2E_OUT_DIR/);
    expect(code(HARNESS)).toMatch(/\.output-e2e\/chrome-mv3/);
    expect(code(HARNESS)).toMatch(/\.output\/chrome-mv3/);
  });
});

// ═══ I. THE CLOSURE ARGUMENT ITSELF IS PINNED ══════════════════════════════

describe('WS9-DA-9 — the exit criterion is proven in both halves, and says so', () => {
  it('the production suite still holds its nine fail-closed tests', () => {
    const suite = read(PRODUCTION_SUITE);
    for (const id of [
      'E2E-01/02',
      'E2E-03',
      'E2E-04',
      'E2E-06',
      'E2E-07',
      'E2E-08',
      'E2E-09',
      'E2E-10',
      'E2E-13',
    ]) {
      expect(
        suite,
        `${id} must survive — this slice extends the suite, it does not replace it`,
      ).toContain(id);
    }
    // It still runs against the SHIPPED artifact and nothing else.
    expect(suite).not.toContain('E2E_EXTENSION_DIR');
  });

  it('the closure suite runs against the E2E artifact and names it explicitly', () => {
    const suite = read(CLOSURE_SUITE);
    expect(suite).toContain('E2E_EXTENSION_DIR');
    // There must be no ambient route to the enabled artifact: every launch of
    // it is a named argument, which makes every such call site grep-able.
    expect(suite).toMatch(/launchExtension\(\{\s*artifactDir/);
    for (const id of ['E2E-A1', 'E2E-A2', 'E2E-A3', 'E2E-A4', 'E2E-A5', 'E2E-A6']) {
      expect(suite).toContain(id);
    }
  });

  it('E2E-09 no longer describes the sufficient proof as missing', () => {
    // DL-86 wrote, correctly at the time, that the sufficient form "is
    // impossible without a test-only build (owner decision A)". The decision
    // was made and the proof exists, so that sentence is now false. A stale
    // honest caveat becomes a dishonest one; this pins the correction.
    const suite = read(PRODUCTION_SUITE);
    expect(suite).not.toContain('owner decision A');
    expect(suite, 'it must point at the suite that supplies the other half').toContain(
      'ws9-recording-enabled.e2e.mjs',
    );
  });

  it('both suites read their timing from the one limits module', () => {
    const suite = code(CLOSURE_SUITE);
    expect(suite).toContain('recordingLimits()');
    // The bound is DERIVED, never written down here. `heartbeatTimeoutMs` is
    // 15_000 today; a suite that hard-coded it would keep asserting the old
    // tolerance the day it changed.
    expect(suite).not.toMatch(/15_?000|\b15000\b/);
    expect(RECORDING_LIMITS.heartbeatTimeoutMs).toBe(15_000);
  });
});
