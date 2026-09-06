// @vitest-environment happy-dom
/**
 * WS9 — THE PANEL'S READERS ARE DRIVEN BY EVIDENCE, NOT BY RENDERS.
 * ============================================================================
 * WHY THIS FILE EXISTS, AND WHAT IT MEASURES.
 *
 * The real-Chromium A4 closure measured a Side Panel that issued 5,205 runtime
 * queries, 10,408 durable observation reads and 15,612 workflow reads in 24.9
 * seconds — against a documented beat of ONE read per 5,000 ms. The counters
 * came back in the ratio 1 : 2 : 3, which is exactly one `useRecording` poll,
 * one `useRecordingFeedback` pair and two more workflow readers re-arming
 * TOGETHER: four effects whose dependency was a fresh object literal, recreated
 * on every render of the panel.
 *
 * Each re-arm ran the previous effect's cleanup, and that cleanup sets
 * `alive = false` — so every render DISCARDED the recording poll that was in
 * flight. The lifecycle view was committed only when a runtime round-trip
 * happened to finish between two renders, which is why the banner appeared in
 * 283 ms on one machine and 24,872 ms on another, and not at all inside A4's
 * budget on a third.
 *
 * So the invariant this file pins is not a timing: it is that
 *
 *     RENDER COUNT AND READER ACTIVITY ARE INDEPENDENT.
 *
 * A render that changes nothing the readers depend on must cost nothing. Reads
 * happen on mount, on the lifecycle beat, when the bound tab changes, and when
 * the stored workflow actually changes — and at no other time.
 *
 * EVIDENCE BOUNDARY, meant literally: happy-dom is not Chromium and this fake
 * gateway is not `chrome.storage`. These tests prove the SHAPE of the reader
 * lifecycle — how many subscriptions exist, when reads are issued, and whether
 * a stored change reaches the view. Real scheduling, real MV3 service-worker
 * wake-up and real storage latency stay where they are proven: the E2E suite.
 */
import { StrictMode, act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ sends: 0 }));

// `sendRuntimeMessage` is the ONE runtime seam (WS5 D-g). Faking it here counts
// live queries without touching the seam itself, and answering `NO_HANDLER`
// keeps the panel on the DURABLE path — the same path A4 exercises.
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      id: 'test-extension-id',
      sendMessage: async () => {
        hoisted.sends += 1;
        return { ok: false, code: 'NO_HANDLER' };
      },
    },
  },
}));

const { useExport } = await import('../entrypoints/sidepanel/ExportControl');
const { useRecording, useRecordingFeedback } =
  await import('../entrypoints/sidepanel/RecordingControl');
const { useRecordingWorkspace } = await import('../entrypoints/sidepanel/RecordingWorkspace');
const { createStorageGateway, STORAGE_SCHEMA_VERSION, tabKey } =
  await import('../src/storage/gateway');
const { RECORDING_WORKFLOW } = await import('../src/storage/state');
const { appendStep, createWorkflow } = await import('../src/recording/workflow');
const { FakeChangeSource, FakeStorageArea } = await import('./helpers/fake-storage');

import type {
  FakeChangeSource as FakeChangeSourceType,
  FakeStorageArea as FakeStorageAreaType,
} from './helpers/fake-storage';

import type { StorageGateway } from '../src/application/ports/StorageGateway';
import type { RecordedStep, RecordedWorkflow } from '../src/recording/workflow';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TAB = 41;
const OTHER_TAB = 42;

const step = (over: Partial<RecordedStep> = {}): RecordedStep =>
  ({
    kind: 'click',
    timestamp: 10,
    target: {
      locator: {
        chain: {
          steps: [
            {
              kind: 'role',
              selectorValue: { type: 'string', value: 'button' },
              options: { name: { type: 'string', value: 'Save' } },
            },
          ],
        },
        verdict: 'excellent',
        matchCount: 1,
        visibleMatchCount: 1,
        stepCounts: [1],
        rationale: [],
      },
      facts: {
        attributes: { tagName: 'BUTTON', innerText: 'Save' },
        ancestors: [],
        indexInParent: 0,
        inShadowRoot: false,
      },
    },
    ...over,
  }) as RecordedStep;

/** A workflow whose generated code carries a marker unique to `name`. */
function workflowNamed(name: string): RecordedWorkflow {
  const base = createWorkflow({ id: `s-${name}`, url: 'https://example.test/', startedAt: 0 });
  return appendStep(
    base,
    step({
      target: {
        ...step().target!,
        locator: {
          ...step().target!.locator,
          chain: {
            steps: [
              {
                kind: 'role',
                selectorValue: { type: 'string', value: 'button' },
                options: { name: { type: 'string', value: name } },
              },
            ],
          },
        },
      },
    } as Partial<RecordedStep>),
  ).workflow;
}

const envelope = (data: unknown) => ({ v: STORAGE_SCHEMA_VERSION, data });
const workflowKey = (tabId: number) => tabKey(tabId, RECORDING_WORKFLOW.key);

interface Rig {
  gateway: StorageGateway;
  session: FakeStorageAreaType;
  changes: FakeChangeSourceType;
  /** Every `readTab` this rig has served, by descriptor key. */
  reads: Record<string, number>;
}

function rig(seed: Record<string, unknown> = {}): Rig {
  const session = new FakeStorageArea(seed);
  const changes = new FakeChangeSource();
  const real = createStorageGateway({ local: new FakeStorageArea(), session, changes });
  const reads: Record<string, number> = {};
  const gateway: StorageGateway = {
    ...real,
    readTab: async (descriptor, tabId) => {
      reads[descriptor.key] = (reads[descriptor.key] ?? 0) + 1;
      return real.readTab(descriptor, tabId);
    },
  };
  return { gateway, session, changes, reads };
}

/**
 * The panel's four recording readers, wired the way the panel wires them.
 *
 * `bump` is state NO reader depends on: changing it is an unrelated render, and
 * an unrelated render is precisely what must cost nothing.
 */
function Harness({ rigRef, tabId, lang }: { rigRef: Rig; tabId: number | null; lang: string }) {
  const [, setBump] = useState(0);
  bump = () => act(() => setBump((n) => n + 1));
  const bound = { tabId, gateway: rigRef.gateway };
  const rec = useRecording(bound);
  const exp = useExport(lang as never, bound);
  const feedback = useRecordingFeedback(bound);
  const workspace = useRecordingWorkspace(lang as never, bound);
  return createElement(
    'div',
    null,
    createElement('span', { id: 'view' }, rec.view),
    createElement('span', { id: 'recorded' }, String(feedback.recorded)),
    createElement('span', { id: 'ws-state' }, workspace.state),
    createElement('span', { id: 'ws-lang' }, workspace.language),
    createElement('span', { id: 'ws-code' }, workspace.code),
    createElement('span', { id: 'exp' }, exp.result?.ok ? exp.result.artifact.content : ''),
  );
}

let bump: () => void = () => {};
let host: HTMLDivElement;
let root: Root;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const text = (id: string) => host.querySelector(`#${id}`)?.textContent ?? '';

beforeEach(() => {
  hoisted.sends = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = async (r: Rig, tabId: number | null = TAB, lang = 'typescript') => {
  await act(async () => {
    root.render(
      createElement(StrictMode, null, createElement(Harness, { rigRef: r, tabId, lang })),
    );
  });
  await flush();
};

// ─── A. RENDER CHURN MUST NOT DRIVE READS ───────────────────────────────────

describe('WS9-SUB-A — an unrelated render costs nothing', () => {
  it('twenty unrelated renders issue no further runtime queries and no further reads', async () => {
    const r = rig({ [workflowKey(TAB)]: envelope(workflowNamed('Save')) });
    await mount(r);

    const sendsAfterMount = hoisted.sends;
    const readsAfterMount = { ...r.reads };
    expect(sendsAfterMount, 'the panel asks the live authority on mount').toBeGreaterThan(0);

    for (let i = 0; i < 20; i += 1) bump();
    await flush();

    expect(
      hoisted.sends,
      'a render that changes nothing the reader depends on must not re-ask the authority. ' +
        'Before DL-91 each render re-armed the effect and issued another query, which is how ' +
        '5,205 queries were measured in 24.9 seconds.',
    ).toBe(sendsAfterMount);
    expect(
      r.reads,
      'and it must not re-read durable state either — the 1 : 2 : 3 ratio measured in the ' +
        'real browser was four readers re-arming together',
    ).toEqual(readsAfterMount);
  });
});

// ─── B / C. THE STORED RECORDING STAYS FRESH WITHOUT THE CHURN ──────────────

describe('WS9-SUB-B — export follows the stored workflow', () => {
  it('a workflow written after mount reaches the export artifact', async () => {
    const r = rig({ [workflowKey(TAB)]: envelope(workflowNamed('Save')) });
    await mount(r);
    expect(text('exp')).toContain("name: 'Save'");

    const next = workflowNamed('Publish');
    await r.session.set({ [workflowKey(TAB)]: envelope(next) });
    await act(async () => {
      r.changes.emit({ [workflowKey(TAB)]: { newValue: envelope(next) } }, 'session');
    });
    await flush();

    expect(
      text('exp'),
      'freshness must come from the storage seam, not from a render storm. A memo alone ' +
        'would freeze this value at its first read.',
    ).toContain("name: 'Publish'");
  });
});

describe('WS9-SUB-C — the code workspace follows the stored workflow', () => {
  it('a workflow written after mount reaches the rendered spec', async () => {
    const r = rig({ [workflowKey(TAB)]: envelope(workflowNamed('Save')) });
    await mount(r);
    expect(text('ws-code')).toContain("name: 'Save'");

    const next = workflowNamed('Publish');
    await r.session.set({ [workflowKey(TAB)]: envelope(next) });
    await act(async () => {
      r.changes.emit({ [workflowKey(TAB)]: { newValue: envelope(next) } }, 'session');
    });
    await flush();

    expect(text('ws-code')).toContain("name: 'Publish'");
    expect(text('ws-state')).toBe('ready');
  });
});

// ─── D. SUBSCRIPTION LIFECYCLE ──────────────────────────────────────────────

describe('WS9-SUB-D — one subscription per reader per bound tab', () => {
  it('subscribes once, does not accumulate across renders, and unsubscribes on unmount', async () => {
    const r = rig({ [workflowKey(TAB)]: envelope(workflowNamed('Save')) });
    await mount(r);

    const afterMount = r.changes.listenerCount;
    expect(afterMount, 'the two workflow readers each watch exactly once').toBeGreaterThan(0);

    for (let i = 0; i < 10; i += 1) bump();
    await flush();
    expect(
      r.changes.listenerCount,
      'renders must not accumulate subscriptions — a leaked watch is the same defect ' +
        'in a slower disguise',
    ).toBe(afterMount);

    await act(async () => root.unmount());
    expect(r.changes.listenerCount, 'every watch is released on unmount').toBe(0);

    // Re-arm the harness for the shared afterEach.
    root = createRoot(host);
  });

  it('rebinds to the new tab when the bound tab changes, without leaking the old one', async () => {
    const r = rig({
      [workflowKey(TAB)]: envelope(workflowNamed('Save')),
      [workflowKey(OTHER_TAB)]: envelope(workflowNamed('Publish')),
    });
    await mount(r);
    expect(text('ws-code')).toContain("name: 'Save'");
    const afterMount = r.changes.listenerCount;

    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(Harness, { rigRef: r, tabId: OTHER_TAB, lang: 'typescript' }),
        ),
      );
    });
    await flush();

    expect(text('ws-code'), 'the new tab’s recording is what is shown').toContain(
      "name: 'Publish'",
    );
    expect(r.changes.listenerCount, 'the old tab’s watch was released, not stacked').toBe(
      afterMount,
    );
  });
});

// ─── E. LANGUAGE ────────────────────────────────────────────────────────────

describe('WS9-SUB-E — language derivation is separate from workflow freshness', () => {
  it('a language change re-renders the code without re-reading the workflow', async () => {
    const r = rig({ [workflowKey(TAB)]: envelope(workflowNamed('Save')) });
    await mount(r);
    expect(text('ws-lang')).toBe('typescript');
    const readsBefore = { ...r.reads };

    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(Harness, { rigRef: r, tabId: TAB, lang: 'python_sync' }),
        ),
      );
    });
    await flush();

    expect(text('ws-lang')).toBe('python_sync');
    expect(text('ws-code')).toContain('get_by_role');
    expect(
      r.reads[RECORDING_WORKFLOW.key],
      'language is a derivation of a workflow already held, not a reason to re-read storage',
    ).toBe(readsBefore[RECORDING_WORKFLOW.key]);
  });
});
