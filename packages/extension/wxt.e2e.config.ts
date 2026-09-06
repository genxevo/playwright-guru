/**
 * WS9 Decision A — THE E2E-ONLY BUILD.
 * ============================================================================
 * NOT A PRODUCTION CONFIG. NOT REACHABLE FROM `pnpm build`.
 *
 * `pnpm build` runs `wxt build`, which loads `wxt.config.ts` and writes
 * `.output/`. This file is loaded ONLY by an explicit `wxt build -c
 * wxt.e2e.config.ts`, and it writes ONLY to `.output-e2e/`. Neither build can
 * overwrite the other's artifact, and no script in the repository's build,
 * verify, package or release path invokes this one.
 *
 * ═══ WHAT IT PRODUCES, AND WHY THAT IS SAFE ═══
 *
 * An extension identical to production in every respect — same entrypoints,
 * same manifest, same permission set, same code — EXCEPT that one module,
 * `src/config/recording.ts`, is replaced at resolution time with
 * `test/e2e/recording-enabled.config.ts`, whose `RECORDING_ENABLED` is `true`.
 *
 * Everything else is INHERITED from `wxt.config.ts` rather than restated, on
 * purpose. A config that re-declared the manifest would drift from the product
 * silently, and the E2E artifact would stop being evidence about the extension
 * we actually ship. Inheriting means the artifact differs from production in
 * exactly the ways this file names below and in no others.
 *
 * ═══ THE THREE THINGS THAT DELIBERATELY DIFFER ═══
 *
 *   1. `outDir`        `.output-e2e` — never `.output`.
 *   2. manifest `name` a DIFFERENT name, so the artifact announces itself from
 *                      inside a running browser. This is how the E2E suite
 *                      proves WHICH artifact it loaded, rather than assuming.
 *   3. the recording config module, as described above.
 *
 * The permission set is NOT among them. `activeTab`, `storage`, `scripting`,
 * `sidePanel` and host `<all_urls>` come from the production config unchanged,
 * and the E2E suite asserts them in the loaded manifest of BOTH artifacts. A
 * test build that could quietly acquire a permission would be a test build that
 * proves nothing about the product.
 *
 * ═══ FAIL LOUD, NEVER HALF-ENABLED ═══
 *
 * DL-87's feasibility experiment produced a HALF-ENABLED artifact: the
 * substitution was keyed on the import SPECIFIER, and two different specifiers
 * reach the recording config —
 *
 *     '../config/recording'          from 6 modules under src/, INCLUDING
 *                                    `runtime/recording.ts`, which owns the gate
 *     '../../src/config/recording'   from the 3 sidepanel components
 *
 * — so the UI rendered a Record button while the runtime still refused to
 * start. That artifact was worse than useless: it looked enabled and behaved
 * disabled, and a suite run against it would have "proved" a banner that no
 * recorder backed.
 *
 * Two mechanisms make that unrepeatable, and BOTH are hard failures:
 *
 *   • The key is the RESOLVED ABSOLUTE PATH, obtained from `this.resolve`, not
 *     the specifier text. Every specifier that lands on the production module
 *     is substituted, by construction, whatever it is spelled like.
 *
 *   • The build THROWS if the substitution never fired, and THROWS if any
 *     module other than the substitute itself still imports the production
 *     config. Not a warning, not a log line: the build fails and no artifact is
 *     produced, because an artifact whose recording state is unknown is exactly
 *     the thing that must never exist.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'wxt';

import base from './wxt.config';

import type { WxtViteConfig } from 'wxt';

/**
 * Vite's own `Plugin` type, reached through WXT rather than by importing
 * `vite` directly.
 *
 * `vite` is not a dependency of this package — it arrives under WXT, and pnpm's
 * strict layout means `import type { Plugin } from 'vite'` does not resolve
 * here. Adding vite to `package.json` to obtain a TYPE would put a build tool
 * into the extension's own dependency graph, which is the same class of mistake
 * DL-20 settled for playwright. `WxtViteConfig` is WXT's public re-statement of
 * `vite.UserConfig`, so the type is derived from the one that is already ours.
 */
type VitePlugin = Extract<
  NonNullable<Awaited<NonNullable<WxtViteConfig['plugins']>[number]>>,
  { name: string }
>;

/**
 * This file's own directory — the extension root.
 *
 * Derived from the module's location, never hard-coded and never taken from
 * `process.cwd()`: a literal path works exactly once, on the machine it was
 * written on, and a cwd-relative path silently resolves somewhere else the
 * moment the command is run from the workspace root instead of the package.
 */
const ROOT = dirname(fileURLToPath(import.meta.url));

/** The production module. Read, never written. */
const PRODUCTION_CONFIG = resolve(ROOT, 'src/config/recording.ts');

/** The test-only replacement. */
const E2E_CONFIG = resolve(ROOT, 'test/e2e/recording-enabled.config.ts');

/** The name the E2E artifact reports from `chrome.runtime.getManifest()`. */
export const E2E_EXTENSION_NAME = 'Playwright Guru — E2E RECORDING BUILD';

/** Where the E2E artifact is written. Never `.output`. */
export const E2E_OUT_DIR = '.output-e2e';

/**
 * Vite/Rollup ids can carry a query (`?used`, `?v=…`) and, on Windows, either
 * separator. Compare on the bare filesystem path so the key stays exact rather
 * than accidentally prefix-matching a neighbouring file.
 */
function normalise(id: string): string {
  return (id.split('?')[0] ?? id).split('\\').join('/');
}

/**
 * How many times the substitution fired, across EVERY Vite build in this
 * process.
 *
 * WXT runs several builds (background, content scripts, HTML pages) from one
 * command, and only some of them import the recording config at all — so a
 * per-build assertion would fail on the popup build for the right reason and
 * the wrong test. The count is therefore process-wide and is checked once, in
 * WXT's `build:done` hook, after every sub-build has finished.
 */
let substitutions = 0;

function recordingEnabledSubstitution(): VitePlugin {
  return {
    name: 'pg-e2e-recording-enabled',
    enforce: 'pre',

    async resolveId(source, importer, options) {
      if (!importer) return null;

      // The substitute's own re-export of the limits is the ONE import of the
      // production module that is allowed to stand. Substituting it here would
      // make the module import itself; forbidding it would force the limits to
      // be duplicated, which `src/config/recording.ts` explicitly prohibits.
      // `buildEnd` below asserts this exemption never widens beyond this file.
      if (normalise(importer) === normalise(E2E_CONFIG)) return null;

      // THE KEY IS THE RESOLVED PATH, NOT THE SPECIFIER. This single line is
      // the whole correction to DL-87's half-enabled artifact.
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || normalise(resolved.id) !== normalise(PRODUCTION_CONFIG)) return null;

      substitutions += 1;
      return E2E_CONFIG;
    },

    buildEnd(error) {
      if (error) return;

      // Structural proof, per sub-build: if the production config is in this
      // graph at all, the substitute must be its only importer. Anything else
      // means a path reached `RECORDING_ENABLED = false` inside a build whose
      // entire purpose is that it does not — the half-enabled artifact again.
      const info = this.getModuleInfo(PRODUCTION_CONFIG);
      if (!info) return;
      const trespassers = info.importers.filter((id) => normalise(id) !== normalise(E2E_CONFIG));
      if (trespassers.length > 0) {
        this.error(
          'E2E BUILD ABORTED — the production recording config was imported by a module ' +
            'other than the test-only substitute:\n  ' +
            trespassers.join('\n  ') +
            '\nThat produces a HALF-ENABLED artifact (UI enabled, runtime disabled), which ' +
            'is exactly what DL-87 refused to ship. No artifact has been written.',
        );
      }
    },
  };
}

const baseManifest = typeof base.manifest === 'function' ? null : base.manifest;
if (!baseManifest) {
  throw new Error(
    'E2E BUILD ABORTED — `wxt.config.ts` no longer exports a plain manifest object, so this ' +
      'config can no longer inherit the production manifest. Restating it here instead would ' +
      'let the E2E artifact drift from the product it is meant to be evidence about. Update ' +
      'this file deliberately.',
  );
}

export default defineConfig({
  ...base,
  outDir: E2E_OUT_DIR,
  manifest: {
    ...baseManifest,
    // The artifact says what it is, from inside the browser. The E2E suite
    // asserts this name before it asserts anything about recording, so a run
    // against the wrong `--load-extension` directory fails immediately instead
    // of reporting a green result about the other artifact.
    name: E2E_EXTENSION_NAME,
  },
  vite: async (env) => {
    // Awaited because WXT allows an async `vite()` and the production config is
    // free to become one. Inheriting rather than restating is the point: the
    // E2E artifact must differ from production only where this file says so.
    const inherited: WxtViteConfig = await (typeof base.vite === 'function'
      ? base.vite(env)
      : (base.vite ?? {}));
    return {
      ...inherited,
      plugins: [...(inherited.plugins ?? []), recordingEnabledSubstitution()],
    };
  },
  hooks: {
    /**
     * THE FAIL-LOUD GATE. Runs once, after every sub-build.
     *
     * Zero substitutions means the plugin never saw the production module: the
     * config was edited, the path moved, WXT dropped the plugin, or resolution
     * changed shape. In every one of those cases the artifact on disk is the
     * PRODUCTION build wearing an E2E name — recording disabled — and a suite
     * that trusted it would report a banner proof it never performed.
     *
     * So the artifact is deleted and the build fails. There is no warn-and-
     * continue path, because "probably enabled" is not a state this artifact is
     * allowed to be in.
     */
    'build:done': async (wxt) => {
      if (substitutions > 0) return;
      const { rmSync } = await import('node:fs');
      rmSync(wxt.config.outDir, { recursive: true, force: true });
      throw new Error(
        'E2E BUILD ABORTED — the recording-config substitution NEVER FIRED.\n' +
          `  expected to replace: ${PRODUCTION_CONFIG}\n` +
          `  with:                ${E2E_CONFIG}\n` +
          'Without it this artifact is the production build under a different name, with ' +
          'RECORDING_ENABLED=false, and the WS9 banner proof it exists to support would be ' +
          'fabricated. The output directory has been removed.',
      );
    },
  },
});

/**
 * A read-only assertion about the PRODUCTION source, evaluated when this config
 * is loaded.
 *
 * This config's whole justification is that it changes nothing in production.
 * If someone ever "helps" by flipping the production constant, the honest
 * outcome is that the E2E build — the thing that exists precisely because the
 * constant is false — refuses to run, rather than quietly becoming redundant
 * while the product ships a recorder.
 */
{
  // Named `productionSource`, not `source`: `source` already means "an import
  // specifier" in `resolveId` above, and one file holding two very different
  // `source`s is how a reader — or a guard reading this file's text — comes to
  // the wrong conclusion about which one is being matched.
  const productionSource = readFileSync(PRODUCTION_CONFIG, 'utf8');
  if (!/^export const RECORDING_ENABLED = false;$/m.test(productionSource)) {
    throw new Error(
      'E2E BUILD ABORTED — `src/config/recording.ts` no longer contains the locked line ' +
        '`export const RECORDING_ENABLED = false;`. This build exists only to reach an ' +
        'enabled recorder WITHOUT changing production. If production changed, that premise ' +
        'is gone and the change must be reviewed, not built around.',
    );
  }
}
