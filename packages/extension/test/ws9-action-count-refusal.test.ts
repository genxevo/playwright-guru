// @vitest-environment happy-dom
/**
 * WS9 — TRUTHFUL ACTION COUNT AND REFUSAL FEEDBACK.
 * ============================================================================
 * THE ONE SENTENCE:
 *
 *     CAPTURED is not RECORDED. ATTEMPTED is not RECORDED. REFUSED is not
 *     RECORDED. Only what crossed the existing admission boundary is RECORDED —
 *     and the user should be able to learn that without being lied to.
 *
 * ═══ WHAT "ACTION COUNT" MEANS, MEASURED RATHER THAN CHOSEN ═══
 *
 * The gate asks whether the count is raw events, accepted steps, or something
 * else, and warns against assuming. The architecture had already decided, in
 * code: `appendStep` calls `shouldStopRecording(workflow.steps.length)` and
 * `recordingLimitState(steps.length)`, and `config/recording.ts` names that
 * parameter `actionCount`. So the 40/100 contract has ALWAYS counted accepted
 * `RecordedStep`s, coalescing included — two clicks that became one `dblclick`
 * are one action, and always were. This slice therefore changes no contract; it
 * surfaces the number the limit already uses. A guard below pins that identity
 * so the two can never drift into meaning different things.
 *
 * ═══ WHY THERE IS NO NEW COUNT FIELD IN STORAGE ═══
 *
 * `persistence.ts` states the rule outright: "There is no action count: the
 * workflow is persisted beside this record and already knows, and a second copy
 * of one fact is a second thing to disagree." That is still right, so the
 * recorded count is DERIVED from the durable workflow the panel already reads —
 * `readDurableWorkflow`, the same reader export and the workspace use. No new
 * descriptor, no new message, no duplicated fact.
 *
 * Refusals are the opposite case, and that is why they ARE stored: a refused
 * action is deliberately NOT in the workflow, is not derivable from anything
 * else, and is known only to the runtime that refused it. Two bounded optional
 * fields on the EXISTING `RecordingObservation` carry it — the durable
 * projection of runtime state, which is exactly what that record is for.
 *
 * ═══ ONE ADMISSION AUTHORITY, NOT TWO ═══
 *
 * `refusalFor` replaces the boolean at the centre of the trust boundary and
 * returns WHY. `isTrustworthy` becomes `refusalFor(target) === null`, so there
 * is still exactly one place that decides, and the reason a user sees is the
 * same computation that dropped the action. The UI computes nothing: no probe,
 * no resolver, no verdict interpretation, no frame check.
 *
 * ═══ WHAT IS NOT REPORTED, AND WHY ═══
 *
 *   the noise filter    a click on a text input returns `null` from
 *                       `stepForClick` because the FILL owns that element. The
 *                       user's intent was recorded, by another event. Calling
 *                       that a refusal would invent a failure.
 *   a dead session      `recordAction`'s `rejected-*` outcomes mean the session
 *                       was not live. The lifecycle already says so, in the
 *                       banner; counting it again would report one fact twice.
 *
 * EVIDENCE BOUNDARY. happy-dom with real event dispatch, the real
 * `captureSnapshot`, the real `LiveDomProbe` and the real resolver, including a
 * real sub-frame. **Real Chromium was not run and nothing here claims otherwise.**
 */
import { describe, expect, it } from 'vitest';

import { RECORDING_ENABLED, RECORDING_LIMITS, recordingLimitState } from '../src/config/recording';
import { REFUSALS, refusalFor, type RecordingRefusal } from '../src/recording/admission';
import {
  observationFor,
  validateObservation,
  type RecordingObservation,
} from '../src/recording/persistence';
import { appendStep, createWorkflow } from '../src/recording/workflow';
import { createRecordingRuntime, isTrustworthy } from '../src/runtime/recording';

import { setBody } from './helpers/dom-fixture';
import { stubLayout } from './helpers/layout-stub';
import { readExtFile, stripComments } from './helpers/surface-source';

import type { RecordedTarget } from '../src/recording/workflow';

stubLayout();

const T0 = 4_000_000;
const code = (rel: string): string => stripComments(readExtFile(rel));

/** A runtime plus the durable payloads it published. */
function runtimeOver(doc: Document, start = T0, seed = 'c') {
  const clock = { now: start };
  const published: Array<{ observation: RecordingObservation }> = [];
  let n = 0;
  const rt = createRecordingRuntime({
    doc,
    now: () => clock.now,
    nonce: () => `${seed}${n++}`,
    enabled: true,
    persist: (payload) => published.push(payload as { observation: RecordingObservation }),
  });
  return { rt, clock, published, last: () => published[published.length - 1]?.observation };
}

function recordingOn(html: string, start = T0, seed = 'c') {
  setBody(html);
  const ctx = runtimeOver(document, start, seed);
  expect(ctx.rt.start(ctx.clock.now).ok, 'fixture must start').toBe(true);
  return ctx;
}

const clickOn = (id: string, doc: Document = document) =>
  doc.getElementById(id)!.dispatchEvent(
    new (doc.defaultView as unknown as Window & typeof globalThis).MouseEvent('click', {
      bubbles: true,
    }),
  );

function frameDocument(html: string): Document {
  setBody('<iframe id="child"></iframe>');
  const doc = (document.getElementById('child') as HTMLIFrameElement).contentDocument!;
  doc.write(`<!doctype html><html><body>${html}</body></html>`);
  return doc;
}

/** A synthetic target, for the taxonomy tests. Never fed to the DOM. */
function targetWith(over: Partial<RecordedTarget['locator']> = {}): RecordedTarget {
  return {
    locator: {
      chain: { steps: [{ kind: 'role', role: 'button', name: 'Save' }] },
      verdict: 'excellent',
      matchCount: 1,
      visibleMatchCount: 1,
      stepCounts: [1],
      rationale: [],
      ...over,
    } as RecordedTarget['locator'],
    facts: {
      attributes: { tagName: 'button' },
      ancestors: [],
      indexInParent: 0,
      inShadowRoot: false,
    },
  };
}

// ═══ COUNT-01…05 — what the count counts ════════════════════════════════════

describe('COUNT-01 — an admitted click increments the recorded count', () => {
  it('one accepted action is one recorded step', () => {
    const { rt } = recordingOn('<button id="b">Save</button>');
    clickOn('b');
    expect(rt.workflow()!.steps.length).toBe(1);
    expect(rt.recorded()).toBe(1);
  });
});

describe('COUNT-02/03 — a refused action does NOT increment the count', () => {
  it('a frame action is refused and counted as refused, not as recorded', () => {
    const doc = frameDocument('<button id="b">Save</button>');
    const ctx = runtimeOver(doc, T0, 'f');
    ctx.rt.start(ctx.clock.now);
    clickOn('b', doc);

    expect(ctx.rt.workflow()!.steps, 'nothing entered the workflow').toEqual([]);
    expect(ctx.rt.recorded()).toBe(0);
    expect(ctx.rt.refused()).toEqual({ count: 1, last: 'frame-unsupported' });
  });
});

describe('COUNT-04 — an ambiguous or unverifiable action does not become a step', () => {
  it('refuses two identical buttons, and says why', () => {
    const { rt } = recordingOn('<button id="b">Save</button><button>Save</button>');
    clickOn('b');
    expect(rt.recorded()).toBe(0);
    expect(rt.refused().count).toBe(1);
    expect(rt.refused().last, 'two visible matches is ambiguity').toBe('ambiguous');
  });
});

describe('COUNT-05/06 — two successful actions, and what coalescing means', () => {
  it('two distinct accepted actions count 2', () => {
    const { rt, clock } = recordingOn(
      '<button id="one">Alpha</button><button id="two">Beta</button>',
    );
    clickOn('one');
    clock.now += RECORDING_LIMITS.dblclickWindowMs + 1;
    clickOn('two');
    expect(rt.recorded()).toBe(2);
    expect(rt.workflow()!.steps.length).toBe(2);
  });

  it('a coalesced pair is ONE action, and the count never disagrees with the workflow', () => {
    // Two clicks on one element inside `dblclickWindowMs` become a single
    // `dblclick`. That is one ACTION by the architecture's own definition, and
    // the count must say one — not two, which would count raw events.
    const { rt } = recordingOn('<button id="b">Save</button>');
    clickOn('b');
    clickOn('b');
    expect(rt.workflow()!.steps.length).toBe(1);
    expect(rt.workflow()!.steps[0]!.kind).toBe('dblclick');
    expect(rt.recorded(), 'the count follows the workflow, never the event stream').toBe(1);
  });

  it('the count IS the number the recording limit already uses', () => {
    // `appendStep` calls `shouldStopRecording(workflow.steps.length)` and
    // `recordingLimitState(steps.length)`, and `config/recording.ts` names that
    // parameter `actionCount`. Pinned so "actions recorded" and "the 40/100
    // contract" can never drift into meaning different things.
    const workflow = code('src/recording/workflow.ts');
    expect(workflow).toContain('shouldStopRecording(workflow.steps.length)');
    expect(workflow).toContain('recordingLimitState(steps.length)');
    const runtime = code('src/runtime/recording.ts');
    expect(runtime, 'the runtime reports the workflow length, it does not tally').toMatch(
      /session\.workflow\.steps\.length/,
    );
  });
});

// ═══ COUNT-07/08 — bounded ══════════════════════════════════════════════════

describe('COUNT-07/08 — the counts are bounded by the existing limits', () => {
  it('the recorded count cannot exceed the authoritative hard stop', () => {
    let workflow = createWorkflow({ id: 'w', url: 'https://a.example/', startedAt: T0 });
    for (let i = 0; i < RECORDING_LIMITS.hardStop + 20; i += 1) {
      workflow = appendStep(workflow, {
        kind: 'click',
        target: targetWith(),
        timestamp: T0 + i * 1000,
      }).workflow;
    }
    expect(workflow.steps.length).toBeLessThanOrEqual(RECORDING_LIMITS.hardStop);
    expect(recordingLimitState(workflow.steps.length)).toBe('stopped');
  });

  it('the refused count is capped at the same limit rather than at a new one', () => {
    const admission = code('src/recording/admission.ts');
    expect(admission, 'the cap comes from RECORDING_LIMITS').toContain('RECORDING_LIMITS.hardStop');
    expect(admission, 'and no module-local ceiling is declared').not.toMatch(
      /=\s*\d{2,}\s*;?\s*$/m,
    );
  });

  it('a hostile stored value cannot inflate either count', () => {
    const base = {
      schemaVersion: 1,
      sessionId: 's',
      lifecycle: 'active',
      startedAt: T0,
      lastHeartbeatAt: T0,
    };
    for (const hostile of [
      Number.MAX_SAFE_INTEGER,
      1e309,
      -1,
      Number.NaN,
      '5',
      { valueOf: () => 5 },
    ]) {
      expect(
        validateObservation({ ...base, refusedCount: hostile }),
        `refusedCount ${String(hostile)} must be refused`,
      ).toBeNull();
    }
    expect(
      validateObservation({ ...base, refusedCount: 3, lastRefusal: 'ambiguous' }),
    ).not.toBeNull();
  });
});

// ═══ COUNT-09…14 — the refusal taxonomy ════════════════════════════════════

describe('COUNT-09 — a refusal is a bounded, typed code', () => {
  it('every reason is a member of one small finite set', () => {
    expect(REFUSALS.length).toBeLessThanOrEqual(8);
    for (const reason of REFUSALS) {
      expect(typeof reason).toBe('string');
      expect(reason.length).toBeLessThanOrEqual(24);
    }
    expect(new Set(REFUSALS).size, 'no duplicates').toBe(REFUSALS.length);
  });
});

describe('COUNT-10 — a refusal never carries content', () => {
  it('the reason is categorical, never a selector, value or fragment of the page', () => {
    const secret = 'hunter2';
    const target = targetWith({
      chain: {
        steps: [{ kind: 'label', name: secret } as never],
        frameSelector: `iframe[src*="${secret}"]`,
      } as never,
    });
    const reason = refusalFor(target);
    expect(reason).toBe('frame-unsupported');
    expect(String(reason)).not.toContain(secret);
    expect(String(reason)).not.toContain('iframe');
  });

  it('and no refusal code contains a bracket, quote or angle that could carry markup', () => {
    for (const reason of REFUSALS) {
      expect(reason, `${reason} must be a plain code`).toMatch(/^[a-z][a-z-]*$/);
    }
  });

  it('the durable record still carries no DOM, value or page text', () => {
    const record = observationFor(
      {
        id: { __brand: 'RecordingSessionId', value: 'sid' } as never,
        state: 'active',
        startedAt: T0,
        lastHeartbeatAt: T0,
      },
      { count: 2, last: 'ambiguous' },
    );
    const serialised = JSON.stringify(record);
    for (const forbidden of ['<', '>', 'iframe', 'value', 'html', 'outerHTML']) {
      expect(serialised.toLowerCase(), `the record must not carry ${forbidden}`).not.toContain(
        forbidden.toLowerCase(),
      );
    }
    expect(Object.keys(record).sort()).toEqual(
      [
        'lastHeartbeatAt',
        'lastRefusal',
        'lifecycle',
        'refusedCount',
        'schemaVersion',
        'sessionId',
        'startedAt',
      ].sort(),
    );
  });
});

describe('COUNT-11/12/13 — each reason corresponds to a real admission state', () => {
  it('a frame chain is frame-unsupported', () => {
    expect(refusalFor(targetWith({ chain: { steps: [], frameSelector: 'iframe' } as never }))).toBe(
      'frame-unsupported',
    );
  });

  it('a positional guess is ambiguous', () => {
    expect(refusalFor(targetWith({ chain: { steps: [], nth: 0 } as never }))).toBe('ambiguous');
  });

  it('zero visible matches is not-found', () => {
    expect(refusalFor(targetWith({ visibleMatchCount: 0, verdict: 'no-match' }))).toBe('not-found');
  });

  it('more than one visible match is ambiguous', () => {
    expect(refusalFor(targetWith({ visibleMatchCount: 3, verdict: 'ambiguous' }))).toBe(
      'ambiguous',
    );
  });

  it('an unmeasured verdict is unverifiable', () => {
    expect(refusalFor(targetWith({ verdict: 'unknown' }))).toBe('unverifiable');
  });

  it('and a good target is refused for nothing at all', () => {
    expect(refusalFor(targetWith())).toBeNull();
    expect(refusalFor(targetWith({ verdict: 'good' }))).toBeNull();
  });
});

describe('COUNT-14 — an unknown or future reason fails closed', () => {
  it('a stored reason outside the set invalidates the whole record', () => {
    const base = {
      schemaVersion: 1,
      sessionId: 's',
      lifecycle: 'active',
      startedAt: T0,
      lastHeartbeatAt: T0,
      refusedCount: 1,
    };
    expect(validateObservation({ ...base, lastRefusal: 'from-the-future' })).toBeNull();
    expect(validateObservation({ ...base, lastRefusal: 42 })).toBeNull();
    expect(validateObservation({ ...base, lastRefusal: { code: 'ambiguous' } })).toBeNull();
  });

  it('and the UI maps only known reasons, never an arbitrary string', () => {
    const control = code('entrypoints/sidepanel/RecordingControl.tsx');
    expect(control, 'the copy table is keyed by the typed set').toMatch(
      /Record<RecordingRefusal,\s*string>/,
    );
  });
});

// ═══ COUNT-15…20 — ownership and lifecycle ═════════════════════════════════

describe('COUNT-15/16 — a foreign or stale session cannot mutate the counts', () => {
  it('a refusal after the session went stale changes nothing', () => {
    const { rt, clock } = recordingOn('<button id="b">Save</button><button>Save</button>');
    clock.now += RECORDING_LIMITS.heartbeatTimeoutMs + 1;
    clickOn('b');
    expect(rt.state(clock.now)).toBe('stale');
    expect(rt.refused().count, 'a dead session refuses nothing; it simply is not recording').toBe(
      0,
    );
    expect(rt.recorded()).toBe(0);
  });

  it('a stop presented with a foreign id leaves the counts alone', () => {
    const { rt, clock } = recordingOn('<button id="b">Save</button>');
    clickOn('b');
    expect(rt.recorded()).toBe(1);
    expect(rt.stop('not-my-session', clock.now).ok).toBe(false);
    expect(rt.recorded(), 'a refused stop is not a state change').toBe(1);
  });

  it('the counts reset when a NEW session starts', () => {
    const ctx = recordingOn('<button id="b">Save</button><button>Save</button>');
    clickOn('b');
    expect(ctx.rt.refused().count).toBe(1);
    ctx.clock.now += 10;
    ctx.rt.stop(ctx.rt.workflow()!.id, ctx.clock.now);
    ctx.clock.now += 10;
    ctx.rt.start(ctx.clock.now);
    expect(ctx.rt.refused(), 'a new recording starts from nothing').toEqual({
      count: 0,
      last: null,
    });
    expect(ctx.rt.recorded()).toBe(0);
  });
});

describe('COUNT-17/18 — the counts are tab-scoped through the existing WS4 ownership', () => {
  it('they travel on the observation and workflow the background keys by sender.tab.id', () => {
    const background = code('entrypoints/background.ts');
    expect(background).toContain('contentSenderTabId(sender)');
    expect(background).toContain('RECORDING_OBSERVATION');
    expect(background).toContain('RECORDING_WORKFLOW');
  });

  it('and no new descriptor was added for them', () => {
    const state = code('src/storage/state.ts');
    const descriptors = [...state.matchAll(/export const ([A-Z_]+): StateDescriptor/g)].map(
      (m) => m[1],
    );
    expect(descriptors.sort()).toEqual(
      [
        'CODE_BUFFER',
        'LAST_PICK',
        'PICKER_ACTIVE',
        'PW_LANG',
        'RECORDING_OBSERVATION',
        'RECORDING_WORKFLOW',
      ].sort(),
    );
  });
});

describe('COUNT-19/20 — a durable count never becomes live authority', () => {
  it('a fresh runtime reports no counts, whatever storage holds', () => {
    setBody('<button id="b">Save</button>');
    const { rt } = runtimeOver(document, T0);
    expect(rt.recorded()).toBe(0);
    expect(rt.refused()).toEqual({ count: 0, last: null });
    expect(rt.state(T0)).toBe('inactive');
  });

  it('the runtime still reads nothing back from storage', () => {
    const runtime = code('src/runtime/recording.ts');
    for (const reader of ['readTab', 'readGlobal', 'storage.', 'RECORDING_OBSERVATION']) {
      expect(runtime, `the runtime must not read ${reader}`).not.toContain(reader);
    }
  });

  it('and a stored count does not imply a lifecycle', () => {
    // Count existence and lifecycle existence are separate facts. The
    // observation's lifecycle is still the only lifecycle input, and a record
    // carrying counts is subject to exactly the same staleness derivation.
    const persistence = code('src/recording/persistence.ts');
    const at = persistence.indexOf('export function observedLifecycle');
    const fn = persistence.slice(at, persistence.indexOf('\n}', at));
    for (const field of ['refusedCount', 'lastRefusal']) {
      expect(fn, `observedLifecycle must not consult ${field}`).not.toContain(field);
    }
  });
});

// ═══ COUNT-21…24 — architectural non-duplication ═══════════════════════════

describe('COUNT-21/22/23 — one lifecycle, one resolver, one admission authority', () => {
  it('no second session state machine', () => {
    const session = code('src/recording/session.ts');
    expect([...session.matchAll(/state:\s*'active'/g)]).toHaveLength(1);
    for (const rel of [
      'src/recording/admission.ts',
      'entrypoints/sidepanel/RecordingControl.tsx',
    ]) {
      expect(code(rel), `${rel} must not assign a lifecycle state`).not.toMatch(
        /state:\s*'active'/,
      );
    }
  });

  it('no second resolver or probe, and none in the UI', () => {
    for (const rel of [
      'src/recording/admission.ts',
      'src/runtime/recording.ts',
      'entrypoints/sidepanel/RecordingControl.tsx',
    ]) {
      const src = code(rel);
      for (const forbidden of ['new LiveDomProbe', 'resolveChain(', 'resolveStep(', 'DomProbe']) {
        expect(src, `${rel} must not build ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('the admission decision is computed in exactly one place', () => {
    // `isTrustworthy` must BE `refusalFor`, not a second opinion that agrees.
    const runtime = code('src/runtime/recording.ts');
    expect(runtime).toMatch(/refusalFor\(target\)\s*===\s*null/);
    for (const duplicated of ['frameSelector', 'visibleMatchCount', 'verdict ===', 'chain.nth']) {
      expect(runtime, `the runtime must not re-check ${duplicated}`).not.toContain(duplicated);
    }
    const control = code('entrypoints/sidepanel/RecordingControl.tsx');
    for (const duplicated of [
      'frameSelector',
      'visibleMatchCount',
      'verdict',
      'isTrustworthy',
      'refusalFor',
    ]) {
      expect(control, `the UI must not compute ${duplicated}`).not.toContain(duplicated);
    }
  });

  it('and isTrustworthy still agrees with refusalFor for every case', () => {
    const cases: RecordedTarget[] = [
      targetWith(),
      targetWith({ verdict: 'good' }),
      targetWith({ chain: { steps: [], frameSelector: 'iframe' } as never }),
      targetWith({ chain: { steps: [], nth: 1 } as never }),
      targetWith({ visibleMatchCount: 0, verdict: 'no-match' }),
      targetWith({ visibleMatchCount: 2, verdict: 'ambiguous' }),
      targetWith({ verdict: 'unknown' }),
    ];
    for (const target of cases) {
      expect(isTrustworthy(target)).toBe(refusalFor(target) === null);
    }
  });
});

describe('COUNT-24 — the authoritative record remains RecordedWorkflow', () => {
  it('a refused action never enters the workflow, in any shape', () => {
    const doc = frameDocument('<button id="b">Save</button>');
    const ctx = runtimeOver(doc, T0, 'w');
    ctx.rt.start(ctx.clock.now);
    clickOn('b', doc);
    const workflow = ctx.rt.workflow()!;
    expect(workflow.steps).toEqual([]);
    expect(JSON.stringify(workflow)).not.toContain('refus');
    expect(JSON.stringify(workflow)).not.toContain('frame');
  });

  it('and no placeholder, unverified or raw-selector step type was introduced', () => {
    const workflow = code('src/recording/workflow.ts');
    for (const forbidden of [
      'UNVERIFIED',
      'unverified',
      'placeholder',
      'rawSelector',
      'refusedCount',
    ]) {
      expect(workflow, `the model must not gain ${forbidden}`).not.toContain(forbidden);
    }
  });
});

// ═══ PERSISTENCE — additive, bounded, fail-closed ══════════════════════════

describe('the durable observation carries the refusal without a new mechanism', () => {
  it('publishes the refusal on the existing observation', () => {
    const doc = frameDocument('<button id="b">Save</button>');
    const ctx = runtimeOver(doc, T0, 'p');
    ctx.rt.start(ctx.clock.now);
    clickOn('b', doc);
    const observation = ctx.last()!;
    expect(observation.refusedCount).toBe(1);
    expect(observation.lastRefusal).toBe('frame-unsupported');
    expect(observation.schemaVersion, 'no schema version bump was needed').toBe(1);
  });

  it('a refusal refreshes the observation WITHOUT rewriting the recording', () => {
    // Only a change to the recording rewrites the recording. A refusal changed
    // nothing about the workflow, so the workflow must not be republished.
    const doc = frameDocument('<button id="b">Save</button>');
    const ctx = runtimeOver(doc, T0, 'q');
    ctx.rt.start(ctx.clock.now);
    const before = ctx.published.filter((p) => 'workflow' in p).length;
    clickOn('b', doc);
    const after = ctx.published.filter((p) => 'workflow' in p).length;
    expect(after, 'a refusal publishes no workflow').toBe(before);
    expect(ctx.published.length, 'but it does publish an observation').toBeGreaterThan(0);
  });

  it('absent fields are legal — an observation without refusals still validates', () => {
    expect(
      validateObservation({
        schemaVersion: 1,
        sessionId: 's',
        lifecycle: 'active',
        startedAt: T0,
        lastHeartbeatAt: T0,
      }),
      'the fields are additive, so an older record is still readable',
    ).not.toBeNull();
  });

  it('and a record with one field but not the other fails closed', () => {
    const base = {
      schemaVersion: 1,
      sessionId: 's',
      lifecycle: 'active',
      startedAt: T0,
      lastHeartbeatAt: T0,
    };
    expect(
      validateObservation({ ...base, lastRefusal: 'ambiguous' }),
      'a reason with no count is an incoherent record',
    ).toBeNull();
    expect(
      validateObservation({ ...base, refusedCount: 0, lastRefusal: 'ambiguous' }),
      'and a reason with a zero count is too',
    ).toBeNull();
  });
});

// ═══ UI — truthful, gated, accessible ══════════════════════════════════════

describe('the feedback surface is truthful and stays behind the flag', () => {
  const control = code('entrypoints/sidepanel/RecordingControl.tsx');

  it('RECORDING_ENABLED is still false and every component refuses to render', () => {
    expect(RECORDING_ENABLED).toBe(false);
    const components = [...control.matchAll(/^export function ([A-Z]\w+)\(/gm)].map((m) => m[1]);
    const gates = [...control.matchAll(/if\s*\(!RECORDING_ENABLED\)\s*return null;/g)];
    expect(components.length).toBeGreaterThan(0);
    expect(gates.length, 'every rendering component is gated').toBe(components.length);
  });

  it('names the two numbers differently, so neither can be read as the other', () => {
    expect(control).toMatch(/recorded/);
    expect(control).toMatch(/not recorded|refused/i);
  });

  it('says nothing at all when there is nothing to say', () => {
    const control2 = code('entrypoints/sidepanel/RecordingControl.tsx');
    expect(control2, 'zero recorded and zero refused must render no claim').toMatch(
      /recorded === 0 && [^\n]*refus/i,
    );
  });

  it('exposes status to assistive technology without a second noisy live region', () => {
    // `RecordingBanner` already owns the one `aria-live` region for recording.
    // A second polite region announcing a changing number would talk over it.
    expect([...control.matchAll(/aria-live=/g)], 'exactly one live region').toHaveLength(1);
    expect(control).toContain('role="status"');
  });

  it('never renders the session id, a raw selector or a value', () => {
    // `sessionId` is deliberately NOT in this list. DL-77's rule is "used, never
    // shown": the panel must present the id on STOP_RECORDING, which is what
    // makes a stale stop refusable, so the identifier legitimately appears in
    // that message. Banning the string outright would forbid the correct code
    // and pass only by accident. The claim is that it is never RENDERED or
    // LOGGED, which is what `ws9-recording-reconcile.test.ts` already pins and
    // what is asserted here in the same shape.
    expect(control, 'the session id is never interpolated into JSX').not.toMatch(
      /\{\s*[A-Za-z.]*session[A-Za-z]*\s*\}/i,
    );
    expect(control, 'and never logged').not.toMatch(/console\.\w+\([^)]*session/i);
    for (const forbidden of ['frameSelector', 'outerHtml', 'innerHTML', 'dangerouslySet']) {
      expect(control, `the panel must not render ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('and reaches storage only through the WS4 gateway', () => {
    for (const api of [
      'browser.storage',
      'chrome.storage',
      'localStorage',
      'sessionStorage',
      'indexedDB',
    ]) {
      expect(control, `the panel must not touch ${api}`).not.toContain(api);
    }
    for (const api of ['tabs.query', 'lastFocusedWindow']) {
      expect(control, `no active-tab lookup via ${api}`).not.toContain(api);
    }
  });

  it('and never names a V1 storage key', () => {
    for (const key of ['pg_recording_active', 'pg_recorded_actions']) {
      expect(control, `DL-82 keys stay untouched: ${key}`).not.toContain(key);
    }
  });
});

// ═══ FAILURE MODES ═════════════════════════════════════════════════════════

describe('failure modes are categorised honestly', () => {
  it('a refusal followed by a success counts one of each', () => {
    const { rt, clock } = recordingOn(
      '<button id="dup">Save</button><button>Save</button><button id="ok">Publish</button>',
    );
    clickOn('dup');
    clock.now += RECORDING_LIMITS.dblclickWindowMs + 1;
    clickOn('ok');
    expect(rt.recorded()).toBe(1);
    expect(rt.refused()).toEqual({ count: 1, last: 'ambiguous' });
  });

  it('a success followed by a refusal keeps both facts', () => {
    const { rt, clock } = recordingOn(
      '<button id="ok">Publish</button><button id="dup">Save</button><button>Save</button>',
    );
    clickOn('ok');
    clock.now += RECORDING_LIMITS.dblclickWindowMs + 1;
    clickOn('dup');
    expect(rt.recorded()).toBe(1);
    expect(rt.refused().count).toBe(1);
  });

  it('repeated refusals accumulate and keep the most recent reason', () => {
    const { rt, clock } = recordingOn('<button id="dup">Save</button><button>Save</button>');
    clickOn('dup');
    clock.now += RECORDING_LIMITS.dblclickWindowMs + 1;
    clickOn('dup');
    expect(rt.refused().count).toBe(2);
    expect(rt.refused().last).toBe('ambiguous');
  });

  it('the noise filter is NOT reported as a refusal', () => {
    // A click on a text input returns `null` from `stepForClick` because the
    // FILL owns that element. Nothing was refused — the intent is recorded by
    // the other event — so counting it would invent a failure.
    const { rt } = recordingOn('<input id="t" type="text" />');
    clickOn('t');
    expect(rt.refused(), 'noise is not refusal').toEqual({ count: 0, last: null });
  });

  it('an inactive runtime refuses nothing because it is not listening', () => {
    setBody('<button id="b">Save</button><button>Save</button>');
    const { rt } = runtimeOver(document, T0);
    clickOn('b');
    expect(rt.refused()).toEqual({ count: 0, last: null });
  });
});
