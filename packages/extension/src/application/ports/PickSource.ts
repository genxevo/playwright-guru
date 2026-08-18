/**
 * Playwright Guru — PickSource port (WS0).
 * ---------------------------------------------------------------------------
 * THE ADAPTER THAT UNIFIES THE TWO SURFACES.
 *
 * The Side Panel and the DevTools panel are the same product. They differ in
 * exactly one respect: how they obtain a verified `PickSnapshot`.
 *
 *   TabPickSource       (WS5) reads the tab-scoped snapshot written by the
 *                       content script, and asks it to activate the picker.
 *   DevtoolsPickSource  (WS5) evaluates the bundled probe against `$0` and
 *                       subscribes to Elements-panel selection changes.
 *
 * Everything above this port is shared. Phase 0 found ~500 duplicated lines
 * between the two panels, already diverged in seven ways; this interface is how
 * that stops being possible.
 */

import type { PickSnapshot } from '@playwright-guru/locator-engine';

/**
 * What a surface can do.
 *
 * Surface differences are expressed as DATA, never as `if (isDevtools)` spread
 * through the component tree. A capability a surface lacks renders as a
 * disabled control with an explanation, driven by this object.
 */
export interface PickSourceCapabilities {
  /** The Side Panel can arm the element picker; DevTools follows `$0` instead. */
  canActivatePicker: boolean;
  /** Recording needs persistent page listeners, so it is Side Panel only (WS9). */
  canRecord: boolean;
  /** Assertion capture rides on the picker, so it follows recording (WS10). */
  canCaptureAssertion: boolean;
  canVerify: boolean;
  /** DevTools mirrors the Elements panel selection. */
  hasElementsPanelSync: boolean;
}

export type PickSourceKind = 'tab' | 'devtools';

export interface PickSource {
  readonly kind: PickSourceKind;
  readonly capabilities: PickSourceCapabilities;

  /** The current snapshot, or null when nothing is picked. */
  getCurrent(): Promise<PickSnapshot | null>;

  /** Subscribe to snapshot changes. Returns an unsubscribe function. */
  subscribe(listener: (snapshot: PickSnapshot | null) => void): () => void;

  /**
   * Ask this surface to produce a pick.
   *
   * Side Panel: activates the picker. DevTools: re-evaluates `$0`.
   */
  requestPick(): Promise<void>;
}
