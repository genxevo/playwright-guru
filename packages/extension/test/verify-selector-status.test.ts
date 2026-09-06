/**
 * WS7 — CSS/XPath Verify Selector truth: one classification, reused.
 * ================================================================
 * Before WS7, `VERIFY_SELECTOR`'s error path folded every `ProbeErrorCode`
 * into one alarming red "⚠ CODE: detail" string — a genuinely unmeasurable
 * environment limit (`UNSUPPORTED`/`SCOPE_DETACHED`/`BUDGET_EXHAUSTED`) looked
 * identical to bad syntax (`INVALID_SELECTOR`/`INVALID_XPATH`) and identical
 * to a confirmed zero-match result. These tests pin:
 *
 *   1. `verify-selector-status.ts` — the shared, pure classification module —
 *      behaves correctly and covers exactly the three "could not measure a
 *      count" states, nothing more.
 *   2. `content.ts` computes `verifyStatus` through the SAME `classifyVerification`
 *      the Playwright locator-expression path already uses (WS6.2), and a
 *      dedicated `statusForProbeError` for the probe-error branch — no second,
 *      independent classification scheme for "what counts as ambiguous".
 *   3. Both panels consume that status through the ONE shared module, rather
 *      than each hand-rolling (and risking silently diverging) its own error
 *      classification.
 *   4. The existing count-based (verified/not-found/ambiguous) wording and
 *      colour logic — already honest, pinned by `honesty.test.ts` — is
 *      untouched.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isRawVerifyErrorStatus,
  RAW_VERIFY_ERROR_STATUS_STYLE,
} from '../src/ui/verify-selector-status';
import type { VerificationStatus } from '../utils/messaging';

import { readComposed } from './helpers/surface-source';

const EXT = resolve(__dirname, '..');
/**
 * WS5 — a surface is a COMPOSITION, not a file.
 *
 * `readComposed` resolves a panel entrypoint path to everything that surface
 * actually imports (see `helpers/surface-source.ts`). Every assertion below is
 * unchanged; what changed is that they now follow the code when WS5 moves it,
 * instead of silently passing because the string they look for went to another
 * file. Any other path still reads exactly that one file.
 */
const read = (rel: string): string => readComposed(rel);

const SIDE_PANEL = 'entrypoints/sidepanel/SidePanel.tsx';
const DEVTOOLS_PANEL = 'entrypoints/devtools-panel/Panel.tsx';
const PANELS = [SIDE_PANEL, DEVTOOLS_PANEL];
const CONTENT = read('entrypoints/content.ts');

// ─── 1. The shared classification module ─────────────────────────────────

describe('isRawVerifyErrorStatus / RAW_VERIFY_ERROR_STATUS_STYLE', () => {
  const ALL_STATUSES: VerificationStatus[] = [
    'verified',
    'not-found',
    'ambiguous',
    'invalid',
    'unsupported',
    'unverifiable',
  ];

  it('is true for exactly the three unmeasurable-count states', () => {
    for (const status of ALL_STATUSES) {
      const expected =
        status === 'invalid' || status === 'unsupported' || status === 'unverifiable';
      expect(isRawVerifyErrorStatus(status), status).toBe(expected);
    }
  });

  it('is false for undefined — a missing status must not silently pass as classified', () => {
    expect(isRawVerifyErrorStatus(undefined)).toBe(false);
  });

  it('gives every unmeasurable-count status a distinct colour from a confirmed zero match', () => {
    // #dc2626 is used elsewhere for a MEASURED zero/ambiguous-adjacent negative.
    // Reusing it for "the environment could not answer" would repeat the exact
    // conflation this gate exists to remove — 'invalid' (bad syntax) is the one
    // state that legitimately keeps it (a rejected expression, not an unmeasured one).
    expect(RAW_VERIFY_ERROR_STATUS_STYLE.invalid.color).toBe('#dc2626');
    expect(RAW_VERIFY_ERROR_STATUS_STYLE.unsupported.color).not.toBe('#dc2626');
    expect(RAW_VERIFY_ERROR_STATUS_STYLE.unverifiable.color).not.toBe('#dc2626');
    // unsupported/unverifiable are both "no measurement happened" — same neutral colour.
    expect(RAW_VERIFY_ERROR_STATUS_STYLE.unsupported.color).toBe(
      RAW_VERIFY_ERROR_STATUS_STYLE.unverifiable.color,
    );
  });

  it('never claims a verdict glyph (✓/✗) for a state that measured nothing', () => {
    for (const status of ['invalid', 'unsupported', 'unverifiable'] as const) {
      expect(RAW_VERIFY_ERROR_STATUS_STYLE[status].prefix).not.toMatch(/[✓✗]/);
    }
  });
});

// ─── 2. content.ts reuses classifyVerification — no second scheme ────────

describe('content.ts classifies raw CSS/XPath verification through the shared function', () => {
  it('imports classifyVerification from the domain package, not a local re-implementation', () => {
    expect(CONTENT).toMatch(
      /import\s*\{[^}]*\bclassifyVerification\b[^}]*\}\s*from '@playwright-guru\/locator-engine'/,
    );
  });

  it('computes verifyStatus for a measured (non-error) result via classifyVerification', () => {
    expect(CONTENT).toMatch(/verifyStatus:\s*classifyVerification\(/);
  });

  it('maps every ProbeErrorCode to a VerificationStatus, exhaustively — no default/fallthrough', () => {
    const fn = CONTENT.match(
      /function statusForProbeError\(code: ProbeErrorCode\): VerificationStatus \{[\s\S]*?\n    \}/,
    );
    expect(fn, 'statusForProbeError must exist').toBeTruthy();
    const body = fn![0];
    // Every ProbeErrorCode member (probe.ts) is handled.
    for (const code of [
      'INVALID_SELECTOR',
      'INVALID_XPATH',
      'BUDGET_EXHAUSTED',
      'SCOPE_DETACHED',
      'UNSUPPORTED',
    ]) {
      expect(body, `must handle ${code}`).toContain(`case '${code}'`);
    }
    // No catch-all default — a new ProbeErrorCode must fail typecheck, not
    // silently fall through to an arbitrary status.
    expect(body).not.toMatch(/default:/);
  });

  it('invalid syntax classifies as invalid, never not-found (an unmeasured count is not a measured zero)', () => {
    const fn = CONTENT.match(/function statusForProbeError[\s\S]*?\n    \}/)![0];
    expect(fn).toMatch(
      /case 'INVALID_SELECTOR':\s*\n\s*case 'INVALID_XPATH':\s*\n\s*return 'invalid';/,
    );
  });

  it('an environment limit classifies as unsupported, a probe failure as unverifiable', () => {
    const fn = CONTENT.match(/function statusForProbeError[\s\S]*?\n    \}/)![0];
    expect(fn).toMatch(/case 'UNSUPPORTED':\s*\n\s*return 'unsupported';/);
    expect(fn).toMatch(
      /case 'SCOPE_DETACHED':\s*\n\s*case 'BUDGET_EXHAUSTED':\s*\n\s*return 'unverifiable';/,
    );
  });

  it('still populates the pre-existing ok/count/visibleCount/error fields unchanged', () => {
    // Backward-compatible: verifyStatus is additive, not a replacement.
    expect(CONTENT).toMatch(/ok:\s*false,[\s\S]{0,120}count:\s*-1,[\s\S]{0,60}visibleCount:\s*-1,/);
    expect(CONTENT).toMatch(
      /ok:\s*true,[\s\S]{0,80}count:\s*result\.total,[\s\S]{0,60}visibleCount:\s*result\.visible,/,
    );
  });
});

// ─── 3. Both panels reuse the ONE shared presentation module ─────────────

describe('both panels present the raw verify error through the shared module, not their own logic', () => {
  it('imports isRawVerifyErrorStatus and RAW_VERIFY_ERROR_STATUS_STYLE from the shared file', () => {
    for (const panel of PANELS) {
      const source = read(panel);
      expect(source, `${panel} must import the shared classification`).toMatch(
        /import\s*\{[^}]*\bRAW_VERIFY_ERROR_STATUS_STYLE\b[^}]*\bisRawVerifyErrorStatus\b[^}]*\}\s*from '[^']*verify-selector-status'|import\s*\{[^}]*\bisRawVerifyErrorStatus\b[^}]*\bRAW_VERIFY_ERROR_STATUS_STYLE\b[^}]*\}\s*from '[^']*verify-selector-status'/,
      );
    }
  });

  it('propagates verifyStatus from the ack into local state on every code path (success, domain error, transport error, no-tab)', () => {
    for (const panel of PANELS) {
      const source = read(panel);
      const occurrences = (source.match(/verifyStatus/g) ?? []).length;
      // 1 in the state type + at least 3 call sites (ok branch, error branch,
      // catch branch) — a dropped field on any path would silently regress a
      // classified error back to generic red, the exact bug this gate fixes.
      expect(
        occurrences,
        `${panel} must thread verifyStatus through every verify outcome`,
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it('does not hand-roll its own invalid/unsupported/unverifiable colour logic', () => {
    for (const panel of PANELS) {
      const source = read(panel);
      // The only literal colour a panel may still declare inline for the
      // error branch is the '#dc2626' fallback used when verifyStatus is
      // absent (defensive, not a second classification) — everything else
      // routes through RAW_VERIFY_ERROR_STATUS_STYLE.
      // WS5 moved this into the one shared `verify-message.ts`, so the
      // subject is `outcome` rather than each panel's local `verifyResult`.
      // The rule is unchanged — and is now enforced in one place instead of
      // being two identical expressions that could drift.
      expect(source).toMatch(
        /RAW_VERIFY_ERROR_STATUS_STYLE\[(verifyResult|outcome)\.verifyStatus\]/,
      );
    }
  });
});

// ─── 4. The already-honest count-based path is untouched ─────────────────

describe('the pre-existing count-based verify wording is untouched by this gate', () => {
  it('SidePanel and Panel still derive their verdict from the visible count, unchanged', () => {
    for (const panel of PANELS) {
      const source = read(panel);
      // Same rename: `verifyVisible` became the shared `visibleCountOf()`.
      expect(source).toMatch(/verifyVisible|visibleCountOf/);
      expect(source).toMatch(/total,\s*\$\{hidden\}\s*hidden/);
    }
  });
});
