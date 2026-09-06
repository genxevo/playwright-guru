/**
 * Release metadata and packaging structure.
 *
 * Two things this protects:
 *
 *   1. `chrome.sidePanel` — the extension's entire UI — requires Chrome 114.
 *      Without `minimum_chrome_version` an older Chrome installs the extension
 *      happily and the panel then fails to open with no explanation, which is
 *      the same class of unaccountable state Stage 1 exists to remove.
 *
 *   2. The archive must contain the CONTENTS of `.output/chrome-mv3`, not the
 *      folder. Zipping the folder yields an archive Chrome rejects, and the
 *      mistake is invisible until upload. It has happened once already.
 *
 * Manifest assertions need a build, so they skip when none is present.
 * `pnpm verify` and CI both build first.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const EXT = resolve(__dirname, '..');
const BUILD = join(EXT, '.output', 'chrome-mv3');
const MANIFEST = join(BUILD, 'manifest.json');
const built = existsSync(MANIFEST);

interface Manifest {
  manifest_version: number;
  name: string;
  version: string;
  minimum_chrome_version?: string;
  permissions?: string[];
  host_permissions?: string[];
  icons?: Record<string, string>;
  background?: { service_worker?: string };
  side_panel?: { default_path?: string };
}

const manifest = (): Manifest => JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;

describe('manifest declares the compatibility the UI actually needs', () => {
  it('sets minimum_chrome_version in the source of truth', () => {
    // Asserted at source as well as in the build, so the intent survives even
    // if someone inspects only the config.
    expect(readFileSync(join(EXT, 'wxt.config.ts'), 'utf8')).toMatch(
      /minimum_chrome_version:\s*'114'/,
    );
  });

  it.skipIf(!built)('carries it through into the generated manifest', () => {
    expect(manifest().minimum_chrome_version).toBe('114');
  });

  it.skipIf(!built)('declares a side panel, which is what makes 114 the floor', () => {
    expect(manifest().side_panel?.default_path).toBeTruthy();
  });

  it.skipIf(!built)('is Manifest V3 with a service worker', () => {
    const m = manifest();
    expect(m.manifest_version).toBe(3);
    expect(m.background?.service_worker).toBeTruthy();
  });

  it.skipIf(!built)('uses a version Chrome will accept', () => {
    expect(manifest().version).toMatch(/^\d+(\.\d+){0,3}$/);
  });

  it.skipIf(!built)('requests exactly the four permissions the product uses', () => {
    expect([...(manifest().permissions ?? [])].sort()).toEqual([
      'activeTab',
      'scripting',
      'sidePanel',
      'storage',
    ]);
  });

  it.skipIf(!built)('documents the icon gap honestly rather than shipping a placeholder', () => {
    // Icons are a tracked release input awaiting a product decision. This test
    // records the current, known state; when icons land it is updated to assert
    // all four sizes are present and packaged.
    const icons = manifest().icons;
    if (icons) {
      expect(Object.keys(icons).sort()).toEqual(['128', '16', '32', '48']);
    } else {
      expect(icons).toBeUndefined();
    }
  });
});

describe('packaging is validated deterministically', () => {
  it('ships a validation script rather than relying on a remembered command', () => {
    const script = join(EXT, 'scripts/validate-package.mjs');
    expect(existsSync(script)).toBe(true);
    const source = readFileSync(script, 'utf8');
    // The specific mistake it guards against.
    expect(source).toMatch(/nested build directory/);
    expect(source).toMatch(/manifest\.json is not at the archive root/);
    // Zipping from INSIDE the build directory is the whole point.
    expect(source).toMatch(/cwd:\s*BUILD_DIR/);
  });

  it('is reachable as a package script', () => {
    const pkg = JSON.parse(readFileSync(join(EXT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.package).toBe('node scripts/validate-package.mjs');
  });

  it('refuses source, maps and dependencies in the artifact', () => {
    const source = readFileSync(join(EXT, 'scripts/validate-package.mjs'), 'utf8');
    for (const forbidden of ['node_modules', 'TypeScript source', 'source map']) {
      expect(source).toContain(forbidden);
    }
  });
});
