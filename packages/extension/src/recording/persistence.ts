/**
 * Playwright Guru — the durable projection of a recording (WS9, slice 5B).
 * ---------------------------------------------------------------------------
 * THE ONE SENTENCE THIS MODULE EXISTS TO KEEP TRUE:
 *
 *     The content runtime is the AUTHORITY while it exists.
 *     What is written here is a PROJECTION of that authority — never a rival.
 *
 * Slice 2 made liveness a derivation from the clock rather than a stored flag,
 * precisely so a recorder that dies silently stops reading as recording. Any
 * durable record risks undoing that: a row in storage saying `active` does not
 * stop being a row when the content script is gone. So the record here stores
 * `lastHeartbeatAt` and NOT a trusted boolean, and `observedLifecycle`
 * re-derives staleness on every read with the SAME
 * `RECORDING_LIMITS.heartbeatTimeoutMs` the runtime uses. A stale record cannot
 * report `active`, because nothing here can produce `active` from an old clock.
 *
 * IT IS NOT A SECOND STATE MACHINE. There are no new states: the projection
 * speaks the existing `RecordingLifecycleState` vocabulary and nothing else. It
 * has no transitions, no `starting → active` rule, no way to begin or end a
 * recording. It answers exactly one question — "what does this record, plus the
 * clock, imply?" — and `inactive` is what it says when there is no record.
 *
 * PURE, AND DEPENDENCY-LIGHT ON PURPOSE. No DOM, no probe, no resolver, no
 * codegen, no storage API, no messages, no clock of its own. Every value import
 * except `RECORDING_LIMITS` is type-only, so the background service worker pays
 * for the validators and nothing else. Guards pin all of that.
 *
 * PERSISTENCE STORES; IT DOES NOT INTERPRET. Nothing here resolves a locator,
 * ranks a candidate, re-verifies a chain, normalises a selector or improves a
 * recording. A `RecordedWorkflow` that goes in comes back identical or is
 * refused — and `validateWorkflow` refuses whole records rather than filtering,
 * following `CODE_BUFFER`'s precedent: a record with something unrecognised in
 * it is evidence that a shape we do not understand was written, and keeping
 * "the good half" is a guess about which half is real.
 *
 * NOT IN THIS SLICE: any consumer. Reconciling this projection with a live
 * runtime answer is a precedence rule that has not been authorised, so nothing
 * reads it yet and a guard pins that too. `RECORDING_ENABLED` is still `false`.
 */

import { RECORDING_LIMITS } from '../config/recording';
import { isRefusal, isRefusedCount, NO_REFUSALS } from './admission';

import type { RecordingRefusal, RefusalTally } from './admission';
import type { RecordingLifecycleState, RecordingSession } from './session';
import type { RecordedStep, RecordedStepKind, RecordedWorkflow } from './workflow';

/** The durable record's own schema. Independent of WS4's storage envelope. */
export const RECORDING_OBSERVATION_SCHEMA = 1;

/**
 * A session that is over, in one of the two ways a session can be over.
 *
 * `inactive` is deliberately absent: it means "no session at all", which is
 * represented by the absence of a record, not by a record that says so.
 */
export type ObservedLifecycle = Exclude<RecordingLifecycleState, 'inactive'>;

const OBSERVED: readonly ObservedLifecycle[] = ['starting', 'active', 'stale', 'stopped'];

/**
 * The bounded, durable observation of one recording.
 *
 * Every field is here because something cannot be answered without it:
 *   sessionId        which recording this is, so a stale stop is refusable
 *   lifecycle        `stopped` and `starting` are not derivable from a clock
 *   startedAt        when it began, for a controller that reopens
 *   lastHeartbeatAt  the ONLY liveness input, re-derived on every read
 *
 * There is STILL no recorded-action count, and that rule has not softened: the
 * workflow is persisted beside this record and already knows its own length, so
 * a second copy of one fact would be a second thing to disagree. `recorded()`
 * derives from the workflow, and `readDurableWorkflow` is what the panel reads.
 *
 * THE REFUSAL FIELDS ARE THE OPPOSITE CASE (WS9 DL-84), which is why they are
 * here and a count is not. A refused action is deliberately NOT in the
 * workflow — that is the whole point of refusing it — and is derivable from
 * nothing else at all. It is known only to the runtime that refused it, and
 * this record is precisely the durable projection of that runtime's own state.
 * Both fields are OPTIONAL and ADDITIVE, so the schema version does not move: a
 * record written without them is still valid and still readable, which is what
 * makes this a widening rather than a migration.
 *
 *   refusedCount  bounded by `RECORDING_LIMITS.hardStop`, never unbounded
 *   lastRefusal   one code from a five-member set, never a message
 *
 * There is no workflow id either — it IS `sessionId`, by construction in
 * `requestActivation`, and a test pins that.
 *
 * It carries no DOM, no HTML, no attributes, no input values and no page text.
 * It is bounded by construction: seven scalar fields that never grow.
 */
export interface RecordingObservation {
  schemaVersion: typeof RECORDING_OBSERVATION_SCHEMA;
  /** Opaque. Never rendered, never logged, never put in a filename. */
  sessionId: string;
  lifecycle: ObservedLifecycle;
  startedAt: number;
  lastHeartbeatAt: number;
  /** Present only when at least one action was refused. Bounded by `hardStop`. */
  refusedCount?: number;
  /** The most recent reason. A CODE — never a selector, value or page text. */
  lastRefusal?: RecordingRefusal;
}

/** The fields of a live session this projection is allowed to look at. */
export type ObservableSession = Pick<RecordingSession, 'id' | 'state' | 'startedAt'> &
  Partial<Pick<RecordingSession, 'lastHeartbeatAt'>>;

/**
 * Projects the live session into the durable record.
 *
 * `lastHeartbeatAt` falls back to `startedAt`, mirroring the lifecycle's own
 * `lastSignalAt`: an activation nobody acknowledged must age out on the same
 * clock as a recorder that stopped beating, or a handshake could wait forever.
 *
 * It reads the session's own `state` rather than re-deriving it. That is not a
 * shortcut — re-deriving here would be this module deciding lifecycle, which is
 * exactly what it must not do. Staleness is still re-derived on the way OUT, so
 * a record written moments before a crash cannot keep claiming to be live.
 */
export function observationFor(
  session: ObservableSession,
  refusals: RefusalTally = NO_REFUSALS,
): RecordingObservation {
  return {
    schemaVersion: RECORDING_OBSERVATION_SCHEMA,
    sessionId: session.id.value,
    lifecycle: session.state,
    startedAt: session.startedAt,
    lastHeartbeatAt: session.lastHeartbeatAt ?? session.startedAt,
    // Absent when there is nothing to report, so a clean recording writes the
    // record it always wrote and the fields cost nothing until they mean
    // something. A reason without a count, or a count without a reason, is an
    // incoherent record and the validator refuses it.
    ...(refusals.count > 0 && refusals.last
      ? { refusedCount: refusals.count, lastRefusal: refusals.last }
      : {}),
  };
}

/**
 * What the record plus the clock imply. FAIL-CLOSED BY CONSTRUCTION.
 *
 * No record — missing, unreadable, rejected by the validator, or lost with the
 * browser session — is `inactive`. A record whose last signal is older than the
 * authoritative timeout is `stale`, whatever it claims about itself. Staleness
 * stays terminal, and `stopped` stays stopped: neither can be talked back into
 * life by a later read.
 *
 * There is no path from an absence, an error or an old clock to `active`.
 */
export function observedLifecycle(
  record: RecordingObservation | null | undefined,
  at: number,
): RecordingLifecycleState {
  if (!record) return 'inactive';
  if (record.lifecycle === 'stopped' || record.lifecycle === 'stale') return record.lifecycle;
  if (at - record.lastHeartbeatAt > RECORDING_LIMITS.heartbeatTimeoutMs) return 'stale';
  return record.lifecycle;
}

// ─── Validators ─────────────────────────────────────────────────────────────
//
// Hand-written and deterministic, the convention every WS4 descriptor follows
// (`normalizeAck`, `classifyVerification`) — no schema library, no dependency.
// Each returns `null` for anything it does not recognise, which the gateway
// turns into the descriptor's default on read and refuses outright on write.

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

/** A real, finite, non-negative instant. `NaN` and `Infinity` are not times. */
function isInstant(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0;
}

export function validateObservation(raw: unknown): RecordingObservation | null {
  if (!isRecord(raw)) return null;
  if (raw['schemaVersion'] !== RECORDING_OBSERVATION_SCHEMA) return null;
  if (typeof raw['sessionId'] !== 'string' || raw['sessionId'].length === 0) return null;
  if (!OBSERVED.includes(raw['lifecycle'] as ObservedLifecycle)) return null;
  if (!isInstant(raw['startedAt']) || !isInstant(raw['lastHeartbeatAt'])) return null;

  // WS9 DL-84 — the two optional refusal fields, checked TOGETHER.
  //
  // Both absent is the ordinary case and is valid. Both present and well-formed
  // is valid. Anything else — one without the other, a count outside its
  // bounds, a reason outside the five-member set, a reason from a future build
  // — refuses the WHOLE record, following this module's existing rule that a
  // record with something unrecognised in it is evidence of a shape we do not
  // understand, and keeping "the good half" is a guess about which half is real.
  // The gateway then returns the descriptor's `null` default, which reads as no
  // observation at all: fail-closed, never a fabricated count.
  const count = raw['refusedCount'];
  const reason = raw['lastRefusal'];
  if (count !== undefined || reason !== undefined) {
    if (!isRefusedCount(count)) return null;
    if (!isRefusal(reason)) return null;
  }
  return raw as unknown as RecordingObservation;
}

const STEP_KINDS: readonly RecordedStepKind[] = [
  'goto',
  'click',
  'dblclick',
  'fill',
  'check',
  'uncheck',
  'selectOption',
];

/**
 * One step, checked for the things persistence itself is answerable for.
 *
 * It does NOT re-validate the locator chain. Re-checking a `LocatorChain` here
 * would duplicate the locator engine's contracts inside the storage layer —
 * the second-source-of-truth `LAST_PICK`'s own validator says the architecture
 * exists to avoid — and it would be a second, weaker verification gate wearing
 * the first one's clothes.
 *
 * It DOES refuse a redacted step that still carries a value. Slice 1 removes
 * the value at the model boundary, so such a step cannot come from
 * `appendStep`; refusing it anyway means a future refactor that reintroduced
 * the leak would fail here instead of writing a secret to disk.
 */
function isStep(raw: unknown): raw is RecordedStep {
  if (!isRecord(raw)) return false;
  if (!STEP_KINDS.includes(raw['kind'] as RecordedStepKind)) return false;
  if (!isInstant(raw['timestamp'])) return false;
  if (raw['value'] !== undefined && typeof raw['value'] !== 'string') return false;
  if (raw['url'] !== undefined && typeof raw['url'] !== 'string') return false;
  if (raw['target'] !== undefined && !isRecord(raw['target'])) return false;
  if (raw['redacted'] !== undefined) {
    if (typeof raw['redacted'] !== 'string') return false;
    if (raw['value'] !== undefined) return false;
  }
  return true;
}

/**
 * A whole recording, or nothing.
 *
 * `hardStop` is enforced here as well as at capture, so persistence can never
 * become the place an unbounded recording enters the product — the limit stays
 * the one in `RECORDING_LIMITS`, never a number of this module's own.
 */
export function validateWorkflow(raw: unknown): RecordedWorkflow | null {
  if (!isRecord(raw)) return null;
  if (raw['schemaVersion'] !== 1) return null;
  if (typeof raw['id'] !== 'string' || raw['id'].length === 0) return null;
  if (typeof raw['url'] !== 'string') return null;
  if (!isInstant(raw['startedAt'])) return null;

  const steps = raw['steps'];
  if (!Array.isArray(steps)) return null;
  if (steps.length > RECORDING_LIMITS.hardStop) return null;
  if (!steps.every(isStep)) return null;

  const stopped = raw['stopped'];
  if (stopped !== undefined) {
    if (!isRecord(stopped)) return null;
    if (stopped['reason'] !== 'limit' && stopped['reason'] !== 'user') return null;
    if (!isInstant(stopped['at'])) return null;
  }
  return raw as unknown as RecordedWorkflow;
}
