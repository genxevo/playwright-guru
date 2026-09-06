import { browser } from 'wxt/browser';

/**
 * chrome.devtools.panels.create needs a real page URL to load into the
 * panel — it can't render a component inline. That page lives at
 * entrypoints/devtools-panel/index.html, an "unlisted page" entrypoint
 * (WXT builds it but doesn't wire it into the manifest on its own, since
 * it's not one of WXT's recognized special folder names). This file's
 * only job is that registration call — and, since WS5, the one lifecycle
 * signal the panel page cannot obtain for itself.
 */
browser.devtools.panels.create(
  'Playwright Guru',
  /* iconPath */ '',
  browser.runtime.getURL('/devtools-panel.html'),
  (panel) => {
    /**
     * WS5 / O3 — "the panel became visible again".
     *
     * `panel.onShown` belongs to the panel OBJECT, and this page is the only
     * one that ever holds it: the panel's own page cannot ask Chrome for its
     * panel. So the hook the panel page installed on its window is called from
     * here, and the panel re-reads `$0` on becoming visible.
     *
     * This is the SECOND mechanism, never the only one. The primary is the
     * subscription — `storage.onChanged` for the shared workspace, and the
     * Elements-panel selection listener for the pick — because whether Chrome
     * delivers `onShown` on every dock, undock and remount is NOT verified
     * anywhere in this repository and is not claimed to be. If the callback
     * never arrives, the panel is stale by exactly one user action rather than
     * broken.
     */
    try {
      panel.onShown.addListener((panelWindow) => {
        (panelWindow as unknown as { __pgPanelShown?: () => void }).__pgPanelShown?.();
      });
    } catch {
      // An older Chrome without the callback form loses only the re-read.
    }
  }
);
