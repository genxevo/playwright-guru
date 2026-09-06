/**
 * WS5 — the Side Panel's `TabContext` adapter.
 *
 * WS0 declared the `TabContext` port and nothing ever implemented it; DL-67
 * found it still at zero implementations and zero consumers. This is the Side
 * Panel's half of it: the surface floats over whatever tab is active, so its
 * tab identity changes as the user switches, and WS4's tab-scoped state has to
 * follow.
 *
 * The DevTools half is deliberately NOT here — it is a different model (a fixed
 * inspected tab, from `chrome.devtools.inspectedWindow.tabId`) and lives with
 * the DevTools pick source. Keeping them apart is the point: O2 forbids
 * resolving DevTools state through an active-tab query, and a single "get the
 * tab" helper is exactly how that mistake gets made.
 */
import { browser } from 'wxt/browser';

import type { TabContext, TabInfo } from '../application/ports/TabContext';

async function readActiveTab(): Promise<TabInfo | null> {
  try {
    const tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    return tab?.id === undefined ? null : { tabId: tab.id, url: tab.url, title: tab.title };
  } catch {
    return null;
  }
}

/**
 * The active tab in the current window, re-emitted whenever the user switches.
 *
 * `subscribe` emits the current value immediately, so a consumer never has to
 * both read and subscribe to avoid a gap between the two.
 */
export const activeTabContext: TabContext = {
  getActiveTab: readActiveTab,

  subscribe(listener) {
    let stopped = false;
    void readActiveTab().then((tab) => {
      if (!stopped) listener(tab);
    });
    const onActivated = (info: { tabId: number }) => {
      if (!stopped) listener({ tabId: info.tabId });
    };
    browser.tabs.onActivated.addListener(onActivated);
    return () => {
      stopped = true;
      browser.tabs.onActivated.removeListener(onActivated);
    };
  },
};
