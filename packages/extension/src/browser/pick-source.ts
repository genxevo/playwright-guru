/**
 * WS5 — the two `PickSource` adapters. THE surface difference, in one file.
 * ============================================================================
 * The WS0 port said it first: "The Side Panel and the DevTools panel are the
 * same product. They differ in exactly one respect: how they obtain a verified
 * `StoredPick`." The port was declared and then nothing implemented it —
 * DL-67 found it at zero implementations and zero consumers, five workstreams
 * later. This is that one respect, finally written down as two adapters instead
 * of as two whole panels.
 *
 *   TabPickSource       floats over the ACTIVE tab, arms the page picker, and
 *                       reads the tab-scoped `LAST_PICK` the content script
 *                       persisted through WS4.
 *   DevtoolsPickSource  is fixed to the INSPECTED tab, tags `$0`, and asks the
 *                       content script — which holds the engine — to build the
 *                       pick with `capturePick`, the same function the picker
 *                       path uses.
 *
 * O2 IS THE LOAD-BEARING RULE HERE. DevTools resolves its tab from
 * `chrome.devtools.inspectedWindow.tabId` and never from an active-tab query.
 * They are different tabs whenever DevTools is undocked or the user switches
 * tab, and binding DevTools state to the active tab would show one page's facts
 * while pointing at another's.
 *
 * There is no locator intelligence in this file. `TAG_SCRIPT` sets one
 * attribute on `$0` and returns a boolean; everything else travels over the
 * existing message seam. `EVAL_SCRIPT` is gone and does not come back.
 */
import { LAST_PICK, PICKER_ACTIVE } from '../storage/state';
import { sendRuntimeMessage } from './runtime';
import { DEVTOOLS_TARGET_ATTR } from '../../utils/messaging';

import type { PickSource, PickSourceCapabilities } from '../application/ports/PickSource';
import type { TabContext, TabInfo } from '../application/ports/TabContext';
import type { StorageGateway } from '../application/ports/StorageGateway';
import type { RuntimeMessageAck, StoredPick } from '../../utils/messaging';
import type { ErrorStateCode } from '../ui/copy/errors';

/** The panel-facing surface: the port, plus what a panel additionally observes. */
export interface PanelPickSource extends PickSource {
  /** The tab this surface's tab-scoped state belongs to. */
  subscribeTab(listener: (tabId: number | null) => void): () => void;
  /** Whether the source is currently producing a pick. */
  subscribeBusy?(listener: (busy: boolean) => void): () => void;
  /** A failure the SOURCE produced, as a WS8 error-matrix code. */
  subscribeError?(listener: (code: ErrorStateCode | null) => void): () => void;
  /** Side Panel only — the crosshair state of the bound tab. */
  subscribePickerActive?(listener: (active: boolean) => void): () => void;
  /** Side Panel only — arm or disarm the crosshair. */
  setPickerActive?(active: boolean): Promise<RuntimeMessageAck>;
}

const TAB_CAPABILITIES: PickSourceCapabilities = {
  canActivatePicker: true,
  canRecord: false, // WS9; `RECORDING_ENABLED` still gates the control itself
  canCaptureAssertion: false, // WS10
  canVerify: true,
  hasElementsPanelSync: false,
};

const DEVTOOLS_CAPABILITIES: PickSourceCapabilities = {
  canActivatePicker: false,
  canRecord: false,
  canCaptureAssertion: false,
  canVerify: true,
  hasElementsPanelSync: true,
};

// ─── Side Panel ─────────────────────────────────────────────────────────────

/**
 * The Side Panel's source: whatever tab is active, whatever the content script
 * last persisted for it.
 */
export function createTabPickSource(
  gateway: Pick<StorageGateway, 'readTab' | 'watch'>,
  tabContext: TabContext,
  send: (m: never) => Promise<RuntimeMessageAck> = sendRuntimeMessage as never,
): PanelPickSource {
  let tabId: number | null = null;

  const tabListeners = new Set<(id: number | null) => void>();
  const pickListeners = new Set<(pick: StoredPick | null) => void>();
  const pickerListeners = new Set<(active: boolean) => void>();

  let stopTabWatches: Array<() => void> = [];
  let stopTabContext: (() => void) | null = null;
  let started = false;

  const bind = async (next: TabInfo | null) => {
    const id = next?.tabId ?? null;
    if (id === tabId) return;
    stopTabWatches.forEach((stop) => stop());
    stopTabWatches = [];
    tabId = id;
    tabListeners.forEach((l) => l(id));
    if (id === null) {
      pickListeners.forEach((l) => l(null));
      pickerListeners.forEach((l) => l(false));
      return;
    }
    const [pick, active] = await Promise.all([
      gateway.readTab(LAST_PICK, id),
      gateway.readTab(PICKER_ACTIVE, id),
    ]);
    if (tabId !== id) return; // the user switched again while we were reading
    pickListeners.forEach((l) => l(pick.value));
    pickerListeners.forEach((l) => l(active.value));
    stopTabWatches.push(
      gateway.watch(LAST_PICK, id, (value) => pickListeners.forEach((l) => l(value))),
      gateway.watch(PICKER_ACTIVE, id, (value) => pickerListeners.forEach((l) => l(value))),
    );
  };

  /** Start following the active tab the first time anyone subscribes. */
  const start = () => {
    if (started) return;
    started = true;
    stopTabContext = tabContext.subscribe((tab) => void bind(tab));
  };

  const stopAll = () => {
    stopTabWatches.forEach((stop) => stop());
    stopTabWatches = [];
    stopTabContext?.();
    stopTabContext = null;
    started = false;
  };

  return {
    kind: 'tab',
    capabilities: TAB_CAPABILITIES,

    async getCurrent() {
      if (tabId === null) return null;
      return (await gateway.readTab(LAST_PICK, tabId)).value;
    },

    subscribe(listener) {
      pickListeners.add(listener);
      start();
      return () => {
        pickListeners.delete(listener);
        if (!pickListeners.size && !tabListeners.size && !pickerListeners.size) stopAll();
      };
    },

    subscribeTab(listener) {
      tabListeners.add(listener);
      listener(tabId);
      start();
      return () => tabListeners.delete(listener);
    },

    subscribePickerActive(listener) {
      pickerListeners.add(listener);
      start();
      return () => pickerListeners.delete(listener);
    },

    async requestPick() {
      await this.setPickerActive!(true);
    },

    async setPickerActive(active) {
      const ack = await send({
        type: active ? 'ACTIVATE_PICKER' : 'DEACTIVATE_PICKER',
        targetTabId: tabId ?? undefined,
      } as never);
      return ack;
    },
  };
}

// ─── DevTools ───────────────────────────────────────────────────────────────

/**
 * Marks the Elements-panel selection so the content script can find it.
 *
 * This is the entire remaining eval payload. It contains no role inference, no
 * visibility rule and no match counting — deliberately, because every one of
 * those exists once already in the engine. `$0` is unreachable from a content
 * script and the DOM is the one thing both worlds share, so an attribute is the
 * narrowest possible bridge.
 */
export const TAG_SCRIPT = `(function(){try{var el=$0;if(!el||el===document||el===document.documentElement)return false;el.setAttribute(${JSON.stringify(DEVTOOLS_TARGET_ATTR)},'');return true;}catch(e){return false;}})()`;

/** A fixed-tab `TabContext` — the DevTools model, where the tab never changes. */
export function devtoolsTabContext(tabId: number): TabContext {
  return {
    async getActiveTab() {
      return { tabId };
    },
    subscribe(listener) {
      listener({ tabId });
      return () => {};
    },
  };
}

/** The DevTools APIs this adapter needs, named so a test can see the seam. */
interface DevtoolsApi {
  readonly tabId: number;
  evaluate(
    script: string,
    cb: (result: boolean | null, error?: { description?: string }) => void,
  ): void;
  onSelectionChanged(handler: () => void): () => void;
  onNavigated(handler: () => void): () => void;
  onShown(handler: () => void): () => void;
}

/** The real Chrome DevTools APIs. O2: the tab id comes from the inspected window. */
export function chromeDevtoolsApi(): DevtoolsApi {
  return {
    tabId: chrome.devtools.inspectedWindow.tabId,
    evaluate: (script, cb) => chrome.devtools.inspectedWindow.eval(script, cb),
    onSelectionChanged: (handler) => {
      chrome.devtools.panels.elements.onSelectionChanged.addListener(handler);
      return () => chrome.devtools.panels.elements.onSelectionChanged.removeListener(handler);
    },
    onNavigated: (handler) => {
      chrome.devtools.network.onNavigated.addListener(handler);
      return () => chrome.devtools.network.onNavigated.removeListener(handler);
    },
    /**
     * O3 — the panel became visible again.
     *
     * `panel.onShown` belongs to the panel OBJECT, which only
     * `entrypoints/devtools/main.ts` ever holds; this page cannot ask for it.
     * That entrypoint therefore calls the hook this installs on the panel
     * window. LIMITATION, stated rather than papered over: whether Chrome
     * delivers that callback on every dock/undock and remount is NOT verified
     * anywhere in this repository, so the subscription-based path
     * (`storage.onChanged`) is the primary mechanism and this is the addition,
     * never the only one.
     */
    onShown: (handler) => {
      const w = window as unknown as { __pgPanelShown?: () => void };
      w.__pgPanelShown = handler;
      return () => {
        if (w.__pgPanelShown === handler) delete w.__pgPanelShown;
      };
    },
  };
}

export function createDevtoolsPickSource(
  api: DevtoolsApi,
  send: (m: never) => Promise<RuntimeMessageAck> = sendRuntimeMessage as never,
): PanelPickSource {
  let current: StoredPick | null = null;
  const pickListeners = new Set<(pick: StoredPick | null) => void>();
  const busyListeners = new Set<(busy: boolean) => void>();
  const errorListeners = new Set<(code: ErrorStateCode | null) => void>();
  const stops: Array<() => void> = [];
  let wired = false;

  const emitPick = (pick: StoredPick | null) => {
    current = pick;
    pickListeners.forEach((l) => l(pick));
  };
  const emitBusy = (busy: boolean) => busyListeners.forEach((l) => l(busy));
  const emitError = (code: ErrorStateCode | null) => errorListeners.forEach((l) => l(code));

  /**
   * Tag `$0`, then ask the content script to build the pick.
   *
   * Two hops, because neither side can do both: only `inspectedWindow.eval`
   * sees `$0`, and only the content script holds the engine. Nothing between
   * them carries locator intelligence.
   */
  const evaluate = () => {
    emitBusy(true);
    api.evaluate(TAG_SCRIPT, (tagged, error) => {
      if (error) {
        emitBusy(false);
        emitError('DEVTOOLS_EVALUATE_FAILED');
        emitPick(null);
        return;
      }
      if (!tagged) {
        emitBusy(false);
        emitError(null);
        emitPick(null);
        return;
      }
      void send({ type: 'PICK_DEVTOOLS_TARGET', targetTabId: api.tabId } as never)
        .then((ack) => {
          emitBusy(false);
          if (!ack.ok || !ack.pick) {
            emitError('ELEMENT_READ_FAILED');
            emitPick(null);
            return;
          }
          emitError(null);
          emitPick(ack.pick);
        })
        .catch(() => {
          emitBusy(false);
          emitError('CONTENT_SCRIPT_UNREACHABLE');
          emitPick(null);
        });
    });
  };

  const wire = () => {
    if (wired) return;
    wired = true;
    stops.push(api.onSelectionChanged(evaluate));
    /**
     * A navigation invalidates the currently tagged `$0`: the node it referred
     * to may be detached or gone, and Chrome typically clears the Elements
     * panel selection anyway. Clearing the pick — rather than re-running the
     * evaluation against a possibly stale `$0` — avoids silently tagging the
     * wrong node. (WS5, DL-54.)
     */
    stops.push(
      api.onNavigated(() => {
        emitError(null);
        emitPick(null);
      }),
    );
    stops.push(api.onShown(evaluate)); // O3
    evaluate();
  };

  return {
    kind: 'devtools',
    capabilities: DEVTOOLS_CAPABILITIES,

    async getCurrent() {
      return current;
    },

    subscribe(listener) {
      pickListeners.add(listener);
      wire();
      return () => {
        pickListeners.delete(listener);
      };
    },

    subscribeTab(listener) {
      // O2 — fixed for the life of this panel, and it is the INSPECTED tab.
      listener(api.tabId);
      return () => {};
    },

    subscribeBusy(listener) {
      busyListeners.add(listener);
      return () => busyListeners.delete(listener);
    },

    subscribeError(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },

    async requestPick() {
      wire();
      evaluate();
    },
  };
}
