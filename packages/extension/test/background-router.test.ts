/**
 * WS3 — background.ts's sender validation and executeScript target.
 *
 * Pure-function tests only: `isFromExtensionUI` and `buildInjectionTarget` are
 * exported specifically so this can assert their behaviour and call-argument
 * shape without needing a `chrome.*`/`browser.*` runtime — `defineBackground`
 * cannot be exercised from a test (WS0's own constraint: browser APIs are
 * confined to `entrypoints/**`, R1).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension-id' } } }));

import { isFromExtensionUI, buildInjectionTarget } from '../entrypoints/background';

describe('isFromExtensionUI — sender validation', () => {
  it('accepts a sender from the extension UI (own id, no tab)', () => {
    expect(isFromExtensionUI({ id: 'test-extension-id' })).toBe(true);
  });

  it('rejects a sender carrying sender.tab — a content script, never legitimate for these message types', () => {
    expect(isFromExtensionUI({ id: 'test-extension-id', tab: { id: 7 } })).toBe(false);
  });

  it('rejects a sender with a different (or absent) extension id', () => {
    expect(isFromExtensionUI({ id: 'someone-elses-extension' })).toBe(false);
    expect(isFromExtensionUI({})).toBe(false);
  });
});

describe('buildInjectionTarget — the executeScript fallback target', () => {
  it("always sets allFrames: true, matching the content script's own allFrames config", () => {
    expect(buildInjectionTarget(42)).toEqual({ tabId: 42, allFrames: true });
  });
});
