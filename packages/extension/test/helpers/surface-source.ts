/**
 * WS5 — "what does this surface actually compose?"
 * ============================================================================
 * THE PROBLEM THIS SOLVES.
 *
 * Sixteen test files in this repository guard the two panels by reading their
 * SOURCE TEXT and asserting on it. DL-67's discovery measured 220 `it()` blocks
 * across those files. That worked while both panels were single flat files —
 * and it becomes a silent lie the moment WS5 extracts a component, because the
 * string a guard searches for moves to another file and the guard keeps
 * passing while guarding nothing at all. A green test that no longer protects
 * its target is worse than a red one.
 *
 * THE FIX.
 *
 * A surface is not a file, it is a composition. This helper resolves the
 * TRANSITIVE closure of a surface's own relative imports inside this package
 * and concatenates them, so a guard asks "does this surface, as actually
 * composed, contain / not contain X?" rather than "does this one file".
 *
 * Consequences, deliberately:
 *   - moving code between files inside the closure cannot break a guard, and
 *     cannot silently disarm one either;
 *   - moving code OUT of the closure (into something the surface no longer
 *     imports) DOES break the guard, which is correct — the surface stopped
 *     composing it;
 *   - a negative assertion (`not.toContain`) becomes STRICTER, since it now
 *     covers every module the surface pulls in.
 *
 * Package-external imports (`react`, `@playwright-guru/*`, `wxt/browser`) are
 * not followed: they are not this surface's source.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const EXT_ROOT = resolve(HERE, '../..');

/** The two surface entrypoints, by the name the guards use in failure messages. */
export const SURFACE_ENTRY = {
  'Side Panel': 'entrypoints/sidepanel/SidePanel.tsx',
  DevTools: 'entrypoints/devtools-panel/Panel.tsx',
} as const;

export type SurfaceName = keyof typeof SURFACE_ENTRY;
export const SURFACE_NAMES = Object.keys(SURFACE_ENTRY) as SurfaceName[];

const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function readFile(relPath: string): string {
  return readFileSync(join(EXT_ROOT, relPath), 'utf8');
}

/** Resolve a relative import specifier to a real file, package-relative. */
function resolveImport(fromRel: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(EXT_ROOT, dirname(fromRel), spec);
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = base + suffix;
    if (existsSync(candidate) && !existsSync(join(candidate, 'package.json'))) {
      try {
        readFileSync(candidate, 'utf8');
        return relative(EXT_ROOT, candidate).split('\\').join('/');
      } catch {
        /* a directory — keep trying the index suffixes */
      }
    }
  }
  return null;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;

/**
 * Every file this entry composes, entry first, in deterministic order.
 * Cycles terminate — a file is visited once.
 */
export function surfaceFiles(entry: string): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const walk = (relPath: string) => {
    if (seen.has(relPath)) return;
    seen.add(relPath);
    order.push(relPath);
    const source = readFile(relPath);
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    const specs: string[] = [];
    while ((m = IMPORT_RE.exec(source)) !== null) specs.push(m[1]!);
    for (const spec of specs) {
      const target = resolveImport(relPath, spec);
      if (target) walk(target);
    }
  };
  walk(entry);
  return order;
}

/** Files composed by a named surface. */
export function filesFor(surface: SurfaceName): string[] {
  return surfaceFiles(SURFACE_ENTRY[surface]);
}

/**
 * The surface's composed source text.
 *
 * Files are separated by a marker comment so a failing assertion can be traced
 * back to a real file rather than to an anonymous blob.
 */
export function surfaceSource(surface: SurfaceName): string {
  return filesFor(surface)
    .map((f) => `\n/* ===== ${f} ===== */\n${readFile(f)}`)
    .join('\n');
}

/** `[name, composedSource]` pairs — the shape the existing guards loop over. */
export function eachSurface(): Array<[SurfaceName, string]> {
  return SURFACE_NAMES.map((name) => [name, surfaceSource(name)]);
}

/** True when `relPath` is part of what this surface composes. */
export function surfaceComposes(surface: SurfaceName, relPath: string): boolean {
  return filesFor(surface).includes(relPath);
}

/** Shared by BOTH surfaces — the WS5 unification surface, measured not assumed. */
export function sharedFiles(): string[] {
  const a = new Set(filesFor('Side Panel'));
  return filesFor('DevTools').filter((f) => a.has(f));
}

export { readFile as readExtFile };

/**
 * The same composed source with comments removed.
 *
 * A guard about what the CODE does must not be satisfied — or broken — by
 * prose. `src/browser/runtime.ts`'s header, for instance, names
 * `chrome.runtime.sendMessage` precisely to explain why nothing calls it any
 * more; a naive scan would read that as the call still being there.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

export function surfaceCode(surface: SurfaceName): string {
  return stripComments(surfaceSource(surface));
}

/** `[name, code]` pairs with comments removed. */
export function eachSurfaceCode(): Array<[SurfaceName, string]> {
  return SURFACE_NAMES.map((name) => [name, surfaceCode(name)]);
}

/**
 * WS5 — the drop-in replacement for a guard's own `read`.
 *
 * Sixteen guard files each had `const read = (rel) => readFileSync(...)` and
 * then asserted on `read('entrypoints/.../SidePanel.tsx')`. Pointing that one
 * line here is the whole conversion: a path that names a SURFACE resolves to
 * everything that surface composes, and every other path still resolves to its
 * own file. The assertions, their messages and their intent are untouched — but
 * they now follow the code instead of following a filename.
 */
export function readComposed(relPath: string): string {
  const surface = SURFACE_NAMES.find((name) => SURFACE_ENTRY[name] === relPath);
  return surface ? surfaceSource(surface) : readFile(relPath);
}

/**
 * Comments removed, then whitespace removed OUTSIDE string literals.
 *
 * Several WS2-era guards assert exact fragments such as
 * `background:'var(--pg-code-bg)'` — a shape that came from the two panels
 * having been written as dense one-liners, not from anything about the property
 * being protected. WS5 moved that code into prettier-formatted modules, so the
 * bytes changed while the meaning did not.
 *
 * Densifying restores the comparison those guards were always making, without
 * touching their intent: the token must be used, the literal must be gone. It
 * deliberately does NOT collapse whitespace inside a string, because
 * `'3px solid #f97316'` is a value and its spaces are part of it.
 */
export function denseCode(source: string): string {
  const code = stripComments(source);
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < code.length; i += 1) {
    const c = code[i]!;
    if (quote) {
      out += c;
      if (c === '\\') {
        out += code[i + 1] ?? '';
        i += 1;
      } else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      out += c;
      continue;
    }
    if (/\s/.test(c)) {
      // Collapse runs of whitespace to nothing, EXCEPT between two identifier
      // characters, where a single space is what separates `const unique` from
      // `constunique`. This is exactly the shape the pre-WS5 one-liners had.
      let j = i;
      while (j < code.length && /\s/.test(code[j]!)) j += 1;
      const before = out[out.length - 1];
      const after = code[j];
      if (before && after && /[A-Za-z0-9_$]/.test(before) && /[A-Za-z0-9_$]/.test(after)) {
        out += ' ';
      }
      i = j - 1;
      continue;
    }
    out += c;
  }
  // Prettier adds a trailing comma before a closing brace/bracket/paren; the
  // dense one-liners these guards were written against did not. A trailing
  // comma is never semantically meaningful, so dropping it is the same
  // formatting-only normalisation as the whitespace above — it does not let a
  // guard pass on anything it would previously have rejected.
  return out.replace(/,(?=[}\])])/g, '');
}

/**
 * WHICH files in a surface's composition declare something.
 *
 * This is the composition-aware form of the WS2-era guards that read "the panel
 * must not re-declare `X`, it is now shared". Under a single flat panel file,
 * "not here" was a good enough proxy for "declared once, in the shared module".
 * Under a composition it is not: the shared module is now part of what the
 * surface composes, so the honest assertion is the one that was always meant —
 * exactly one declaration, and it is in the module that owns it.
 */
export function declaringFiles(surface: SurfaceName, pattern: RegExp): string[] {
  const re = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g');
  return filesFor(surface).filter((f) => {
    re.lastIndex = 0;
    return re.test(stripComments(readFile(f)));
  });
}

/** How many times a surface's composition declares something. */
export function declarationCount(surface: SurfaceName, pattern: RegExp): number {
  const re = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g');
  return (stripComments(surfaceSource(surface)).match(re) ?? []).length;
}

/**
 * A surface's composed source with whole files excluded by path prefix.
 *
 * Some guards ask "does anything in this surface bypass X" where X's own
 * implementation is legitimately part of the composition — the WS4 storage
 * gateway calls `browser.storage` because that is its entire job. Cutting the
 * implementation out of the scan keeps the question sharp; relaxing the pattern
 * instead would let a real bypass through.
 */
export function surfaceSourceExcluding(surface: SurfaceName, prefixes: string[]): string {
  return filesFor(surface)
    .filter((f) => !prefixes.some((p) => f.startsWith(p)))
    .map((f) => `\n/* ===== ${f} ===== */\n${readFile(f)}`)
    .join('\n');
}

/** Cut one file's section out of an already-composed surface source. */
export function withoutFile(composed: string, relPath: string): string {
  const mark = `/* ===== ${relPath} ===== */`;
  const at = composed.indexOf(mark);
  if (at === -1) return composed;
  const end = composed.indexOf('/* ===== ', at + mark.length);
  return composed.slice(0, at) + (end === -1 ? '' : composed.slice(end));
}
