/**
 * WS9 — SLICE 5A: the recording UI as a LIFECYCLE CONSUMER.
 * ============================================================================
 * THE ONE DEFECT THIS SLICE EXISTS TO REMOVE.
 *
 * `useRecording` held `const [recording, setRecording] = useState(false)` and
 * set it to `true` when a START_RECORDING acknowledgement came back. That is a
 * local boolean standing in for a fact it does not own: the authoritative
 * lifecycle lives in the content script's `RecordingRuntime`, is derived from
 * the clock on every read, and can become `stale` without sending anybody a
 * message. A boolean set once at start cannot become stale, so the panel could
 * display RECORDING for a recorder that had already died — the exact failure
 * `config/recording.ts` names as the reason `RECORDING_ENABLED` is off, and the
 * exact failure `session.ts` was built to make structurally impossible.
 *
 * A SECOND, SMALLER DEFECT, MEASURED HERE AND FIXED: `toggle()` sent
 * STOP_RECORDING with no `sessionId`, while slice 3's content handler calls
 * `recording.stop(sessionId ?? '', …)` and refuses an id that does not match.
 * Stop was therefore refused by construction. `refuses a stop that presents no
 * session id` below pins the runtime behaviour, and the source guards pin that
 * the panel now presents the id it was given.
 *
 * WHAT THIS SUITE IS. Pure-function tests for the fail-closed mapping, runtime
 * tests for the two liveness properties that matter (a reader cannot extend a
 * session; silence still wins), and source guards in this repository's
 * established idiom for the properties that are decidable from the source. No
 * React render harness exists here (R3 — every project is `environment:'node'`;
 * `a11y-structure.test.ts` states the same boundary), so component behaviour is
 * guarded structurally and honestly labelled as such.
 *
 * WHAT IT IS NOT. No real Chromium ran. No workflow, no step and no recorded
 * value crosses any seam this suite exercises, because none may.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RECORDING_ENABLED, RECORDING_LIMITS } from '../src/config/recording';
import {
  isRecordingNow,
  observedView,
  recordButtonModel,
  recordingBannerLine,
  type RecordingView,
} from '../src/recording/lifecycle-view';
import { createRecordingRuntime } from '../src/runtime/recording';

import { readComposed, stripComments } from './helpers/surface-source';

const EXT = resolve(__dirname, '..');
const read = (rel: string): string => readComposed(rel);
const readRaw = (rel: string): string => readFileSync(resolve(EXT, rel), 'utf8');

const CONTROL = 'entrypoints/sidepanel/RecordingControl.tsx';
const SIDE_PANEL = 'entrypoints/sidepanel/SidePanel.tsx';
const CONTENT = 'entrypoints/content.ts';
const BACKGROUND = 'entrypoints/background.ts';
const MESSAGING = 'utils/messaging.ts';
const VIEW = 'src/recording/lifecycle-view.ts';

/** Comment-stripped source: a guard about code must not be satisfied by prose. */
const code = (rel: string): string => stripComments(readRaw(rel));

const ALL_VIEWS: RecordingView[] = [
  'unknown',
  'inactive',
  'starting',
  'active',
  'stale',
  'stopped',
];

// ─── The flag has not moved ─────────────────────────────────────────────────

describe('the product flag is untouched by this slice', () => {
  it('keeps RECORDING_ENABLED false', () => {
    expect(RECORDING_ENABLED).toBe(false);
  });
});

// ─── observedView — the fail-closed mapping ─────────────────────────────────
//
// Every input that is not a positive, explicit statement of lifecycle state
// from the one authority must collapse to `unknown`, and `unknown` must never
// read as recording. This is the whole guarantee, expressed four ways.

describe('observedView fails closed on every kind of non-answer', () => {
  it('reports unknown when nothing has been asked yet', () => {
    expect(observedView(null)).toBe('unknown');
    expect(observedView(undefined)).toBe('unknown');
  });

  it('reports unknown when the content script did not handle the query', () => {
    // `normalizeAck` turns an absent response into exactly this shape, which is
    // what a dead, reloaded or never-injected content script produces.
    expect(observedView({ ok: false })).toBe('unknown');
  });

  it('reports unknown when a handler answered without saying anything', () => {
    // `ok:true` with no lifecycle is not evidence of a state. Defaulting it to
    // `inactive` would be a guess; defaulting it to `active` would be the lie.
    expect(observedView({ ok: true })).toBe('unknown');
  });

  it('never invents active out of a failure that happens to mention it', () => {
    expect(observedView({ ok: false, lifecycle: 'active' })).toBe('unknown');
  });

  it('passes each of the five real lifecycle states through unchanged', () => {
    for (const state of ['inactive', 'starting', 'active', 'stale', 'stopped'] as const) {
      expect(observedView({ ok: true, lifecycle: state })).toBe(state);
    }
  });
});

describe('exactly one view means recording', () => {
  it('claims recording for active and for nothing else', () => {
    const claiming = ALL_VIEWS.filter(isRecordingNow);
    expect(claiming).toEqual(['active']);
  });

  it('does not claim recording while the handshake is unanswered', () => {
    expect(isRecordingNow('starting')).toBe(false);
  });

  it('does not claim recording once the recorder went silent', () => {
    expect(isRecordingNow('stale')).toBe(false);
  });
});

// ─── The button ─────────────────────────────────────────────────────────────

describe('the record button reflects the authority, not the request', () => {
  it('offers Stop only while the authority says active', () => {
    const stopping = ALL_VIEWS.filter((v) => recordButtonModel(v, null).action === 'stop');
    expect(stopping).toEqual(['starting', 'active']);
  });

  it('shows the live affordance only for active', () => {
    const live = ALL_VIEWS.filter((v) => recordButtonModel(v, null).live);
    expect(live).toEqual(['active']);
  });

  it('shows no live affordance while a start is merely pending', () => {
    // The moment a naive implementation lights up. The request is in flight;
    // nothing has confirmed a recorder exists.
    const model = recordButtonModel('inactive', 'start');
    expect(model.live).toBe(false);
    expect(model.busy).toBe(true);
    expect(model.action).toBe('none');
  });

  it('refuses a second request while one is in flight', () => {
    for (const pending of ['start', 'stop'] as const) {
      for (const view of ALL_VIEWS) {
        expect(recordButtonModel(view, pending).action).toBe('none');
      }
    }
  });

  it('gives every state an accessible name that is not a glyph', () => {
    for (const view of ALL_VIEWS) {
      const { name } = recordButtonModel(view, null);
      expect(name.length, `${view} must be nameable`).toBeGreaterThan(3);
      expect(name).not.toMatch(/[●▶✕]/u);
    }
  });

  it('lets a user start again after a recorder died, without pretending it did not', () => {
    const model = recordButtonModel('stale', null);
    expect(model.action).toBe('start');
    expect(model.live).toBe(false);
  });
});

// ─── The banner ─────────────────────────────────────────────────────────────

describe('the banner says what is true, including when it is bad news', () => {
  it('says nothing at all when there is nothing to say', () => {
    expect(recordingBannerLine('inactive', null)).toBeNull();
    expect(recordingBannerLine('unknown', null)).toBeNull();
  });

  it('claims RECORDING only for active', () => {
    const claiming = ALL_VIEWS.filter((v) =>
      /recording —/i.test(recordingBannerLine(v, null) ?? ''),
    );
    expect(claiming).toEqual(['active']);
  });

  it('surfaces a dead recorder instead of leaving the last claim standing', () => {
    const line = recordingBannerLine('stale', null);
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/^RECORDING —/);
    expect(line).toMatch(/stopped responding/i);
  });

  it('distinguishes a requested recording from a live one', () => {
    expect(recordingBannerLine('inactive', 'start')).toMatch(/starting/i);
    expect(recordingBannerLine('inactive', 'start')).not.toMatch(/^RECORDING —/);
    expect(recordingBannerLine('starting', null)).toMatch(/not recording yet/i);
  });

  it('reports a stop in flight rather than a recording still running', () => {
    expect(recordingBannerLine('active', 'stop')).toMatch(/stopping/i);
  });

  it('never mentions a session, a count it cannot know, or a value', () => {
    for (const view of ALL_VIEWS) {
      for (const pending of [null, 'start', 'stop'] as const) {
        const line = recordingBannerLine(view, pending) ?? '';
        expect(line).not.toMatch(/session|\d+\s*action/i);
      }
    }
  });
});

// ─── Liveness belongs to the runtime, and reading cannot extend it ──────────
//
// The one property that decides whether a poll is a READER or a second
// heartbeat. It is measured against the real runtime, not asserted in prose.

describe('a lifecycle reader cannot keep a recording alive', () => {
  const stubDoc = (): Document =>
    ({
      addEventListener() {},
      removeEventListener() {},
      defaultView: { location: { href: 'https://example.test/' } },
    }) as unknown as Document;

  const runtime = () =>
    createRecordingRuntime({
      doc: stubDoc(),
      now: () => 0,
      nonce: () => 'n',
      enabled: true,
    });

  const TIMEOUT = RECORDING_LIMITS.heartbeatTimeoutMs;

  it('goes stale on schedule however often it is read', () => {
    const polled = runtime();
    polled.start(0);
    // A UI polling far faster than the heartbeat, for the whole window.
    for (let t = 0; t <= TIMEOUT; t += 250) polled.state(t);
    expect(polled.state(TIMEOUT + 1)).toBe('stale');
  });

  it('goes stale at exactly the same instant as a runtime nobody reads', () => {
    const polled = runtime();
    const quiet = runtime();
    polled.start(0);
    quiet.start(0);
    for (let t = 0; t <= TIMEOUT + 5_000; t += 100) polled.state(t);
    for (let t = 0; t <= TIMEOUT + 5_000; t += 100) {
      expect(polled.state(t), `polled at ${t}`).toBe(quiet.state(t));
    }
  });

  it('is still active before the timeout, so the reader is not making it fail either', () => {
    const rt = runtime();
    rt.start(0);
    expect(rt.state(TIMEOUT)).toBe('active');
  });

  it('leaves the captured workflow untouched no matter how much it is read', () => {
    const rt = runtime();
    rt.start(0);
    const before = JSON.stringify(rt.workflow());
    for (let t = 0; t < 1_000; t += 1) rt.state(t);
    expect(JSON.stringify(rt.workflow())).toBe(before);
  });
});

// ─── Stop, and the id it must present ───────────────────────────────────────

describe('stopping is identity-checked, which is why the panel must present an id', () => {
  const stubDoc = (): Document =>
    ({
      addEventListener() {},
      removeEventListener() {},
      defaultView: { location: { href: 'https://example.test/' } },
    }) as unknown as Document;

  const runtime = () =>
    createRecordingRuntime({ doc: stubDoc(), now: () => 0, nonce: () => 'n', enabled: true });

  it('refuses a stop that presents no session id', () => {
    // THE DEFECT, PINNED. `toggle()` sent STOP_RECORDING without `sessionId`,
    // and `content.ts` forwards `sessionId ?? ''`. Stop could never succeed.
    const rt = runtime();
    rt.start(0);
    expect(rt.stop('', 10)).toEqual({ ok: false, error: 'wrong-session' });
    expect(rt.state(10)).toBe('active');
  });

  it('refuses a stop from a different session', () => {
    const rt = runtime();
    const started = rt.start(0);
    expect(rt.stop(`${started.sessionId}-other`, 10)).toEqual({
      ok: false,
      error: 'wrong-session',
    });
  });

  it('accepts a stop that presents the id START handed back', () => {
    const rt = runtime();
    const started = rt.start(0);
    expect(started.sessionId).toBeTruthy();
    expect(rt.stop(started.sessionId!, 10)).toEqual({ ok: true });
    expect(rt.state(10)).toBe('stopped');
  });

  it('reports stopped, not active, for a session that died before the stop arrived', () => {
    const rt = runtime();
    const started = rt.start(0);
    const late = RECORDING_LIMITS.heartbeatTimeoutMs + 1;
    expect(rt.state(late)).toBe('stale');
    expect(rt.stop(started.sessionId!, late)).toEqual({ ok: true });
    expect(rt.state(late)).toBe('stopped');
  });
});

// ─── Source guards — the local boolean is gone ──────────────────────────────

describe('the panel holds no local boolean standing for recording state', () => {
  it('no longer declares the recording flag it used to set on an acknowledgement', () => {
    const src = code(CONTROL);
    expect(src).not.toMatch(/const\s*\[\s*recording\s*,\s*setRecording\s*\]\s*=\s*useState/);
    expect(src).not.toMatch(/setRecording\s*\(/);
  });

  it('declares no boolean state the authority does not write', () => {
    // REPAIRED FOR WS9 DL-89 (Decision E), AND STRICTLY STRONGER.
    //
    // This used to ban `useState(false)` outright, reasoning that the defect
    // then "cannot come back under another name". But the defect it names is
    // precise: a panel-local boolean that STANDS FOR RECORDING and is set from
    // a START acknowledgement, so it can outlive the recorder. A ban on the
    // LITERAL caught one spelling of that and nothing else —
    // `useState<boolean | null>(null)` followed by `setX(ack.ok)` would have
    // sailed through while re-introducing the exact slice-5A lie.
    //
    // Decision E gave the panel a second OBSERVED fact, `confirmed` ("the live
    // authority answered"), which is re-derived from the authority on every
    // poll, is never written from an acknowledgement, and can only WITHDRAW a
    // recording claim, never make one. So the rule is now about PROVENANCE
    // rather than spelling, and it is checked in two parts.
    const src = code(CONTROL);

    // (1) No state anywhere in this control may be set to a boolean literal.
    //     `setRecording(true)` — the original defect — fails here whatever it
    //     is called and however its state was declared.
    expect(src, 'a stored `true` is the lie slice 5A removed').not.toMatch(
      /set[A-Z]\w*\(\s*(true|false)\s*\)/,
    );

    // (2) Any boolean state that DOES exist must be written only with the one
    //     observation function's own answer — never an ack, never a guess.
    const declared = [
      ...src.matchAll(/const \[(\w+), (set\w+)\] = useState(?:<[^>]*>)?\(\s*(?:true|false)\s*\)/g),
    ];
    for (const [, name, setter] of declared) {
      const calls = [...src.matchAll(new RegExp(setter + '\\(([^;]*?)\\)\\s*;', 'g'))].map((m) =>
        (m[1] ?? '').trim(),
      );
      expect(calls.length, name + ' must actually be written somewhere').toBeGreaterThan(0);
      for (const arg of calls) {
        expect(arg, setter + '(' + arg + ") must carry the observation's own answer").toMatch(
          /^next\.\w+$/,
        );
      }
    }
  });

  it('feeds the view state from the authority and from nothing else', () => {
    // WS9 slice 5C — the same claim, one indirection deeper.
    //
    // This required every `setView(...)` argument to contain `observedView(`.
    // Slice 5C put a second evidence source behind the view, so the argument is
    // now the result of the one observation function. The claim being protected
    // is unchanged and is checked in two parts instead of one: every write is
    // that function's result, and that function resolves through the single
    // precedence resolver. A literal, an acknowledgement or an optimistic guess
    // still fails, and now so does a SECOND observation path.
    const src = code(CONTROL);
    const sets = [...src.matchAll(/setView\(([^;]*?)\)\s*;/g)].map((m) => (m[1] ?? '').trim());
    expect(sets.length, 'the view must actually be set somewhere').toBeGreaterThan(0);
    for (const arg of sets) {
      // DL-89 — the observation now yields `{ view, confirmed }`, so the
      // argument is that value's VIEW projection. Strictly stronger than the
      // previous shape: it no longer accepts the whole observation object,
      // which after Decision E would be an object where a view belongs.
      expect(arg, `setView(${arg}) must be the observation result`).toMatch(
        /^(next|await observe\(\))\.view$/,
      );
    }
    const observe = src.slice(src.indexOf('const observe'), src.indexOf('const refresh'));
    expect(observe, 'observation must resolve through the one precedence rule').toContain(
      'resolveRecordingView',
    );
    expect(observe).toContain('observedView(');
  });

  it('never derives the view from a start/stop acknowledgement', () => {
    const src = code(CONTROL);
    expect(src).not.toMatch(/setView\s*\(\s*['"]active['"]\s*\)/);
    expect(src).not.toMatch(/ack\.ok[\s\S]{0,80}setView/);
  });

  it('asks the authority through the one existing runtime-message seam', () => {
    expect(code(CONTROL)).toContain('QUERY_RECORDING_STATE');
    expect(code(CONTROL)).toContain('sendRuntimeMessage');
    // Not a second messaging architecture: no direct chrome/browser messaging.
    expect(code(CONTROL)).not.toMatch(/chrome\.runtime|browser\.runtime/);
  });

  it('presents the session id START handed back when it asks to stop', () => {
    expect(code(CONTROL)).toMatch(/type:\s*'STOP_RECORDING'[\s\S]{0,120}sessionId/);
  });
});

// ─── Source guards — the UI does not own liveness ───────────────────────────

describe('the UI consumes liveness; it never produces it', () => {
  it('sends no heartbeat and calls no tick', () => {
    const src = code(CONTROL);
    expect(src).not.toMatch(/\btick\s*\(/);
    expect(src).not.toMatch(/\bheartbeat\s*\(/);
    // The word may appear for exactly ONE reason: reading the recorder's own
    // interval out of the single constants module. Any other mention would be
    // the UI growing a beat of its own. Stricter than banning the word, which
    // would only have forced the constant to be re-declared under a new name.
    const mentions = [...src.matchAll(/heartbeat\w*/gi)].map((m) => m[0]);
    expect(mentions).toEqual(['heartbeatMs']);
    expect(src).toContain('RECORDING_LIMITS.heartbeatMs');
  });

  it('never starts or stops a recording from a timer', () => {
    const src = code(CONTROL);
    const at = src.indexOf('setInterval');
    expect(at, 'the refresh timer must exist').toBeGreaterThan(-1);
    // The WHOLE effect that owns the timer — not just the callback expression —
    // so a poll helper defined beside it is covered too.
    // WS9 slice 5C — two adjustments, neither of them a relaxation. The
    // dependency list is no longer literally `[]`, so the terminator is `}, [`
    // (with `}, []);` the slice became the whole rest of the file and the guard
    // failed for the wrong reason). And the query itself moved into the
    // observation callback the timer drives, so the claim — a timer READS and
    // never mutates — is now checked on both halves rather than one.
    const effect = src.slice(src.lastIndexOf('useEffect', at), src.indexOf('}, [', at));
    expect(effect).toContain('observe()');
    expect(effect).not.toContain('START_RECORDING');
    expect(effect).not.toContain('STOP_RECORDING');

    const observe = src.slice(src.indexOf('const observe'), src.indexOf('const refresh'));
    expect(observe).toContain('QUERY_RECORDING_STATE');
    expect(observe).not.toContain('START_RECORDING');
    expect(observe).not.toContain('STOP_RECORDING');
  });

  it('declares no timing number of its own', () => {
    // Same rule `runtime/recording.ts` follows: every interval comes from the
    // one constants module, so nothing can drift from the recorder's own beat.
    const src = code(CONTROL);
    expect(src).toContain('RECORDING_LIMITS');
    expect(src).not.toMatch(/setInterval\s*\([\s\S]{0,240}?,\s*\d{3,}\s*\)/);
  });

  it('reads the runtime state without mutating it, on the content side', () => {
    const src = code(CONTENT);
    expect(src).toMatch(/case 'QUERY_RECORDING_STATE':/);
    // The handler may call `state(...)` and nothing else on the runtime.
    //
    // WS9 navigation slice (DL-83) — REPAIRED. This split the case on the FIRST
    // `return false;`, which was the end of the handler until DL-83 added the
    // top-frame gate — whose early return is now the first one, so the slice
    // stopped before `recording.state(` and the guard failed on a legitimate
    // change. The handler is the whole case block, so that is what is read now:
    // the same claim, over the text it was always about, and it covers the gate
    // as well.
    const at = src.indexOf(`case 'QUERY_RECORDING_STATE':`);
    expect(at, 'the case must exist').toBeGreaterThan(-1);
    const nextCase = src.indexOf('case ', at + 10);
    const handler = src.slice(at, nextCase === -1 ? src.indexOf('default:', at) : nextCase);
    expect(handler, 'the case must be bounded, never the rest of the file').not.toBe('');
    expect(handler).toContain('recording.state(');
    expect(handler, 'and only the top frame may answer it').toContain('if (!isTopFrame) return');
    for (const mutator of ['recording.start(', 'recording.stop(', 'recording.tick(']) {
      expect(handler, `the query must not call ${mutator}`).not.toContain(mutator);
    }
  });
});

// ─── Source guards — nothing about the workflow crosses the seam ────────────

describe('no recorded content is transported to the UI', () => {
  it('adds no workflow message type the UI can read', () => {
    // WS9 slice 5B — RE-SCOPED, and sharper than what it replaces.
    //
    // This used to assert that the word "workflow" appeared in no field of
    // `messaging.ts` at all. Slice 5B legitimately added one — the durable
    // projection travels content → background on `PersistRecordingStateMessage`
    // — and that message never reaches the UI. The claim this guard was always
    // making is the one below: nothing the PANEL can ask for or read back
    // carries a recording. That is now checked on the reply type itself and on
    // the direction of the only message that does carry one, rather than on a
    // word appearing anywhere in the file.
    const src = code(MESSAGING);
    expect(src).not.toContain('GET_RECORDING_WORKFLOW');

    // The acknowledgement is what the panel reads. It must carry no recording.
    const ack = src.slice(src.indexOf('interface RuntimeMessageAck'));
    const ackBody = ack.slice(0, ack.indexOf('\n}'));
    expect(ackBody).not.toMatch(/workflow/i);
    expect(ackBody).not.toMatch(/RecordedStep\b/);
    expect(ackBody).not.toMatch(/steps\s*\??:/);

    // Exactly one declaration may carry a workflow field. Located by asking,
    // for every such field, which interface it is inside — the declaration
    // boundaries are found by position rather than by a brace-matching regex,
    // which a one-line interface elsewhere in the file would defeat.
    const declarations = [...src.matchAll(/interface (\w+)\b/g)];
    const owners = [...src.matchAll(/workflow\s*\??:/gi)].map((field) => {
      const before = declarations.filter((d) => d.index! < field.index!);
      return before[before.length - 1]?.[1] ?? '<none>';
    });
    expect([...new Set(owners)]).toEqual(['PersistRecordingStateMessage']);

    // And it travels FROM a tab, so it carries no `targetTabId`: the tab
    // identity comes from the sender, and the panel cannot send it meaningfully.
    const carrier = src.slice(src.indexOf('interface PersistRecordingStateMessage'));
    expect(carrier.slice(0, carrier.indexOf('\n}'))).not.toContain('targetTabId');
  });

  it('carries a lifecycle state and nothing else on the new acknowledgement field', () => {
    const src = code(MESSAGING);
    expect(src).toMatch(/lifecycle\?:\s*RecordingLifecycleState/);
  });

  it('never lets the panel touch a workflow, a step, or a rendered spec', () => {
    const src = code(CONTROL);
    for (const forbidden of [
      'RecordedWorkflow',
      'RecordedStep',
      'renderSpecFile',
      'renderAction',
      'workflow(',
    ]) {
      expect(src, `the panel must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('shows no action count, because the panel is not told one', () => {
    // The old banner rendered `{count} action(s)` from an array that DL-76
    // measured as permanently empty — a second untruth beside the first. A
    // truthful count needs a source this slice may not build, so the claim is
    // withdrawn rather than restated.
    const src = code(CONTROL);
    expect(src).not.toMatch(/\{count\}\s*action/);
    expect(src).not.toMatch(/count\s*!==\s*1/);
  });
});

// ─── Source guards — no persistence, no session-id leak ─────────────────────

describe('this slice adds no persistence', () => {
  it('keeps the lifecycle view module free of every storage API', () => {
    const src = code(VIEW);
    for (const api of ['chrome.', 'browser.', 'localStorage', 'sessionStorage', 'indexedDB']) {
      expect(src, `${VIEW} must not touch ${api}`).not.toContain(api);
    }
  });

  it('adds no storage write to the recording control', () => {
    // WS9 V1 raw-line migration (DL-82) — STRENGTHENED from one to zero.
    // `clearRecording` was the one pre-existing call this guard budgeted for;
    // DL-82 measured it as having no consumer and retired it. "None was added"
    // becomes the stronger "none exists".
    const writes = [...code(CONTROL).matchAll(/browser\.storage/g)];
    expect(writes.length).toBe(0);
  });

  it('keeps every slice-5A module free of storage, descriptors included', () => {
    // WS9 slice 5B — RE-SCOPED to what this suite is actually answerable for.
    //
    // This used to assert that `src/storage/state.ts` mentioned neither
    // "recording" nor "workflow", as slice 5A's way of saying "I added no
    // persistence". Slice 5B was explicitly authorised to add two WS4
    // descriptors (DL-78), so that file legitimately names them now, and the
    // descriptor set is pinned positively in `ws9-recording-persistence.test.ts`
    // instead. What remains this suite's claim — and is asserted here — is that
    // the slice-5A modules themselves still own no persistence at all.
    // WS9 slice 5C — RE-SCOPED again, from "owns no persistence" to "owns no
    // WRITE". The owner authorised the panel to READ durable evidence as
    // fallback when the live authority is unreachable, so a blanket ban on
    // `readTab` now forbids the thing that was explicitly approved. Everything
    // dangerous is still forbidden, and one thing is newly forbidden that was
    // not before: reaching the WORKFLOW descriptor, which would smuggle a
    // recording into the panel.
    for (const rel of [VIEW, CONTROL]) {
      const src = code(rel);
      for (const api of ['chrome.storage', 'localStorage', 'sessionStorage', 'indexedDB']) {
        expect(src, `${rel} must not touch ${api}`).not.toContain(api);
      }
      expect(src, `${rel} must never WRITE recording state`).not.toMatch(
        /writeTab|writeGlobal|PERSIST_RECORDING_STATE/,
      );
      expect(src, `${rel} must not reach the workflow descriptor`).not.toContain(
        'RECORDING_WORKFLOW',
      );
    }
    // The presentation module gains nothing at all: it is still pure.
    expect(code(VIEW), 'the view module must stay free of storage').not.toMatch(
      /storage\/state|readTab|RECORDING_OBSERVATION/,
    );
    // And the panel reads only through the injected gateway surface, never by
    // importing the descriptor or the gateway itself.
    expect(code(CONTROL)).not.toMatch(/from '.*storage\/state'/);
    expect(code(CONTROL)).not.toMatch(/from '.*browser\/storage'/);
    expect(code(CONTROL)).toContain('readDurableObservation');
  });
});

describe('the session id is used, never shown', () => {
  it('keeps it out of React state', () => {
    const src = code(CONTROL);
    expect(src).not.toMatch(/useState[^;]*session/i);
  });

  it('keeps it out of everything the hook hands back', () => {
    const src = code(CONTROL);
    const returned = src.slice(src.lastIndexOf('return {', src.indexOf('function RecordButton')));
    expect(returned.slice(0, returned.indexOf('}'))).not.toMatch(/session/i);
  });

  it('keeps it out of the rendered output and out of every log', () => {
    const src = code(CONTROL);
    expect(src).not.toMatch(/\{\s*session[A-Za-z]*\s*\}/);
    expect(src).not.toMatch(/console\./);
  });
});

// ─── Source guards — accessibility and the flag gate ────────────────────────

describe('the recording surface is announced and stays behind the flag', () => {
  it('gates the button and the banner with an early return on the flag', () => {
    const src = readRaw(CONTROL);
    const gates = [...src.matchAll(/if\s*\(!RECORDING_ENABLED\)\s*return null;/g)];
    expect(gates.length, 'both the button and the banner must refuse to render').toBe(2);
  });

  it('announces a recording state change politely', () => {
    expect(readRaw(CONTROL)).toMatch(/role="status"\s*\n?\s*aria-live="polite"/);
  });

  it('names the button for a screen reader and reports its pressed state', () => {
    const src = readRaw(CONTROL);
    expect(src).toMatch(/aria-label=\{/);
    expect(src).toMatch(/aria-pressed=\{/);
  });

  it('keeps the side panel composing the control it owns', () => {
    const composed = read(SIDE_PANEL);
    expect(composed).toContain('QUERY_RECORDING_STATE');
    expect(composed).toContain('observedView');
  });
});

// ─── Source guards — the router still knows the message ─────────────────────

describe('the background routes the lifecycle query through the existing router', () => {
  it('lists it among the known message types', () => {
    expect(code(BACKGROUND)).toMatch(/KNOWN_MESSAGE_TYPES[\s\S]*?'QUERY_RECORDING_STATE'/);
  });

  it('adds no second listener and no command bus', () => {
    const src = code(BACKGROUND);
    expect([...src.matchAll(/onMessage\.addListener/g)].length).toBe(1);
    expect(src).not.toMatch(/CommandBus/);
  });
});
