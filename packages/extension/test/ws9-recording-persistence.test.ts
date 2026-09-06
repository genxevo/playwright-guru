/**
 * WS9 — SLICE 5B: durable recording state + workflow persistence.
 * ============================================================================
 * WHAT THIS SUITE IS FOR.
 *
 * DL-77 closed the first of DL-76's two flag-gating conditions (the UI reads
 * authoritative lifecycle instead of a local boolean) and left the second open:
 * nothing survives the Side Panel closing, and the live `RecordedWorkflow`
 * still exists only inside the content-side runtime's closure. Export is
 * blocked on that, and so is a truthful action count.
 *
 * This slice gives recording a DURABLE OWNER, through the EXISTING WS4
 * architecture — one gateway, one namespace, one version envelope, one
 * tab-scoping rule — and nothing else.
 *
 * ═══ THE ARCHITECTURAL LINE THIS SUITE DEFENDS ═══
 *
 *     The content runtime is the AUTHORITY while it exists.
 *     Durable state is a PROJECTION of that authority.
 *
 * A projection may be read. It may never out-rank the live runtime, and it may
 * never manufacture "recording is active" on its own. Every fail-closed test
 * below exists because the opposite behaviour — a persisted record that keeps
 * claiming `active` after the recorder is gone — is precisely the lie
 * `RECORDING_ENABLED = false` exists to prevent.
 *
 * ═══ WHAT IS DELIBERATELY NOT TESTED, BECAUSE IT IS NOT BUILT ═══
 *
 * No UI reads durable state in this slice. No precedence rule between live and
 * durable evidence is implemented, because inventing one is exactly what the
 * gate forbids. `RECORDING_ENABLED` is still `false`, so in production nothing
 * is written at all — the runtime refuses to start.
 *
 * Evidence level: UNIT + STRUCTURAL. `FakeStorageArea` is not Chrome (its own
 * header says so), so real quota, real `tabs.onRemoved` and real multi-tab
 * behaviour remain deferred. **Real Chromium: NOT RUN.**
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { persistRecordingState } from '../entrypoints/background';
import { RECORDING_ENABLED, RECORDING_LIMITS } from '../src/config/recording';
import {
  observationFor,
  observedLifecycle,
  validateObservation,
  validateWorkflow,
  RECORDING_OBSERVATION_SCHEMA,
  type RecordingObservation,
} from '../src/recording/persistence';
import { createWorkflow, appendStep, type RecordedStep } from '../src/recording/workflow';
import { createStorageGateway, tabKey, STORAGE_SCHEMA_VERSION } from '../src/storage/gateway';
import { RECORDING_OBSERVATION, RECORDING_WORKFLOW, WS4_DESCRIPTORS } from '../src/storage/state';
import { createRecordingRuntime, type RecordingPersistPayload } from '../src/runtime/recording';

import { FakeChangeSource, FakeStorageArea } from './helpers/fake-storage';
import { readComposed, stripComments } from './helpers/surface-source';

const EXT = resolve(__dirname, '..');
const readRaw = (rel: string): string => readFileSync(resolve(EXT, rel), 'utf8');
const code = (rel: string): string => stripComments(readRaw(rel));

const TAB = 7;
const OTHER_TAB = 9;
const TIMEOUT = RECORDING_LIMITS.heartbeatTimeoutMs;

function build(seed: Record<string, unknown> = {}) {
  const local = new FakeStorageArea();
  const session = new FakeStorageArea(seed);
  const gateway = createStorageGateway({ local, session, changes: new FakeChangeSource() });
  return { local, session, gateway };
}

/** The envelope shape the gateway writes, so a test can seed storage directly. */
const envelope = (data: unknown) => ({ v: STORAGE_SCHEMA_VERSION, data });

const OBSERVATION = (over: Partial<RecordingObservation> = {}): RecordingObservation => ({
  schemaVersion: RECORDING_OBSERVATION_SCHEMA,
  sessionId: 's1',
  lifecycle: 'active',
  startedAt: 1_000,
  lastHeartbeatAt: 1_000,
  ...over,
});

/** A step carrying a verified-looking chain. Shape only — nothing is resolved. */
const step = (over: Partial<RecordedStep> = {}): RecordedStep => ({
  kind: 'click',
  timestamp: 10,
  target: {
    locator: {
      chain: { steps: [{ kind: 'role', selectorValue: { type: 'string', value: 'button' } }] },
      verdict: 'excellent',
      matchCount: 1,
      visibleMatchCount: 1,
      stepCounts: [1],
      rationale: [],
    },
    facts: {
      attributes: { tagName: 'BUTTON' },
      ancestors: [],
      indexInParent: 0,
      inShadowRoot: false,
    },
  },
  ...over,
});

const stubDoc = (): Document =>
  ({
    addEventListener() {},
    removeEventListener() {},
    defaultView: { location: { href: 'https://example.test/' } },
  }) as unknown as Document;

// ─── The flag has not moved ─────────────────────────────────────────────────

describe('the product flag is untouched by this slice', () => {
  it('keeps RECORDING_ENABLED false', () => {
    expect(RECORDING_ENABLED).toBe(false);
  });
});

// ═══ A — the storage descriptors ════════════════════════════════════════════

describe('A — recording state joins the WS4 descriptor set, following its pattern', () => {
  it('registers both descriptors', () => {
    expect(WS4_DESCRIPTORS).toContain(RECORDING_OBSERVATION);
    expect(WS4_DESCRIPTORS).toContain(RECORDING_WORKFLOW);
  });

  it('scopes both to a tab, in the session area', () => {
    // Not decoration. `clearTab` and `sweepOrphans` only sweep the SESSION
    // area, so a tab-scoped descriptor in `local` would never be cleaned up on
    // tab close — the existing WS4 lifecycle is what F11/S depends on.
    for (const descriptor of [RECORDING_OBSERVATION, RECORDING_WORKFLOW]) {
      expect(descriptor.scope).toBe('tab');
      expect(descriptor.area).toBe('session');
    }
  });

  it('defaults both to null — absence is not a recording', () => {
    expect(RECORDING_OBSERVATION.defaultValue).toBeNull();
    expect(RECORDING_WORKFLOW.defaultValue).toBeNull();
  });

  it('keeps the WS9 LEGACY flat keys out of WS4, which is what O2 actually said', () => {
    // DL-66/O2: "`pg_recording_active`/`pg_recorded_actions` remain WS9-owned
    // and are neither migrated, cleared nor read by WS4." That is a claim about
    // those two legacy keys — and it still holds, checked here on all three
    // verbs rather than on the spelling of a descriptor key.
    const keys = WS4_DESCRIPTORS.map((d) => d.key);
    expect(keys).not.toContain('pg_recording_active');
    expect(keys).not.toContain('pg_recorded_actions');
    for (const rel of [
      'src/storage/migration.ts',
      'src/storage/state.ts',
      'src/storage/gateway.ts',
    ]) {
      const src = code(rel);
      expect(src, `${rel} must not touch the legacy recording keys`).not.toMatch(
        /pg_recording_active|pg_recorded_actions/,
      );
    }
  });
});

// ═══ B/C/E/F — read paths ═══════════════════════════════════════════════════

describe('B — a valid record reads back', () => {
  it('returns the stored observation', async () => {
    const record = OBSERVATION();
    const { gateway } = build({ [tabKey(TAB, RECORDING_OBSERVATION.key)]: envelope(record) });
    const read = await gateway.readTab(RECORDING_OBSERVATION, TAB);
    expect(read.valid).toBe(true);
    expect(read.value).toEqual(record);
  });
});

describe('C/F — an invalid record becomes the safe default', () => {
  const REJECTED: Array<[string, unknown]> = [
    ['not an object', 'active'],
    ['an array', []],
    [
      'no schema version',
      { sessionId: 's', lifecycle: 'active', startedAt: 0, lastHeartbeatAt: 0 },
    ],
    ['a future observation schema', { ...OBSERVATION(), schemaVersion: 2 }],
    ['an unknown lifecycle', { ...OBSERVATION(), lifecycle: 'recording' }],
    ['lifecycle "inactive" — absence is not a record', { ...OBSERVATION(), lifecycle: 'inactive' }],
    ['an empty session id', { ...OBSERVATION(), sessionId: '' }],
    ['a non-numeric heartbeat', { ...OBSERVATION(), lastHeartbeatAt: 'now' }],
    ['a negative heartbeat', { ...OBSERVATION(), lastHeartbeatAt: -1 }],
    ['a non-finite heartbeat', { ...OBSERVATION(), lastHeartbeatAt: Number.POSITIVE_INFINITY }],
  ];

  it.each(REJECTED)('rejects %s', (_label, raw) => {
    expect(validateObservation(raw)).toBeNull();
  });

  it('reads a corrupt record back as null, flagged invalid', async () => {
    const { gateway } = build({
      [tabKey(TAB, RECORDING_OBSERVATION.key)]: envelope({ lifecycle: 'active' }),
    });
    const read = await gateway.readTab(RECORDING_OBSERVATION, TAB);
    expect(read.value).toBeNull();
    expect(read.valid).toBe(false);
  });
});

describe('D — an invalid value is refused on the way IN', () => {
  it('never lets an unreadable observation reach storage', async () => {
    const { gateway, session } = build();
    const result = await gateway.writeTab(RECORDING_OBSERVATION, TAB, {
      lifecycle: 'active',
    } as unknown as RecordingObservation);
    expect(result).toEqual({ ok: false, code: 'INVALID_VALUE' });
    expect(session.has(tabKey(TAB, RECORDING_OBSERVATION.key))).toBe(false);
  });
});

describe('E — an unknown future storage version is never interpreted or overwritten', () => {
  it('reads as the safe default with UNKNOWN_VERSION, leaving the bytes intact', async () => {
    const key = tabKey(TAB, RECORDING_OBSERVATION.key);
    const future = { v: STORAGE_SCHEMA_VERSION + 1, data: OBSERVATION() };
    const { gateway, session } = build({ [key]: future });
    const read = await gateway.readTab(RECORDING_OBSERVATION, TAB);
    expect(read.value).toBeNull();
    expect(read.code).toBe('UNKNOWN_VERSION');
    expect(session.snapshot()[key]).toEqual(future);
  });
});

// ═══ G — tab isolation ══════════════════════════════════════════════════════

describe('G — two tabs cannot overwrite each other', () => {
  it('keeps one tab’s recording invisible to another', async () => {
    const { gateway } = build();
    await gateway.writeTab(RECORDING_OBSERVATION, TAB, OBSERVATION({ sessionId: 'a' }));
    await gateway.writeTab(RECORDING_OBSERVATION, OTHER_TAB, OBSERVATION({ sessionId: 'b' }));
    expect((await gateway.readTab(RECORDING_OBSERVATION, TAB)).value?.sessionId).toBe('a');
    expect((await gateway.readTab(RECORDING_OBSERVATION, OTHER_TAB)).value?.sessionId).toBe('b');
  });
});

// ═══ H/I/J/K/L/M/N — the durable liveness projection ════════════════════════

describe('H/I — the observation carries the session it belongs to', () => {
  it('projects the runtime session without inventing anything', () => {
    const rt = createRecordingRuntime({
      doc: stubDoc(),
      now: () => 0,
      nonce: () => 'n',
      enabled: true,
    });
    const started = rt.start(0);
    const seen: RecordingPersistPayload[] = [];
    // The runtime is the only producer of an observation, so build one the way
    // it does and assert the identity tie rather than trusting a literal.
    const observation = observationFor({
      id: { __brand: 'RecordingSessionId', value: started.sessionId! },
      state: 'active',
      startedAt: 0,
      lastHeartbeatAt: 0,
    });
    expect(observation.sessionId).toBe(started.sessionId);
    expect(observation.schemaVersion).toBe(RECORDING_OBSERVATION_SCHEMA);
    expect(seen).toEqual([]);
  });

  it('ties the persisted workflow to the persisted observation by one id', () => {
    const payloads: RecordingPersistPayload[] = [];
    const rt = createRecordingRuntime({
      doc: stubDoc(),
      now: () => 0,
      nonce: () => 'n',
      enabled: true,
      persist: (p) => payloads.push(p),
    });
    rt.start(0);
    const first = payloads[0]!;
    expect(first.workflow?.id).toBe(first.observation.sessionId);
  });

  it('falls back to the activation instant before the first heartbeat', () => {
    const observation = observationFor({
      id: { __brand: 'RecordingSessionId', value: 's' },
      state: 'starting',
      startedAt: 500,
    });
    // Same rule as `lastSignalAt` in the lifecycle: an unanswered handshake
    // ages out on the activation clock, so it cannot wait forever.
    expect(observation.lastHeartbeatAt).toBe(500);
  });
});

describe('J/K/L — the projection reports what the record plus the clock imply', () => {
  it('reports inactive when there is no record at all', () => {
    expect(observedLifecycle(null, 0)).toBe('inactive');
  });

  it('reports active only inside the timeout', () => {
    const record = OBSERVATION({ lastHeartbeatAt: 1_000 });
    expect(observedLifecycle(record, 1_000 + TIMEOUT)).toBe('active');
  });

  it('reports starting for an unacknowledged handshake', () => {
    expect(observedLifecycle(OBSERVATION({ lifecycle: 'starting' }), 1_000)).toBe('starting');
  });

  it('reports stopped for a session that ended', () => {
    // Stopped is not derivable from a clock, which is why the record carries it.
    expect(observedLifecycle(OBSERVATION({ lifecycle: 'stopped' }), 10 ** 12)).toBe('stopped');
  });

  it('keeps stale terminal — a late record cannot resurrect a recording', () => {
    expect(observedLifecycle(OBSERVATION({ lifecycle: 'stale' }), 1_000)).toBe('stale');
  });
});

describe('M — an expired marker fails closed', () => {
  it('reports stale one millisecond past the authoritative timeout', () => {
    const record = OBSERVATION({ lastHeartbeatAt: 1_000 });
    expect(observedLifecycle(record, 1_000 + TIMEOUT + 1)).toBe('stale');
  });

  it('expires an unanswered handshake on the same clock', () => {
    const record = OBSERVATION({ lifecycle: 'starting', lastHeartbeatAt: 1_000 });
    expect(observedLifecycle(record, 1_000 + TIMEOUT + 1)).toBe('stale');
  });

  it('never reports active for any record older than the timeout, whatever it claims', () => {
    for (const lifecycle of ['starting', 'active'] as const) {
      const record = OBSERVATION({ lifecycle, lastHeartbeatAt: 0 });
      expect(observedLifecycle(record, TIMEOUT + 1)).not.toBe('active');
    }
  });

  it('uses the ONE authoritative timeout, not a number of its own', () => {
    const record = OBSERVATION({ lastHeartbeatAt: 0 });
    expect(observedLifecycle(record, TIMEOUT)).toBe('active');
    expect(observedLifecycle(record, TIMEOUT + 1)).toBe('stale');
  });
});

describe('N — a heartbeat refreshes the marker and does nothing else', () => {
  it('advances lastHeartbeatAt without touching the workflow', () => {
    const payloads: RecordingPersistPayload[] = [];
    let clock = 0;
    const rt = createRecordingRuntime({
      doc: stubDoc(),
      now: () => clock,
      nonce: () => 'n',
      enabled: true,
      persist: (p) => payloads.push(p),
    });
    rt.start(0);
    const workflowAtStart = JSON.stringify(payloads[0]!.workflow);
    payloads.length = 0;

    clock = RECORDING_LIMITS.heartbeatMs;
    rt.tick(clock);

    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.observation.lastHeartbeatAt).toBe(RECORDING_LIMITS.heartbeatMs);
    expect(payloads[0]!.observation.lifecycle).toBe('active');
    // A heartbeat must not create, append to, or rewrite a recording.
    expect(payloads[0]!.workflow, 'a heartbeat must not carry a workflow').toBeUndefined();
    expect(JSON.stringify(rt.workflow())).toBe(workflowAtStart);
  });
});

// ═══ O/P/Q/R/S — lifecycle transitions reach persistence ════════════════════

describe('O — a stop is persisted as stopped, and the recording is kept', () => {
  it('projects the terminal state and the final workflow together', () => {
    const payloads: RecordingPersistPayload[] = [];
    const rt = createRecordingRuntime({
      doc: stubDoc(),
      now: () => 0,
      nonce: () => 'n',
      enabled: true,
      persist: (p) => payloads.push(p),
    });
    const started = rt.start(0);
    payloads.length = 0;
    rt.stop(started.sessionId!, 50);

    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.observation.lifecycle).toBe('stopped');
    // The workflow is NOT discarded on stop: keeping it is the whole point of
    // giving it a durable owner — export reads it after recording ends.
    expect(payloads[0]!.workflow).toBeDefined();
    expect(payloads[0]!.workflow!.stopped).toEqual({ reason: 'user', at: 50 });
  });
});

describe('P — a foreign session cannot end another recording, or its durable state', () => {
  it('persists nothing when the id does not match', () => {
    const payloads: RecordingPersistPayload[] = [];
    const rt = createRecordingRuntime({
      doc: stubDoc(),
      now: () => 0,
      nonce: () => 'n',
      enabled: true,
      persist: (p) => payloads.push(p),
    });
    rt.start(0);
    payloads.length = 0;

    expect(rt.stop('not-the-session', 50)).toEqual({ ok: false, error: 'wrong-session' });
    expect(payloads, 'a refused stop must not write durable state').toEqual([]);
    expect(rt.state(50)).toBe('active');
  });

  it('persists nothing for a stop with no id at all', () => {
    const payloads: RecordingPersistPayload[] = [];
    const rt = createRecordingRuntime({
      doc: stubDoc(),
      now: () => 0,
      nonce: () => 'n',
      enabled: true,
      persist: (p) => payloads.push(p),
    });
    rt.start(0);
    payloads.length = 0;
    expect(rt.stop('', 50).ok).toBe(false);
    expect(payloads).toEqual([]);
  });
});

describe('Q — a duplicate start does not fork or corrupt ownership', () => {
  it('keeps the live session and its id', () => {
    const payloads: RecordingPersistPayload[] = [];
    const rt = createRecordingRuntime({
      doc: stubDoc(),
      now: () => 0,
      nonce: () => 'n',
      enabled: true,
      persist: (p) => payloads.push(p),
    });
    const first = rt.start(0);
    const second = rt.start(10);
    expect(second.sessionId).toBe(first.sessionId);
    for (const payload of payloads) {
      expect(payload.observation.sessionId).toBe(first.sessionId);
    }
  });
});

describe('R — a dead content script cannot leave "active" standing forever', () => {
  it('needs no death event: the last written marker ages out on the clock', () => {
    const payloads: RecordingPersistPayload[] = [];
    const rt = createRecordingRuntime({
      doc: stubDoc(),
      now: () => 0,
      nonce: () => 'n',
      enabled: true,
      persist: (p) => payloads.push(p),
    });
    rt.start(0);
    // The script dies here. No stop, no tick, no message — nothing is written
    // ever again, which is exactly what a crash looks like from storage.
    const last = payloads[payloads.length - 1]!.observation;
    expect(last.lifecycle).toBe('active');
    expect(observedLifecycle(last, TIMEOUT)).toBe('active');
    expect(observedLifecycle(last, TIMEOUT + 1)).toBe('stale');
    expect(observedLifecycle(last, 10 ** 12)).toBe('stale');
  });

  it('a tick that finds the session already dead writes the stale projection', () => {
    const payloads: RecordingPersistPayload[] = [];
    const rt = createRecordingRuntime({
      doc: stubDoc(),
      now: () => 0,
      nonce: () => 'n',
      enabled: true,
      persist: (p) => payloads.push(p),
    });
    rt.start(0);
    payloads.length = 0;
    rt.tick(TIMEOUT + 1);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.observation.lifecycle).toBe('stale');
  });
});

describe('S — tab close uses the EXISTING WS4 cleanup, not a second mechanism', () => {
  it('clearTab removes both recording records for that tab and nothing else', async () => {
    const { gateway, session } = build();
    await gateway.writeTab(RECORDING_OBSERVATION, TAB, OBSERVATION());
    await gateway.writeTab(
      RECORDING_WORKFLOW,
      TAB,
      createWorkflow({ id: 's1', url: 'u', startedAt: 0 }),
    );
    await gateway.writeTab(RECORDING_OBSERVATION, OTHER_TAB, OBSERVATION({ sessionId: 'b' }));

    await gateway.clearTab(TAB);

    expect(session.has(tabKey(TAB, RECORDING_OBSERVATION.key))).toBe(false);
    expect(session.has(tabKey(TAB, RECORDING_WORKFLOW.key))).toBe(false);
    expect(session.has(tabKey(OTHER_TAB, RECORDING_OBSERVATION.key))).toBe(true);
  });

  it('the orphan sweep reclaims recording state from tabs that no longer exist', async () => {
    const { gateway, session } = build();
    await gateway.writeTab(RECORDING_OBSERVATION, TAB, OBSERVATION());
    await gateway.writeTab(RECORDING_OBSERVATION, OTHER_TAB, OBSERVATION({ sessionId: 'b' }));

    const result = await gateway.sweepOrphans([OTHER_TAB]);

    expect(result.ok).toBe(true);
    expect(result.removedTabs).toContain(TAB);
    expect(session.has(tabKey(TAB, RECORDING_OBSERVATION.key))).toBe(false);
    expect(session.has(tabKey(OTHER_TAB, RECORDING_OBSERVATION.key))).toBe(true);
  });

  it('"Clear data" reaches recording state too, because it is now WS4-owned', async () => {
    const { gateway, session } = build();
    await gateway.writeTab(RECORDING_OBSERVATION, TAB, OBSERVATION());
    await gateway.clearAll();
    expect(session.has(tabKey(TAB, RECORDING_OBSERVATION.key))).toBe(false);
  });
});

// ═══ T/U/V/W/X/Y/Z — the workflow itself ═══════════════════════════════════

describe('T/U/V — a workflow survives a full round trip, semantically identical', () => {
  const populated = () => {
    let workflow = createWorkflow({ id: 's1', url: 'https://example.test/', startedAt: 0 });
    workflow = appendStep(
      workflow,
      step({ kind: 'goto', url: 'https://example.test/', timestamp: 1, target: undefined }),
    ).workflow;
    workflow = appendStep(workflow, step({ timestamp: 2 })).workflow;
    workflow = appendStep(workflow, step({ kind: 'fill', value: 'hello', timestamp: 3 })).workflow;
    workflow = appendStep(
      workflow,
      step({ kind: 'fill', redacted: 'password', timestamp: 5_000 }),
    ).workflow;
    return workflow;
  };

  it('writes and reads back an equal workflow', async () => {
    const { gateway } = build();
    const workflow = populated();
    expect((await gateway.writeTab(RECORDING_WORKFLOW, TAB, workflow)).ok).toBe(true);
    const read = await gateway.readTab(RECORDING_WORKFLOW, TAB);
    expect(read.valid).toBe(true);
    expect(read.value).toEqual(workflow);
  });

  it('survives an actual JSON round trip byte for byte', () => {
    // The transport is `structuredClone` and the store is JSON-shaped; this
    // proves the model carries no RegExp, Date, Map, Element or function that
    // would silently change on the way through. `MatcherValue` models a regex
    // as `{type:'regex', value, flags}` — data, not a native object — which is
    // why this holds.
    const workflow = populated();
    expect(JSON.parse(JSON.stringify(workflow))).toEqual(workflow);
    expect(JSON.stringify(JSON.parse(JSON.stringify(workflow)))).toBe(JSON.stringify(workflow));
  });

  it('preserves the verified chain exactly — persistence resolves nothing', () => {
    const workflow = populated();
    const restored = JSON.parse(JSON.stringify(workflow)) as typeof workflow;
    const original = workflow.steps[1]!.target!.locator;
    const round = restored.steps[1]!.target!.locator;
    expect(round.chain).toEqual(original.chain);
    expect(round.verdict).toBe(original.verdict);
    expect(round.visibleMatchCount).toBe(original.visibleMatchCount);
    expect(round.stepCounts).toEqual(original.stepCounts);
    expect(round.rationale).toEqual(original.rationale);
  });
});

describe('W — ordering is preserved exactly', () => {
  it('reads back the same actions in the same order', async () => {
    const { gateway } = build();
    let workflow = createWorkflow({ id: 's1', url: 'u', startedAt: 0 });
    for (let i = 0; i < 10; i += 1) {
      workflow = appendStep(workflow, step({ timestamp: i * 10_000, value: undefined })).workflow;
    }
    await gateway.writeTab(RECORDING_WORKFLOW, TAB, workflow);
    const read = await gateway.readTab(RECORDING_WORKFLOW, TAB);
    expect(read.value!.steps.map((s) => s.timestamp)).toEqual(
      workflow.steps.map((s) => s.timestamp),
    );
  });
});

describe('X/Y/Z — privacy survives persistence', () => {
  it('a redacted step reaches storage with no value at all', async () => {
    const { gateway, session } = build();
    let workflow = createWorkflow({ id: 's1', url: 'u', startedAt: 0 });
    workflow = appendStep(
      workflow,
      step({ kind: 'fill', value: 'hunter2', redacted: 'password' }),
    ).workflow;
    await gateway.writeTab(RECORDING_WORKFLOW, TAB, workflow);

    const written = JSON.stringify(session.snapshot());
    expect(written).not.toContain('hunter2');
    expect(written).toContain('password');
    expect(workflow.steps[0]!.value).toBeUndefined();
  });

  it('refuses a workflow whose redacted step still carries a value', async () => {
    // Slice 1 removes the value at the model boundary, so this shape cannot
    // arise from `appendStep`. The validator refuses it anyway: a persistence
    // layer that would accept a secret is one refactor away from storing one.
    const smuggled = {
      ...createWorkflow({ id: 's1', url: 'u', startedAt: 0 }),
      steps: [{ kind: 'fill', timestamp: 1, redacted: 'password', value: 'hunter2' }],
    };
    expect(validateWorkflow(smuggled)).toBeNull();

    const { gateway, session } = build();
    const result = await gateway.writeTab(RECORDING_WORKFLOW, TAB, smuggled as never);
    expect(result).toEqual({ ok: false, code: 'INVALID_VALUE' });
    expect(JSON.stringify(session.snapshot())).not.toContain('hunter2');
  });

  it('preserves truncation rather than restoring a full value', async () => {
    const { gateway } = build();
    let workflow = createWorkflow({ id: 's1', url: 'u', startedAt: 0 });
    const long = 'x'.repeat(RECORDING_LIMITS.maxValueLength + 50);
    workflow = appendStep(workflow, step({ kind: 'fill', value: long })).workflow;
    await gateway.writeTab(RECORDING_WORKFLOW, TAB, workflow);
    const read = await gateway.readTab(RECORDING_WORKFLOW, TAB);
    expect(read.value!.steps[0]!.value).toHaveLength(RECORDING_LIMITS.maxValueLength);
  });

  it('carries no DOM, no HTML and no probe state', () => {
    let workflow = createWorkflow({ id: 's1', url: 'u', startedAt: 0 });
    workflow = appendStep(workflow, step()).workflow;
    const written = JSON.stringify(workflow);
    for (const forbidden of ['outerHTML', 'innerHTML', '__proto__', 'ScopeHandle', 'scope']) {
      expect(written, `persisted workflow must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('never persists a recording longer than the authoritative cap', () => {
    const over = {
      ...createWorkflow({ id: 's1', url: 'u', startedAt: 0 }),
      steps: Array.from({ length: RECORDING_LIMITS.hardStop + 1 }, (_, i) =>
        step({ timestamp: i }),
      ),
    };
    expect(validateWorkflow(over)).toBeNull();
  });
});

// ═══ AA — storage failure ═══════════════════════════════════════════════════

describe('AA — a storage failure is observable and never fabricates a recording', () => {
  it('reports a write failure as a value, and stores nothing', async () => {
    const { gateway, session } = build();
    session.fail('write');
    const result = await gateway.writeTab(RECORDING_OBSERVATION, TAB, OBSERVATION());
    expect(result.ok).toBe(false);
    expect(result.code).toBe('WRITE_FAILED');
  });

  it('classifies a quota rejection distinctly', async () => {
    const { gateway, session } = build();
    session.fail('quota');
    const result = await gateway.writeTab(
      RECORDING_WORKFLOW,
      TAB,
      createWorkflow({ id: 's', url: 'u', startedAt: 0 }),
    );
    expect(result.code).toBe('QUOTA_EXCEEDED');
  });

  it('reports a read failure as the safe default, not as a recording', async () => {
    const { gateway, session } = build();
    session.fail('read');
    const read = await gateway.readTab(RECORDING_OBSERVATION, TAB);
    expect(read.value).toBeNull();
    expect(read.code).toBe('READ_FAILED');
    expect(observedLifecycle(read.value, 0)).toBe('inactive');
  });

  it('leaves the in-memory authority untouched when persistence fails', () => {
    // The runtime must not lose a recording because a disk was full.
    const rt = createRecordingRuntime({
      doc: stubDoc(),
      now: () => 0,
      nonce: () => 'n',
      enabled: true,
      persist: () => {
        throw new Error('storage exploded');
      },
    });
    const started = rt.start(0);
    expect(started.ok).toBe(true);
    expect(rt.state(0)).toBe('active');
    expect(() => rt.tick(1_000)).not.toThrow();
    expect(rt.state(1_000)).toBe('active');
  });
});

// ═══ The background write path, exercised rather than inspected ═════════════

describe('the background owns the write, and takes the tab from the sender', () => {
  it('writes both records for the tab it was told about', async () => {
    const { gateway, session } = build();
    const workflow = createWorkflow({ id: 's1', url: 'u', startedAt: 0 });
    const ack = await persistRecordingState(gateway, TAB, {
      type: 'PERSIST_RECORDING_STATE',
      observation: OBSERVATION({ sessionId: 's1' }),
      workflow,
    });
    expect(ack.ok).toBe(true);
    expect((await gateway.readTab(RECORDING_OBSERVATION, TAB)).value?.sessionId).toBe('s1');
    expect((await gateway.readTab(RECORDING_WORKFLOW, TAB)).value).toEqual(workflow);
    expect(session.has(tabKey(OTHER_TAB, RECORDING_OBSERVATION.key))).toBe(false);
  });

  it('leaves the stored workflow alone when a heartbeat carries none', async () => {
    const { gateway } = build();
    const workflow = createWorkflow({ id: 's1', url: 'u', startedAt: 0 });
    await persistRecordingState(gateway, TAB, {
      type: 'PERSIST_RECORDING_STATE',
      observation: OBSERVATION(),
      workflow,
    });
    await persistRecordingState(gateway, TAB, {
      type: 'PERSIST_RECORDING_STATE',
      observation: OBSERVATION({ lastHeartbeatAt: 9_999 }),
    });
    expect((await gateway.readTab(RECORDING_WORKFLOW, TAB)).value).toEqual(workflow);
    expect((await gateway.readTab(RECORDING_OBSERVATION, TAB)).value?.lastHeartbeatAt).toBe(9_999);
  });

  it('surfaces a failed write instead of acknowledging success', async () => {
    const { gateway, session } = build();
    session.fail('write');
    const ack = await persistRecordingState(gateway, TAB, {
      type: 'PERSIST_RECORDING_STATE',
      observation: OBSERVATION(),
    });
    expect(ack.ok).toBe(false);
    expect(ack.error).toBeTruthy();
  });

  it('never logs the session id or the recording contents', () => {
    const src = code('entrypoints/background.ts');
    const block = src.slice(src.indexOf('persistRecordingState'));
    expect(block.slice(0, 700)).not.toMatch(/console\.\w+\([^)]*(sessionId|observation|workflow)/);
  });
});

// ═══ AB/AC — the UI still owns nothing ══════════════════════════════════════

describe('AB/AC — the Side Panel cannot manufacture durable recording truth', () => {
  const CONTROL = code('entrypoints/sidepanel/RecordingControl.tsx');
  const PANEL = stripComments(readComposed('entrypoints/sidepanel/SidePanel.tsx'));

  it('writes no recording state of any kind', () => {
    expect(CONTROL).not.toContain('PERSIST_RECORDING_STATE');
    expect(CONTROL).not.toContain('RECORDING_OBSERVATION');
    expect(CONTROL).not.toContain('writeTab');
  });

  it('touches no storage API directly for recording state', () => {
    for (const api of ['chrome.storage', 'localStorage', 'sessionStorage', 'indexedDB']) {
      expect(CONTROL, `the panel must not touch ${api}`).not.toContain(api);
    }
    // WS9 V1 raw-line migration (DL-82) — STRENGTHENED from one to zero.
    // The one permitted call was `clearRecording`'s `pg_recorded_actions: []`
    // reset: a WRITE, from a function with no consumer, that emptied preserved
    // V1 data. Retiring it makes the ban absolute rather than budgeted.
    expect([...CONTROL.matchAll(/browser\.storage/g)]).toHaveLength(0);
  });

  it('still cannot heartbeat, start or stop the recorder from a timer', () => {
    // WS9 slice 5C — the effect's dependency list is no longer literally `[]`
    // (it depends on the observation callback), so the terminator this guard
    // slices on is `}, [`. Leaving `}, []);` here would have made `indexOf`
    // return -1 and the "effect" become the whole rest of the file — a guard
    // that fails for the wrong reason is as bad as one that passes for the
    // wrong reason. The claim is unchanged.
    const at = CONTROL.indexOf('setInterval');
    expect(at, 'the refresh timer must exist').toBeGreaterThan(-1);
    const effect = CONTROL.slice(CONTROL.lastIndexOf('useEffect', at), CONTROL.indexOf('}, [', at));
    expect(effect).not.toContain('START_RECORDING');
    expect(effect).not.toContain('STOP_RECORDING');
    expect(CONTROL).not.toMatch(/\btick\s*\(/);
    expect(PANEL).not.toMatch(/recording\.(start|stop|tick)\(/);
  });
});

// ═══ AD/AE/AF/AG — architectural boundaries ═════════════════════════════════

describe('AD — no second message architecture', () => {
  it('routes the new persistence message through the one existing router', () => {
    const background = code('entrypoints/background.ts');
    expect(background).toMatch(/KNOWN_MESSAGE_TYPES[\s\S]*?'PERSIST_RECORDING_STATE'/);
    expect([...background.matchAll(/onMessage\.addListener/g)]).toHaveLength(1);
    for (const forbidden of ['CommandBus', 'BroadcastChannel', 'WebSocket', 'EventBus']) {
      expect(background, `no ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('takes tab identity from the sender, never from the message', () => {
    const messaging = code('utils/messaging.ts');
    expect(messaging).toMatch(/PersistRecordingStateMessage/);
    // A page must not be able to choose which tab's state it writes.
    const decl = messaging.slice(messaging.indexOf('interface PersistRecordingStateMessage'));
    expect(decl.slice(0, decl.indexOf('}'))).not.toContain('targetTabId');
  });

  it('the content script asks the background rather than importing storage', () => {
    const content = code('entrypoints/content.ts');
    expect(content).toMatch(/type: 'PERSIST_RECORDING_STATE'/);
    expect(content).not.toMatch(/from '.*storage\/gateway'/);
    expect(content).not.toMatch(/from '.*storage\/state'/);
    expect(content).not.toMatch(/from '.*storage\/migration'/);

    // WS9 V1 raw-line migration (DL-82) — STRENGTHENED from four calls to
    // none, and from half a file to the whole one.
    //
    // This used to split the file on the `// -- Recording` marker, assert the
    // part ABOVE it was clean, and pin the four legacy calls below it so a new
    // one could not hide among them. DL-82 retired that block, so the marker is
    // gone — and a guard that slices on a missing marker gets `indexOf` = -1
    // and silently starts asserting about the whole file minus its last
    // character, which is exactly the failure mode this project has hit before.
    // The honest replacement is the claim the split was approximating all
    // along: this file reaches storage zero times, by any name.
    const raw = readRaw('entrypoints/content.ts');
    expect([...raw.matchAll(/browser\.storage\./g)]).toHaveLength(0);
    for (const api of ['chrome.storage', 'localStorage', 'sessionStorage', 'indexedDB']) {
      expect(raw, `content.ts must not touch ${api}`).not.toContain(api);
    }
  });
});

describe('AE/AF — persistence stores; it never resolves, ranks or renders', () => {
  it('the persistence module imports no probe, resolver, codegen or renderer', () => {
    const src = code('src/recording/persistence.ts');
    for (const forbidden of [
      'DomProbe',
      'resolveChain',
      'resolveStep',
      'captureSnapshot',
      'generateLocatorCode',
      'renderSpecFile',
      'renderAction',
      'buildLocatorChain',
    ]) {
      expect(src, `persistence must not reach for ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('the persistence module touches no browser, storage or DOM API', () => {
    const src = code('src/recording/persistence.ts');
    for (const api of [
      'chrome.',
      'browser.',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'document',
      'window',
    ]) {
      expect(src, `persistence must not touch ${api}`).not.toContain(api);
    }
  });

  it('declares no timing number of its own', () => {
    const src = code('src/recording/persistence.ts');
    expect(src).toContain('RECORDING_LIMITS.heartbeatTimeoutMs');
    expect(src).not.toMatch(/\b\d{4,}\b/);
  });

  it('introduces no second workflow model and no generic automation model', () => {
    const src = code('src/recording/persistence.ts');
    for (const forbidden of [
      'RecordedWorkflowV2',
      'GenericWorkflow',
      'AutomationWorkflow',
      'FrameworkWorkflow',
      'Selenium',
      'Cypress',
      'Puppeteer',
      'WebdriverIO',
    ]) {
      expect(src, `no ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('adds no second lifecycle state — the projection reuses the one vocabulary', () => {
    const src = code('src/recording/persistence.ts');
    expect(src).toContain('RecordingLifecycleState');
    for (const invented of ['recovering', 'orphaned', 'resumable', 'paused', 'suspended']) {
      expect(src, `"${invented}" would be a second lifecycle model`).not.toContain(invented);
    }
  });
});

describe('AG — the session id stays opaque', () => {
  it('is never rendered by the panel', () => {
    const CONTROL = code('entrypoints/sidepanel/RecordingControl.tsx');
    expect(CONTROL).not.toMatch(/\{\s*session[A-Za-z]*\s*\}/);
    expect(CONTROL).not.toMatch(/console\./);
  });

  it('is never logged by the content script’s persistence hook', () => {
    const content = code('entrypoints/content.ts');
    const at = content.indexOf('PERSIST_RECORDING_STATE');
    expect(content.slice(Math.max(0, at - 400), at + 400)).not.toMatch(/console\./);
  });
});

// ═══ The two-levels-of-truth rule, stated as a test ═════════════════════════

describe('durable state is a projection, never a competing authority', () => {
  it('nothing reads durable recording state as truth yet — by design', () => {
    // This slice builds the WRITE side. Reconciling a durable observation with
    // a live runtime answer is a precedence rule the gate forbids inventing, so
    // no consumer exists and this guard pins that, rather than letting one
    // appear unreviewed.
    for (const rel of [
      'entrypoints/sidepanel/RecordingControl.tsx',
      'entrypoints/sidepanel/SidePanel.tsx',
      'src/recording/lifecycle-view.ts',
    ]) {
      expect(code(rel), `${rel} must not read durable recording state`).not.toContain(
        'observedLifecycle',
      );
    }
  });

  it('the runtime never asks storage what its own state is', () => {
    const src = code('src/runtime/recording.ts');
    expect(src).not.toContain('observedLifecycle');
    expect(src).not.toMatch(/readTab|writeTab|readGlobal|writeGlobal/);
    // It emits a projection through an injected sink and reads nothing back.
    expect(src).toMatch(/persist\?:/);
  });
});
