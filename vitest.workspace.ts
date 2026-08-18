import { defineWorkspace } from 'vitest/config';

/**
 * WS0 — workspace test runner.
 *
 * Each package owns its own test scope. Domain packages run in a plain Node
 * environment with no DOM: this is a deliberate architectural guard (rule R3).
 * If domain code ever reaches for `document` or `window`, the test run fails
 * rather than silently passing against a DOM the domain must not assume.
 */
export default defineWorkspace([
  {
    test: {
      name: 'locator-engine',
      root: './packages/locator-engine',
      environment: 'node',
      include: ['test/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'codegen',
      root: './packages/codegen',
      environment: 'node',
      include: ['test/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'extension',
      root: './packages/extension',
      environment: 'node',
      include: ['test/**/*.test.ts'],
    },
  },
]);
