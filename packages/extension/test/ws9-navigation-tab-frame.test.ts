// @vitest-environment happy-dom
/**
 * WS9 — NAVIGATION · SPA · FRAME · TAB semantics.
 * ============================================================================
 * THE QUESTION: what happens to a live recording when the browsing context
 * changes underneath it?
 *
 * Most of the answer already existed and is PINNED here rather than rebuilt.
 * The lifecycle derives liveness from the clock, identity is an opaque session
 * id every mutating entry point checks, and WS4 owns tab-scoped storage and its
 * cleanup. Those three facts already make full navigation, content-script
 * replacement and tab close behave correctly, and this file proves it instead of
 * assuming it.
 *
 * Three genuine gaps were MEASURED, and only those are changed:
 *
 *   GAP 1 — THE PANEL DOES NOT SAY WHICH TAB IT MEANS.
 *       `START_RECORDING`, `STOP_RECORDING` and `QUERY_RECORDING_STATE` all
 *       accept an optional `targetTabId`, and `background.ts` prefers it. The
 *       panel sent none of the three, so every recording message fell through to
 *       the background's `tabs.query({active: true})` fallback — a SECOND
 *       active-tab lookup, one the panel's own `panel.pick.tabId` binding does
 *       not control. The panel therefore read DURABLE state for the bound tab
 *       while asking a possibly DIFFERENT tab for LIVE state.
 *
 *   GAP 2 — A FRAME-SCOPED RECORDING CARRIES AN UNMEASURED SELECTOR.
 *       `resolveCandidates` passes `detectFrameInfo(win)` into
 *       `buildLocatorChain`, so `chain.frameSelector` is set for an in-frame
 *       element, and `generateLocatorCode` faithfully prepends
 *       `page.frameLocator(...)`. But that selector is GUESSED — `detectFrameInfo`
 *       falls back to `iframe[src*="…"]`, `iframe[name="…"]` or the bare literal
 *       `'iframe'`, and nothing measures it, because the frame's own document is
 *       the only thing its `LiveDomProbe` can see. Meanwhile `verdict`,
 *       `matchCount` and `visibleMatchCount` describe the chain WITHOUT the frame
 *       prefix. The result is a step that looks verified and whose frame half
 *       carries no evidence at all — RULE 7 and RULE 8, violated in the one place
 *       the product least wants it.
 *
 *   GAP 3 — EVERY FRAME RAN ITS OWN RECORDER.
 *       The content script is injected with `allFrames: true` and
 *       `tabs.sendMessage(tabId, …)` carries no `frameId`, so a START reached
 *       every frame, each minted its own session, and each published to the one
 *       tab-scoped storage key. Whichever frame wrote last became "the"
 *       recording, and the id the panel held could stop only one of them.
 *
 * WHAT IS DELIBERATELY NOT DONE. No `webNavigation` permission, no `tabs`
 * permission, no navigation listener, no `history` monkey-patching, no second
 * staleness algorithm, no second session state machine, no second active-tab
 * lookup, no frame model, and no UNVERIFIED step. Frame interaction is
 * classified as UNRECORDABLE and refused, which the gate names as an acceptable
 * outcome.
 *
 * EVIDENCE BOUNDARY. happy-dom with real event dispatch, the real
 * `captureSnapshot`, the real `LiveDomProbe` and the real resolver — including a
 * real `<iframe>` whose `self !== top`, so the frame path below is the
 * production path and not a stand-in. happy-dom is NOT Chromium: it has no
 * layout engine (see `layout-stub.ts`). **Real Chromium was not run and nothing
 * here claims otherwise.**
 */
import { describe, expect, it } from 'vitest';

import { RECORDING_LIMITS } from '../src/config/recording';
import { renderSpecFile } from '../src/recording/render';
import { resolveRecordingView } from '../src/recording/reconcile';
import {
  heartbeat,
  mintSessionId,
  recordAction,
  requestActivation,
  acknowledgeActivation,
} from '../src/recording/session';
import { createRecordingRuntime, type RecordingRuntime } from '../src/runtime/recording';
import { detectFrameInfo } from '../src/runtime/dom-read';
import { RECORDING_OBSERVATION, RECORDING_WORKFLOW, WS4_DESCRIPTORS } from '../src/storage/state';

import { setBody } from './helpers/dom-fixture';
import { stubLayout } from './helpers/layout-stub';
import { readExtFile, stripComments } from './helpers/surface-source';

stubLayout();

const T0 = 3_000_000;
const { heartbeatMs, heartbeatTimeoutMs } = RECORDING_LIMITS;

const code = (rel: string): string => stripComments(readExtFile(rel));

/** A runtime over an explicit document, with an injected clock. */
function runtimeOver(doc: Document, start = T0, seed = 'a') {
  const clock = { now: start };
  let n = 0;
  const rt = createRecordingRuntime({
    doc,
    now: () => clock.now,
    nonce: () => `${seed}${n++}`,
    enabled: true,
  });
  return { rt, clock };
}

function recordingOn(html: string, start = T0, seed = 'a') {
  setBody(html);
  const { rt, clock } = runtimeOver(document, start, seed);
  const started = rt.start(clock.now);
  expect(started.ok, 'fixture must start').toBe(true);
  return { rt, clock, sessionId: started.sessionId! };
}

const clickOn = (id: string, doc: Document = document) =>
  doc.getElementById(id)!.dispatchEvent(
    doc.defaultView
      ? new (doc.defaultView as unknown as Window & typeof globalThis).MouseEvent('click', {
          bubbles: true,
        })
      : new MouseEvent('click', { bubbles: true }),
  );

const steps = (rt: RecordingRuntime) => rt.workflow()?.steps ?? [];

/**
 * A REAL frame: happy-dom gives a genuine `contentDocument` whose window
 * reports `self !== top`, which is exactly the condition `detectFrameInfo`
 * keys on. Nothing here is stubbed.
 */
function frameDocument(html: string): Document {
  setBody('<iframe id="child"></iframe>');
  const el = document.getElementById('child') as HTMLIFrameElement;
  const doc = el.contentDocument!;
  doc.write(`<!doctype html><html><body>${html}</body></html>`);
  return doc;
}

// ═══ A · FULL PAGE NAVIGATION ═══════════════════════════════════════════════

describe('NAV-01 — a full navigation replaces the content session, and the replacement is inactive', () => {
  it('the new content script starts with no session at all', () => {
    // A full document navigation destroys the content script and injects a new
    // one. The new instance constructs a new runtime with `session = null`, so
    // the honest answer to QUERY_RECORDING_STATE is `inactive` — not `active`,
    // and not the previous session's state, which no longer exists anywhere.
    const before = recordingOn('<button id="b">Save</button>');
    clickOn('b');
    expect(before.rt.state(before.clock.now)).toBe('active');
    expect(steps(before.rt).length).toBeGreaterThan(0);

    // The replacement. A NEW runtime over a NEW document is what navigation
    // actually produces; nothing is carried across.
    setBody('<button id="b">Save</button>');
    const after = runtimeOver(document, before.clock.now + 10);
    expect(after.rt.state(after.clock.now), 'a fresh content script is never recording').toBe(
      'inactive',
    );
    expect(after.rt.workflow(), 'and holds no workflow of its own').toBeNull();
  });
});

describe('NAV-02 — a replacement content script cannot accept the old session id', () => {
  it('rejects a stop presented with the previous session id', () => {
    const before = recordingOn('<button id="b">Save</button>');
    const after = runtimeOver(document, before.clock.now + 10);
    const stopped = after.rt.stop(before.sessionId, after.clock.now);
    expect(stopped.ok).toBe(false);
    expect(stopped.error, 'there is no session to be wrong about').toBe('no-session');
  });

  it('and a NEW start mints a different id rather than resuming the old one', () => {
    const before = recordingOn('<button id="b">Save</button>', T0, 'a');
    const after = runtimeOver(document, before.clock.now + 10, 'b');
    const restarted = after.rt.start(after.clock.now);
    expect(restarted.ok).toBe(true);
    expect(restarted.sessionId).not.toBe(before.sessionId);
  });
});

describe('NAV-03 — the workflow survives navigation only where the architecture already puts it', () => {
  it('does not survive in content-script memory', () => {
    const before = recordingOn('<button id="b">Save</button>');
    clickOn('b');
    expect(steps(before.rt).length).toBe(1);

    const after = runtimeOver(document, before.clock.now + 10);
    expect(after.rt.workflow(), 'a new content script inherits nothing').toBeNull();
  });

  it('survives durably, because WS4 owns it per tab and the runtime published it', () => {
    // The recording is not lost by a navigation: `PERSIST_RECORDING_STATE`
    // already wrote it to the tab-scoped `recording-workflow` descriptor, which
    // outlives the content script. That is why export and the workspace can
    // still show a recording whose recorder is gone (DL-79's rule that lifecycle
    // and workflow existence are different facts).
    const published: unknown[] = [];
    const clock = { now: T0 };
    let n = 0;
    setBody('<button id="b">Save</button>');
    const rt = createRecordingRuntime({
      doc: document,
      now: () => clock.now,
      nonce: () => `p${n++}`,
      enabled: true,
      persist: (payload) => published.push(payload),
    });
    rt.start(clock.now);
    clickOn('b');
    const withWorkflow = published.filter(
      (p) => (p as { workflow?: unknown }).workflow !== undefined,
    );
    expect(withWorkflow.length, 'the recording was handed to its durable owner').toBeGreaterThan(0);
    expect(RECORDING_WORKFLOW.scope).toBe('tab');
    expect(RECORDING_WORKFLOW.area).toBe('session');
  });
});

// ═══ B · SPA NAVIGATION ═════════════════════════════════════════════════════

describe('NAV-04/05/06 — an SPA route change does not end the recording session', () => {
  /**
   * The distinction the gate asks for: SESSION lifetime versus ELEMENT-FACT
   * lifetime. `history.pushState`, `replaceState`, `popstate` and `hashchange`
   * do not replace the document, so the content script, its listeners and its
   * session are all still there. Ending the recording on a route change would
   * discard a recording the user never asked to end, and would need a signal the
   * extension cannot obtain without a new permission or patching page globals.
   *
   * Nothing is monkey-patched and no navigation listener exists; these tests
   * drive the real APIs happy-dom implements and assert the session is untouched.
   */
  it('survives pushState', () => {
    const { rt, clock } = recordingOn('<button id="b">Save</button>');
    clickOn('b');
    history.pushState({}, '', '/route-two');
    expect(rt.state(clock.now)).toBe('active');

    // Past the double-click window before the second click. Two clicks on one
    // element inside `dblclickWindowMs` are legitimately COALESCED into a single
    // `dblclick` by `appendStep` — a rule that has nothing to do with navigation.
    // Without this the assertion below would fail for that reason and be read as
    // a navigation defect, which is the wrong lesson from a red test.
    clock.now += RECORDING_LIMITS.dblclickWindowMs + 1;
    clickOn('b');
    expect(steps(rt).length, 'capture continues after the route change').toBe(2);
  });

  it('survives replaceState', () => {
    const { rt, clock } = recordingOn('<button id="b">Save</button>');
    history.replaceState({}, '', '/route-three');
    expect(rt.state(clock.now)).toBe('active');
    clickOn('b');
    expect(steps(rt).length).toBe(1);
  });

  it('survives popstate and hashchange', () => {
    const { rt, clock } = recordingOn('<button id="b">Save</button>');
    window.dispatchEvent(new Event('popstate'));
    window.dispatchEvent(new Event('hashchange'));
    expect(rt.state(clock.now)).toBe('active');
    clickOn('b');
    expect(steps(rt).length).toBe(1);
  });

  it('and no navigation signal is subscribed to anywhere in the recording path', () => {
    // The reason the three tests above are honest rather than lucky: there is no
    // listener that could have ended the session, and none is added by this
    // slice. A `webNavigation`/`tabs` permission would be required for a real
    // navigation signal in the panel, and this slice adds neither.
    for (const rel of [
      'src/runtime/recording.ts',
      'src/recording/session.ts',
      'entrypoints/sidepanel/RecordingControl.tsx',
    ]) {
      const src = code(rel);
      for (const api of ['webNavigation', 'onNavigated', 'popstate', 'hashchange', 'pushState']) {
        expect(src, `${rel} must not subscribe to ${api}`).not.toContain(api);
      }
    }
  });
});

describe('NAV-07 — an action after a route change is resolved against the CURRENT DOM', () => {
  it('re-resolves per action and retains no element reference between actions', () => {
    const { rt, clock } = recordingOn('<button id="one">Alpha</button>');
    clickOn('one');

    // The route changed and the view was replaced — the classic SPA transition.
    history.pushState({}, '', '/second');
    setBody('<button id="two">Beta</button>');
    clickOn('two');

    const captured = steps(rt);
    expect(captured.length).toBe(2);
    const first = JSON.stringify(captured[0]!.target!.locator.chain);
    const second = JSON.stringify(captured[1]!.target!.locator.chain);
    expect(second, 'the second action described the element that existed then').not.toBe(first);
    expect(rt.state(clock.now)).toBe('active');
  });

  it('the recorder holds no cached element, snapshot or probe across actions', () => {
    const recorder = code('src/runtime/recorder.ts');
    expect(recorder, 'every step calls captureSnapshot afresh').toContain('captureSnapshot(el)');
    expect(recorder, 'and nothing is memoised between actions').not.toMatch(
      /\b(cache|memo|lastElement|lastSnapshot)\b/i,
    );
  });
});

// ═══ C · FRAME / IFRAME ═════════════════════════════════════════════════════

describe('NAV-08 — an in-frame action is UNRECORDABLE and is refused', () => {
  it('the frame selector the engine would use is a guess, never a measurement', () => {
    // This is the evidence for the refusal, taken from the production function.
    // `detectFrameInfo` reads the frame's own window and falls back to shapes
    // like `iframe[src*="…"]` — or the bare literal `'iframe'` — none of which is
    // ever resolved or counted, because the frame's `LiveDomProbe` cannot see the
    // parent document that contains the `<iframe>` element.
    const doc = frameDocument('<button id="b">Save</button>');
    const info = detectFrameInfo(doc.defaultView as unknown as Window);
    expect(info, 'happy-dom gives a real sub-frame window').not.toBeNull();
    expect(typeof info!.frameSelector).toBe('string');
    expect(
      (info as unknown as Record<string, unknown>).verdict,
      'a frame selector carries no verdict',
    ).toBeUndefined();
    expect(
      (info as unknown as Record<string, unknown>).visibleMatchCount,
      'and no measured count',
    ).toBeUndefined();
  });

  it('records nothing for a click inside a frame', () => {
    const doc = frameDocument('<button id="b">Save</button>');
    const { rt, clock } = runtimeOver(doc, T0, 'f');
    expect(rt.start(clock.now).ok).toBe(true);
    clickOn('b', doc);
    expect(
      steps(rt),
      'a frame action cannot be verified end to end, so it is not recorded',
    ).toEqual([]);
    expect(rt.state(clock.now), 'and refusing one action does not end the session').toBe('active');
  });
});

describe('NAV-09 — a frame target is never flattened, and never rendered', () => {
  it('no recorded step may carry a frameSelector', () => {
    const doc = frameDocument('<button id="b">Save</button>');
    const { rt, clock } = runtimeOver(doc, T0, 'g');
    rt.start(clock.now);
    clickOn('b', doc);
    for (const step of steps(rt)) {
      expect(step.target?.locator.chain.frameSelector, 'refused before it could be stored').toBe(
        undefined,
      );
    }
  });

  it('and a rendered recording therefore never emits frameLocator', () => {
    // The flattening risk runs the other way too: `generateLocatorCode` FAITHFULLY
    // prepends `page.frameLocator(<selector>)` whenever the chain carries one, so
    // an admitted frame step would have produced a locator whose frame half was
    // invented. Refusing at admission is what makes this assertion true for every
    // language at once, rather than teaching the renderer to hide the problem.
    const doc = frameDocument('<button id="b">Save</button>');
    const { rt, clock } = runtimeOver(doc, T0, 'h');
    rt.start(clock.now);
    clickOn('b', doc);
    rt.stop(rt.workflow()!.id, clock.now);
    for (const lang of ['typescript', 'python_sync', 'java', 'csharp_async'] as const) {
      const rendered = renderSpecFile(rt.workflow()!, lang);
      expect(rendered, `${lang} must not contain a fabricated frame prefix`).not.toMatch(
        /frameLocator|frame_locator|FrameLocator/,
      );
    }
  });

  it('and the top-level path is unaffected — this refuses frames, not recording', () => {
    const { rt } = recordingOn('<button id="b">Save</button>');
    clickOn('b');
    expect(steps(rt).length, 'a top-frame click still records').toBe(1);
  });
});

describe('NAV-21 — only the top frame answers a recording message', () => {
  it('the content entrypoint refuses recording messages from a sub-frame', () => {
    // `allFrames: true` plus a `tabs.sendMessage` with no `frameId` means a START
    // reached EVERY frame, each minted its own session, and each published to the
    // one tab-scoped key — so the last frame to write became "the" recording and
    // the panel's id could stop only one of them. Exactly one responder is the
    // fix, and it costs one comparison and no permission.
    const content = code('entrypoints/content.ts');
    expect(content, 'the top-frame test must exist').toMatch(
      /window\.top|self\s*===\s*top|isTopFrame/,
    );
    for (const type of ['START_RECORDING', 'STOP_RECORDING', 'QUERY_RECORDING_STATE']) {
      expect(content, `${type} must be gated on the top frame`).toContain(type);
    }
    expect(content, 'and the gate is named, not inlined three times').toContain('isTopFrame');
  });
});

// ═══ D/E · TAB OWNERSHIP AND TAB SWITCHING ══════════════════════════════════

describe('NAV-10 — a recording stays bound to the tab the panel is bound to', () => {
  it('every recording message the panel sends names its target tab', () => {
    // `StartRecordingMessage`, `StopRecordingMessage` and
    // `QueryRecordingStateMessage` all already carry an optional `targetTabId`,
    // and `background.ts` prefers it over any fallback. The panel simply did not
    // set it, so the background resolved the tab by asking which one was ACTIVE.
    const control = code('entrypoints/sidepanel/RecordingControl.tsx');
    for (const type of ['START_RECORDING', 'STOP_RECORDING', 'QUERY_RECORDING_STATE']) {
      const at = control.indexOf(type);
      expect(at, `${type} must still be sent`).toBeGreaterThan(-1);
      const message = control.slice(Math.max(0, at - 200), at + 200);
      expect(message, `${type} must name the tab it means`).toContain('targetTabId');
    }
  });
});

describe('NAV-11 — one tab cannot mutate another tab’s recording', () => {
  it('the durable write takes its tab identity from the sender, never from the message', () => {
    const background = code('entrypoints/background.ts');
    expect(background).toContain('contentSenderTabId(sender)');
    // PERSIST_RECORDING_STATE must not read a tab id out of the payload — that
    // would let a page choose whose recording it overwrites.
    const at = background.indexOf("message.type === 'PERSIST_RECORDING_STATE'");
    expect(at).toBeGreaterThan(-1);
    const branch = background.slice(at, background.indexOf('if (message.type', at + 10));
    expect(branch, 'the payload may not supply a tab').not.toMatch(/message\.targetTabId/);
    expect(branch, 'and an unidentifiable sender is refused').toContain('UNTRUSTED_SENDER');
  });

  it('a foreign session id is refused by the lifecycle itself', () => {
    const mine = mintSessionId({ at: T0, nonce: 'mine' });
    const theirs = mintSessionId({ at: T0, nonce: 'theirs' });
    const session = acknowledgeActivation(
      requestActivation({ id: mine, url: 'https://a.example/', at: T0 }),
      mine,
      T0,
    ).session;

    expect(heartbeat(session, theirs, T0 + heartbeatMs).outcome).toBe('rejected-wrong-session');
    expect(
      recordAction(session, theirs, { kind: 'click', timestamp: T0 + 1 }, T0 + 1).outcome,
    ).toBe('rejected-wrong-session');
  });
});

describe('NAV-12 — the panel bound to tab A never displays tab B', () => {
  it('the live query is addressed to the bound tab, not to whichever tab is active', () => {
    const control = code('entrypoints/sidepanel/RecordingControl.tsx');
    const at = control.indexOf('QUERY_RECORDING_STATE');
    const send = control.slice(Math.max(0, at - 300), at + 300);
    expect(send, 'the query must carry the bound tab').toContain('targetTabId');
    expect(send, 'and it comes from the panel binding, not a lookup').toMatch(/tabId/);
  });

  it('fails closed when the panel has no tab yet, rather than falling back to the active tab', () => {
    // `panel.pick.tabId` is `null` until the binding resolves. Sending an
    // unaddressed message then would re-enter the active-tab fallback, which is
    // the whole defect. `unknown` is the honest answer, and `unknown` never
    // reads as recording.
    const control = code('entrypoints/sidepanel/RecordingControl.tsx');
    expect(control, 'a null tab must short-circuit before any send').toMatch(
      /tabId\s*===\s*null|tabId == null|!== null|typeof .*tabId/,
    );
  });

  it('and durable evidence still cannot promote itself over live evidence', () => {
    const durableActive = {
      valid: true as const,
      value: {
        schemaVersion: 1 as const,
        sessionId: 's',
        lifecycle: 'active' as const,
        startedAt: T0,
        lastHeartbeatAt: T0,
      },
    };
    expect(
      resolveRecordingView({
        live: { ok: true, lifecycle: 'stale' },
        durable: durableActive,
        now: T0,
      }),
      'live authority wins',
    ).toBe('stale');
  });
});

describe('NAV-18 — no second active-tab lookup is introduced', () => {
  it('the panel performs no tab query of its own', () => {
    const control = code('entrypoints/sidepanel/RecordingControl.tsx');
    for (const api of ['tabs.query', 'tabs.getCurrent', 'activeTab', 'lastFocusedWindow']) {
      expect(control, `the panel must not look up a tab via ${api}`).not.toContain(api);
    }
  });

  it('and the background keeps exactly the one pre-existing fallback', () => {
    // Not removed: `ACTIVATE_PICKER`/`DEACTIVATE_PICKER` legitimately rely on it,
    // and deleting it would be an unrelated behaviour change. Pinned at one so
    // this slice cannot be read as having added another.
    const background = code('entrypoints/background.ts');
    expect([...background.matchAll(/tabs\s*\n?\s*\.query\(\{\s*active:\s*true/g)]).toHaveLength(1);
  });
});

// ═══ F · TAB CLOSE ══════════════════════════════════════════════════════════

describe('NAV-13 — tab close cleanup is WS4’s, and is not duplicated', () => {
  it('both recording descriptors are tab-scoped session state, so clearTab reaches them', () => {
    for (const descriptor of [RECORDING_OBSERVATION, RECORDING_WORKFLOW]) {
      expect(descriptor.scope).toBe('tab');
      expect(descriptor.area).toBe('session');
    }
    expect(WS4_DESCRIPTORS).toContain(RECORDING_OBSERVATION);
    expect(WS4_DESCRIPTORS).toContain(RECORDING_WORKFLOW);
  });

  it('the one cleanup listener is the existing WS4 one', () => {
    const background = code('entrypoints/background.ts');
    expect([...background.matchAll(/tabs\.onRemoved\.addListener/g)]).toHaveLength(1);
    expect(background).toContain('storageGateway.clearTab(tabId)');
    expect(background, 'and no recording-specific cleanup was added beside it').not.toMatch(
      /clearRecording|removeRecording|purgeRecording/,
    );
  });
});

// ═══ G · CONTENT SCRIPT REPLACEMENT ═════════════════════════════════════════

describe('NAV-14 — a stale durable ACTIVE never overrides live evidence', () => {
  const durableActive = {
    valid: true as const,
    value: {
      schemaVersion: 1 as const,
      sessionId: 's',
      lifecycle: 'active' as const,
      startedAt: T0,
      lastHeartbeatAt: T0,
    },
  };

  it('a live INACTIVE from a replacement content script wins', () => {
    expect(
      resolveRecordingView({
        live: { ok: true, lifecycle: 'inactive' },
        durable: durableActive,
        now: T0,
      }),
    ).toBe('inactive');
  });

  it('and when there is no live answer at all, the durable record ages out on its own clock', () => {
    expect(
      resolveRecordingView({
        live: null,
        durable: durableActive,
        now: T0 + heartbeatTimeoutMs + 1,
      }),
      'silence becomes stale, never active',
    ).toBe('stale');
  });
});

describe('NAV-15 — a recreated content script fails closed', () => {
  it('inherits no authority from durable storage', () => {
    // The structural reason: the runtime is one-way. It PUBLISHES its state and
    // never reads any back, so no stored record can tell a fresh runtime that it
    // is recording.
    const runtime = code('src/runtime/recording.ts');
    expect(runtime, 'the sink is write-only').toContain('options.persist');
    for (const reader of ['readTab', 'readGlobal', 'storage.', 'RECORDING_OBSERVATION']) {
      expect(runtime, `the runtime must not read ${reader}`).not.toContain(reader);
    }
  });

  it('and reports inactive, which no consumer may read as recording', () => {
    const { rt, clock } = runtimeOver(document, T0);
    expect(rt.state(clock.now)).toBe('inactive');
  });
});

describe('NAV-16 — a beat from a dead session is rejected', () => {
  it('refuses a heartbeat that arrives after the timeout', () => {
    const id = mintSessionId({ at: T0, nonce: 'x' });
    const session = acknowledgeActivation(
      requestActivation({ id, url: 'https://a.example/', at: T0 }),
      id,
      T0,
    ).session;
    const late = heartbeat(session, id, T0 + heartbeatTimeoutMs + 1);
    expect(late.outcome).toBe('rejected-not-active');
    expect(late.session.state, 'staleness is terminal').toBe('stale');
  });
});

describe('NAV-17 — a new session cannot mutate the previous workflow', () => {
  it('an action naming the old session is refused by the new one', () => {
    const oldId = mintSessionId({ at: T0, nonce: 'old' });
    const newId = mintSessionId({ at: T0, nonce: 'new' });
    const fresh = acknowledgeActivation(
      requestActivation({ id: newId, url: 'https://a.example/', at: T0 }),
      newId,
      T0,
    ).session;

    const result = recordAction(fresh, oldId, { kind: 'click', timestamp: T0 + 1 }, T0 + 1);
    expect(result.outcome).toBe('rejected-wrong-session');
    expect(result.session.workflow.steps, 'nothing entered the new workflow').toEqual([]);
  });
});

// ═══ ARCHITECTURAL NON-DUPLICATION ══════════════════════════════════════════

describe('NAV-19 — no second session state machine', () => {
  it('`state: ‘active’` is still assigned in exactly one place', () => {
    const session = code('src/recording/session.ts');
    expect([...session.matchAll(/state:\s*'active'/g)]).toHaveLength(1);
  });

  it('and nothing outside session.ts declares a lifecycle transition table', () => {
    for (const rel of [
      'src/runtime/recording.ts',
      'src/recording/reconcile.ts',
      'src/recording/lifecycle-view.ts',
      'entrypoints/content.ts',
      'entrypoints/sidepanel/RecordingControl.tsx',
    ]) {
      const src = code(rel);
      expect(src, `${rel} must not mint its own session id`).not.toContain('__brand');
      expect(src, `${rel} must not assign an active state`).not.toMatch(/state:\s*'active'/);
    }
  });
});

describe('NAV-20 — no second locator resolver or DOM probe', () => {
  it('the recording modules construct neither', () => {
    for (const rel of [
      'src/runtime/recording.ts',
      'src/recording/session.ts',
      'src/recording/workflow.ts',
      'src/recording/render.ts',
      'entrypoints/sidepanel/RecordingControl.tsx',
    ]) {
      const src = code(rel);
      for (const forbidden of ['new LiveDomProbe', 'resolveChain(', 'resolveStep(', 'DomProbe']) {
        expect(src, `${rel} must not build ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('and the recorder still delegates to the one shared engine', () => {
    const recorder = code('src/runtime/recorder.ts');
    expect(recorder).toContain('captureSnapshot');
    expect(recorder, 'it counts nothing itself').not.toMatch(/querySelectorAll\(|matchCount\s*=/);
  });
});

// ═══ NO NEW PERMISSION ══════════════════════════════════════════════════════

describe('this slice adds no permission', () => {
  it('the manifest is unchanged in the ways that would matter', () => {
    const config = readExtFile('wxt.config.ts');
    expect(config).toContain("permissions: ['activeTab', 'storage', 'scripting', 'sidePanel']");
    for (const perm of ['webNavigation', "'tabs'", 'declarativeNetRequest']) {
      expect(config, `${perm} must not be requested`).not.toContain(perm);
    }
  });
});
