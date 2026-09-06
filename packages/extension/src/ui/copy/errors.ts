/**
 * WS8 — the error-state matrix.
 * ============================================================================
 *
 * WS8's exit criterion is "every error has title, cause, action". Before this
 * module, an error reaching the user was a bare string: `ack.error ?? 'Error'`
 * in SidePanel's picker path, `Eval error` in the DevTools panel, `⚠ ${error}`
 * next to Verify Selector. Each told the user THAT something failed and left
 * them to guess why and what to do — and several of them rendered a raw
 * internal code (`SCOPE_DETACHED`, `BUDGET_EXHAUSTED`) as if it were prose.
 *
 * One record, three fields, no exceptions:
 *
 *   title   — what went wrong, in the user's words, not the runtime's.
 *   cause   — why it happened, stated only where it is actually known.
 *   action  — the single next thing the user can do about it.
 *
 * WHAT THIS MODULE DELIBERATELY IS NOT
 * ------------------------------------
 * It is not a second classification scheme. WS7 (DL-59/DL-60) settled how a
 * raw CSS/XPath verify outcome is CLASSIFIED — `classifyVerification` and its
 * six-state `VerificationStatus`, presented through
 * `src/ui/verify-selector-status.ts`. This module never re-decides what a
 * result means; `errorStateForVerifyStatus` simply maps the three "could not
 * measure a count" states WS7 already established onto their copy. Classify
 * once, describe once.
 *
 * It also states no cause it cannot know. `CONTENT_SCRIPT_UNREACHABLE` says
 * the panel could not reach the page — not "the page is still loading", which
 * would be a guess dressed as a diagnosis.
 */

import type { RawVerifyErrorStatus } from '../verify-selector-status';

/**
 * Every error surface either panel can render. Adding a member without adding
 * its copy fails the build: `ERROR_STATES` is an exhaustive `Record`.
 */
export type ErrorStateCode =
  | 'NO_ACTIVE_TAB'
  | 'CONTENT_SCRIPT_UNREACHABLE'
  | 'PICKER_FAILED'
  | 'VERIFY_INVALID'
  | 'VERIFY_UNSUPPORTED'
  | 'VERIFY_UNVERIFIABLE'
  | 'DEVTOOLS_EVALUATE_FAILED'
  | 'ELEMENT_READ_FAILED'
  | 'STORAGE_WRITE_FAILED'
  | 'RENDER_CRASHED';

export interface ErrorState {
  /** What went wrong. Never a raw error code. */
  readonly title: string;
  /** Why, as far as the extension actually knows. Never a guess. */
  readonly cause: string;
  /** The one next thing the user can do. Imperative. */
  readonly action: string;
}

export const ERROR_STATES: Record<ErrorStateCode, ErrorState> = {
  NO_ACTIVE_TAB: {
    title: 'No page to work with',
    cause: 'This panel could not find an active browser tab to talk to.',
    action: 'Switch to the tab you want to inspect, then try again.',
  },
  CONTENT_SCRIPT_UNREACHABLE: {
    title: 'Cannot reach this page',
    cause:
      'Playwright Guru got no answer from the page. That happens on a tab opened before the extension loaded, and on pages Chrome does not allow extensions to run on, such as the Web Store and chrome:// pages.',
    action: 'Reload the page, then try again.',
  },
  PICKER_FAILED: {
    title: 'Element picker did not start',
    cause: 'The page acknowledged the request but reported that it could not start picking.',
    action: 'Reload the page and start the picker again.',
  },
  VERIFY_INVALID: {
    title: 'Selector is not valid',
    cause: 'The browser rejected this selector as malformed, so nothing was matched against it.',
    action: 'Correct the syntax and run Verify again.',
  },
  VERIFY_UNSUPPORTED: {
    title: 'Not supported here',
    cause: 'This page cannot evaluate that kind of selector, so no count was measured.',
    action: 'Try the equivalent CSS selector, or verify on a page that supports it.',
  },
  VERIFY_UNVERIFIABLE: {
    title: 'Could not check the page',
    cause:
      'The check did not complete, so there is no match count — this is not a result of zero matches.',
    action: 'Reload the page and run Verify again.',
  },
  DEVTOOLS_EVALUATE_FAILED: {
    title: 'DevTools could not read the page',
    cause: 'The inspected page rejected the evaluation DevTools uses to find the selected element.',
    action: 'Reload the inspected page, reselect the element, and try again.',
  },
  ELEMENT_READ_FAILED: {
    title: 'Could not read the selected element',
    cause: 'The element was found but its details could not be captured from the page.',
    action: 'Select the element again in the Elements panel.',
  },
  // WS4 — before the storage gateway, a failed write was invisible: the panel
  // kept showing the line the user had just added while nothing had been
  // saved. The gateway returns failures as values, and this is where one
  // becomes something the user can act on.
  STORAGE_WRITE_FAILED: {
    title: 'Your code was not saved',
    cause:
      'The browser refused to store this change, which usually means extension storage is full. What you see is still here, but it will be gone when this panel reloads.',
    action: 'Copy anything you need now, then clear some saved code and try again.',
  },
  RENDER_CRASHED: {
    title: 'Playwright Guru hit an unexpected error',
    cause:
      'This panel stopped rendering. Nothing was sent anywhere and no data was lost — your saved code is still in extension storage.',
    action: 'Reload the panel. Technical details were written to this panel’s console.',
  },
};

/**
 * The three `VerificationStatus` states WS7 defined as "a count could not be
 * measured", mapped onto their copy. WS7 owns the classification; this owns
 * only the words. No status is re-derived here.
 */
export function errorStateForVerifyStatus(status: RawVerifyErrorStatus): ErrorStateCode {
  switch (status) {
    case 'invalid':
      return 'VERIFY_INVALID';
    case 'unsupported':
      return 'VERIFY_UNSUPPORTED';
    case 'unverifiable':
      return 'VERIFY_UNVERIFIABLE';
  }
}
