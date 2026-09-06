/**
 * WS9 slice 2 — the recording LIFECYCLE: activation, identity, heartbeat, death.
 * ============================================================================
 * WHAT AUTHORISES THIS SLICE.
 *
 * Three authoritative sources name the same unit:
 *
 *   • WS9 discovery §14 sequences it — slice 1, then "`RECORDING_ENABLED` left
 *     **off** until THE HANDSHAKE AND HEARTBEAT exist", then "`renderAction`/
 *     `renderSpecFile`, the export menu and the structured workspace FOLLOW";
 *   • DL-64's D1 fixes its evidence level — the kill-the-content-script exit
 *     criterion is satisfied by "unit + structural proof of the recording
 *     ACTIVATION / HEARTBEAT / STALENESS behaviour";
 *   • `config/recording.ts` — "WS9 turns recording on by flipping this constant,
 *     once the recorder, THE ACTIVATION HANDSHAKE AND THE HEARTBEAT exist."
 *
 * THE FAILURE THIS EXISTS TO PREVENT, in the product's own words. The
 * `RECORDING_ENABLED` flag was introduced because "the control could report
 * success while capturing nothing", and `heartbeatTimeoutMs`' doc calls the
 * heartbeat "half of the guarantee that the product never claims to be recording
 * when it is not: the banner is driven by state the content script writes, and
 * stale state is surfaced rather than trusted."
 *
 * So the property under test is not "can we start a recording" — it is **the
 * product must never believe it is recording when it is not**. Every assertion
 * below is a way of being wrong about that.
 *
 * THE DESIGN THAT MAKES IT FAIL-CLOSED. Liveness is DERIVED from the clock, not
 * stored as a boolean. `isRecording(session, now)` recomputes staleness on every
 * call, so a content script that dies silently — no message, no event, no
 * transition — stops being "recording" purely through the passage of time. A
 * caller that never asks the lifecycle anything cannot obtain a stale `true`.
 * That is the structural answer to "what happens if the controlling context
 * disappears", and it needs no browser to prove.
 *
 * IDENTITY, NOT TIMESTAMPS. Every mutating call takes the session id it claims
 * to act on. An id from a previous session is refused by every one of them, so
 * a stale start/heartbeat/stop/action cannot reach across sessions. This is
 * asserted directly rather than approximated with clock arithmetic.
 *
 * EVIDENCE BOUNDARY. Pure unit tests at R3's `environment: 'node'` — no DOM, no
 * browser, no timers. **Real Chromium is not tested and nothing here claims
 * otherwise.** WS9's X1 criterion is met at exactly DL-64/D1's re-scoped level
 * and no higher; live-browser proof remains deferred infrastructure.
 *
 * NOT IN THIS SLICE: `content.ts` wiring, new message types, UI, persistence,
 * and `RECORDING_ENABLED` stays `false`.
 */
import { describe, expect, it } from 'vitest';

import { RECORDING_LIMITS } from '../src/config/recording';
import {
  acknowledgeActivation,
  heartbeat,
  isRecording,
  lifecycleStateOf,
  mintSessionId,
  observe,
  recordAction,
  requestActivation,
  sameSession,
  stopSession,
  type RecordingSession,
  type RecordingSessionId,
} from '../src/recording/session';

import type { RecordedStep, RecordedTarget } from '../src/recording/workflow';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const T0 = 1_000_000;
const { heartbeatMs, heartbeatTimeoutMs, warnAt, hardStop } = RECORDING_LIMITS;

function target(id: string): RecordedTarget {
  return {
    locator: {
      chain: { steps: [{ kind: 'testId', selectorValue: { type: 'string', value: id } }] },
      verdict: 'excellent',
      matchCount: 1,
      visibleMatchCount: 1,
      stepCounts: [1],
      rationale: [],
    },
    facts: {
      attributes: { tagName: 'button', testId: id },
      ancestors: [],
      indexInParent: 0,
      inShadowRoot: false,
    },
  };
}

const click = (id: string, timestamp: number): RecordedStep => ({
  kind: 'click',
  target: target(id),
  timestamp,
});

const idAt = (at: number, nonce: string) => mintSessionId({ at, nonce });

/** Source with comments removed, so architecture guards read code, not prose. */
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

/** A session that completed the handshake and is genuinely live. */
function live(at = T0): { session: RecordingSession; id: RecordingSessionId } {
  const id = idAt(at, 'a');
  const started = requestActivation({ id, url: 'https://example.test/', at });
  const { session } = acknowledgeActivation(started, id, at);
  return { session, id };
}

// ─── 1. Activation — nothing records until the handshake completes ─────────

describe('WS9 · activation is a handshake, not a boolean', () => {
  it('a requested activation is NOT yet recording — the content side has not answered', () => {
    // This is the exact failure `RECORDING_ENABLED` was created for: "the
    // control could report success while capturing nothing."
    const id = idAt(T0, 'a');
    const session = requestActivation({ id, url: 'https://example.test/', at: T0 });

    expect(session.state).toBe('starting');
    expect(isRecording(session, T0), 'starting must never read as recording').toBe(false);
  });

  it('acknowledgement from the SAME session activates it', () => {
    const id = idAt(T0, 'a');
    const started = requestActivation({ id, url: 'https://example.test/', at: T0 });
    const result = acknowledgeActivation(started, id, T0 + 10);

    expect(result.outcome).toBe('ok');
    expect(result.session.state).toBe('active');
    expect(isRecording(result.session, T0 + 10)).toBe(true);
  });

  it('acknowledgement from a DIFFERENT session is refused and changes nothing', () => {
    const id = idAt(T0, 'a');
    const started = requestActivation({ id, url: 'https://example.test/', at: T0 });
    const result = acknowledgeActivation(started, idAt(T0, 'b'), T0 + 10);

    expect(result.outcome).toBe('rejected-wrong-session');
    expect(result.session.state, 'a foreign ack must not activate anything').toBe('starting');
    expect(isRecording(result.session, T0 + 10)).toBe(false);
  });

  it('a duplicate acknowledgement is deterministic and does not restart anything', () => {
    const { session, id } = live();
    const again = acknowledgeActivation(session, id, T0 + 5_000);

    expect(again.outcome).toBe('ignored-duplicate');
    expect(again.session.state).toBe('active');
    expect(again.session.startedAt, 'the session must not be restarted').toBe(session.startedAt);
    expect(again.session.id).toEqual(session.id);
  });

  it('an activation that is never acknowledged goes stale rather than waiting forever', () => {
    const id = idAt(T0, 'a');
    const started = requestActivation({ id, url: 'https://example.test/', at: T0 });
    const later = observe(started, T0 + heartbeatTimeoutMs + 1);

    expect(later.state).toBe('stale');
    expect(isRecording(later, T0 + heartbeatTimeoutMs + 1)).toBe(false);
  });

  it('`lifecycleStateOf(null)` is inactive — no session is a first-class state', () => {
    expect(lifecycleStateOf(null, T0)).toBe('inactive');
    expect(isRecording(null, T0)).toBe(false);
  });
});

// ─── 2. Session identity — an old session cannot control the current one ───

describe('WS9 · OLD SESSION CANNOT CONTROL CURRENT SESSION', () => {
  it('mints a distinct id per activation', () => {
    const a = idAt(T0, 'a');
    const b = idAt(T0, 'b');
    const sameMoment = idAt(T0, 'a');

    expect(sameSession(a, b)).toBe(false);
    expect(sameSession(a, sameMoment), 'the same seed is the same session').toBe(true);
    // Identity is not a timestamp: two sessions started in the same millisecond
    // are still different sessions.
    expect(a.value).not.toBe(b.value);
  });

  it('every mutating call refuses the previous session’s id', () => {
    const first = live(T0);
    const second = live(T0 + 60_000);
    const stale = first.id;

    expect(acknowledgeActivation(second.session, stale, T0 + 60_001).outcome).toBe(
      'rejected-wrong-session',
    );
    expect(heartbeat(second.session, stale, T0 + 60_001).outcome).toBe('rejected-wrong-session');
    expect(stopSession(second.session, stale, T0 + 60_001, 'user').outcome).toBe(
      'rejected-wrong-session',
    );
    expect(recordAction(second.session, stale, click('x', T0), T0 + 60_001).outcome).toBe(
      'rejected-wrong-session',
    );
  });

  it('a stale STOP cannot end the current recording', () => {
    // The dangerous direction: a late stop from a dead session silently ending
    // a recording the user is still making.
    const first = live(T0);
    const second = live(T0 + 60_000);

    const result = stopSession(second.session, first.id, T0 + 60_100, 'user');
    expect(result.outcome).toBe('rejected-wrong-session');
    expect(result.session.state).toBe('active');
    expect(isRecording(result.session, T0 + 60_100)).toBe(true);
  });

  it('a stale HEARTBEAT cannot keep a foreign session alive', () => {
    const first = live(T0);
    const second = live(T0 + 60_000);

    // The old session's heartbeat arrives after the new session would go stale.
    const at = T0 + 60_000 + heartbeatTimeoutMs + 1;
    const result = heartbeat(second.session, first.id, at);

    expect(result.outcome).toBe('rejected-wrong-session');
    expect(isRecording(result.session, at), 'the refused beat must not revive it').toBe(false);
  });

  it('a stale ACTION cannot be appended to the current workflow', () => {
    const first = live(T0);
    const second = live(T0 + 60_000);

    const result = recordAction(second.session, first.id, click('ghost', T0), T0 + 60_100);
    expect(result.outcome).toBe('rejected-wrong-session');
    expect(result.session.workflow.steps).toHaveLength(0);
  });
});

// ─── 3. Heartbeat — liveness is derived, never asserted ────────────────────

describe('WS9 · the heartbeat proves liveness, and its absence is fatal', () => {
  it('a beat inside the timeout keeps the session recording', () => {
    const { session, id } = live();
    const result = heartbeat(session, id, T0 + heartbeatMs);

    expect(result.outcome).toBe('ok');
    expect(result.session.lastHeartbeatAt).toBe(T0 + heartbeatMs);
    expect(isRecording(result.session, T0 + heartbeatMs)).toBe(true);
  });

  it('silence past the timeout makes it stale WITHOUT any message arriving', () => {
    // The content script died. Nothing was sent, nothing was called. The only
    // input is the clock — which is exactly the real-world failure.
    const { session } = live();
    const at = T0 + heartbeatTimeoutMs + 1;

    expect(isRecording(session, at), 'a dead recorder must not read as recording').toBe(false);
    expect(observe(session, at).state).toBe('stale');
  });

  it('is still recording at exactly the timeout boundary, and not one ms later', () => {
    const { session } = live();
    expect(isRecording(session, T0 + heartbeatTimeoutMs)).toBe(true);
    expect(isRecording(session, T0 + heartbeatTimeoutMs + 1)).toBe(false);
  });

  it('a late beat cannot resurrect a stale session — staleness is terminal', () => {
    const { session, id } = live();
    const at = T0 + heartbeatTimeoutMs + 1;

    const result = heartbeat(session, id, at);
    expect(result.outcome).toBe('rejected-not-active');
    expect(result.session.state).toBe('stale');
    expect(isRecording(result.session, at)).toBe(false);

    // …and it stays dead even if beats resume.
    const again = heartbeat(result.session, id, at + heartbeatMs);
    expect(again.outcome).toBe('rejected-not-active');
    expect(isRecording(again.session, at + heartbeatMs)).toBe(false);
  });

  it('repeated beats are idempotent in state and only advance the marker', () => {
    const { session, id } = live();
    const once = heartbeat(session, id, T0 + heartbeatMs);
    const twice = heartbeat(once.session, id, T0 + heartbeatMs);

    expect(twice.outcome).toBe('ok');
    expect(twice.session.state).toBe('active');
    expect(twice.session.lastHeartbeatAt).toBe(T0 + heartbeatMs);
  });

  it('a chain of beats keeps a long recording alive across many timeouts', () => {
    let { session, id } = live();
    for (let i = 1; i <= 20; i++) {
      const at = T0 + i * heartbeatMs;
      const result = heartbeat(session, id, at);
      expect(result.outcome).toBe('ok');
      session = result.session;
      expect(isRecording(session, at)).toBe(true);
    }
    expect(isRecording(session, T0 + 20 * heartbeatMs)).toBe(true);
  });

  it('uses the shared constants, holding no timing numbers of its own', async () => {
    // DL-4's drift — the legacy recorder hard-codes 600 ms against the
    // constant's 500 — must not be repeated in the lifecycle either.
    const { readExtFile } = await import('./helpers/surface-source');
    const code = readExtFile('src/recording/session.ts').replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      '',
    );

    expect(code).toMatch(/RECORDING_LIMITS/);
    expect(code, 'no hard-coded timing literals').not.toMatch(/\b\d{3,}\b|\b5_?000\b|\b15_?000\b/);
  });
});

// ─── 4. Fail-closed capture — an action needs a genuinely live session ─────

describe('WS9 · an action is captured only while the session is truly live', () => {
  it('records while active', () => {
    const { session, id } = live();
    const result = recordAction(session, id, click('save', T0), T0);

    expect(result.outcome).toBe('ok');
    expect(result.session.workflow.steps).toHaveLength(1);
  });

  it('refuses while merely STARTING — before the handshake completes', () => {
    const id = idAt(T0, 'a');
    const starting = requestActivation({ id, url: 'https://example.test/', at: T0 });
    const result = recordAction(starting, id, click('save', T0), T0);

    expect(result.outcome).toBe('rejected-not-active');
    expect(result.session.workflow.steps).toHaveLength(0);
  });

  it('refuses once STALE, and marks the session stale in the same call', () => {
    const { session, id } = live();
    const at = T0 + heartbeatTimeoutMs + 1;
    const result = recordAction(session, id, click('ghost', at), at);

    expect(result.outcome).toBe('rejected-not-active');
    expect(result.session.state).toBe('stale');
    expect(result.session.workflow.steps).toHaveLength(0);
  });

  it('refuses after STOP', () => {
    const { session, id } = live();
    const stopped = stopSession(session, id, T0 + 1_000, 'user').session;
    const result = recordAction(stopped, id, click('late', T0 + 2_000), T0 + 2_000);

    expect(result.outcome).toBe('rejected-stopped');
    expect(result.session.workflow.steps).toHaveLength(0);
  });

  it('refuses when there is no session at all', () => {
    const result = recordAction(null, idAt(T0, 'a'), click('x', T0), T0);
    expect(result.outcome).toBe('rejected-not-active');
    expect(result.session).toBeNull();
  });

  it('carries the Slice 1 rules through unchanged — the model still owns them', () => {
    // The lifecycle gates capture; it does not re-implement the workflow rules.
    let { session, id } = live();
    for (let i = 0; i < hardStop; i++) {
      const at = T0 + i * heartbeatMs;
      const beat = heartbeat(session, id, at);
      session = beat.session;
      session = recordAction(session, id, click(`t${i}`, at), at).session;
    }
    expect(session.workflow.steps).toHaveLength(hardStop);
    expect(session.state, 'the hard stop ends the session, not just the workflow').toBe('stopped');
    expect(session.endedReason).toBe('limit');

    const after = recordAction(session, id, click('extra', T0 + 10_000_000), T0 + 10_000_000);
    expect(after.outcome).toBe('rejected-stopped');
    expect(after.session.workflow.steps, 'captured work is preserved').toHaveLength(hardStop);
  });

  it('the warning at 40 does not interrupt the session', () => {
    let { session, id } = live();
    for (let i = 0; i < warnAt; i++) {
      const at = T0 + i * heartbeatMs;
      session = heartbeat(session, id, at).session;
      session = recordAction(session, id, click(`t${i}`, at), at).session;
    }
    const at = T0 + warnAt * heartbeatMs;
    expect(session.workflow.steps).toHaveLength(warnAt);
    expect(session.state).toBe('active');
    expect(isRecording(session, at)).toBe(true);
  });
});

// ─── 5. Stop ───────────────────────────────────────────────────────────────

describe('WS9 · stopping', () => {
  it('ends the session and preserves what was captured', () => {
    const { session, id } = live();
    const withAction = recordAction(session, id, click('save', T0), T0).session;
    const result = stopSession(withAction, id, T0 + 1_000, 'user');

    expect(result.outcome).toBe('ok');
    expect(result.session.state).toBe('stopped');
    expect(result.session.endedReason).toBe('user');
    expect(result.session.workflow.steps).toHaveLength(1);
    expect(result.session.workflow.stopped?.reason).toBe('user');
    expect(isRecording(result.session, T0 + 1_000)).toBe(false);
  });

  it('a duplicate stop is deterministic and does not rewrite the reason', () => {
    const { session, id } = live();
    const first = stopSession(session, id, T0 + 1_000, 'user');
    const second = stopSession(first.session, id, T0 + 2_000, 'stale');

    expect(second.outcome).toBe('ignored-duplicate');
    expect(second.session.endedReason, 'the first stop is the true one').toBe('user');
    expect(second.session.workflow.stopped?.at).toBe(T0 + 1_000);
  });

  it('a stale session can still be stopped, and reports why it ended', () => {
    const { session, id } = live();
    const at = T0 + heartbeatTimeoutMs + 1;
    const observed = observe(session, at);
    expect(observed.state).toBe('stale');

    const result = stopSession(observed, id, at, 'user');
    expect(result.session.state).toBe('stopped');
    expect(result.session.endedReason, 'it died before the user stopped it').toBe('stale');
  });
});

// ─── 6. Structural guards — the state cannot be reached by another route ──

describe('WS9 · the lifecycle is the only way to become active', () => {
  it("`state: 'active'` is assigned in exactly one place", async () => {
    // The trust claim is that acknowledgement is the ONLY transition into
    // recording. Pinning the count keeps a future shortcut from opening a
    // second door — the model equivalent of "no arbitrary message activates it".
    //
    // Measured on CODE, with comments stripped, because the claim is about what
    // the module does. That is stricter than reading the raw file, not looser:
    // a doc comment can no longer satisfy the count NOR trip it.
    const { readExtFile } = await import('./helpers/surface-source');
    const code = stripComments(readExtFile('src/recording/session.ts'));
    expect((code.match(/state:\s*'active'/g) ?? []).length).toBe(1);
  });

  it('every mutating entry point takes the session id it claims to act on', async () => {
    const { readExtFile } = await import('./helpers/surface-source');
    const code = readExtFile('src/recording/session.ts');
    for (const fn of ['acknowledgeActivation', 'heartbeat', 'recordAction', 'stopSession']) {
      const signature = new RegExp(`export function ${fn}\\(([\\s\\S]*?)\\)\\s*:`);
      const match = code.match(signature);
      expect(match, `${fn} must be exported`).not.toBeNull();
      expect(match?.[1], `${fn} must be given the session id to validate`).toMatch(
        /id:\s*RecordingSessionId/,
      );
    }
  });

  it('holds no DOM, no probe, no resolver and no storage', async () => {
    // Comments stripped for the same reason as above: the claim is that the
    // lifecycle TOUCHES none of these, which is a property of the code. Reading
    // the raw file would fail on a doc comment that merely names one, which
    // tests the prose rather than the architecture.
    const { readExtFile } = await import('./helpers/surface-source');
    const code = stripComments(readExtFile('src/recording/session.ts'));
    expect(code).not.toMatch(/document|window|querySelector|LiveDomProbe|resolveStep|resolveChain/);
    expect(code).not.toMatch(/wxt\/browser|storage|chrome\./);
  });

  it('the session is serialisable and carries no DOM reference', async () => {
    const { containsScopeHandle } = await import('@playwright-guru/locator-engine');
    const { session, id } = live();
    const withAction = recordAction(session, id, click('save', T0), T0).session;

    expect(containsScopeHandle(withAction)).toBe(false);
    expect(() => structuredClone(withAction)).not.toThrow();
    expect(JSON.parse(JSON.stringify(withAction)).state).toBe('active');
  });

  it('recording remains gated off — this slice does not make it reachable', async () => {
    const { RECORDING_ENABLED } = await import('../src/config/recording');
    expect(RECORDING_ENABLED, 'the handshake exists; wiring and UI do not').toBe(false);
  });
});
