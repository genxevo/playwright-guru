// @vitest-environment happy-dom
/**
 * WS9 slice 3 — the content-side recording RUNTIME: wiring, handshake, capture.
 * ============================================================================
 * WHAT THIS SLICE IS.
 *
 * Slice 1 (DL-72) built the recording engine and slice 2 (DL-73) built the
 * lifecycle, and neither was reachable: nothing called them. This is the wiring
 * that makes recording actually happen — a real `START_RECORDING`, real DOM
 * listeners, and real actions flowing through the existing capture path.
 *
 * THE ADMISSION RULE, which is the reason this file is mostly about refusals.
 *
 * A browser action does NOT become a recorded action merely because an element
 * was clicked. The element goes through the SAME `captureSnapshot` →
 * `LiveDomProbe` → `resolveChain` path the Pick feature uses, and the resulting
 * verdict decides:
 *
 *     excellent / good  → exactly one visible match → RECORD
 *     ambiguous         → more than one match       → DO NOT RECORD
 *     no-match          → zero                      → DO NOT RECORD
 *     unknown           → not measured              → DO NOT RECORD
 *
 * There is no CSS fallback, no XPath fallback, no `.nth(0)` rescue, no guessed
 * text and no "best effort recorder selector". **Not recording is the correct
 * outcome** when the locator engine cannot produce a trustworthy answer — a
 * recorded step the user cannot replay is worse than a step that was never
 * recorded, because it looks like it works.
 *
 * FAIL-CLOSED AT EVERY LAYER. An event is captured only when the runtime holds a
 * session that `isRecording` says is live right now. Inactive, starting, stale,
 * stopped and foreign-session all refuse, and refuse silently rather than
 * throwing into the page.
 *
 * EVIDENCE BOUNDARY. happy-dom with real event dispatch, the real
 * `captureSnapshot`, the real `LiveDomProbe` and the real resolver — the same
 * pipeline production uses, not a stand-in. happy-dom is **not** Chromium: it
 * has no layout engine, so every element reads as visible. **Real Chromium was
 * not run and nothing here claims otherwise.**
 *
 * NOT IN THIS SLICE: persistence, UI, renderers, export, workspace,
 * navigation/SPA/frame/tab, and `RECORDING_ENABLED` stays `false`.
 */
import { describe, expect, it } from 'vitest';

import { RECORDING_LIMITS } from '../src/config/recording';
import { createRecordingRuntime, type RecordingRuntime } from '../src/runtime/recording';
import { setBody } from './helpers/dom-fixture';
import { stubLayout } from './helpers/layout-stub';

stubLayout();

const T0 = 2_000_000;
const { heartbeatMs, heartbeatTimeoutMs, maxValueLength, hardStop } = RECORDING_LIMITS;

/**
 * A runtime with an injected clock, so no test depends on real timers.
 *
 * `enabled: true` is passed explicitly. The option defaults to
 * `RECORDING_ENABLED`, which is still `false` in the product — so these tests
 * exercise the runtime without the slice quietly turning the feature on, and
 * the default is itself asserted below.
 */
function runtimeAt(start = T0): { rt: RecordingRuntime; clock: { now: number } } {
  const clock = { now: start };
  let n = 0;
  const rt = createRecordingRuntime({
    doc: document,
    now: () => clock.now,
    nonce: () => `n${n++}`,
    enabled: true,
  });
  return { rt, clock };
}

/** Starts a runtime and returns it already recording. */
function recording(html: string, start = T0) {
  setBody(html);
  const { rt, clock } = runtimeAt(start);
  const started = rt.start(clock.now);
  expect(started.ok, 'fixture must start').toBe(true);
  return { rt, clock, sessionId: started.sessionId! };
}

const clickOn = (id: string) =>
  document.getElementById(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

const steps = (rt: RecordingRuntime) => rt.workflow()?.steps ?? [];

// ─── 1. Activation — the handshake, end to end ─────────────────────────────

describe('WS9 · the runtime starts inactive and only records after a real start', () => {
  it('is inactive before anything happens, and holds no workflow', () => {
    setBody('<button id="b">Save</button>');
    const { rt, clock } = runtimeAt();
    expect(rt.state(clock.now)).toBe('inactive');
    expect(rt.workflow()).toBeNull();
  });

  it('ignores events entirely while inactive — no listeners, no capture', () => {
    setBody('<button id="b">Save</button>');
    const { rt, clock } = runtimeAt();
    clickOn('b');
    expect(rt.state(clock.now)).toBe('inactive');
    expect(rt.workflow()).toBeNull();
  });

  it('start() completes the handshake and returns the opaque session id', () => {
    setBody('<button id="b">Save</button>');
    const { rt, clock } = runtimeAt();
    const result = rt.start(clock.now);

    expect(result.ok).toBe(true);
    expect(typeof result.sessionId).toBe('string');
    expect(result.sessionId).not.toBe('');
    expect(rt.state(clock.now), 'the content side acknowledges its own activation').toBe('active');
  });

  it('a duplicate start is deterministic and does not silently fork a session', () => {
    setBody('<button id="b">Save</button>');
    const { rt, clock } = runtimeAt();
    const first = rt.start(clock.now);
    const second = rt.start(clock.now + 10);

    expect(second.ok).toBe(true);
    expect(second.sessionId, 'the live session is kept, not replaced').toBe(first.sessionId);
    expect(rt.state(clock.now + 10)).toBe('active');
  });

  it('captures nothing until start, then captures after it', () => {
    const html = '<button id="b" data-testid="save">Save</button>';
    setBody(html);
    const { rt, clock } = runtimeAt();

    clickOn('b');
    expect(rt.workflow()).toBeNull();

    rt.start(clock.now);
    clickOn('b');
    expect(steps(rt)).toHaveLength(1);
    expect(steps(rt)[0]?.kind).toBe('click');
  });
});

// ─── 2. Session identity governs stop ──────────────────────────────────────

describe('WS9 · only the current session can stop the recording', () => {
  it('stop with the right id ends it, and later events are ignored', () => {
    const { rt, clock, sessionId } = recording('<button id="b" data-testid="s">Save</button>');
    clickOn('b');
    expect(steps(rt)).toHaveLength(1);

    const stopped = rt.stop(sessionId, clock.now + 1_000);
    expect(stopped.ok).toBe(true);
    expect(rt.state(clock.now + 1_000)).toBe('stopped');

    clickOn('b');
    expect(steps(rt), 'a click after stop must not be recorded').toHaveLength(1);
  });

  it('stop with a FOREIGN id is refused, and recording continues', () => {
    const { rt, clock, sessionId } = recording('<button id="b" data-testid="s">Save</button>');
    const result = rt.stop(`${sessionId}-tampered`, clock.now + 100);

    expect(result.ok).toBe(false);
    expect(rt.state(clock.now + 100), 'a stale stop must not end a live recording').toBe('active');

    clickOn('b');
    expect(steps(rt)).toHaveLength(1);
  });

  it('a duplicate stop is deterministic', () => {
    const { rt, clock, sessionId } = recording('<button id="b" data-testid="s">Save</button>');
    expect(rt.stop(sessionId, clock.now + 100).ok).toBe(true);
    const again = rt.stop(sessionId, clock.now + 200);
    expect(again.ok).toBe(true);
    expect(rt.state(clock.now + 200)).toBe('stopped');
  });

  it('a session id from a previous recording cannot stop the next one', () => {
    const {
      rt,
      clock,
      sessionId: first,
    } = recording('<button id="b" data-testid="s">Save</button>');
    rt.stop(first, clock.now + 100);

    clock.now += 1_000;
    const second = rt.start(clock.now).sessionId!;
    expect(second).not.toBe(first);

    expect(rt.stop(first, clock.now + 10).ok, 'the old id is foreign now').toBe(false);
    expect(rt.state(clock.now + 10)).toBe('active');
    expect(rt.stop(second, clock.now + 20).ok).toBe(true);
  });
});

// ─── 3. Heartbeat and staleness — fail-closed capture ──────────────────────

describe('WS9 · a silent runtime stops capturing, without anyone telling it to', () => {
  it('goes stale after the timeout and refuses further events', () => {
    const { rt, clock } = recording('<button id="b" data-testid="s">Save</button>');
    clickOn('b');
    expect(steps(rt)).toHaveLength(1);

    // No ticks: the runtime is silent for longer than the timeout allows.
    clock.now += heartbeatTimeoutMs + 1;
    expect(rt.state(clock.now)).toBe('stale');

    clickOn('b');
    expect(steps(rt), 'a stale runtime must capture nothing').toHaveLength(1);
  });

  it('ticking keeps a long recording alive across many timeouts', () => {
    const { rt, clock } = recording('<button id="b" data-testid="s">Save</button>');
    for (let i = 1; i <= 10; i++) {
      clock.now += heartbeatMs;
      rt.tick(clock.now);
      expect(rt.state(clock.now)).toBe('active');
    }
    clock.now += 1;
    clickOn('b');
    expect(steps(rt)).toHaveLength(1);
  });

  it('a tick after the session went stale does not resurrect it', () => {
    const { rt, clock } = recording('<button id="b" data-testid="s">Save</button>');
    clock.now += heartbeatTimeoutMs + 1;
    rt.tick(clock.now);
    expect(rt.state(clock.now)).toBe('stale');

    clock.now += heartbeatMs;
    rt.tick(clock.now);
    expect(rt.state(clock.now), 'staleness is terminal').toBe('stale');
    clickOn('b');
    expect(steps(rt)).toHaveLength(0);
  });

  it('a tick after stop does not restart anything', () => {
    const { rt, clock, sessionId } = recording('<button id="b" data-testid="s">Save</button>');
    rt.stop(sessionId, clock.now + 10);
    clock.now += 20;
    rt.tick(clock.now);
    expect(rt.state(clock.now)).toBe('stopped');
  });
});

// ─── 4. THE ADMISSION RULE — the heart of this slice ───────────────────────

describe('WS9 · an action is recorded only when the locator engine can be trusted', () => {
  it('records a click whose element resolves to EXACTLY ONE match', () => {
    const { rt } = recording('<div><button id="b" data-testid="save">Save</button></div>');
    clickOn('b');

    const step = steps(rt)[0];
    expect(step?.kind).toBe('click');
    expect(step?.target?.locator.visibleMatchCount).toBe(1);
    expect(['excellent', 'good']).toContain(step?.target?.locator.verdict);
  });

  it('records NOTHING when the element is AMBIGUOUS', () => {
    // Two indistinguishable buttons: no strategy can single one out, so the
    // engine reports ambiguous and the honest outcome is to record nothing.
    const { rt } = recording('<div><button id="b">Go</button><button id="c">Go</button></div>');
    clickOn('b');

    expect(steps(rt), 'ambiguity is not success').toHaveLength(0);
  });

  it('never rescues an ambiguous element with nth(0), CSS or XPath', () => {
    const { rt } = recording('<div><button id="b">Go</button><button id="c">Go</button></div>');
    clickOn('b');

    const serialised = JSON.stringify(rt.workflow());
    expect(serialised).not.toContain('nth');
    expect(serialised).not.toContain('css');
    expect(serialised).not.toContain('xpath');
    expect(serialised).not.toContain('outerHTML');
  });

  it('the nth(0) clause is LOAD-BEARING, not decorative — measured', async () => {
    // MEASURED, and the reason this slice has an admission rule at all.
    //
    // For the ambiguous fixture above, the engine does NOT report ambiguity to
    // its caller. `buildLocatorChain` appends `.nth(0)` to the ambiguous winner
    // (its own module doc says it does), and `resolveChain` then measures that
    // chain as resolving to exactly one element:
    //
    //     verdict            'good'
    //     visibleMatchCount   1
    //     chain.nth           0
    //
    // So the "exactly one visible match" and "verdict is good" clauses BOTH
    // pass. Only `chain.nth !== undefined` refuses it. Without that clause a
    // positional guess would be recorded as a verified result — which is
    // precisely the failure WS6.2 spent two gates removing from verification.
    // This test pins the measurement, so if the engine ever stops appending
    // nth(0) the refusal is re-justified rather than silently weakened.
    const { recordedTargetFor } = await import('../src/runtime/recorder');
    setBody('<div><button id="b">Go</button><button id="c">Go</button></div>');
    const target = recordedTargetFor(document.getElementById('b')!);

    expect(target.locator.chain.nth, 'the engine really does append nth(0)').toBe(0);
    expect(target.locator.visibleMatchCount, 'and it really does measure 1').toBe(1);
    expect(['excellent', 'good']).toContain(target.locator.verdict);
  });

  it('keeps recording the actions it CAN trust, in a page that also has ambiguity', () => {
    // The refusal is per action, not a recording-wide abort.
    const { rt } = recording(
      '<div><button id="a">Go</button><button id="c">Go</button>' +
        '<button id="u" data-testid="unique">Unique</button></div>',
    );
    clickOn('a');
    clickOn('u');

    expect(steps(rt)).toHaveLength(1);
    expect(steps(rt)[0]?.target?.facts.attributes.testId).toBe('unique');
  });

  it('the recorded target is the VERIFIED chain, never a rendered string', () => {
    const { rt } = recording('<button id="b" data-testid="save">Save</button>');
    clickOn('b');

    const step = steps(rt)[0];
    expect(step?.target?.locator.chain.steps.length).toBeGreaterThan(0);
    const serialised = JSON.stringify(rt.workflow());
    expect(serialised).not.toContain('page.getBy');
    expect(serialised).not.toContain('await page');
  });
});

// ─── 5. Privacy — the throwing getter, now through real event dispatch ─────

describe('WS9 · a sensitive value is never read, even on the live capture path', () => {
  /** Makes `.value` fail the test if anything reads it. */
  function bugValue(el: Element, message: string): void {
    Object.defineProperty(el, 'value', {
      configurable: true,
      get() {
        throw new Error(message);
      },
    });
  }

  it('a password field: dispatching a real input event never touches .value', () => {
    const { rt } = recording(
      '<form><label for="p">Password</label><input id="p" type="password" /></form>',
    );
    const input = document.getElementById('p')!;
    bugValue(input, 'the runtime read a password value');

    input.dispatchEvent(new Event('input', { bubbles: true }));

    const step = steps(rt)[0];
    expect(step?.redacted).toBe('password');
    expect(step?.value).toBeUndefined();
    expect(JSON.stringify(rt.workflow())).not.toContain('hunter2');
  });

  it('a file field and a card field are equally untouched', () => {
    const { rt } = recording(
      '<form><input id="f" type="file" /><input id="cc" type="text" autocomplete="cc-number" /></form>',
    );
    const file = document.getElementById('f')!;
    const card = document.getElementById('cc')!;
    bugValue(file, 'the runtime read a file path');
    bugValue(card, 'the runtime read a card number');

    file.dispatchEvent(new Event('input', { bubbles: true }));
    card.dispatchEvent(new Event('input', { bubbles: true }));

    const reasons = steps(rt).map((s) => s.redacted);
    expect(reasons).toContain('file');
    expect(reasons).toContain('payment');
    expect(steps(rt).every((s) => s.value === undefined)).toBe(true);
  });

  it('an ordinary field IS captured — the feature still has to work', () => {
    const { rt } = recording('<input id="e" type="email" name="email" data-testid="email" />');
    const input = document.getElementById('e') as HTMLInputElement;
    input.value = 'user@example.test';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(steps(rt)[0]?.value).toBe('user@example.test');
    expect(steps(rt)[0]?.redacted).toBeUndefined();
  });

  it('an oversized value is bounded by the shared constant', () => {
    const { rt } = recording('<textarea id="t" data-testid="bio"></textarea>');
    const input = document.getElementById('t') as HTMLTextAreaElement;
    input.value = 'x'.repeat(maxValueLength + 2_000);
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(steps(rt)[0]?.value).toHaveLength(maxValueLength);
  });

  it('a password typed while INACTIVE is not read either', () => {
    setBody('<input id="p" type="password" />');
    const { rt, clock } = runtimeAt();
    const input = document.getElementById('p')!;
    bugValue(input, 'an inactive runtime read a password value');

    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(rt.state(clock.now)).toBe('inactive');
    expect(rt.workflow()).toBeNull();
  });
});

// ─── 6. The event set, and Slice 1's rules through the real path ──────────

describe('WS9 · the authorised event set, routed through the existing recorder', () => {
  it('a checkbox change becomes check / uncheck', () => {
    const { rt } = recording('<input id="c" type="checkbox" data-testid="agree" />');
    const box = document.getElementById('c') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(steps(rt)[0]?.kind).toBe('check');
  });

  it('a select change becomes selectOption with the chosen value', () => {
    const { rt } = recording(
      '<select id="s" data-testid="plan"><option value="a">A</option><option value="b">B</option></select>',
    );
    const select = document.getElementById('s') as HTMLSelectElement;
    select.value = 'b';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(steps(rt)[0]?.kind).toBe('selectOption');
    expect(steps(rt)[0]?.value).toBe('b');
  });

  it('a click on a text input is NOT recorded — the input event owns it', () => {
    const { rt } = recording('<input id="t" type="text" data-testid="q" />');
    clickOn('t');
    expect(steps(rt), 'no duplicate click+fill for one interaction').toHaveLength(0);
  });

  it('consecutive edits to one field coalesce, using Slice 1’s rules', () => {
    const { rt, clock } = recording('<input id="e" type="text" data-testid="email" />');
    const input = document.getElementById('e') as HTMLInputElement;

    input.value = 'a';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    clock.now += 100;
    input.value = 'ab';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(steps(rt), 'one field edited twice is ONE fill').toHaveLength(1);
    expect(steps(rt)[0]?.value).toBe('ab');
  });

  it('the hard stop ends the recording and preserves what was captured', () => {
    const { rt, clock } = recording('<button id="b" data-testid="save">Save</button>');
    for (let i = 0; i < hardStop + 10; i++) {
      clock.now += heartbeatMs;
      rt.tick(clock.now);
      clock.now += 1;
      clickOn('b');
    }
    expect(steps(rt)).toHaveLength(hardStop);
    expect(rt.state(clock.now)).toBe('stopped');
  });

  it('a malformed / detached target does not crash the page', () => {
    const { rt } = recording('<div id="host"><button id="b" data-testid="s">Save</button></div>');
    const button = document.getElementById('b')!;
    button.remove(); // detached: the resolver cannot find it in the document

    expect(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
    expect(steps(rt), 'an unresolvable target records nothing').toHaveLength(0);
  });
});

// ─── 7. Architecture — one engine, nothing leaks, no listeners left behind ─

describe('WS9 · the runtime adds no second engine and leaks nothing', () => {
  it('detaches its listeners on stop', () => {
    const { rt, clock, sessionId } = recording('<button id="b" data-testid="s">Save</button>');
    rt.stop(sessionId, clock.now + 10);
    clickOn('b');
    clickOn('b');
    expect(steps(rt)).toHaveLength(0);
  });

  it('the workflow is structured-clone safe and carries no DOM or ScopeHandle', async () => {
    const { containsScopeHandle } = await import('@playwright-guru/locator-engine');
    const { rt } = recording('<button id="b" data-testid="save">Save</button>');
    clickOn('b');

    const workflow = rt.workflow()!;
    expect(containsScopeHandle(workflow)).toBe(false);
    expect(() => structuredClone(workflow)).not.toThrow();
    expect(JSON.stringify(workflow)).not.toContain('__brand');
  });

  it('declares no probe, no resolver and no DOM query of its own', async () => {
    // The single-engine claim is about what this module MAY grow into, so the
    // guard pins the ABSENCE. Comments are stripped: the claim is about code.
    const { readExtFile } = await import('./helpers/surface-source');
    const code = readExtFile('src/runtime/recording.ts').replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      '',
    );

    expect(code, 'no second probe').not.toMatch(/new LiveDomProbe/);
    expect(code, 'no second resolver').not.toMatch(/\bresolveChain\s*\(|\bresolveStep\s*\(/);
    expect(code, 'no hand-rolled selector engine').not.toMatch(
      /querySelectorAll|document\.evaluate|outerHTML|innerHTML/,
    );
    expect(code, 'no dynamic execution').not.toMatch(/\beval\b|new Function/);
    expect(code, 'no persistence in this slice').not.toMatch(
      /chrome\.storage|localStorage|sessionStorage|indexedDB/,
    );
    expect(code, 'it routes through the existing recorder').toMatch(/stepFor/);
  });

  it('holds no timing or length literal of its own', async () => {
    const { readExtFile } = await import('./helpers/surface-source');
    const code = readExtFile('src/runtime/recording.ts').replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      '',
    );
    expect(code).not.toMatch(/\b\d{3,}\b/);
    expect(code).toMatch(/RECORDING_LIMITS/);
  });

  it('is the ONLY recorder wired into the content entrypoint', async () => {
    // DL-64/D3: the legacy recorder is REPLACED, not extended. When this guard
    // was written, deleting it was not authorised, so the claim was the
    // strongest one then available: it exists, and nothing routes to it.
    //
    // WS9 V1 raw-line migration (DL-82) — STRENGTHENED. The deletion was
    // authorised and performed, so "unreachable" is replaced by "absent", which
    // no future edit can quietly undo by adding a call. Its handlers, its
    // hard-coded 600 ms debounce and its missing password exclusion are all
    // gone rather than merely unwired.
    const { readExtFile } = await import('./helpers/surface-source');
    const content = readExtFile('entrypoints/content.ts');
    const code = content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

    // The legacy handlers no longer exist at all…
    for (const gone of ['onRecClick', 'onRecInput', 'onRecChange', 'appendRecAction']) {
      expect(code, `the legacy recorder's ${gone} must be gone`).not.toContain(gone);
    }
    // …so there is nothing left that a call could route to.
    expect(code, 'no legacy recorder may be declared or called').not.toMatch(
      /\bstartRecording\s*\(/,
    );
    // The wired path is the new runtime, and only it.
    //
    // WS9 navigation slice (DL-83) — REPAIRED, and widened rather than relaxed.
    // This required `sendResponse(startRecordingSession` to sit IMMEDIATELY
    // after the case label. DL-83 put the top-frame gate between them, so the
    // adjacency regex broke on a legitimate change. Adjacency was never the
    // claim; the claim is that this case routes to the WS9 runtime and to
    // nothing else. That is asserted on the case BLOCK, together with the gate
    // that now guards it — so the guard proves more than it did before.
    const startCase = code.slice(
      code.indexOf("case 'START_RECORDING':"),
      code.indexOf("case 'STOP_RECORDING':"),
    );
    expect(startCase, 'the case must exist and be bounded').not.toBe('');
    expect(startCase).toContain('sendResponse(startRecordingSession');
    expect(startCase, 'and only the top frame may answer it').toContain('if (!isTopFrame) return');
    expect(code).toMatch(/createRecordingRuntime/);
  });

  it('the content entrypoint declares no timing literal of its own', async () => {
    const { readExtFile } = await import('./helpers/surface-source');
    // WS9 V1 raw-line migration (DL-82) — STRENGTHENED by deletion. This used
    // to cut the file at `function onRecInput` because the legacy block below
    // it carried DL-4's hard-coded 600 ms. That block is gone, so the whole
    // file is now in scope and DL-4 has no remaining instance here.
    const wired = readExtFile('entrypoints/content.ts').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    expect(wired).toMatch(/HEARTBEAT_INTERVAL_MS/);
    expect(wired, 'the new wiring must not repeat DL-4').not.toMatch(/\b600\b|\b500\b/);
  });

  it('FAILS CLOSED on the product flag — no message can start a disabled feature', async () => {
    // `RECORDING_ENABLED` must not be merely a UI hide. The Record control is
    // hidden while it is `false`, but a message can still reach the content
    // script, so the runtime refuses at its own boundary too.
    const { RECORDING_ENABLED } = await import('../src/config/recording');
    expect(RECORDING_ENABLED, 'this slice does not turn recording on').toBe(false);

    setBody('<button id="b" data-testid="save">Save</button>');
    let n = 0;
    const rt = createRecordingRuntime({
      doc: document,
      now: () => T0,
      nonce: () => `n${n++}`,
      // `enabled` omitted: it defaults to the product flag.
    });

    const result = rt.start(T0);
    expect(result.ok, 'a disabled product must refuse to record').toBe(false);
    expect(result.sessionId).toBeUndefined();
    expect(rt.state(T0)).toBe('inactive');

    clickOn('b');
    expect(rt.workflow(), 'and it must capture nothing').toBeNull();
  });
});
