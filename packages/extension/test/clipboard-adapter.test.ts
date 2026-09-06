/**
 * WS5 — ClipboardAdapter: the first real `ClipboardPort` implementation.
 * =======================================================================
 *
 * Phase 0 found five `navigator.clipboard.writeText` call sites with no
 * try/catch, no fallback and no user feedback — a rejected promise vanished
 * as an unhandled rejection, and the "Copied!" state simply never appeared.
 * `writeText` here must NEVER throw and NEVER resolve with nothing: every
 * outcome is a typed `ClipboardResult` the UI can render (WS5 §13, no
 * synthetic success).
 *
 * `navigator.clipboard` does not exist in vitest's default `node`
 * environment, so it is stubbed per test via `vi.stubGlobal` — this gives
 * precise control over the success/permission-denied/focus/unsupported cases
 * Chrome's real Clipboard API can produce, which happy-dom does not model.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrowserClipboardAdapter } from '../src/application/adapters/ClipboardAdapter';
import { clipboardPort } from '../src/application/adapters';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BrowserClipboardAdapter.writeText', () => {
  it('resolves { ok: true } when the browser copy succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const result = await new BrowserClipboardAdapter().writeText('page.getByRole(...)');

    expect(result).toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith('page.getByRole(...)');
  });

  it('never throws: a rejected writeText resolves to a typed failure', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('boom')) },
    });

    await expect(new BrowserClipboardAdapter().writeText('x')).resolves.toMatchObject({
      ok: false,
      code: 'UNKNOWN',
    });
  });

  it('classifies a permission-denied DOMException as NOT_ALLOWED', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi
          .fn()
          .mockRejectedValue(new DOMException('Write permission denied.', 'NotAllowedError')),
      },
    });

    const result = await new BrowserClipboardAdapter().writeText('x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_ALLOWED');
  });

  it('classifies a focus-related NotAllowedError as NOT_FOCUSED', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi
          .fn()
          .mockRejectedValue(new DOMException('Document is not focused.', 'NotAllowedError')),
      },
    });

    const result = await new BrowserClipboardAdapter().writeText('x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOCUSED');
  });

  it('reports UNSUPPORTED when navigator.clipboard.writeText does not exist', async () => {
    vi.stubGlobal('navigator', {});

    const result = await new BrowserClipboardAdapter().writeText('x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNSUPPORTED');
  });

  it('the shared singleton is exported for direct import, matching the rest of the codebase', () => {
    expect(clipboardPort).toBeInstanceOf(BrowserClipboardAdapter);
  });
});
