/**
 * Playwright Guru — PickSource port (WS0).
 * ---------------------------------------------------------------------------
 * THE ADAPTER THAT UNIFIES THE TWO SURFACES.
 *
 * The Side Panel and the DevTools panel are the same product. They differ in
 * exactly one respect: how they obtain a verified `StoredPick`.
 *
 *   TabPickSource       (WS5) reads the tab-scoped pick written by the
 *                       content script, and asks it to activate the picker.
 *   DevtoolsPickSource  (WS5) evaluates the bundled probe against `$0` and
 *                       subscribes to Elements-panel selection changes.
 *
 * Everything above this port is shared. Phase 0 found ~500 duplicated lines
 * between the two panels, already diverged in seven ways; this interface is how
 * that stops being possible.
 *
 * CONTRACT CORRECTION (DL-55, owner-decision gate). This port originally
 * typed `getCurrent`/`subscribe` against `PickSnapshot`
 * (`@playwright-guru/locator-engine`). WS3 deliberately keeps `PickSnapshot`
 * out of the live capture path at zero shipped bundle cost (see
 * `src/runtime/fact-model.ts`); the actual, and only, value the shipped
 * capture path (`src/runtime/capture.ts`) ever produces is `StoredPick`
 * (`utils/messaging.ts`). `PickSource` has zero implementations and zero
 * consumers anywhere in this repository today, so this file is the port's
 * declaration, not a description of a working integration — retyping it
 * against `StoredPick` makes the contract honest about what a future adapter
 * would actually have to return, instead of a signature nothing could ever
 * satisfy without a fake conversion. This is a type-only correction: it does
 * not implement `TabPickSource`/`DevtoolsPickSource`, and does not reopen
 * WS3's zero-cost `PickSnapshot` decision.
 */

import type { StoredPick } from '../../../utils/messaging';

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

  /** The current pick, or null when nothing is picked. */
  getCurrent(): Promise<StoredPick | null>;

  /** Subscribe to pick changes. Returns an unsubscribe function. */
  subscribe(listener: (pick: StoredPick | null) => void): () => void;

  /**
   * Ask this surface to produce a pick.
   *
   * Side Panel: activates the picker. DevTools: re-evaluates `$0`.
   */
  requestPick(): Promise<void>;
}
