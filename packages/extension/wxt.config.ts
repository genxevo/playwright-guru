import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  // Vite injects a modulepreload polyfill that calls fetch() to warm the cache
  // for its own chunks. It is harmless — the URLs are chrome-extension:// URLs
  // from links this build emitted — but it puts a network API into a bundle
  // that otherwise contains none, and "no network calls at all" is a claim the
  // store listing and privacy policy both make. Chrome 114 (our declared floor)
  // supports modulepreload natively, so the polyfill is dead weight. Dropping
  // it makes the privacy guarantee absolute rather than annotated.
  vite: () => ({
    build: { modulePreload: { polyfill: false } },
  }),
  manifest: {
    name: 'Playwright Guru',
    description:
      'Click any element on a page and get idiomatic Playwright, CSS, and XPath locators instantly.',
    // chrome.sidePanel — the extension's entire UI — landed in Chrome 114.
    // Without this, older Chrome installs the extension and the panel silently
    // fails to open, which is exactly the class of unexplained state this
    // release is trying to eliminate.
    minimum_chrome_version: '114',
    permissions: ['activeTab', 'storage', 'scripting', 'sidePanel'],
    // Required for chrome.scripting.executeScript to work on any tab
    // (not just tabs the user navigated to AFTER the extension was loaded).
    // Without this, the first Inspect click on a pre-existing tab fails.
    host_permissions: ['<all_urls>'],
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});

