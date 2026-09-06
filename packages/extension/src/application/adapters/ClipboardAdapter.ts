/**
 * Playwright Guru — ClipboardAdapter (WS5).
 * ---------------------------------------------------------------------------
 * The first real implementation of the `ClipboardPort` contract (WS0). The
 * port existed for one turn as a contract only — Phase 0's finding was five
 * `navigator.clipboard.writeText` call sites with no try/catch, no fallback
 * and no user feedback, and closing that gap is what this file does.
 *
 * `writeText` NEVER throws and NEVER resolves silently. A rejected browser
 * promise is caught here and turned into a typed `ClipboardResult`, so the
 * caller always has something to render — this is the port's own "no
 * synthetic success" rule (WS5 §13): a failed copy must be a state the UI
 * shows, not an exception nothing catches.
 *
 * Failure classification is best-effort, from what Chrome's Clipboard API
 * actually reports:
 *   - `navigator.clipboard`/`writeText` missing entirely       → UNSUPPORTED
 *   - `NotAllowedError` whose message mentions focus            → NOT_FOCUSED
 *     (Chrome's actual wording for "document is not focused")
 *   - any other `NotAllowedError` (permission denied)           → NOT_ALLOWED
 *   - anything else                                             → UNKNOWN
 */

import type { ClipboardFailureCode, ClipboardPort, ClipboardResult } from '../ports/ClipboardPort';

function classify(error: unknown): { code: ClipboardFailureCode; detail: string } {
  const detail = error instanceof Error ? error.message : String(error);
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return { code: /focus/i.test(detail) ? 'NOT_FOCUSED' : 'NOT_ALLOWED', detail };
  }
  return { code: 'UNKNOWN', detail };
}

export class BrowserClipboardAdapter implements ClipboardPort {
  async writeText(text: string): Promise<ClipboardResult> {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard?.writeText) {
      return {
        ok: false,
        code: 'UNSUPPORTED',
        detail: 'navigator.clipboard.writeText is not available in this context.',
      };
    }
    try {
      await clipboard.writeText(text);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...classify(error) };
    }
  }
}

/**
 * Single shared instance. The codebase has no dependency-injection framework
 * anywhere (WS5 §25: no new dependency), so — matching how every other
 * shared module in `src/ui` and `src/application` is consumed — components
 * import this directly rather than receiving it through props or context.
 */
export const clipboardPort: ClipboardPort = new BrowserClipboardAdapter();
