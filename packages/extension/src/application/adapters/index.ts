/**
 * Playwright Guru — Environment adapters (WS0 boundary).
 * ---------------------------------------------------------------------------
 * This directory is the ONLY place a surface-specific implementation of an
 * application port may live. It is the seam that keeps the Side Panel and the
 * DevTools panel one product rather than two.
 *
 *                       Shared Application
 *                       /       |        \
 *                      /        |         \
 *              Side Panel   DevTools   Future surface
 *                     \         |         /
 *                      └──── adapters ───┘
 *                              │
 *                        (application ports)
 *
 * PLANNED IMPLEMENTATIONS — WS5
 *
 *   TabPickSource
 *     kind: 'tab'
 *     Reads the tab-scoped `StoredPick` from session storage, subscribes to
 *     storage changes, and activates the picker through the CommandBus.
 *     capabilities: canActivatePicker ✓  canRecord ✓  canCaptureAssertion ✓
 *
 *   DevtoolsPickSource
 *     kind: 'devtools'
 *     Evaluates the BUNDLED probe (built from the real engines in WS3, which is
 *     what retires the hand-written eval string Phase 0 found) against `$0`,
 *     subscribes to `panels.elements.onSelectionChanged` and, critically, to
 *     `network.onNavigated` so the panel does not display stale facts after a
 *     reload. Writes its snapshot into session storage so both surfaces observe
 *     the same state.
 *     capabilities: canActivatePicker ✗  canRecord ✗  canCaptureAssertion ✗
 *
 * WHY DEVTOOLS CANNOT RECORD IN PHASE 1
 * `chrome.devtools.inspectedWindow.eval` is a request/response channel with no
 * event stream. Recording needs persistent listeners in the page, which is what
 * a content script is for. Rather than half-build it, the DevTools panel shows a
 * disabled control explaining that recording runs from the Side Panel — driven
 * by `capabilities.canRecord`, not by a branch in a component. Bridging this is
 * Phase 3 work.
 *
 * WS0 SCOPE
 * The boundary and its contract, deliberately without implementations. Adding
 * stubs that throw would be worse than an empty directory: they invite call
 * sites that compile and fail at runtime.
 *
 * IMPLEMENTED — WS5
 *
 *   BrowserClipboardAdapter (`./ClipboardAdapter`)
 *     The first port implementation to actually land here. Real
 *     `navigator.clipboard.writeText`, typed failure instead of an uncaught
 *     rejection. Consumed by `src/ui/primitives.tsx` (`CopyButton`) and by
 *     both panels' "Copy All" actions.
 *
 *   TabPickSource / DevtoolsPickSource — STILL PLANNED, NOT IMPLEMENTED.
 *     `PickSource.getCurrent()`/`subscribe()` are now typed against
 *     `StoredPick` (corrected DL-55, owner-decision gate) — the type
 *     conflict that previously blocked an honest implementation is
 *     resolved. What remains is simply that no implementation exists yet:
 *     building `TabPickSource`/`DevtoolsPickSource` (session-storage
 *     wiring, the CommandBus question, Elements-panel selection sync) is
 *     unstarted WS5 work, not a blocked contract. Not implemented by this
 *     gate — a documentation/contract correction only.
 */

export type { PickSource, PickSourceKind, PickSourceCapabilities } from '../ports/PickSource';
export { BrowserClipboardAdapter, clipboardPort } from './ClipboardAdapter';

/**
 * Capability profiles, declared here so both surfaces cannot drift apart by
 * hand-rolling their own — the exact failure mode Phase 0 documented.
 */
export const TAB_CAPABILITIES = {
  canActivatePicker: true,
  canRecord: true,
  canCaptureAssertion: true,
  canVerify: true,
  hasElementsPanelSync: false,
} as const;

export const DEVTOOLS_CAPABILITIES = {
  canActivatePicker: false,
  canRecord: false,
  canCaptureAssertion: false,
  canVerify: true,
  hasElementsPanelSync: true,
} as const;
