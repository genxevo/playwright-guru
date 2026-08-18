/**
 * Playwright Guru — ClipboardPort (WS0 contract only).
 * ---------------------------------------------------------------------------
 * Copying is the product's primary output action, and Phase 0 found five call
 * sites with no try/catch, no fallback and no user feedback: a rejected
 * `writeText` left the user with no tick and no error.
 *
 * This port returns a RESULT rather than throwing, so failure is a state the UI
 * must render, not an exception it can forget to catch.
 */

export type ClipboardFailureCode = 'NOT_ALLOWED' | 'NOT_FOCUSED' | 'UNSUPPORTED' | 'UNKNOWN';

export type ClipboardResult =
  { ok: true } | { ok: false; code: ClipboardFailureCode; detail?: string };

export interface ClipboardPort {
  writeText(text: string): Promise<ClipboardResult>;
}
