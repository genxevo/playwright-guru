/**
 * Playwright Guru — reading the durable recording observation (WS9, slice 5C).
 * ---------------------------------------------------------------------------
 * The one read of slice 5B's durable projection, and nothing more.
 *
 * It exists so the Side Panel can answer "was this tab recording?" when the
 * content script cannot be reached — after the panel was closed and reopened,
 * or while the script is being re-injected. It is the READ half of the seam
 * slice 5B built; the write half stays where it was, in the content runtime and
 * the background.
 *
 * ═══ WHAT IT REFUSES TO DO ═══
 *
 * IT DOES NOT READ THE WORKFLOW. `RECORDING_WORKFLOW` exists and is readable,
 * and reading it here would be the cheapest possible way to smuggle a recording
 * into the panel. This slice is lifecycle observation only: the workflow
 * belongs to the export slice, which has its own boundary and its own review.
 * A guard asserts the descriptor is never named in this file.
 *
 * IT DOES NOT DECIDE ANYTHING. It returns evidence — the validated record and
 * whether the read could be trusted — and `resolveRecordingView` weighs it
 * against the live answer. Interpreting a record here would put the precedence
 * rule in two places.
 *
 * IT OPENS NO NEW STORAGE PATH. The gateway is injected; this module imports no
 * browser API, no adapter and no `chrome.storage`, so it cannot become the
 * bypass `storage-consumers.test.ts` exists to prevent.
 *
 * ═══ FAIL CLOSED, THREE WAYS ═══
 *
 * No bound tab, an unreadable record, and a gateway that throws outright all
 * produce `{ value: null, valid: false }` — which `resolveRecordingView` reads
 * as `unknown`. There is no path from a storage problem to "recording".
 */

import { RECORDING_OBSERVATION } from '../storage/state';

import type { StorageGateway } from '../application/ports/StorageGateway';
import type { DurableEvidence } from '../recording/reconcile';

/** What a caller could not learn anything from. */
const NO_EVIDENCE: DurableEvidence = { value: null, valid: false };

/**
 * Read one tab's durable recording observation.
 *
 * `tabId` is nullable because the Side Panel floats over the active tab and is
 * briefly bound to nothing at all. That is absence of evidence, not evidence of
 * absence, so it fails closed rather than reporting "no recording".
 *
 * The `try` is not defensive clutter: `readTab` rejects a mis-scoped descriptor
 * and an invalid tab id by throwing, and a lifecycle read must never surface as
 * an exception inside a render.
 */
export async function readDurableObservation(
  gateway: Pick<StorageGateway, 'readTab'>,
  tabId: number | null,
): Promise<DurableEvidence> {
  if (tabId === null) return NO_EVIDENCE;
  try {
    const read = await gateway.readTab(RECORDING_OBSERVATION, tabId);
    return { value: read.value, valid: read.valid };
  } catch {
    return NO_EVIDENCE;
  }
}
