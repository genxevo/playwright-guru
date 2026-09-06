import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import type {
  PersistPickMessage,
  PersistPickerStateMessage,
  PersistRecordingStateMessage,
  RuntimeMessage,
  RuntimeMessageAck,
} from '../utils/messaging';
import { normalizeAck } from '../utils/messaging';
import { storageGateway } from '../src/browser/storage';
import type { StorageGateway } from '../src/application/ports/StorageGateway';
import { migrateToV2 } from '../src/storage/migration';
import {
  LAST_PICK,
  PICKER_ACTIVE,
  RECORDING_OBSERVATION,
  RECORDING_WORKFLOW,
} from '../src/storage/state';

const LOG = '[PlaywrightGuru/background]';
const CONTENT_SCRIPT_PATH = 'content-scripts/content.js';

/** The message types this background script routes at all. */
const KNOWN_MESSAGE_TYPES = new Set<RuntimeMessage['type']>([
  'ACTIVATE_PICKER', 'DEACTIVATE_PICKER', 'START_RECORDING', 'STOP_RECORDING',
  'QUERY_RECORDING_STATE',
  'VERIFY_SELECTOR', 'VERIFY_LOCATOR_EXPRESSION', 'PICK_DEVTOOLS_TARGET',
  'PERSIST_PICK', 'PERSIST_PICKER_STATE', 'PERSIST_RECORDING_STATE',
]);

/** Structural subset of `chrome.runtime.MessageSender` this module depends on. */
export interface MinimalSender {
  id?: string;
  tab?: { id?: number } | undefined;
}

/**
 * WS3 — sender validation (§18 of the implementation authorization).
 *
 * Every message type this router handles is sent BY this extension's own UI
 * (side panel, DevTools panel, popup) TO the background script — none is ever
 * legitimately sent by a tab-injected content script. An extension UI page's
 * `sender.tab` is `undefined` (it runs as its own page, not injected into a
 * tab); a content script's is always populated with the tab it runs in. That
 * is the one bit this router needs: reject any sender carrying `sender.tab`.
 *
 * `sender.id` is included defensively — Chrome already scopes `onMessage` to
 * the same extension for any sender without `externally_connectable`, so this
 * can only fail closed, never open a gap `sender.tab` did not already close.
 */
export function isFromExtensionUI(sender: MinimalSender): boolean {
  return sender.id === browser.runtime.id && sender.tab === undefined;
}

/**
 * WS4 — the mirror of `isFromExtensionUI`, for the two persistence messages.
 *
 * A content script's `sender.tab.id` is the tab identity WS4 keys session
 * state by, and it is the browser that fills it in — a page cannot forge it.
 * Requiring it does two things at once: it rejects anything that did not come
 * from an injected content script, and it guarantees the write has a real tab
 * to be scoped to, so no state can land unscoped.
 */
export function contentSenderTabId(sender: MinimalSender): number | undefined {
  if (sender.id !== browser.runtime.id) return undefined;
  return sender.tab?.id;
}

/**
 * WS3 — the executeScript target `dispatchToTab`'s injection fallback uses.
 *
 * `allFrames: true` mirrors the content script's own `allFrames: true`
 * (`entrypoints/content.ts`) — without it, a fallback injection triggered from
 * a frame other than the top document would silently miss that frame.
 * Exported as its own function so a test can assert the exact shape passed to
 * `scripting.executeScript`, per the authorization's requirement for a direct
 * test on the call arguments.
 */
export function buildInjectionTarget(tabId: number): { tabId: number; allFrames: true } {
  return { tabId, allFrames: true };
}

export default defineBackground(() => {
  console.info(`${LOG} service worker started`);

  // ── Side panel: open on icon click ──────────────────────────────────────
  // setPanelBehavior tells Chrome to open the side panel when the toolbar
  // icon is clicked — works together with the popup auto-redirect.
  try {
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

  // ── One typed message router ───────────────────────────────────────────
  //
  // WS3 merges what were two separate `onMessage` listeners (a generic
  // fire-and-forget relay and a tab-scoped request/response relay) into one.
  // They differed only in how the target tab was resolved, which is now a
  // single branch below — there was never a reason for two listeners.
  browser.runtime.onMessage.addListener(
    (message: RuntimeMessage, sender, sendResponse: (ack: RuntimeMessageAck) => void) => {
      if (!KNOWN_MESSAGE_TYPES.has(message.type)) return false;

      // WS4 — the only two message types that legitimately come FROM a tab.
      //
      // Every other type is sent by this extension's own UI and is rejected
      // below if it carries a `sender.tab`. These two are the exact inverse:
      // a content script cannot know its own tab id, and WS4 keys session
      // state by exactly that, so the background reads the identity from the
      // sender — which the browser fills in and a page cannot forge — and
      // performs the write itself.
      if (message.type === 'PERSIST_RECORDING_STATE') {
        const tabId = contentSenderTabId(sender);
        if (tabId === undefined) {
          sendResponse({ ok: false, code: 'UNTRUSTED_SENDER', error: 'This message must come from a page.' });
          return false;
        }
        void persistRecordingState(storageGateway, tabId, message).then(sendResponse);
        return true;
      }

      if (message.type === 'PERSIST_PICK' || message.type === 'PERSIST_PICKER_STATE') {
        const tabId = contentSenderTabId(sender);
        if (tabId === undefined) {
          sendResponse({ ok: false, code: 'UNTRUSTED_SENDER', error: 'This message must come from a page.' });
          return false;
        }
        void persistFromTab(message, tabId).then(sendResponse);
        return true;
      }

      if (!isFromExtensionUI(sender)) {
        sendResponse({ ok: false, code: 'UNTRUSTED_SENDER', error: 'This message must come from the extension UI.' });
        return false;
      }

      // VERIFY_SELECTOR / VERIFY_LOCATOR_EXPRESSION / PICK_DEVTOOLS_TARGET are
      // tab-scoped request/response calls from a panel that already knows
      // which tab it is inspecting.
      if (
        message.type === 'VERIFY_SELECTOR' ||
        message.type === 'VERIFY_LOCATOR_EXPRESSION' ||
        message.type === 'PICK_DEVTOOLS_TARGET'
      ) {
        if (message.type === 'PICK_DEVTOOLS_TARGET') {
          const targetTabId = message.targetTabId;
          void dispatchToTab(targetTabId, message).then(async (ack) => {
            // WS5/E9 — the DevTools pick becomes that tab's LAST_PICK, exactly
            // as a picker pick already does. Same tab identity (the INSPECTED
            // tab, O2), same descriptor, same gateway; the panel never touches
            // storage itself. Persistence must not gate the answer, so the ack
            // is returned either way and a failed write is logged, not thrown.
            sendResponse(ack);
            await persistDevtoolsPick(storageGateway, targetTabId, ack);
          });
          return true;
        }
        void dispatchToTab(message.targetTabId, message).then(sendResponse);
        return true;
      }

      // ACTIVATE_PICKER / DEACTIVATE_PICKER / START_RECORDING / STOP_RECORDING /
      // QUERY_RECORDING_STATE resolve a target tab explicitly, from the sender,
      // or fall back to the active tab.
      //
      // WS9 slice 5A adds QUERY_RECORDING_STATE to this existing branch rather
      // than to a new one: it is the same UI-to-tab request/response shape, and
      // a tab that cannot be reached produces the same NO_HANDLER ack the panel
      // already reads as "no evidence of a recording".
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

  // ── WS4 — storage lifecycle ─────────────────────────────────────────────
  //
  // Install/update is where the v1 → v2 migration runs. It is idempotent and
  // failure-safe by construction (see `storage/migration.ts`): a failure here
  // leaves the legacy keys exactly where they are, and the next install or
  // update tries again. Nothing is logged but counts — never user content.
  browser.runtime.onInstalled.addListener(() => {
    void migrateToV2(storageGateway, browser.storage.local as never).then((result) => {
      console.info(`${LOG} storage migration`, {
        ok: result.ok,
        migrated: result.migrated.length,
        quarantined: result.quarantined.length,
        code: result.code,
      });
      // An update can arrive with session state left over from tabs that no
      // longer exist. Sweeping here bounds the work to one pass at startup.
      void browser.tabs.query({}).then((tabs) => {
        const live = tabs.map((t) => t.id).filter((id): id is number => id !== undefined);
        void storageGateway.sweepOrphans(live);
      });
    });
  });

  // A closed tab's session state has no owner left. Removing it here is what
  // stops picker state from one tab surviving to confuse the next one that
  // happens to reuse the id.
  browser.tabs.onRemoved.addListener((tabId) => {
    void storageGateway.clearTab(tabId).then((result) => {
      if (!result.ok) console.warn(`${LOG} tab state cleanup failed`, { tabId, code: result.code });
    });
  });
});

/**
 * WS4 — perform a content-script-requested write, scoped to the sender's tab.
 *
 * The content script never sees the gateway; it sends a message and gets a
 * normal ack back, so a storage failure is observable at the call site instead
 * of vanishing into a fire-and-forget promise the way it did before WS4.
 */
async function persistFromTab(
  message: PersistPickMessage | PersistPickerStateMessage,
  tabId: number
): Promise<RuntimeMessageAck> {
  const result =
    message.type === 'PERSIST_PICK'
      ? await storageGateway.writeTab(LAST_PICK, tabId, message.pick)
      : await storageGateway.writeTab(PICKER_ACTIVE, tabId, message.active);

  return result.ok
    ? { ok: true }
    : { ok: false, error: `Could not save state for this tab (${result.code ?? 'WRITE_FAILED'}).` };
}

/**
 * WS9 slice 5B — write the recording's durable projection for one tab.
 *
 * The background owns this write for the reason WS4 already established: the
 * tab identity comes from `sender.tab.id`, not from the message, so a page
 * cannot choose whose recording state it overwrites.
 *
 * The observation is written on every call — it is small and its whole job is
 * to be fresh. The workflow is written only when the message carries one, so a
 * heartbeat refreshes liveness without rewriting the recording; a call without
 * a workflow leaves the stored one exactly as it was.
 *
 * A failure is returned, never swallowed and never logged with its contents:
 * the code alone is reported, because the payload is a user's recording.
 *
 * Exported for direct testing, like `persistDevtoolsPick`.
 */
export async function persistRecordingState(
  gateway: Pick<StorageGateway, 'writeTab'>,
  tabId: number,
  message: PersistRecordingStateMessage,
): Promise<RuntimeMessageAck> {
  const observation = await gateway.writeTab(RECORDING_OBSERVATION, tabId, message.observation);
  const workflow = message.workflow
    ? await gateway.writeTab(RECORDING_WORKFLOW, tabId, message.workflow)
    : { ok: true as const };

  if (observation.ok && workflow.ok) return { ok: true };
  const code = (!observation.ok ? observation.code : workflow.code) ?? 'WRITE_FAILED';
  return { ok: false, error: `Could not save recording state for this tab (${code}).` };
}

/**
 * WS5 (E9) — record a DevTools `$0` pick as the inspected tab's LAST_PICK.
 *
 * O2 makes the inspected tab the tab: `targetTabId` on this message is
 * `chrome.devtools.inspectedWindow.tabId`, so the write lands on the page the
 * user is actually looking at rather than on whatever tab happens to be active.
 * The Side Panel watching that tab therefore sees the same pick — one product,
 * two surfaces, one stored fact.
 *
 * Exported for direct testing, and deliberately failure-tolerant: a storage
 * failure here must not turn a pick the user CAN see into an error, so it is
 * reported in the log and the pick still renders.
 */
export async function persistDevtoolsPick(
  gateway: Pick<StorageGateway, 'writeTab'>,
  tabId: number,
  ack: RuntimeMessageAck
): Promise<void> {
  if (!ack.ok || !ack.pick) return;
  const result = await gateway.writeTab(LAST_PICK, tabId, ack.pick);
  if (!result.ok) console.warn(`${LOG} devtools pick not persisted`, { tabId, code: result.code });
}

async function dispatchToTab(
  tabId: number,
  message: RuntimeMessage
): Promise<RuntimeMessageAck> {
  try {
    const response = (await browser.tabs.sendMessage(tabId, message)) as RuntimeMessageAck | undefined;
    // An absent response means the content script had no case for this message.
    // It must NOT become success — see normalizeAck.
    return normalizeAck(response);
  } catch (firstError) {
    const reason = firstError instanceof Error ? firstError.message : String(firstError);
    const isNotInjected =
      reason.includes('Receiving end does not exist') ||
      reason.includes('Could not establish connection');

    if (message.type === 'VERIFY_SELECTOR' || message.type === 'VERIFY_LOCATOR_EXPRESSION') {
      return { ok: false, error: 'Start picking first to inject the content script.' };
    }

    if (!isNotInjected) {
      return { ok: false, error: reason };
    }

    try {
      await browser.scripting.executeScript({ target: buildInjectionTarget(tabId), files: [CONTENT_SCRIPT_PATH] });
      await new Promise<void>(r => setTimeout(r, 300));  // give content script time to register
      const retryResponse = (await browser.tabs.sendMessage(tabId, message)) as RuntimeMessageAck | undefined;
      return normalizeAck(retryResponse);
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
