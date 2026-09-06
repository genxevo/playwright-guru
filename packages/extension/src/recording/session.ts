/**
 * Playwright Guru — the recording lifecycle (WS9, slice 2).
 * ---------------------------------------------------------------------------
 * THE ONE PROPERTY THIS MODULE EXISTS FOR:
 *
 *   **the product must never believe it is recording when it is not.**
 *
 * That is not a paraphrase. `RECORDING_ENABLED`'s own doc says the flag exists
 * because "the control could report success while capturing nothing", and
 * `heartbeatTimeoutMs`' doc calls the heartbeat "half of the guarantee that the
 * product never claims to be recording when it is not: the banner is driven by
 * state the content script writes, and stale state is surfaced rather than
 * trusted." This module is that guarantee, expressed as data.
 *
 * WHY LIVENESS IS DERIVED, NOT STORED
 * `isRecording(session, now)` recomputes staleness from the clock on every call.
 * It is not a flag anybody sets. So when a content script dies the way content
 * scripts actually die — a reload, a navigation, a tab discard, an extension
 * update, a crash — it sends no message, fires no event and calls no
 * transition, and the session stops reading as recording anyway, purely because
 * time passed. A caller that forgets to poll cannot obtain a stale `true`,
 * because there is no stored `true` to obtain. This is the structural answer to
 * "what happens if the controlling context disappears", and it needs no browser
 * to establish.
 *
 * WHY IDENTITY, NOT TIMESTAMPS
 * Every mutating entry point takes the `RecordingSessionId` it claims to act on
 * and refuses anything else. A late heartbeat, a late stop or a late action from
 * a previous recording is rejected because it names a different session — not
 * because its clock reading looks old. Clock comparison would be a heuristic;
 * identity is a fact.
 *
 * THE FIVE STATES, each earning its place:
 *
 *   inactive   no session at all (`null`). Nothing to be wrong about.
 *   starting   activation requested, the content side has NOT answered. This
 *              state is the whole point of calling it a handshake: it is the
 *              window in which a naive implementation shows "Recording" while
 *              capturing nothing.
 *   active     acknowledged AND heartbeating. The only state that records.
 *   stale      the heartbeat stopped. TERMINAL — a late beat cannot resurrect a
 *              session, because a recorder that went away may have missed
 *              actions, and a recording with an unknown hole in it is worse
 *              than one that honestly ended.
 *   stopped    ended deliberately or by the hard limit. Captured work preserved.
 *
 * There is no `stopping`: a stop is a single transition with nothing to wait
 * for, and a state nobody can observe is state explosion, not safety.
 *
 * WHAT THIS MODULE IS NOT. It has no DOM, no probe, no resolver, no storage, no
 * messages and no UI. It gates the Slice 1 workflow engine and re-implements
 * none of it — `appendStep` still owns the limits, coalescing, truncation and
 * redaction. Every timing number comes from `config/recording.ts`, whose
 * contract is that no other module may define or duplicate one.
 *
 * NOT IN THIS SLICE: `content.ts` wiring, message types, persistence and UI.
 * `RECORDING_ENABLED` remains `false`, so nothing here is reachable by a user —
 * the handshake exists, but the product does not yet offer it.
 */

import { RECORDING_LIMITS } from '../config/recording';
import { appendStep, createWorkflow, stopWorkflow, type RecordedWorkflow } from './workflow';

import type { RecordedStep } from './workflow';

// ─── Session identity ───────────────────────────────────────────────────────

/**
 * An opaque handle to ONE recording session.
 *
 * Branded so a bare string cannot be passed where a session is required, and
 * serialisable (unlike `ScopeHandle`) because a later slice must carry it
 * across the message seam between the panel and the content script.
 */
export type RecordingSessionId = {
  readonly __brand: 'RecordingSessionId';
  readonly value: string;
};

/**
 * Mints a session id from an explicit seed.
 *
 * Takes the seed rather than reading a clock or a random source, so the
 * lifecycle stays a pure function of its inputs and every test below is
 * deterministic. The `nonce` is what makes two sessions started in the same
 * millisecond distinct — identity must not degrade into a timestamp.
 */
export function mintSessionId(seed: { at: number; nonce: string }): RecordingSessionId {
  return { __brand: 'RecordingSessionId', value: `${seed.at.toString(36)}.${seed.nonce}` };
}

export function sameSession(a: RecordingSessionId, b: RecordingSessionId): boolean {
  return a.value === b.value;
}

// ─── Shapes ─────────────────────────────────────────────────────────────────

export type RecordingLifecycleState = 'inactive' | 'starting' | 'active' | 'stale' | 'stopped';

/** Why a session ended. `stale` means it died rather than was ended. */
export type RecordingEndReason = 'user' | 'limit' | 'stale';

export interface RecordingSession {
  id: RecordingSessionId;
  state: Exclude<RecordingLifecycleState, 'inactive'>;
  startedAt: number;
  /** Absent until the content side answers the handshake. */
  lastHeartbeatAt?: number;
  workflow: RecordedWorkflow;
  endedReason?: RecordingEndReason;
}

/**
 * What a lifecycle call did.
 *
 * Deliberately explicit rather than a boolean: "refused because that is not the
 * current session" and "refused because this session is no longer live" are
 * different facts, and a caller that cannot tell them apart cannot report
 * honestly to a user.
 */
export type SessionOutcome =
  | 'ok'
  | 'ignored-duplicate'
  | 'rejected-wrong-session'
  | 'rejected-not-active'
  | 'rejected-stopped';

export interface SessionResult {
  session: RecordingSession;
  outcome: SessionOutcome;
}

export interface NullableSessionResult {
  session: RecordingSession | null;
  outcome: SessionOutcome;
}

// ─── Liveness, derived ──────────────────────────────────────────────────────

/**
 * The last moment the content side proved it was there.
 *
 * Before the first heartbeat that is the activation itself, so an activation
 * that is never acknowledged ages out on the same clock as a recorder that
 * stops beating. A handshake nobody answers must not wait forever.
 */
function lastSignalAt(session: RecordingSession): number {
  return session.lastHeartbeatAt ?? session.startedAt;
}

function isSilent(session: RecordingSession, at: number): boolean {
  return at - lastSignalAt(session) > RECORDING_LIMITS.heartbeatTimeoutMs;
}

/** True only for a session that is live RIGHT NOW. Fail-closed by construction. */
export function isRecording(session: RecordingSession | null, at: number): boolean {
  if (!session) return false;
  return session.state === 'active' && !isSilent(session, at);
}

export function lifecycleStateOf(
  session: RecordingSession | null,
  at: number,
): RecordingLifecycleState {
  if (!session) return 'inactive';
  return observe(session, at).state;
}

/**
 * The session as it truly is at `at`, promoting silence to `stale`.
 *
 * Pure: it reports what the clock already implies. Callers do not have to call
 * it for `isRecording` to be correct — it exists so a caller can PERSIST the
 * transition and show a user why recording ended.
 */
export function observe(session: RecordingSession, at: number): RecordingSession {
  const dying = session.state === 'active' || session.state === 'starting';
  if (!dying || !isSilent(session, at)) return session;
  return { ...session, state: 'stale', endedReason: session.endedReason ?? 'stale' };
}

// ─── Activation — the handshake ─────────────────────────────────────────────

/**
 * Requests a recording. The result is NOT recording yet.
 *
 * A fresh session is always minted, so a second activation cannot be confused
 * with the first: the previous id becomes foreign and every entry point below
 * then refuses it. That is what makes "an old session cannot control the
 * current session" true by construction rather than by policy.
 */
export function requestActivation(init: {
  id: RecordingSessionId;
  url: string;
  at: number;
}): RecordingSession {
  return {
    id: init.id,
    state: 'starting',
    startedAt: init.at,
    workflow: createWorkflow({ id: init.id.value, url: init.url, startedAt: init.at }),
  };
}

/**
 * The content side answering the handshake. THE ONLY TRANSITION INTO RECORDING.
 *
 * A structural guard asserts `state: 'active'` is assigned in exactly one place
 * in this file, so a future shortcut cannot open a second door into the one
 * state that captures.
 */
export function acknowledgeActivation(
  session: RecordingSession,
  id: RecordingSessionId,
  at: number,
): SessionResult {
  if (!sameSession(session.id, id)) return { session, outcome: 'rejected-wrong-session' };

  const current = observe(session, at);
  if (current.state === 'active') return { session: current, outcome: 'ignored-duplicate' };
  if (current.state !== 'starting') return { session: current, outcome: 'rejected-not-active' };

  return { session: { ...current, state: 'active', lastHeartbeatAt: at }, outcome: 'ok' };
}

// ─── Heartbeat ──────────────────────────────────────────────────────────────

/**
 * Refreshes the liveness marker.
 *
 * Only an already-active session may beat. A beat that arrives after the
 * timeout finds a `stale` session and is refused — staleness is terminal, so a
 * recorder that went quiet and came back starts a NEW session rather than
 * silently resuming one with an unknown hole in it.
 */
export function heartbeat(
  session: RecordingSession,
  id: RecordingSessionId,
  at: number,
): SessionResult {
  if (!sameSession(session.id, id)) return { session, outcome: 'rejected-wrong-session' };

  const current = observe(session, at);
  if (current.state !== 'active') {
    return {
      session: current,
      outcome: current.state === 'stopped' ? 'rejected-stopped' : 'rejected-not-active',
    };
  }
  return { session: { ...current, lastHeartbeatAt: at }, outcome: 'ok' };
}

// ─── Capture — gated on genuine liveness ───────────────────────────────────

/**
 * Records one action, if and only if the session is truly live.
 *
 * The gate is `isRecording`, so `starting`, `stale` and `stopped` all refuse,
 * and a silent recorder refuses without anyone having noticed it died. The
 * action itself goes through Slice 1's `appendStep`, which keeps the limits,
 * coalescing, truncation and redaction rules in exactly one place.
 *
 * Reaching the hard stop ends the SESSION as well as the workflow: a recording
 * that cannot accept another action is over, and leaving it "active" would be
 * the same lie in a smaller room.
 */
export function recordAction(
  session: RecordingSession,
  id: RecordingSessionId,
  step: RecordedStep,
  at: number,
): SessionResult;
export function recordAction(
  session: RecordingSession | null,
  id: RecordingSessionId,
  step: RecordedStep,
  at: number,
): NullableSessionResult;
export function recordAction(
  session: RecordingSession | null,
  id: RecordingSessionId,
  step: RecordedStep,
  at: number,
): NullableSessionResult {
  if (!session) return { session: null, outcome: 'rejected-not-active' };
  if (!sameSession(session.id, id)) return { session, outcome: 'rejected-wrong-session' };

  const current = observe(session, at);
  if (current.state === 'stopped') return { session: current, outcome: 'rejected-stopped' };
  if (!isRecording(current, at)) return { session: current, outcome: 'rejected-not-active' };

  const appended = appendStep(current.workflow, step);
  const ended = appended.workflow.stopped;
  return {
    session: {
      ...current,
      workflow: appended.workflow,
      ...(ended ? { state: 'stopped' as const, endedReason: ended.reason } : {}),
    },
    outcome: 'ok',
  };
}

// ─── Stop ───────────────────────────────────────────────────────────────────

/**
 * Ends a session, preserving everything captured.
 *
 * An existing `endedReason` wins: a session that had already gone stale reports
 * that it died, not that the user tidied it away, because those are different
 * things to tell someone about their recording.
 */
export function stopSession(
  session: RecordingSession,
  id: RecordingSessionId,
  at: number,
  reason: RecordingEndReason,
): SessionResult {
  if (!sameSession(session.id, id)) return { session, outcome: 'rejected-wrong-session' };

  const current = observe(session, at);
  if (current.state === 'stopped') return { session: current, outcome: 'ignored-duplicate' };

  return {
    session: {
      ...current,
      state: 'stopped',
      endedReason: current.endedReason ?? reason,
      workflow: stopWorkflow(current.workflow, at),
    },
    outcome: 'ok',
  };
}
