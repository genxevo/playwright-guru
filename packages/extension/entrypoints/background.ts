import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import type { RuntimeMessage, RuntimeMessageAck } from '../utils/messaging';

const LOG = '[PlaywrightGuru/background]';
const CONTENT_SCRIPT_PATH = 'content-scripts/content.js';

export default defineBackground(() => {
  console.info(`${LOG} service worker started`);

  // ── Side panel: open on icon click ──────────────────────────────────────
  // setPanelBehavior tells Chrome to open the side panel when the toolbar
  // icon is clicked — works together with the popup auto-redirect.
  try {
    // @ts-expect-error — chrome.sidePanel not in WXT types
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    // API may not be available in all Chrome versions — silent fallback
  }

  // action.onClicked fires when there's no popup OR when setPanelBehavior
  // is active. We keep it as a fallback to activate the picker.
  browser.action.onClicked.addListener(async (tab) => {
    // Also try to open the side panel (belt-and-suspenders)
    try {
      const win = await browser.windows.getCurrent();
      // @ts-expect-error
      await chrome.sidePanel.open({ windowId: win.id });
    } catch { /* already open */ }

    if (tab.id !== undefined) {
      void dispatchToTab(tab.id, { type: 'ACTIVATE_PICKER' });
    }
  });

  // ── Generic message relay ─────────────────────────────────────────────
  browser.runtime.onMessage.addListener(
    (message: RuntimeMessage, sender, sendResponse: (ack: RuntimeMessageAck) => void) => {
      if (!['ACTIVATE_PICKER','DEACTIVATE_PICKER','START_RECORDING','STOP_RECORDING'].includes(message.type)) {
        return false;
      }

      const explicitTabId = message.targetTabId;
      const senderTabId   = sender.tab?.id;
      const resolvedTabId = explicitTabId ?? senderTabId;

      if (resolvedTabId !== undefined) {
        void dispatchToTab(resolvedTabId, message).then(sendResponse);
        return true;
      }

      void browser.tabs
        .query({ active: true, lastFocusedWindow: true })
        .then(async (tabs) => {
          const tab = tabs[0];
          if (!tab?.id) { sendResponse({ ok: false, error: 'no-active-tab' }); return; }
          const ack = await dispatchToTab(tab.id, message);
          sendResponse(ack);
        });

      return true;
    }
  );

  // ── VERIFY_SELECTOR relay ─────────────────────────────────────────────
  browser.runtime.onMessage.addListener(
    (message: RuntimeMessage, _sender, sendResponse: (ack: RuntimeMessageAck) => void) => {
      if (message.type !== 'VERIFY_SELECTOR') return false;
      void dispatchToTab(message.targetTabId, message).then(sendResponse);
      return true;
    }
  );

  browser.tabs.onRemoved.addListener((tabId) => {
    console.info(`${LOG} tab closed`, { tabId });
  });
});

async function dispatchToTab(
  tabId: number,
  message: RuntimeMessage
): Promise<RuntimeMessageAck> {
  try {
    const response = (await browser.tabs.sendMessage(tabId, message)) as RuntimeMessageAck | undefined;
    return response ?? { ok: true };
  } catch (firstError) {
    const reason = firstError instanceof Error ? firstError.message : String(firstError);
    const isNotInjected =
      reason.includes('Receiving end does not exist') ||
      reason.includes('Could not establish connection');

    if (message.type === 'VERIFY_SELECTOR') {
      return { ok: false, error: 'Start picking first to inject the content script.' };
    }

    if (!isNotInjected) {
      return { ok: false, error: reason };
    }

    try {
      await browser.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_PATH] });
      await new Promise<void>(r => setTimeout(r, 300));  // give content script time to register
      const retryResponse = (await browser.tabs.sendMessage(tabId, message)) as RuntimeMessageAck | undefined;
      return retryResponse ?? { ok: true };
    } catch (injectError) {
      const injectReason = injectError instanceof Error ? injectError.message : String(injectError);
      const isRestricted = injectReason.includes('Cannot access') || injectReason.includes('chrome://');
      return {
        ok: false,
        error: isRestricted
          ? 'Cannot inspect this page — chrome:// pages and the Web Store are off-limits.'
          : `Could not reach the page. Try refreshing it and clicking Inspect again.`,
      };
    }
  }
}
