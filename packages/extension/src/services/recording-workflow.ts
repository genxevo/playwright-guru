/**
 * Playwright Guru — reading the durable recording (WS9, export).
 * ---------------------------------------------------------------------------
 * The workflow reader DL-79 named as export's missing prerequisite.
 *
 * Slice 5B gave a recording a durable owner; 5C gave the lifecycle a reader and
 * deliberately refused to read this descriptor, because a lifecycle consumer
 * that also loaded the recording would be the cheapest possible way to smuggle
 * one into the panel. This is that read, in its own module, done once, for
 * export and nothing else.
 *
 * ═══ WHAT IT IS NOT ═══
 *
 * It is NOT a repository, a cache, a store or a generic data layer. It is one
 * function over the ONE existing `StorageGateway`, and the gateway is injected —
 * so this module imports no browser API, no adapter and no `chrome.storage`, and
 * cannot become the bypass `storage-consumers.test.ts` exists to prevent.
 *
 * It is NOT a second lifecycle source. It reads `recording-workflow` and never
 * `recording-observation`: a workflow is not evidence that a recording is live,
 * and a live recording is not evidence that a workflow exists. DL-79's rule
 * stands — lifecycle and workflow existence are different questions, and
 * collapsing them is how a panel ends up offering an export of nothing.
 *
 * It is READ-ONLY. Nothing here writes, repairs, normalises or migrates. A
 * malformed record is refused where it lies; the persisted bytes are never
 * touched, so a build that understands them still can.
 *
 * ═══ FAIL CLOSED, FOUR WAYS ═══
 *
 * No bound tab · an unreadable record · an unknown FUTURE schema version · a
 * gateway that throws. Every one yields `value: null`, and the export boundary
 * turns that into a refusal rather than an empty file.
 */

import { RECORDING_WORKFLOW } from '../storage/state';

import type { StorageFailureCode, StorageGateway } from '../application/ports/StorageGateway';
import type { RecordedWorkflow } from '../recording/workflow';

/**
 * What a read yielded.
 *
 * `valid` is kept distinct from `value === null` for the same reason the
 * lifecycle reader keeps it: absence and untrustworthiness are different facts,
 * and a caller that cannot tell them apart cannot report honestly.
 */
export interface DurableWorkflowEvidence {
  value: RecordedWorkflow | null;
  valid: boolean;
  code?: StorageFailureCode;
}

const NO_EVIDENCE: DurableWorkflowEvidence = { value: null, valid: false };

/**
 * Read one tab's persisted recording.
 *
 * `tabId` is nullable because the Side Panel floats over the active tab and is
 * briefly bound to nothing. That is absence of evidence, not evidence that the
 * tab has no recording, so it fails closed.
 *
 * The `try` is not clutter: `readTab` throws on a mis-scoped descriptor or an
 * invalid tab id, and an export read must never surface as an exception inside
 * a render.
 */
export async function readDurableWorkflow(
  gateway: Pick<StorageGateway, 'readTab'>,
  tabId: number | null,
): Promise<DurableWorkflowEvidence> {
  if (tabId === null) return NO_EVIDENCE;
  try {
    const read = await gateway.readTab(RECORDING_WORKFLOW, tabId);
    return { value: read.value, valid: read.valid, ...(read.code ? { code: read.code } : {}) };
  } catch {
    return NO_EVIDENCE;
  }
}
