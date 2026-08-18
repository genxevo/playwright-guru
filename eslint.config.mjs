// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Playwright Guru — ESLint flat config (WS0).
 *
 * SCOPE OF THIS CONFIG IN WS0
 * ---------------------------
 * WS0's lint deliverable is ARCHITECTURAL BOUNDARY ENFORCEMENT (rules R1–R5 of
 * the locked Phase 1 blueprint) plus a small set of security-critical bans.
 *
 * It deliberately does NOT enable the full `typescript-eslint` recommended rule
 * set. The pre-WS0 codebase (~2,700 lines) has never been linted; switching on
 * broad style and correctness rules now would force exactly the wide, unrelated
 * refactoring that WS0 forbids. Broadening the rule set is recorded as
 * future work and belongs to a later workstream, once the code it would touch
 * has already been rewritten by WS3/WS5/WS7.
 *
 * A violation of R1–R5 fails CI. That is the point: the dependency direction is
 * enforced by the build, not by code review.
 */

// ── Path groups ────────────────────────────────────────────────────────────
const DOMAIN = ['packages/locator-engine/**/*.ts', 'packages/codegen/**/*.ts'];

const EXTENSION_NON_BROWSER = [
  'packages/extension/src/application/**/*.{ts,tsx}',
  'packages/extension/src/ui/**/*.{ts,tsx}',
  'packages/extension/src/config/**/*.{ts,tsx}',
];

const UI_PRODUCT = ['packages/extension/src/ui/**/*.{ts,tsx}'];

// NOTE: flat-config blocks OVERRIDE rather than merge rule options. A rule
// configured for a path group must therefore carry EVERY restriction that
// applies to that group in one place — a later block listing the same rule for
// an overlapping group silently discards the earlier one. (Verified: an earlier
// draft lost R2 exactly this way.)
const RUNTIME_ONLY = ['packages/extension/src/runtime/**/*.{ts,tsx}'];

// ── Messages ───────────────────────────────────────────────────────────────
const R1 =
  'R1: Browser/extension APIs are only permitted in `src/browser/**` and `entrypoints/**`. ' +
  'Reach them through a port instead.';

const R2 =
  'R2: Domain packages must not depend on React. The domain makes decisions; the UI presents them.';

const R3 =
  'R3: Domain packages must not touch a live DOM. Ask the DOM through the injected `DomProbe` port.';

const R4 =
  'R4: Domain and runtime code must not import UI copy. Engines emit rationale CODES; ' +
  'the presentation layer owns the wording (Domain Prose Exclusion).';

const R5 =
  'R5: `ui/**` must not import `browser/**`. Product components must not know which surface ' +
  'they are rendered on — that is what keeps the Side Panel and DevTools identical.';

export default tseslint.config(
  // ── Ignores ──────────────────────────────────────────────────────────────
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      'pnpm-lock.yaml',
    ],
  },

  // ── Base ─────────────────────────────────────────────────────────────────
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      // Security-critical bans. These protect the posture Phase 0 verified as
      // correct and the blueprint locks: no remote code, no string-built code,
      // no unescaped HTML injection.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression > MemberExpression[property.name='innerHTML']",
          message:
            'Assigning innerHTML is forbidden. Render through React (which escapes) or build ' +
            'nodes explicitly.',
        },
        {
          selector: "AssignmentExpression > MemberExpression[property.name='outerHTML']",
          message: 'Assigning outerHTML is forbidden.',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: 'insertAdjacentHTML is forbidden.',
        },
      ],
    },
  },

  // Recommended JS correctness rules apply to config files only, where they are
  // cheap and there is no legacy debt.
  {
    files: ['*.config.{js,ts}', 'vitest.workspace.ts'],
    ...js.configs.recommended,
  },

  // ── R2 + R3 — domain packages are browser-independent ────────────────────
  {
    files: DOMAIN,
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'document', message: R3 },
        { name: 'window', message: R3 },
        { name: 'navigator', message: R3 },
        { name: 'location', message: R3 },
        { name: 'localStorage', message: R3 },
        { name: 'sessionStorage', message: R3 },
        { name: 'chrome', message: R3 },
        { name: 'browser', message: R3 },
        { name: 'CSS', message: R3 },
        { name: 'XPathResult', message: R3 },
        { name: 'getComputedStyle', message: R3 },
      ],
      // Carries R2, R3 and R4 together: see the override note above.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: R2 },
            { name: 'react-dom', message: R2 },
            { name: 'react-dom/client', message: R2 },
            { name: 'wxt', message: R3 },
            { name: 'wxt/browser', message: R3 },
          ],
          patterns: [
            { group: ['react/*', 'react-dom/*', 'wxt/*'], message: R2 },
            { group: ['**/ui/copy/**', '**/ui/**'], message: R4 },
            { group: ['**/browser/**', '**/entrypoints/**'], message: R1 },
          ],
        },
      ],
    },
  },

  // ── R1 — browser APIs confined to browser/ and entrypoints/ ──────────────
  {
    files: EXTENSION_NON_BROWSER,
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'chrome', message: R1 },
        { name: 'browser', message: R1 },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'wxt/browser', message: R1 },
            { name: 'wxt/utils/define-background', message: R1 },
            { name: 'wxt/utils/define-content-script', message: R1 },
          ],
        },
      ],
    },
  },

  // ── R5 — ui/ must not reach into browser/ ────────────────────────────────
  {
    files: UI_PRODUCT,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/browser/**'], message: R5 },
            { group: ['**/runtime/**'], message: R5 },
            { group: ['**/entrypoints/**'], message: R5 },
          ],
        },
      ],
    },
  },

  // ── R4 — Domain Prose Exclusion for the runtime layer (mechanism E-3) ────
  // The domain half of R4 lives in the DOMAIN block above, so that this block
  // cannot override it.
  {
    files: RUNTIME_ONLY,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/ui/copy/**', '**/ui/**'], message: R4 }] },
      ],
    },
  },

  // ── Tests may use fakes and Node built-ins freely ────────────────────────
  {
    files: ['**/test/**/*.{ts,tsx}'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-imports': 'off',
    },
  },
);
