/**
 * Playwright Guru — presenting the recording lifecycle (WS9, slice 5A).
 * ---------------------------------------------------------------------------
 * THE ARCHITECTURAL STATEMENT THIS MODULE MAKES TRUE:
 *
 *     The recording runtime OWNS the lifecycle.
 *     The panel READS it. It never decides it, and it never remembers it.
 *
 * Slice 2 made liveness a derivation rather than a flag: `isRecording(session,
 * now)` recomputes staleness from the clock on every call, so a recorder that
 * died silently stops reading as recording purely because time passed. That
 * guarantee is only worth as much as its consumer. A panel holding
 * `useState(false)` and flipping it to `true` on a successful START
 * acknowledgement re-introduces exactly the stored `true` slice 2 removed — a
 * boolean cannot go stale, so the banner outlives the recorder.
 *
 * So this module owns the mapping from "what the authority last said" to "what
 * the user is told", and it is PURE: no DOM, no React, no messages, no storage,
 * no clock. Every rule below is a function of data and is tested at R3's
 * `environment: 'node'`.
 *
 * ═══ FAIL CLOSED IS THE WHOLE DESIGN ═══
 *
 * There are five real lifecycle states and one honest sixth answer: `unknown`,
 * meaning the authority did not answer. It is what a dead content script, a
 * reloaded page, an unroutable tab, a rejected send and a handler that replied
 * without a state all produce, and it is deliberately NOT `inactive` —
 * "recording is off" is a claim, and we have no evidence for it either.
 *
 * `isRecordingNow` returns true for exactly one value. Everything else — the
 * unanswered handshake, the silent recorder, the ended session, the unknown —
 * reads as not recording. A missing heartbeat therefore cannot become "assume
 * active", because no path here can produce `active` from an absence.
 *
 * ═══ WHAT A PENDING REQUEST IS ALLOWED TO MEAN ═══
 *
 * `PendingRequest` is the ONE piece of local truth the panel legitimately owns:
 * "I have asked, and I have not heard back". It is a fact about the panel's own
 * message, not about the recorder, and it never becomes a recording claim —
 * `recordButtonModel(view, 'start').live` is false for every view, and the
 * banner says "Starting" rather than "RECORDING". The distinction is the entire
 * reason slice 2 has a `starting` state at all.
 *
 * NOT IN THIS SLICE: the workflow, the steps, the action count, the session id,
 * export, the code workspace, persistence and the flag flip. Nothing here can
 * express any of them, which is the cheapest way to guarantee none leaks.
 */

import type { RecordingLifecycleState } from './session';

/**
 * What the panel believes, including the honest "I was not told".
 *
 * The five real states are reused rather than re-listed, so a future lifecycle
 * state cannot appear in the runtime and be silently unrepresentable here.
 */
export type RecordingView = RecordingLifecycleState | 'unknown';

/**
 * The shape of an answer to the lifecycle query.
 *
 * Structural rather than the full `RuntimeMessageAck`, so this module stays
 * free of the messaging layer and can be exercised with hand-written inputs.
 */
export interface LifecycleReply {
  ok: boolean;
  lifecycle?: RecordingLifecycleState;
}

/** A request the panel has sent and not yet had answered. */
export type PendingRequest = 'start' | 'stop' | null;

/**
 * The five states a reply may legitimately claim.
 *
 * WS9 slice 5C — this list is not decoration, and adding it closed a real gap.
 * A reply crosses a `structuredClone` message boundary from a content script,
 * so its `lifecycle` field is DATA at runtime however it is typed here. Before
 * this check, an unrecognised value — a future build's state, a corrupted
 * field — was passed straight through as a `RecordingView`, where the exhaustive
 * switches in `recordButtonModel` and `recordingBannerLine` would fall off the
 * end and return `undefined`. That is worse than failing closed: it is a panel
 * with no button model at all.
 */
const KNOWN_STATES: readonly RecordingLifecycleState[] = [
  'inactive',
  'starting',
  'active',
  'stale',
  'stopped',
];

/**
 * What the authority just said, or `unknown`.
 *
 * The `ok` check is not redundant with the `lifecycle` check: a failed ack that
 * happens to carry a stale state field must not be believed, because the field
 * did not come from a successful read of the live runtime. The membership check
 * is not redundant with either: a value that is not one of the five is not an
 * answer, and treating an unrecognised claim as `unknown` is the only reading
 * that cannot become a lie.
 */
export function observedView(reply: LifecycleReply | null | undefined): RecordingView {
  if (!reply || !reply.ok || !reply.lifecycle) return 'unknown';
  return KNOWN_STATES.includes(reply.lifecycle) ? reply.lifecycle : 'unknown';
}

/** The single place the product may conclude that recording is happening. */
export function isRecordingNow(view: RecordingView): boolean {
  return view === 'active';
}

// ─── The button ─────────────────────────────────────────────────────────────

export interface RecordButtonModel {
  /** What pressing it would ask for. `none` means it is not actionable. */
  action: 'start' | 'stop' | 'none';
  /** The short visible label. */
  label: string;
  /** The accessible name — never a glyph, never empty. */
  name: string;
  /** Whether to show the live-recording affordance. `active` only. */
  live: boolean;
  /** Whether a request of the panel's own is outstanding. */
  busy: boolean;
}

/**
 * How the record button should present itself.
 *
 * A pending request disables the control rather than optimistically flipping
 * it: a button that already reads "Stop" is a button that has claimed the start
 * succeeded. Nothing here consults the request to decide `live`.
 */
export function recordButtonModel(view: RecordingView, pending: PendingRequest): RecordButtonModel {
  const live = isRecordingNow(view);

  if (pending) {
    return {
      action: 'none',
      label: '…',
      name: pending === 'start' ? 'Starting recording' : 'Stopping recording',
      live: false,
      busy: true,
    };
  }

  switch (view) {
    case 'active':
      return { action: 'stop', label: 'Stop', name: 'Stop recording', live, busy: false };
    case 'starting':
      // Requested and unacknowledged. Offering Stop keeps the user in control
      // of a handshake that may never complete; `live` stays false because
      // nothing has confirmed a recorder exists.
      return {
        action: 'stop',
        label: 'Stop',
        name: 'Stop the recording that has not started yet',
        live: false,
        busy: true,
      };
    case 'stale':
      return {
        action: 'start',
        label: 'Rec',
        name: 'Start recording — the last recorder stopped responding',
        live: false,
        busy: false,
      };
    case 'stopped':
      return {
        action: 'start',
        label: 'Rec',
        name: 'Start a new recording — the last one has ended',
        live: false,
        busy: false,
      };
    case 'inactive':
      return {
        action: 'start',
        label: 'Rec',
        name: 'Record user actions as Playwright code',
        live: false,
        busy: false,
      };
    case 'unknown':
      return {
        action: 'start',
        label: 'Rec',
        name: 'Start recording — the page has not reported its state',
        live: false,
        busy: false,
      };
  }
}

// ─── The banner ─────────────────────────────────────────────────────────────

/**
 * The one line of status text, or `null` for "there is nothing to say".
 *
 * `stale` and `stopped` produce text on purpose. `heartbeatTimeoutMs`' own doc
 * requires that "stale state is surfaced rather than trusted", and a banner
 * that simply disappeared when a recorder died would leave the user believing
 * the recording is still running somewhere off-screen.
 *
 * A pending request wins over the last observed state, because it is the newer
 * fact about what the panel knows. It never upgrades into a recording claim:
 * only `active` produces the RECORDING line.
 *
 * ═══ WS9 OWNER DECISION E — `confirmed` ═══
 *
 * `active` can be reached two ways, and until DL-89 the banner said the same
 * thing for both: the LIVE authority answered `active`, or the live authority
 * said nothing at all and the DURABLE observation was consulted instead
 * (DL-79's authorised fallback). DL-88 measured what the second case looks
 * like — for 14.4–15.3 s after a content script dies, the panel kept printing
 * "RECORDING — perform actions on the page" while nothing could be captured.
 *
 * The harm is the IMPERATIVE. A merely optimistic status line is cosmetic;
 * an instruction acted on during that window loses the user's work in silence,
 * which is precisely what `session.ts` opens by forbidding — "the product must
 * never believe it is recording when it is not" — and precisely the reason
 * `RECORDING_ENABLED` exists at all: "the control could report success while
 * capturing nothing."
 *
 * So this parameter carries ONE fact and no more:
 *
 *     confirmed  ⇔  the live authority produced a recognised answer
 *
 * It is NOT a second opinion about whether recording is happening, it does not
 * reorder anything, and it cannot manufacture a state. `resolveRecordingView`
 * still decides the view, by DL-79's rule, entirely unchanged; this only
 * decides what the panel is entitled to SAY about the view it was given. It
 * defaults to `true` so every existing caller keeps its exact meaning: this
 * adds a case, it does not reinterpret one.
 */
export function recordingBannerLine(
  view: RecordingView,
  pending: PendingRequest,
  confirmed = true,
): string | null {
  if (pending === 'start') return 'Starting — not recording yet';
  if (pending === 'stop') return 'Stopping…';

  switch (view) {
    case 'active':
      // Unconfirmed is deliberately NOT silent and deliberately NOT "stopped".
      // Silence would leave a user believing a recording runs off-screen, and
      // claiming it ended would be a second unevidenced assertion in the other
      // direction — the panel does not know that either. It reports exactly
      // what it has: evidence of a recording, no answer from the page, and the
      // consequence that follows for the user.
      return confirmed
        ? 'RECORDING — perform actions on the page'
        : 'Recording unconfirmed — the page has not answered, so actions may not be captured';
    case 'starting':
      return 'Starting — not recording yet';
    case 'stale':
      return 'The recorder stopped responding — nothing is being captured';
    case 'stopped':
      return 'Recording ended';
    case 'inactive':
    case 'unknown':
      return null;
  }
}
