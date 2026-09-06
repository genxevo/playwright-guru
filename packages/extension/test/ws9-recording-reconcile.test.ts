/**
 * WS9 — SLICE 5C: the durable consumer, and the precedence that keeps it honest.
 * ============================================================================
 * THE OWNER DECISION THIS SUITE ENFORCES:
 *
 *     LIVE CONTENT AUTHORITY  >  DURABLE OBSERVATION  >  UNKNOWN
 *
 * Slice 5B gave a recording a durable owner and deliberately left it with no
 * reader, because reconciling durable evidence against a live answer is a
 * precedence rule that had not been authorised. It is authorised now, and this
 * suite is where it is pinned.
 *
 * ═══ THE ONE INVARIANT EVERYTHING ELSE SERVES ═══
 *
 *     A DURABLE RECORD MAY NEVER RESURRECT A RECORDING THE LIVE RUNTIME
 *     HAS ALREADY DECLARED DEAD.
 *
 * The failure it prevents is concrete. The content runtime says `stale` — it
 * knows, because slice 2 derives staleness from the clock and the recorder
 * stopped beating. Storage still holds the last observation written a moment
 * before, which says `active`. If the panel preferred the stored row, it would
 * show RECORDING for a recorder that is provably gone: the exact lie
 * `RECORDING_ENABLED = false` exists to prevent, arriving through the back door
 * of a feature meant to make the product MORE truthful.
 *
 * So durable evidence is FALLBACK evidence. It is consulted only when the live
 * authority produced no answer at all — and `every live answer beats durable
 * active` below proves that across all five live states rather than asserting
 * it once for the interesting one.
 *
 * ═══ NO NEW STATES, NO NEW CLOCK ═══
 *
 * Reconciliation invents no lifecycle vocabulary: it returns exactly what
 * `observedView` (slice 5A) or `observedLifecycle` (slice 5B) already produce.
 * It reads no clock of its own — `now` is injected — and it touches no DOM, no
 * React, no storage, no messages.
 *
 * Evidence level: UNIT + STRUCTURAL. **Real Chromium: NOT RUN** — no Side Panel
 * was really closed and reopened, no service worker was really restarted, and
 * none of that is claimed.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RECORDING_ENABLED, RECORDING_LIMITS } from '../src/config/recording';
import { observedLifecycle, type RecordingObservation } from '../src/recording/persistence';
import {
  resolveRecordingView,
  type DurableEvidence,
  type LiveEvidence,
} from '../src/recording/reconcile';
import { readDurableObservation } from '../src/services/recording-observation';
import { createStorageGateway, tabKey, STORAGE_SCHEMA_VERSION } from '../src/storage/gateway';
import { RECORDING_OBSERVATION } from '../src/storage/state';
import type { RecordingView } from '../src/recording/lifecycle-view';

import { FakeChangeSource, FakeStorageArea } from './helpers/fake-storage';
import { readComposed, stripComments } from './helpers/surface-source';

const EXT = resolve(__dirname, '..');
const readRaw = (rel: string): string => readFileSync(resolve(EXT, rel), 'utf8');
const code = (rel: string): string => stripComments(readRaw(rel));

const CONTROL = 'entrypoints/sidepanel/RecordingControl.tsx';
const SIDE_PANEL = 'entrypoints/sidepanel/SidePanel.tsx';
const RECONCILE = 'src/recording/reconcile.ts';
const READER = 'src/services/recording-observation.ts';

const TAB = 5;
const OTHER_TAB = 6;
const TIMEOUT = RECORDING_LIMITS.heartbeatTimeoutMs;
const NOW = 100_000;

/** The five states a live content runtime can positively report. */
const LIVE_STATES = ['inactive', 'starting', 'active', 'stale', 'stopped'] as const;

const live = (lifecycle?: (typeof LIVE_STATES)[number]): LiveEvidence =>
  lifecycle ? { ok: true, lifecycle } : { ok: false };

const record = (over: Partial<RecordingObservation> = {}): RecordingObservation => ({
  schemaVersion: 1,
  sessionId: 's1',
  lifecycle: 'active',
  startedAt: NOW - 1_000,
  lastHeartbeatAt: NOW - 1_000,
  ...over,
});

const durable = (value: RecordingObservation | null, valid = true): DurableEvidence => ({
  value,
  valid,
});

/** No durable evidence at all — the shape a caller passes when it did not look. */
const NO_DURABLE: DurableEvidence = { value: null, valid: true };

const envelope = (data: unknown) => ({ v: STORAGE_SCHEMA_VERSION, data });

function build(seed: Record<string, unknown> = {}) {
  const session = new FakeStorageArea(seed);
  const gateway = createStorageGateway({
    local: new FakeStorageArea(),
    session,
    changes: new FakeChangeSource(),
  });
  return { session, gateway };
}

const resolveWith = (
  l: LiveEvidence | null | undefined,
  d: DurableEvidence | null | undefined,
  now = NOW,
): RecordingView => resolveRecordingView({ live: l, durable: d, now });

// ─── AB — the flag has not moved ────────────────────────────────────────────

describe('the product flag is untouched by this slice', () => {
  it('keeps RECORDING_ENABLED false', () => {
    expect(RECORDING_ENABLED).toBe(false);
  });
});

// ═══ A–G — LIVE WINS, always ════════════════════════════════════════════════

describe('A/B/C — a live answer beats durable evidence of any kind', () => {
  it('live active beats durable inactive', () => {
    expect(resolveWith(live('active'), NO_DURABLE)).toBe('active');
  });

  it('live active beats a durable record that has gone stale', () => {
    expect(resolveWith(live('active'), durable(record({ lastHeartbeatAt: 0 })))).toBe('active');
  });

  it('live active beats a durable record that says stopped', () => {
    expect(resolveWith(live('active'), durable(record({ lifecycle: 'stopped' })))).toBe('active');
  });
});

describe('D — THE RESURRECTION TEST: live stale beats durable active', () => {
  it('reports stale, never active', () => {
    // The content runtime knows the recorder stopped beating. Storage still
    // holds the observation written moments before it died. Preferring the row
    // would show RECORDING for a recorder that is provably gone.
    const view = resolveWith(live('stale'), durable(record({ lastHeartbeatAt: NOW })));
    expect(view).toBe('stale');
    expect(view).not.toBe('active');
  });

  it('holds even when the durable record was written this instant', () => {
    expect(resolveWith(live('stale'), durable(record({ lastHeartbeatAt: NOW })), NOW)).toBe(
      'stale',
    );
  });
});

describe('E/F/G — every other live answer also beats durable active', () => {
  it.each(LIVE_STATES)('live %s beats a valid, unexpired durable active', (state) => {
    expect(resolveWith(live(state), durable(record({ lastHeartbeatAt: NOW })))).toBe(state);
  });

  it('never lets durable evidence change a live answer, across every combination', () => {
    // The exhaustive form of the invariant: for all five live states and every
    // durable shape, the answer is the live one. A future edit that reordered
    // the precedence fails here rather than in one hand-picked case.
    const durables: DurableEvidence[] = [
      NO_DURABLE,
      durable(null, false),
      durable(record({ lastHeartbeatAt: NOW })),
      durable(record({ lastHeartbeatAt: 0 })),
      durable(record({ lifecycle: 'starting', lastHeartbeatAt: NOW })),
      durable(record({ lifecycle: 'stopped' })),
      durable(record({ lastHeartbeatAt: NOW }), false),
    ];
    for (const state of LIVE_STATES) {
      for (const d of durables) {
        expect(resolveWith(live(state), d), `live ${state}`).toBe(state);
      }
    }
  });
});

// ═══ H–K — live unavailable: durable becomes fallback evidence ══════════════

describe('what "live unavailable" means, and that it is not "inactive"', () => {
  const UNAVAILABLE: Array<[string, LiveEvidence | null | undefined]> = [
    ['no reply at all', null],
    ['undefined', undefined],
    ['a NO_HANDLER failure from a dead content script', { ok: false }],
    ['an ok reply that carried no lifecycle', { ok: true }],
    ['a failed ack that happens to mention active', { ok: false, lifecycle: 'active' }],
    ['a malformed lifecycle value', { ok: true, lifecycle: 'recording' as never }],
  ];

  it.each(UNAVAILABLE)('%s is absence of evidence, not evidence of absence', (_label, l) => {
    // With no durable evidence either, the honest answer is `unknown` — NOT
    // `inactive`, which would be a claim we cannot support.
    expect(resolveWith(l, NO_DURABLE)).toBe('unknown');
  });

  it.each(UNAVAILABLE)('%s never becomes active on its own', (_label, l) => {
    expect(resolveWith(l, NO_DURABLE)).not.toBe('active');
  });
});

describe('H — live unavailable with a valid, unexpired durable active', () => {
  it('reports active — this is the panel-reopened case the slice exists for', () => {
    expect(resolveWith(live(), durable(record({ lastHeartbeatAt: NOW })))).toBe('active');
  });

  it('reports starting for an unacknowledged durable handshake', () => {
    expect(
      resolveWith(live(), durable(record({ lifecycle: 'starting', lastHeartbeatAt: NOW }))),
    ).toBe('starting');
  });

  it('reports stopped for a durable record that ended', () => {
    expect(resolveWith(live(), durable(record({ lifecycle: 'stopped' })))).toBe('stopped');
  });
});

describe('I/O — live unavailable with an EXPIRED durable record', () => {
  it('reports stale, exactly as observedLifecycle already defines it', () => {
    const expired = record({ lastHeartbeatAt: NOW - TIMEOUT - 1 });
    expect(resolveWith(live(), durable(expired))).toBe('stale');
    // No new vocabulary: reconciliation returns what the 5B projection returns.
    expect(resolveWith(live(), durable(expired))).toBe(observedLifecycle(expired, NOW));
  });

  it('never reports active for an expired record, whatever the record claims', () => {
    for (const lifecycle of ['starting', 'active'] as const) {
      const expired = record({ lifecycle, lastHeartbeatAt: NOW - TIMEOUT - 1 });
      expect(resolveWith(live(), durable(expired))).not.toBe('active');
    }
  });
});

describe('P/Q — the heartbeat boundary, and the ONE timeout constant', () => {
  it('is active at exactly the timeout and stale one millisecond later', () => {
    const at = (age: number) => durable(record({ lastHeartbeatAt: NOW - age }));
    expect(resolveWith(live(), at(TIMEOUT))).toBe('active');
    expect(resolveWith(live(), at(TIMEOUT + 1))).toBe('stale');
  });

  it('declares no timeout of its own', () => {
    const src = code(RECONCILE);
    expect(src).not.toMatch(/\b\d{4,}\b/);
    expect(src).not.toContain('heartbeatTimeoutMs');
    // It defers to the 5B projection rather than re-deriving expiry, so there
    // is exactly one place staleness is decided from a clock.
    expect(src).toContain('observedLifecycle');
  });
});

describe('J/K/L/M/N — durable evidence that proves nothing', () => {
  it('J — a durable record can never say "inactive", so that case is absence', () => {
    // `ObservedLifecycle` excludes `inactive` and the validator rejects it: a
    // record meaning "not recording" is the ABSENCE of a record, not a row.
    expect(resolveWith(live(), NO_DURABLE)).toBe('unknown');
  });

  it('K — no live answer and no durable record is unknown', () => {
    expect(resolveWith(live(), durable(null))).toBe('unknown');
  });

  it('L — a malformed durable record fails closed', () => {
    // The gateway already turns a rejected record into `{value:null, valid:false}`.
    expect(resolveWith(live(), durable(null, false))).toBe('unknown');
  });

  it('L — a value that arrives flagged invalid is refused even if it looks fine', () => {
    // Defence in depth: today the gateway nulls an invalid value, but this
    // reconciliation must not depend on that remaining true.
    expect(resolveWith(live(), durable(record({ lastHeartbeatAt: NOW }), false))).toBe('unknown');
  });

  it('N — a missing durable evidence object at all is unknown', () => {
    expect(resolveWith(live(), null)).toBe('unknown');
    expect(resolveWith(live(), undefined)).toBe('unknown');
  });

  it('nothing about an absent live answer can produce active without a record', () => {
    expect(resolveWith(live(), NO_DURABLE)).not.toBe('active');
    expect(resolveWith(null, null)).toBe('unknown');
  });
});

// ═══ The durable reader, through WS4 and nothing else ═══════════════════════

describe('the durable reader goes through the existing gateway', () => {
  it('reads the observation for the tab it was given', async () => {
    const stored = record({ lastHeartbeatAt: NOW });
    const { gateway } = build({ [tabKey(TAB, RECORDING_OBSERVATION.key)]: envelope(stored) });
    const evidence = await readDurableObservation(gateway, TAB);
    expect(evidence.valid).toBe(true);
    expect(evidence.value).toEqual(stored);
  });

  it('does not read another tab’s recording', async () => {
    const { gateway } = build({
      [tabKey(OTHER_TAB, RECORDING_OBSERVATION.key)]: envelope(record()),
    });
    const evidence = await readDurableObservation(gateway, TAB);
    expect(evidence.value).toBeNull();
  });

  it('fails closed when the panel has no bound tab yet', async () => {
    const { gateway } = build();
    const evidence = await readDurableObservation(gateway, null);
    expect(evidence).toEqual({ value: null, valid: false });
    expect(resolveWith(live(), evidence)).toBe('unknown');
  });

  it('M — refuses an unknown FUTURE storage version rather than interpreting it', async () => {
    const key = tabKey(TAB, RECORDING_OBSERVATION.key);
    const future = { v: STORAGE_SCHEMA_VERSION + 1, data: record({ lastHeartbeatAt: NOW }) };
    const { gateway, session } = build({ [key]: future });
    const evidence = await readDurableObservation(gateway, TAB);
    expect(evidence.valid).toBe(false);
    expect(resolveWith(live(), evidence)).toBe('unknown');
    // And WS4's rule holds: the bytes are left exactly as another build wrote them.
    expect(session.snapshot()[key]).toEqual(future);
  });

  it('L — refuses a malformed record', async () => {
    const { gateway } = build({
      [tabKey(TAB, RECORDING_OBSERVATION.key)]: envelope({ lifecycle: 'active' }),
    });
    const evidence = await readDurableObservation(gateway, TAB);
    expect(evidence.valid).toBe(false);
    expect(resolveWith(live(), evidence)).toBe('unknown');
  });

  it('N — a read failure becomes unknown, never a recording', async () => {
    const { gateway, session } = build();
    session.fail('read');
    const evidence = await readDurableObservation(gateway, TAB);
    expect(evidence.valid).toBe(false);
    expect(resolveWith(live(), evidence)).toBe('unknown');
  });

  it('survives a gateway that throws outright', async () => {
    const exploding = {
      readTab: () => {
        throw new Error('gateway exploded');
      },
    } as never;
    await expect(readDurableObservation(exploding, TAB)).resolves.toEqual({
      value: null,
      valid: false,
    });
  });

  it('R — never reads the workflow descriptor', async () => {
    const reads: string[] = [];
    const spy = {
      readTab: async (descriptor: { key: string }) => {
        reads.push(descriptor.key);
        return { value: null, valid: true };
      },
    } as never;
    await readDurableObservation(spy, TAB);
    expect(reads).toEqual(['recording-observation']);
    expect(reads).not.toContain('recording-workflow');
  });

  it('Z — repeated reads change nothing', async () => {
    const stored = record({ lastHeartbeatAt: NOW });
    const key = tabKey(TAB, RECORDING_OBSERVATION.key);
    const { gateway, session } = build({ [key]: envelope(stored) });
    const before = JSON.stringify(session.snapshot());
    for (let i = 0; i < 20; i += 1) await readDurableObservation(gateway, TAB);
    expect(JSON.stringify(session.snapshot())).toBe(before);
    expect(session.writes).toBe(0);
  });
});

// ═══ The panel, wired ═══════════════════════════════════════════════════════

describe('the panel consults durable evidence ONLY when live gave none', () => {
  it('short-circuits the durable read whenever live answers', () => {
    // Stronger than the pure precedence rule: when the live authority answers,
    // the durable record is not merely out-ranked, it is not even read. The
    // guard reads the observation path in the panel and requires the durable
    // read to sit behind an "is the live view unknown" test.
    const src = code(CONTROL);
    // The CALL, not the import line — searched from the observation function so
    // a re-ordered import cannot satisfy or break this guard.
    const observe = src.indexOf('const observe');
    expect(observe, 'the panel must have one observation function').toBeGreaterThan(-1);
    const at = src.indexOf('readDurableObservation', observe);
    expect(at, 'the panel must read durable evidence').toBeGreaterThan(-1);
    const before = src.slice(observe, at);
    expect(before, 'the durable read must be gated on live being unknown').toMatch(
      /observedView\(ack\)\s*!==\s*'unknown'/,
    );
  });

  it('resolves through the one reconciliation function', () => {
    expect(code(CONTROL)).toContain('resolveRecordingView');
  });

  it('is actually wired: the side panel supplies the tab and the gateway', () => {
    const panel = code(SIDE_PANEL);
    // WS9 DL-91 — the four readers now share ONE memoised binding, so a render
    // that changes nothing they depend on cannot re-arm their effects. The fact
    // this pins is unchanged and now stated more strongly: the side panel
    // supplies THE BOUND TAB and THE GATEWAY, from one identity, to this hook.
    expect(panel).toMatch(
      /const bound = useMemo\([\s\S]{0,200}?tabId: panel\.pick\.tabId[\s\S]{0,80}?gateway: storageGateway[\s\S]{0,80}?\[panel\.pick\.tabId\]/,
    );
    expect(panel).toMatch(/useRecording\(bound\)/);
  });
});

describe('S/T — the panel still owns nothing it must not own', () => {
  it('S — writes no recording state, durable or otherwise', () => {
    const src = code(CONTROL);
    expect(src).not.toContain('writeTab');
    expect(src).not.toContain('writeGlobal');
    expect(src).not.toContain('PERSIST_RECORDING_STATE');
    for (const api of ['chrome.storage', 'localStorage', 'sessionStorage', 'indexedDB']) {
      expect(src, `the panel must not touch ${api}`).not.toContain(api);
    }
    // WS9 V1 raw-line migration (DL-82) — STRENGTHENED from one to zero. The
    // legacy call was retired with the rest of the V1 raw-line path, so the
    // panel now owns no storage write of any kind, not merely no NEW one.
    expect([...src.matchAll(/browser\.storage/g)]).toHaveLength(0);
  });

  it('T — still cannot heartbeat, start or stop the recorder from its timer', () => {
    const src = code(CONTROL);
    const at = src.indexOf('setInterval');
    const effect = src.slice(src.lastIndexOf('useEffect', at), src.indexOf('}, [', at));
    expect(effect).not.toContain('START_RECORDING');
    expect(effect).not.toContain('STOP_RECORDING');
    expect(src).not.toMatch(/\btick\s*\(/);
    const beats = [...src.matchAll(/heartbeat\w*/gi)].map((m) => m[0]);
    expect(beats).toEqual(['heartbeatMs']);
  });

  it('U — never renders or logs the session id', () => {
    const src = code(CONTROL);
    expect(src).not.toMatch(/\{\s*session[A-Za-z]*\s*\}/);
    expect(src).not.toMatch(/aria-label=\{[^}]*session/i);
    expect(src).not.toMatch(/title=\{[^}]*session/i);
    expect(src).not.toMatch(/console\./);
  });

  it('W — START stays non-optimistic: the ack never sets the view', () => {
    const src = code(CONTROL);
    expect(src).not.toMatch(/setView\s*\(\s*['"]active['"]\s*\)/);
    expect(src).not.toMatch(/ack\.ok[\s\S]{0,80}setView/);
    // Every view update comes from the one observation function, and from
    // nothing else — no literal, no acknowledgement, no optimistic guess.
    const sets = [...src.matchAll(/setView\(([^;]*?)\)\s*;/g)].map((m) => (m[1] ?? '').trim());
    expect(sets.length).toBeGreaterThan(0);
    for (const arg of sets) {
      // DL-89 — `observe()` now yields `{ view, confirmed }`; the view must be
      // that value's VIEW projection and nothing else. Deliberately duplicated
      // with `ws9-recording-ui.test.ts`, per DL-79.
      expect(arg, `setView(${arg}) must come from observe()`).toMatch(
        /^(next|await observe\(\))\.view$/,
      );
    }
  });

  it('X/Y — STOP still presents the session id START handed back', () => {
    expect(code(CONTROL)).toMatch(/type:\s*'STOP_RECORDING'[\s\S]{0,120}sessionId/);
  });
});

// ═══ V — nothing about the recording itself crosses into the panel ══════════

describe('V — the consumer is lifecycle-only', () => {
  it('the panel never names a workflow, a step or a renderer', () => {
    const src = code(CONTROL);
    for (const forbidden of [
      'RecordedWorkflow',
      'RecordedStep',
      'RECORDING_WORKFLOW',
      'renderSpecFile',
      'renderAction',
      'GET_RECORDING_WORKFLOW',
    ]) {
      expect(src, `the panel must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('the reader never names the workflow descriptor', () => {
    expect(code(READER)).not.toContain('RECORDING_WORKFLOW');
  });

  it('the acknowledgement the panel reads still carries no recording', () => {
    const src = code('utils/messaging.ts');
    const ack = src.slice(src.indexOf('interface RuntimeMessageAck'));
    const body = ack.slice(0, ack.indexOf('\n}'));
    expect(body).not.toMatch(/workflow/i);
    expect(body).not.toMatch(/steps\s*\??:/);
  });
});

// ═══ Purity, and the absence of a second anything ═══════════════════════════

describe('the reconciliation layer is pure and adds no architecture', () => {
  it('touches no DOM, React, storage, message or clock', () => {
    const src = code(RECONCILE);
    for (const forbidden of [
      'document',
      'window',
      'react',
      'useState',
      'chrome.',
      'browser.',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'readTab',
      'writeTab',
      'sendRuntimeMessage',
      'Date.now',
    ]) {
      expect(src, `reconcile must not touch ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('adds no lifecycle state of its own', () => {
    const src = code(RECONCILE);
    for (const invented of [
      'recordingRecovered',
      'recordingDisconnected',
      'recordingPersisted',
      'recordingResumed',
      'recordingUnknownActive',
      'recovering',
      'orphaned',
      'resumable',
    ]) {
      expect(src, `"${invented}" would be a second lifecycle model`).not.toContain(invented);
    }
  });

  it('reuses slice 5A’s live mapping rather than re-deciding what a reply means', () => {
    expect(code(RECONCILE)).toContain('observedView');
  });

  it('the reader imports no probe, resolver, codegen or renderer', () => {
    const src = code(READER);
    for (const forbidden of [
      'DomProbe',
      'resolveChain',
      'resolveStep',
      'captureSnapshot',
      'generateLocatorCode',
      'renderSpecFile',
      'buildLocatorChain',
    ]) {
      expect(src, `the reader must not reach for ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('introduces no second message listener and no command bus', () => {
    const background = code('entrypoints/background.ts');
    expect([...background.matchAll(/onMessage\.addListener/g)]).toHaveLength(1);
    for (const forbidden of ['CommandBus', 'BroadcastChannel', 'WebSocket', 'EventBus']) {
      expect(background, `no ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('adds no new lifecycle message type', () => {
    const src = code('utils/messaging.ts');
    expect(src).toContain('QUERY_RECORDING_STATE');
    for (const invented of [
      'QUERY_RECORDING_WORKFLOW',
      'GET_RECORDING_WORKFLOW',
      'QUERY_RECORDING_DETAILS',
    ]) {
      expect(src, `no ${invented}`).not.toContain(invented);
    }
  });
});

// ═══ AA — the action count stays deferred ═══════════════════════════════════

describe('AA — the action count remains deferred', () => {
  it('the panel RENDERS no count', () => {
    // Scoped to what is rendered. `recordedActions` still exists in the legacy
    // `copyTestCode` guard clause, preserved out of scope since WS5 — but it
    // must not reach a component, which is where a count would become a claim.
    const src = code(CONTROL);
    expect(src).not.toMatch(/\{count\}\s*action/);
    const components = src.slice(src.indexOf('export function RecordButton'));
    expect(components).not.toContain('recordedActions');
    expect(components).not.toMatch(/count/i);
  });

  it('the composed side panel renders no action count either', () => {
    expect(stripComments(readComposed(SIDE_PANEL))).not.toMatch(/\{count\}\s*action/);
  });
});

// ═══ F20 — no source may stay active forever ════════════════════════════════

describe('F20 — with no heartbeat, every source eventually stops saying active', () => {
  it('durable evidence ages out on the same clock the runtime uses', () => {
    const written = record({ lastHeartbeatAt: 0 });
    const evidence = durable(written);
    expect(resolveRecordingView({ live: live(), durable: evidence, now: TIMEOUT })).toBe('active');
    expect(resolveRecordingView({ live: live(), durable: evidence, now: TIMEOUT + 1 })).toBe(
      'stale',
    );
    for (const now of [TIMEOUT + 1, TIMEOUT * 10, 10 ** 12]) {
      expect(resolveRecordingView({ live: live(), durable: evidence, now })).not.toBe('active');
    }
  });

  it('and a live stale answer settles it regardless of the record', () => {
    const evidence = durable(record({ lastHeartbeatAt: 10 ** 12 }));
    expect(resolveRecordingView({ live: live('stale'), durable: evidence, now: 0 })).toBe('stale');
  });
});
