import { browser } from 'wxt/browser';

/**
 * chrome.devtools.panels.create needs a real page URL to load into the
 * panel — it can't render a component inline. That page lives at
 * entrypoints/devtools-panel/index.html, an "unlisted page" entrypoint
 * (WXT builds it but doesn't wire it into the manifest on its own, since
 * it's not one of WXT's recognized special folder names). This file's
 * only job is the one-line registration call; the panel's actual content
 * is deliberately a placeholder until the DevTools workspace gets built
 * out in a later phase.
 */
browser.devtools.panels.create(
  'Playwright Guru',
  /* iconPath */ '',
  browser.runtime.getURL('/devtools-panel.html')
);
