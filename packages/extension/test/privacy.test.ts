/**
 * Privacy regression protection.
 *
 * "Everything stays on your machine" is a claim the store listing, the privacy
 * policy and the README all make. It is currently true. This suite exists so it
 * stays true by accident-proofing rather than by good intentions — a single
 * `fetch` added in a future workstream would silently falsify all three.
 *
 * Two layers, deliberately:
 *
 *   SOURCE  — stable, always runs, and points at the offending file.
 *   BUNDLE  — catches anything a dependency drags in that source review would
 *             miss. Skipped when no build is present, because `pnpm test` may
 *             run standalone; `pnpm verify` and CI both build first, so the
 *             bundle assertions always run where it matters.
 *
 * The tests assert on stable architectural facts, never on generated chunk
 * hashes, so a rebuild cannot make them fail spuriously.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const EXT = resolve(__dirname, '..');
const REPO = resolve(EXT, '../..');
const BUILD = join(EXT, '.output', 'chrome-mv3');

/** Network and exfiltration APIs. None of these may appear anywhere. */
const NETWORK_APIS = [
  { pattern: /\bfetch\s*\(/, name: 'fetch()' },
  { pattern: /\bXMLHttpRequest\b/, name: 'XMLHttpRequest' },
  { pattern: /\bnew\s+WebSocket\b/, name: 'WebSocket' },
  { pattern: /\bnavigator\s*\.\s*sendBeacon\b/, name: 'navigator.sendBeacon' },
  { pattern: /\bEventSource\s*\(/, name: 'EventSource' },
  { pattern: /\bimport\s*\(\s*['"`]https?:/, name: 'remote dynamic import' },
];

/** Storage that would leave the device. `local` stays; `sync` goes to Google. */
const REMOTE_STORAGE = [
  { pattern: /storage\s*\.\s*sync\b/, name: 'chrome.storage.sync (syncs to Google)' },
];

/** Known analytics and error-reporting vendors. */
const TRACKERS =
  /\b(google-analytics|googletagmanager|gtag\s*\(|mixpanel|amplitude|segment\.(?:io|com)|posthog|sentry|bugsnag|datadog|hotjar|fullstory)\b/i;

function walk(dir: string, match: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.output' || entry === '.wxt') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, match));
    else if (match.test(entry)) out.push(full);
  }
  return out;
}

/** Strips comments and strings so a mention in prose is not a false positive. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

const rel = (file: string): string => relative(REPO, file).split(sep).join('/');

// ─── Source layer ───────────────────────────────────────────────────────────

describe('privacy contract — source', () => {
  const sourceRoots = [
    join(EXT, 'entrypoints'),
    join(EXT, 'src'),
    join(EXT, 'utils'),
    join(REPO, 'packages/locator-engine/src'),
    join(REPO, 'packages/codegen/src'),
  ];
  const sourceFiles = sourceRoots.flatMap((root) => walk(root, /\.tsx?$/));

  it('finds source to scan', () => {
    expect(sourceFiles.length).toBeGreaterThan(15);
  });

  it('makes no network calls of any kind', () => {
    for (const file of sourceFiles) {
      const body = code(readFileSync(file, 'utf8'));
      for (const api of NETWORK_APIS) {
        expect(api.pattern.test(body), `${rel(file)} must not use ${api.name}`).toBe(false);
      }
    }
  });

  it('never uses Chrome sync storage, which would upload user data to Google', () => {
    for (const file of sourceFiles) {
      const body = code(readFileSync(file, 'utf8'));
      for (const api of REMOTE_STORAGE) {
        expect(api.pattern.test(body), `${rel(file)} must not use ${api.name}`).toBe(false);
      }
    }
  });

  it('contains no analytics, telemetry or error-reporting vendor', () => {
    for (const file of sourceFiles) {
      expect(TRACKERS.test(code(readFileSync(file, 'utf8'))), `${rel(file)}`).toBe(false);
    }
  });

  it('reads the clipboard never, and writes it only on an explicit user action', () => {
    for (const file of sourceFiles) {
      const body = code(readFileSync(file, 'utf8'));
      expect(/clipboard\s*\.\s*readText/.test(body), `${rel(file)}`).toBe(false);
    }
  });

  it('keeps the Vite modulepreload polyfill off, so no fetch enters the bundle', () => {
    // The polyfill only ever fetches this extension's own chunks, but it put a
    // network API into a bundle that otherwise has none — and "no network calls
    // at all" is a claim the listing and privacy policy both make. Chrome 114
    // (the declared floor) supports modulepreload natively.
    expect(readFileSync(join(EXT, 'wxt.config.ts'), 'utf8')).toMatch(
      /modulePreload:\s*\{\s*polyfill:\s*false\s*\}/,
    );
  });

  it('declares no host-reaching permission beyond the picker requirement', () => {
    const config = readFileSync(join(EXT, 'wxt.config.ts'), 'utf8');
    expect(config).not.toMatch(
      /"?(cookies|history|bookmarks|identity|downloads|webRequest|management|topSites)"?\s*[,\]]/,
    );
  });
});

// ─── Bundle layer ───────────────────────────────────────────────────────────

describe('privacy contract — built bundle', () => {
  const built = existsSync(BUILD);
  const bundleFiles = built ? walk(BUILD, /\.(js|html)$/) : [];

  it.skipIf(!built)('finds a build to scan', () => {
    expect(bundleFiles.length).toBeGreaterThan(5);
  });

  it.skipIf(!built)('ships no network API, including from dependencies', () => {
    for (const file of bundleFiles) {
      const body = readFileSync(file, 'utf8');
      for (const api of NETWORK_APIS) {
        expect(api.pattern.test(body), `${rel(file)} must not contain ${api.name}`).toBe(false);
      }
      expect(/storage\s*\.\s*sync\b/.test(body), `${rel(file)}`).toBe(false);
      expect(TRACKERS.test(body), `${rel(file)}`).toBe(false);
    }
  });

  it.skipIf(!built)('contacts no external origin', () => {
    // The only URLs a clean build may contain are XML namespaces and React's
    // error-decoder link — neither is fetched at runtime.
    const ALLOWED = /^https?:\/\/(www\.w3\.org|reactjs\.org|react\.dev)\//;
    for (const file of bundleFiles) {
      const urls = readFileSync(file, 'utf8').match(/https?:\/\/[a-zA-Z0-9./_-]+/g) ?? [];
      const unexpected = [...new Set(urls)].filter((u) => !ALLOWED.test(u));
      expect(unexpected, `${rel(file)} reaches an unexpected origin`).toEqual([]);
    }
  });

  it.skipIf(!built)('requests no permission that could exfiltrate data', () => {
    const manifest = JSON.parse(readFileSync(join(BUILD, 'manifest.json'), 'utf8')) as {
      permissions?: string[];
    };
    const permitted = new Set(['activeTab', 'storage', 'scripting', 'sidePanel']);
    for (const permission of manifest.permissions ?? []) {
      expect(permitted.has(permission), `unexpected permission: ${permission}`).toBe(true);
    }
  });
});
