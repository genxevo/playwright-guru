/**
 * Deterministic validation of the Chrome MV3 release artifact.
 *
 * The failure this exists to prevent is real and already happened once: zipping
 * the `chrome-mv3` FOLDER instead of its CONTENTS produces an archive Chrome
 * rejects, and the mistake is invisible until upload. So the structure is
 * asserted rather than assumed.
 *
 * Run after a build:
 *   pnpm --filter @playwright-guru/extension run package
 *
 * Exits non-zero with a specific reason on any violation.
 */

import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = resolve(HERE, '..');
const BUILD_DIR = join(EXT_ROOT, '.output', 'chrome-mv3');
const DIST_DIR = join(EXT_ROOT, '.output', 'release');

/** Files that must never appear inside a published artifact. */
const FORBIDDEN = [
  { test: (p) => p.includes('node_modules/'), why: 'dependency tree' },
  { test: (p) => /\.tsx?$/.test(p), why: 'TypeScript source' },
  { test: (p) => p.endsWith('.map'), why: 'source map' },
  { test: (p) => p.startsWith('chrome-mv3/'), why: 'nested build directory' },
  { test: (p) => p.includes('.wxt/'), why: 'WXT scratch directory' },
  { test: (p) => p.endsWith('.tsbuildinfo'), why: 'TypeScript build info' },
  { test: (p) => p === '.env' || p.startsWith('.env.'), why: 'environment file' },
];

const fail = (message) => {
  console.error(`\n  ✗ PACKAGE INVALID — ${message}\n`);
  process.exit(1);
};

const sha256 = (path) =>
  new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('error', rejectPromise)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolvePromise(hash.digest('hex')));
  });

async function main() {
  const buildStat = await stat(BUILD_DIR).catch(() => null);
  if (!buildStat?.isDirectory()) {
    fail(`no build at ${BUILD_DIR} — run \`pnpm build\` from the repository root first`);
  }

  const manifestPath = join(BUILD_DIR, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  const version = manifest.version;
  if (!/^\d+(\.\d+){0,3}$/.test(version ?? '')) fail(`manifest version "${version}" is not valid`);

  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });
  const zipPath = join(DIST_DIR, `playwright-guru-${version}-chrome.zip`);

  // Zip the CONTENTS of chrome-mv3, from inside it — this is the whole point.
  execFileSync('zip', ['-r', '-q', '-X', zipPath, '.'], { cwd: BUILD_DIR });

  const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const files = listing.filter((entry) => !entry.endsWith('/'));

  if (!files.includes('manifest.json')) fail('manifest.json is not at the archive root');

  for (const entry of listing) {
    for (const rule of FORBIDDEN) {
      if (rule.test(entry)) fail(`archive contains a ${rule.why}: ${entry}`);
    }
  }

  const required = ['manifest.json', 'background.js'];
  for (const name of required) {
    if (!files.includes(name)) fail(`archive is missing a required entry: ${name}`);
  }

  const hasContentScript = files.some((f) => f.startsWith('content-scripts/'));
  if (!hasContentScript) fail('archive contains no content script');

  const declaredIcons = Object.values(manifest.icons ?? {});
  for (const iconPath of declaredIcons) {
    if (!files.includes(iconPath))
      fail(`manifest declares icon "${iconPath}" but it is not packaged`);
  }

  const zipBytes = (await stat(zipPath)).size;
  const digest = await sha256(zipPath);

  console.log('\n  Playwright Guru — release artifact\n');
  console.log(`  path         ${zipPath}`);
  console.log(`  size         ${zipBytes.toLocaleString()} bytes`);
  console.log(`  entries      ${files.length} files`);
  console.log(`  sha256       ${digest}`);
  console.log(`  version      ${version}`);
  console.log(`  min chrome   ${manifest.minimum_chrome_version ?? 'NOT DECLARED'}`);
  console.log(
    `  icons        ${declaredIcons.length > 0 ? declaredIcons.join(', ') : 'NONE — release input still outstanding'}`,
  );
  console.log(`  permissions  ${(manifest.permissions ?? []).join(', ')}`);
  console.log(`  host perms   ${(manifest.host_permissions ?? []).join(', ')}`);
  console.log('\n  ✓ structure valid — manifest at root, no source, no maps, no dependencies\n');

  if (declaredIcons.length === 0) {
    console.log("  ! icons are not declared. The extension will show Chrome's default");
    console.log('    puzzle-piece mark. This is a known, tracked release input.\n');
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
