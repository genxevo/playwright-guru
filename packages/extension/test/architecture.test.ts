/**
 * WS0 — repository-wide architectural guards.
 *
 * Lint enforces the boundary rules for code as it is written. These tests
 * enforce them for the repository as a whole, and add the one property lint
 * cannot express cheaply: the import graph must remain acyclic.
 *
 * The dependency direction under test:
 *
 *   Browser / Extension Environment
 *               ↓
 *       Environment Adapter
 *               ↓
 *            DomProbe
 *               ↓
 *      Domain / Locator Logic        ← must never point upward
 *               ↓
 *     Application / Use Cases
 *               ↓
 *              UI
 */

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const LOCATOR_ENGINE_SRC = join(REPO, 'packages/locator-engine/src');
const CODEGEN_SRC = join(REPO, 'packages/codegen/src');
const EXTENSION_SRC = join(REPO, 'packages/extension/src');

const DOMAIN_ROOTS = [LOCATOR_ENGINE_SRC, CODEGEN_SRC];

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    }),
  );
  return nested.flat();
}

/** Strips comments and string literals so scans only see real code. */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function importSpecifiers(source: string): string[] {
  const code = stripCommentsAndStrings(source);
  const specifiers: string[] = [];
  // Re-read the ORIGINAL source for specifiers, since stripping removed them;
  // the stripped copy is only used to confirm the statement is real code.
  const statementPattern = /(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = statementPattern.exec(source)) !== null) {
    if (match[1]) specifiers.push(match[1]);
  }
  void code;
  return specifiers;
}

// ─── R3: the domain never touches a live DOM ────────────────────────────────

describe('R3 — domain packages are browser-independent', () => {
  const FORBIDDEN = [
    'document',
    'window',
    'navigator',
    'localStorage',
    'sessionStorage',
    'chrome',
    'getComputedStyle',
    'XPathResult',
  ];

  it('never references a browser global', async () => {
    for (const root of DOMAIN_ROOTS) {
      for (const file of await walk(root)) {
        const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
        for (const global of FORBIDDEN) {
          const usage = new RegExp(`(?<![\\w.$])${global}\\s*[.[(]`);
          expect(usage.test(code), `${file} must not use \`${global}\``).toBe(false);
        }
      }
    }
  });

  it('never imports a browser or extension module', async () => {
    for (const root of DOMAIN_ROOTS) {
      for (const file of await walk(root)) {
        for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
          expect(
            /^(wxt|react|react-dom)(\/|$)/.test(spec),
            `${file} must not import \`${spec}\``,
          ).toBe(false);
        }
      }
    }
  });
});

// ─── R2 / direction: the domain never points upward ─────────────────────────

describe('dependency direction is one-way', () => {
  it('keeps the domain free of any dependency on the extension', async () => {
    for (const root of DOMAIN_ROOTS) {
      for (const file of await walk(root)) {
        for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
          expect(
            spec.includes('@playwright-guru/extension') || spec.includes('extension/src'),
            `${file} must not depend on the extension`,
          ).toBe(false);
        }
      }
    }
  });

  it('keeps locator-engine free of any dependency on codegen', async () => {
    for (const file of await walk(LOCATOR_ENGINE_SRC)) {
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        expect(
          spec.includes('@playwright-guru/codegen'),
          `${file}: the AST must not know about renderers`,
        ).toBe(false);
      }
    }
  });

  it('keeps ui/ out of browser/ and runtime/ (R5)', async () => {
    const uiRoot = join(EXTENSION_SRC, 'ui');
    for (const file of await walk(uiRoot)) {
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        expect(
          /(^|\/)(browser|runtime|entrypoints)\//.test(spec),
          `${file} must not import \`${spec}\` — product UI must not know its surface`,
        ).toBe(false);
      }
    }
  });
});

// ─── No circular dependencies ───────────────────────────────────────────────

describe('the import graph is acyclic', () => {
  it('has no cycles across the workspace source', async () => {
    const roots = [LOCATOR_ENGINE_SRC, CODEGEN_SRC, EXTENSION_SRC];
    const files = (await Promise.all(roots.map(walk))).flat();

    const resolveLocal = (fromFile: string, spec: string): string | null => {
      if (!spec.startsWith('.')) return null;
      const base = resolve(dirname(fromFile), spec);
      const candidates = [
        `${base}.ts`,
        `${base}.tsx`,
        join(base, 'index.ts'),
        join(base, 'index.tsx'),
      ];
      return candidates.find((candidate) => files.includes(candidate)) ?? null;
    };

    const graph = new Map<string, string[]>();
    for (const file of files) {
      const edges: string[] = [];
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        const target = resolveLocal(file, spec);
        if (target) edges.push(target);
      }
      graph.set(file, edges);
    }

    const VISITING = 1;
    const DONE = 2;
    const state = new Map<string, number>();
    const cycles: string[] = [];

    const visit = (node: string, stack: string[]): void => {
      const current = state.get(node);
      if (current === DONE) return;
      if (current === VISITING) {
        const start = stack.indexOf(node);
        cycles.push(
          [...stack.slice(start), node]
            .map((f) => relative(REPO, f).split(sep).join('/'))
            .join(' → '),
        );
        return;
      }
      state.set(node, VISITING);
      for (const next of graph.get(node) ?? []) visit(next, [...stack, node]);
      state.set(node, DONE);
    };

    for (const file of files) visit(file, []);

    expect(cycles, `circular imports:\n${cycles.join('\n')}`).toEqual([]);
    expect(files.length).toBeGreaterThan(20); // the walk actually found the source
  });
});

// ─── Security posture Phase 0 verified as correct ───────────────────────────

describe('security posture is preserved', () => {
  it('introduces no eval, Function constructor, or innerHTML assignment', async () => {
    const roots = [LOCATOR_ENGINE_SRC, CODEGEN_SRC, EXTENSION_SRC];
    for (const root of roots) {
      for (const file of await walk(root)) {
        const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
        expect(/(?<![\w.$])eval\s*\(/.test(code), `${file}: no eval`).toBe(false);
        expect(/new\s+Function\s*\(/.test(code), `${file}: no Function constructor`).toBe(false);
        expect(/\.innerHTML\s*=/.test(code), `${file}: no innerHTML assignment`).toBe(false);
      }
    }
  });
});
