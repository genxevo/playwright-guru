/**
 * Playwright Guru — the content-side recording runtime (WS9, slice 3).
 * ---------------------------------------------------------------------------
 * THE WIRING THAT MAKES RECORDING ACTUALLY HAPPEN.
 *
 * Slice 1 built the engine (`recording/workflow.ts`, `runtime/recorder.ts`) and
 * slice 2 built the lifecycle (`recording/session.ts`). Neither was reachable —
 * nothing called them. This module is the one place that does: it owns the
 * session, attaches the DOM listeners, and turns a real browser event into a
 * recorded action, or into nothing at all.
 *
 * IT ADDS NO ENGINE. Every element still goes through slice 1's `stepFor*`,
 * which calls `captureSnapshot` → `resolveCandidates` → `LiveDomProbe` →
 * `resolveChain` — the same path the Pick feature has used since WS3. This file
 * constructs no probe, resolves nothing itself, and queries no DOM for counts;
 * a source guard pins that absence.
 *
 * ═══ THE ADMISSION RULE LIVES IN `recording/admission.ts` ═══
 *
 * A browser action does NOT become a recorded action merely because an element
 * was clicked. `refusalFor` decides, and returns the REASON rather than a bare
 * boolean (WS9 DL-84) — so the reason the user is eventually shown is the very
 * computation that dropped the action, not a second opinion that agrees. This
 * module holds no copy of those clauses; it asks, tallies and reports.
 *
 * There is no CSS fallback, no XPath fallback, no guessed text and no "best
 * effort recorder selector". **Recording nothing is the correct outcome** when
 * the engine cannot produce a trustworthy answer: a step the user cannot replay
 * is worse than an absent step, because it looks like it works. The refusal is
 * per action — a page with one ambiguous button still records everything else,
 * and now says so instead of dropping it in silence.
 *
 * FAIL-CLOSED EVERYWHERE. An event is captured only while `isRecording` is true
 * at that instant, so inactive, `starting`, `stale`, `stopped` and a foreign
 * session all refuse. Because slice 2 derives staleness from the clock, a
 * runtime that stops ticking stops capturing on its own.
 *
 * THE PRODUCT FLAG FAILS CLOSED TOO. `enabled` defaults to `RECORDING_ENABLED`.
 * Hiding the Record button is not a security boundary — a message can still
 * reach a content script — so the runtime refuses to start when the product has
 * recording switched off.
 *
 * NOT IN THIS SLICE: persistence of any kind, UI, `renderAction`/
 * `renderSpecFile`, the export menu, the structured workspace, and
 * navigation/SPA/frame/tab handling. The heartbeat here keeps the session from
 * ageing out during a long recording; the CONTROLLER-side liveness marker that
 * slice 2's `heartbeatTimeoutMs` doc describes ("the banner is driven by state
 * the content script writes") needs a consumer that outlives this content
 * script — which is persistence or UI, both out of scope — so it is documented
 * as follow-up rather than half-built here.
 */

import {
  NO_REFUSALS,
  refusalFor,
  tallyRefusal,
  type RecordingRefusal,
  type RefusalTally,
} from '../recording/admission';
import { RECORDING_ENABLED, RECORDING_LIMITS } from '../config/recording';
import {
  isRecording,
  lifecycleStateOf,
  mintSessionId,
  recordAction,
  requestActivation,
  acknowledgeActivation,
  heartbeat,
  stopSession,
  type RecordingLifecycleState,
  type RecordingSession,
} from '../recording/session';
import { observationFor, type RecordingObservation } from '../recording/persistence';
import { stepForChange, stepForClick, stepForFill } from './recorder';

import type { RecordedStep, RecordedTarget, RecordedWorkflow } from '../recording/workflow';

/**
 * How often `content.ts` must call `tick()`.
 *
 * Re-exported from the single constant rather than redeclared — this module
 * holds no timing number of its own, which is the rule DL-4's 600 ms-versus-500
 * drift exists to enforce. The interval lives with the caller so this module
 * stays timer-free and therefore deterministically testable.
 */
export const HEARTBEAT_INTERVAL_MS = RECORDING_LIMITS.heartbeatMs;

/**
 * WS9 slice 5B — what the runtime hands to its durable owner.
 *
 * `observation` is always present; `workflow` only when the recording actually
 * changed, so a heartbeat refreshes liveness without rewriting the recording.
 */
export interface RecordingPersistPayload {
  observation: RecordingObservation;
  workflow?: RecordedWorkflow;
}

export interface RecordingRuntimeOptions {
  doc: Document;
  /** Injected so the runtime is a pure function of its inputs in tests. */
  now: () => number;
  /** Supplies the session-id nonce; identity must not degrade to a timestamp. */
  nonce: () => string;
  /** Defaults to the product flag. Passed explicitly only by tests. */
  enabled?: boolean;
  /**
   * WS9 slice 5B — where the durable projection goes. INJECTED, deliberately.
   *
   * The sink is supplied by `content.ts`, which is the only place allowed to
   * touch `browser.runtime` (R1). That keeps this module free of messages and
   * storage, keeps it deterministically testable, and — more importantly —
   * keeps the direction of travel one-way: the runtime EMITS its state and
   * never reads any back. There is no path here that could let a stored record
   * tell the runtime what it is.
   */
  persist?: (payload: RecordingPersistPayload) => void;
}

export interface StartResult {
  ok: boolean;
  /** The opaque session id the caller must present to stop this recording. */
  sessionId?: string;
  error?: 'recording-disabled';
}

export interface StopResult {
  ok: boolean;
  error?: 'no-session' | 'wrong-session';
}

export interface RecordingRuntime {
  start(at: number): StartResult;
  stop(sessionId: string, at: number): StopResult;
  /** Refreshes liveness. Called on `HEARTBEAT_INTERVAL_MS`. */
  tick(at: number): void;
  state(at: number): RecordingLifecycleState;
  workflow(): RecordedWorkflow | null;
  /**
   * How many actions were RECORDED — the length of the workflow, and nothing
   * else.
   *
   * Not a tally this module keeps: a second counter would be a second thing to
   * disagree with the recording, and coalescing means the event stream and the
   * workflow legitimately differ. It is also the exact number `appendStep`
   * feeds to `shouldStopRecording`, so "actions recorded" and the 40/100
   * contract are the same quantity by construction.
   */
  recorded(): number;
  /** How many were REFUSED by the admission boundary, and the most recent why. */
  refused(): RefusalTally;
}

// ─── The admission rule ─────────────────────────────────────────────────────

/**
 * Whether the engine's answer is good enough to record.
 *
 * The boolean form of the ONE decision, expressed IN TERMS OF it rather than
 * beside it, so the two can never drift apart. Every clause, and the reasoning
 * for each, lives in `recording/admission.ts`.
 */
export function isTrustworthy(target: RecordedTarget): boolean {
  return refusalFor(target) === null;
}

// ─── The runtime ────────────────────────────────────────────────────────────

export function createRecordingRuntime(options: RecordingRuntimeOptions): RecordingRuntime {
  const { doc, now, nonce } = options;
  const enabled = options.enabled ?? RECORDING_ENABLED;

  let session: RecordingSession | null = null;
  let attached = false;
  /**
   * Refusals for the CURRENT session only.
   *
   * Reset by `start`, so a new recording never inherits the previous one's
   * refusals, and held here rather than on `RecordingSession` because the
   * lifecycle module decides lifecycle and nothing else — a refusal is an
   * admission fact, and this is the admission boundary's caller.
   */
  let refusals: RefusalTally = NO_REFUSALS;

  /**
   * Publishes the current session as a durable projection.
   *
   * Guarded three ways. It only ever runs for a session that exists, so a
   * refused start, a foreign stop and a stop with no id write NOTHING — a
   * rejected request must not leave a trace that looks like a state change. It
   * never throws into the user's page: a full disk is a bad day for
   * persistence and must not also end the recording, so the in-memory
   * authority survives a failing sink untouched. And it is one-way: nothing is
   * read back, so stored state can never become this runtime's opinion of
   * itself.
   */
  function publish(includeWorkflow: boolean): void {
    if (!session || !options.persist) return;
    const payload: RecordingPersistPayload = {
      observation: observationFor(session, refusals),
      ...(includeWorkflow ? { workflow: session.workflow } : {}),
    };
    try {
      options.persist(payload);
    } catch {
      // Persistence is a projection. Losing it loses observability, never the
      // recording.
    }
  }

  /**
   * Builds a step from an element without letting a page break the recorder.
   *
   * A capture can throw on a hostile or half-torn-down DOM. Failing to record
   * is the correct outcome there — it is the same answer as an untrustworthy
   * locator — and it must never surface as an exception inside the user's page.
   */
  function stepFrom(build: () => RecordedStep | null): RecordedStep | null {
    try {
      return build();
    } catch {
      // A capture that threw is not the noise filter returning `null`: nothing
      // was measured, so there is no evidence either way. That is exactly
      // `unverifiable`, and it is reported rather than dropped in silence.
      if (session) refuse('unverifiable');
      return null;
    }
  }

  /**
   * The one place an action enters the workflow — or is refused with a reason.
   *
   * Three outcomes, and only one of them is a refusal worth reporting:
   *
   *   NOT LIVE      the session is inactive, stale, stopped or foreign. The
   *                 LIFECYCLE already tells the user that, so this is not
   *                 tallied — one fact, one channel.
   *   NOT ADMITTED  `refusalFor` said why. Tallied, and the observation is
   *                 refreshed so the panel can say so within one poll.
   *   ADMITTED      the recording changed, so the recording is republished.
   */
  function admit(step: RecordedStep | null, at: number): void {
    if (!step || !session) return;
    if (!isRecording(session, at)) {
      // The session died while listeners were still attached — stop listening.
      session = recordAction(session, session.id, step, at).session;
      detach();
      publish(false);
      return;
    }

    if (step.target) {
      const refusal = refusalFor(step.target);
      if (refusal) {
        refuse(refusal);
        return;
      }
    }

    const outcome = recordAction(session, session.id, step, at);
    session = outcome.session;
    if (session && session.state !== 'active') detach();
    // Only a change to the recording rewrites the recording. A refused action
    // writes an observation and no workflow, because nothing about the
    // recording changed — a refusal is news about the recorder, not about the
    // recording.
    if (outcome.outcome === 'ok') publish(true);
  }

  /** Tally one refusal and refresh the liveness marker that carries it. */
  function refuse(reason: RecordingRefusal): void {
    refusals = tallyRefusal(refusals, reason);
    publish(false);
  }

  function onClick(event: Event): void {
    const el = event.target;
    if (!(el instanceof Element)) return;
    const at = now();
    admit(
      stepFrom(() => stepForClick(el, at)),
      at,
    );
  }

  function onInput(event: Event): void {
    const el = event.target;
    if (!(el instanceof Element)) return;
    const at = now();
    admit(
      stepFrom(() => stepForFill(el, at)),
      at,
    );
  }

  function onChange(event: Event): void {
    const el = event.target;
    if (!(el instanceof Element)) return;
    const at = now();
    admit(
      stepFrom(() => stepForChange(el, at)),
      at,
    );
  }

  /** Capture phase, so a page that stops propagation cannot hide an action. */
  function attach(): void {
    if (attached) return;
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('input', onInput, true);
    doc.addEventListener('change', onChange, true);
    attached = true;
  }

  function detach(): void {
    if (!attached) return;
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('input', onInput, true);
    doc.removeEventListener('change', onChange, true);
    attached = false;
  }

  return {
    start(at: number): StartResult {
      if (!enabled) return { ok: false, error: 'recording-disabled' };

      // A duplicate start on a live recording keeps it, rather than silently
      // forking a second session and losing what was already captured.
      if (session && isRecording(session, at)) return { ok: true, sessionId: session.id.value };

      refusals = NO_REFUSALS;
      const id = mintSessionId({ at, nonce: nonce() });
      const requested = requestActivation({
        id,
        url: doc.defaultView?.location.href ?? '',
        at,
      });
      // The content script IS the side the handshake waits on, so it answers
      // here — the acknowledgement is not a formality, it is what proves a
      // recorder is genuinely in place before anything claims to be recording.
      session = acknowledgeActivation(requested, id, at).session;
      attach();
      // The recording and its liveness marker are published together, so the
      // durable owner never holds an observation with no recording behind it.
      publish(true);
      return { ok: true, sessionId: id.value };
    },

    stop(sessionId: string, at: number): StopResult {
      if (!session) return { ok: false, error: 'no-session' };
      if (session.id.value !== sessionId) return { ok: false, error: 'wrong-session' };

      session = stopSession(session, session.id, at, 'user').session;
      detach();
      // The final workflow goes with the terminal state. Ending a recording
      // does not discard it — keeping it is the entire point of giving it a
      // durable owner, and it is what a later export reads.
      publish(true);
      return { ok: true };
    },

    tick(at: number): void {
      if (!session) return;
      session = heartbeat(session, session.id, at).session;
      if (session.state !== 'active') detach();
      // Liveness only. A heartbeat that also rewrote the recording would make
      // every beat cost the size of the workflow, and would blur the line
      // between "the recorder is alive" and "the recording changed".
      publish(false);
    },

    state(at: number): RecordingLifecycleState {
      return lifecycleStateOf(session, at);
    },

    workflow(): RecordedWorkflow | null {
      return session ? session.workflow : null;
    },

    recorded(): number {
      return session ? session.workflow.steps.length : 0;
    },

    refused(): RefusalTally {
      return refusals;
    },
  };
}
