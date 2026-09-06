/**
 * WS8 — the error-state matrix: every error has a title, a cause, and an action.
 * ============================================================================
 *
 * Failure-first. Before this pass an error reaching the user was whatever
 * string the runtime produced — `ack.error ?? 'Error'`, `Eval error`,
 * `⚠ SCOPE_DETACHED`. The user learned that something failed and nothing else.
 * These tests pin the three things that make an error state usable, and the
 * wiring that keeps a panel from quietly going back to a bare string.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ERROR_STATES,
  errorStateForVerifyStatus,
  type ErrorStateCode,
} from '../src/ui/copy/errors';
import type { RawVerifyErrorStatus } from '../src/ui/verify-selector-status';

import { denseCode, readComposed } from './helpers/surface-source';

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

const SIDE_PANEL = read('entrypoints/sidepanel/SidePanel.tsx');
const DEVTOOLS_PANEL = read('entrypoints/devtools-panel/Panel.tsx');
const PRIMITIVES = read('src/ui/primitives.tsx');
const ERROR_BOUNDARY = read('src/ui/ErrorBoundary.tsx');
const CODES = Object.keys(ERROR_STATES) as ErrorStateCode[];

// ─── The matrix itself ──────────────────────────────────────────────────────

describe('every error state carries a title, a cause and an action', () => {
  it.each(CODES)('%s has all three, none of them empty', (code) => {
    const { title, cause, action } = ERROR_STATES[code];
    for (const [field, value] of Object.entries({ title, cause, action })) {
      expect(value.trim(), `${code}.${field}`).not.toBe('');
      expect(value, `${code}.${field} must not carry leading/trailing space`).toBe(value.trim());
    }
  });

  it.each(CODES)('%s says three different things — not the same sentence three times', (code) => {
    const { title, cause, action } = ERROR_STATES[code];
    expect(new Set([title, cause, action]).size).toBe(3);
  });

  it.each(CODES)('%s states an action the user can actually take', (code) => {
    // An action is an instruction, so it starts with a verb and ends as a
    // sentence. "Something went wrong" is not an action.
    const { action } = ERROR_STATES[code];
    expect(action).toMatch(/^[A-Z][a-z]/);
    expect(action).toMatch(/[.!]$/);
  });

  it.each(CODES)('%s never shows the user a raw internal code', (code) => {
    const { title, cause, action } = ERROR_STATES[code];
    const text = `${title} ${cause} ${action}`;
    // The probe/parse codes are SCREAMING_SNAKE. None of them belongs in copy.
    expect(text).not.toMatch(/\b[A-Z]{3,}(_[A-Z]+)+\b/);
  });

  it('titles are unique, so two different failures never read as the same one', () => {
    const titles = CODES.map((c) => ERROR_STATES[c].title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('claims no verification the extension did not perform', () => {
    for (const code of CODES) {
      const { title, cause, action } = ERROR_STATES[code];
      const text = `${title} ${cause} ${action}`.toLowerCase();
      expect(text, `${code}`).not.toMatch(/\bverified\b|\bconfirmed\b|\bguaranteed\b|\breliable\b/);
    }
  });

  it('distinguishes "could not measure" from "measured zero" in the unverifiable copy', () => {
    // This is the WS7 truth boundary restated in words: an unfinished check is
    // not a negative result, and the copy has to say so.
    expect(ERROR_STATES.VERIFY_UNVERIFIABLE.cause).toMatch(/not a result of zero matches/i);
  });
});

// ─── WS7 boundary: classification is not re-decided here ────────────────────

describe('the matrix maps WS7 classifications, it does not re-derive them', () => {
  const STATUSES: RawVerifyErrorStatus[] = ['invalid', 'unsupported', 'unverifiable'];

  it.each(STATUSES)('%s maps to exactly one matrix entry', (status) => {
    const code = errorStateForVerifyStatus(status);
    expect(ERROR_STATES[code]).toBeDefined();
  });

  it('the three statuses map to three distinct entries — no collapsing back into one', () => {
    const codes = STATUSES.map(errorStateForVerifyStatus);
    expect(new Set(codes).size).toBe(3);
  });

  it('the copy module derives no verdict of its own', () => {
    // Comments stripped first: the module's own doc comment explains WHY it
    // does not call `classifyVerification`, and that explanation should not
    // trip the guard that proves it.
    const code = read('src/ui/copy/errors.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/classifyVerification|matchCount|visibleMatchCount/);
  });
});

// ─── Panel wiring ───────────────────────────────────────────────────────────

describe('both panels render errors through the matrix', () => {
  it.each([
    ['SidePanel.tsx', SIDE_PANEL],
    ['Panel.tsx', DEVTOOLS_PANEL],
  ])('%s imports the shared notice and the status mapper', (_name, src) => {
    expect(src).toMatch(/ErrorNotice/);
    expect(src).toMatch(/errorStateForVerifyStatus/);
    expect(src).toMatch(/from '[^']*copy\/errors'/);
  });

  it('the side panel no longer renders a bare runtime string for a failed picker', () => {
    expect(SIDE_PANEL).not.toMatch(/setStatusMsg\(ack\.error\s*\?\?\s*'Error'\)/);
    // WS5 — the local `setStatusError` became `panel.raiseError`, which feeds
    // the same WS8 matrix through the shared frame. The rule is unchanged: a
    // failed picker activation must surface as PICKER_FAILED, not as a string.
    // The Side Panel distinguishes "the content script never answered" from
    // "the picker refused", so the code is chosen in a ternary rather than
    // passed as a bare literal. Both arms are asserted, here and below.
    expect(denseCode(SIDE_PANEL)).toMatch(/(setStatusError|raiseError)\([^)]*'PICKER_FAILED'/);
    expect(denseCode(SIDE_PANEL)).toMatch(
      /(setStatusError|raiseError)\([^)]*'CONTENT_SCRIPT_UNREACHABLE'/,
    );
  });

  it('"no active tab" is its own state, not flattened into a generic probe failure', () => {
    expect(SIDE_PANEL).toMatch(/(setStatusError|raiseError|onNoTab\?\.)\('NO_ACTIVE_TAB'\)/);
    expect(SIDE_PANEL).not.toMatch(/error:'No active tab'/);
  });

  it('the DevTools panel distinguishes an eval failure from an element-read failure', () => {
    // WS5 — the eval lives in the DevTools PickSource adapter now; the code it
    // raises is identical and reaches the same matrix.
    expect(DEVTOOLS_PANEL).toMatch(/(setEvalErrorCode|emitError)\('DEVTOOLS_EVALUATE_FAILED'\)/);
    expect(DEVTOOLS_PANEL).toMatch(/(setEvalErrorCode|emitError)\('ELEMENT_READ_FAILED'\)/);
    expect(DEVTOOLS_PANEL).toMatch(/(setEvalErrorCode|emitError)\('CONTENT_SCRIPT_UNREACHABLE'\)/);
  });

  it('the DevTools panel clears the error code when the page navigates away', () => {
    // A stale error after a reload would describe a page that no longer exists.
    expect(denseCode(DEVTOOLS_PANEL)).toMatch(
      /onNavigated\((\(\)=>\{)?[^}]*(setEvalErrorCode|emitError)\(null\)/,
    );
  });

  it('the shared notice takes a code, never caller-supplied prose', () => {
    expect(PRIMITIVES).toMatch(/code:\s*ErrorStateCode/);
    expect(PRIMITIVES).toMatch(/ERROR_STATES\[code\]/);
    // No escape hatch that would let a panel pass its own text back in.
    expect(PRIMITIVES).not.toMatch(/function ErrorNotice\([^)]*title\s*[,:}]/);
  });

  it('an unmeasurable verify outcome is shown as a warning, a rejected one as an error', () => {
    for (const src of [SIDE_PANEL, DEVTOOLS_PANEL]) {
      expect(denseCode(src)).toMatch(
        /severity=\{(verifyResult|outcome)\.verifyStatus==='invalid'\?'error':'warning'\}/,
      );
    }
  });
});

// ─── Drift protection for the one surface that stays uncoupled ──────────────

describe('the render-crash screen and its matrix entry stay in step', () => {
  // ErrorBoundary deliberately imports nothing but react (honesty.test.ts pins
  // that, and it is right — a boundary that imported a copy module could fail
  // to render for the same reason it was invoked). So the two carry the same
  // words independently, and this is what stops them drifting apart.
  it('the boundary renders the matrix title verbatim', () => {
    expect(ERROR_BOUNDARY).toContain(ERROR_STATES.RENDER_CRASHED.title);
  });

  it('the boundary makes the same promise about data the matrix does', () => {
    expect(ERROR_STATES.RENDER_CRASHED.cause).toMatch(/nothing was sent anywhere/i);
    expect(ERROR_BOUNDARY).toMatch(/Nothing was sent anywhere/i);
  });

  it('the boundary offers the same action', () => {
    expect(ERROR_STATES.RENDER_CRASHED.action).toMatch(/reload/i);
    expect(ERROR_BOUNDARY).toMatch(/Reload panel/);
  });
});
