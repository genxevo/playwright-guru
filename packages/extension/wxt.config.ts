import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Playwright Guru',
    description:
      'Click any element on a page and get idiomatic Playwright, CSS, and XPath locators instantly.',
    permissions: ['activeTab', 'storage', 'scripting', 'declarativeContent', 'sidePanel'],
    // Required for chrome.scripting.executeScript to work on any tab
    // (not just tabs the user navigated to AFTER the extension was loaded).
    // Without this, the first Inspect click on a pre-existing tab fails.
    host_permissions: ['<all_urls>'],
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});

