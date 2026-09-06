/**
 * The Side Panel's recording control — A LIFECYCLE CONSUMER (WS9, slice 5A).
 * ---------------------------------------------------------------------------
 * WHAT CHANGED, AND WHY IT HAD TO.
 *
 * This control used to hold `const [recording, setRecording] = useState(false)`
 * and set it to `true` when a START_RECORDING acknowledgement came back. That
 * boolean was a lie waiting to be told. Slice 2 deliberately made liveness a
 * DERIVATION — `isRecording(session, now)` recomputes staleness from the clock
 * on every read, so a content script that dies the way content scripts actually
 * die (a reload, a navigation, a tab discard, a crash) sends no message, fires
 * no event, and simply stops reading as recording. A boolean in the panel
 * cannot do that. It would still say `true`, and the banner would still say
 * RECORDING, for a recorder that no longer exists.
 *
 * So the panel now ASKS. `QUERY_RECORDING_STATE` returns the one authority's
 * own answer, and `observedView` is the only thing that may set the view. A
 * successful START acknowledgement does NOT make this control believe it is
 * recording — it refreshes, and believes the refresh.
 *
 * THE UI CONSUMES LIVENESS. IT DOES NOT PRODUCE IT.
 * The interval below is a READER, not a heartbeat. It calls nothing that
 * mutates: `state()` is `lifecycleStateOf`, a pure function of the session and
 * the clock. Stopping the timer cannot end a recording, running it faster
 * cannot prolong one, and `ws9-recording-ui.test.ts` measures exactly that —
 * a runtime polled every 250 ms goes stale at the same instant as one nobody
 * reads at all. The recorder owns its own beat, in `content.ts`, at the same
 * interval, from the same constant.
 *
 * FAIL CLOSED. A dead content script produces `{ok:false, code:'NO_HANDLER'}`,
 * which `observedView` turns into `unknown`, and `unknown` never reads as
 * recording. There is no path from an absence to an "active" claim.
 *
 * THE SESSION ID IS USED, NEVER SHOWN. START hands one back and STOP must
 * present it — that identity check is what makes a stale stop refusable rather
 * than merely unlikely (and, until this slice, `toggle()` sent no id at all, so
 * stop was refused by construction). It is held in a ref: never React state,
 * never rendered, never logged, never in a filename or exported source.
 *
 * WHAT IS DELIBERATELY NOT HERE. The old banner rendered `{count} action(s)`
 * from `recordedActions`, an array DL-76 measured as permanently empty — a
 * second untruth beside the first. A truthful count needs a source this slice
 * may not build, so the claim is withdrawn rather than restated. Nothing about
 * a workflow, a step, a value or an export crosses into this file.
 *
 * `RECORDING_ENABLED` is still `false`, so neither the button nor the banner
 * renders. This slice makes the lifecycle truthful; it does not turn recording
 * on.
 *
 * THE V1 RAW-LINE ASSETS ARE GONE (DL-82). `recordedActions`, `copyTestCode`
 * and `clearRecording` lived here, preserved through WS5 and slice 5A because
 * deleting them belonged to a different slice. That slice happened: the array
 * was set only to `[]` (twice, both literal), the two functions had no consumer
 * anywhere, and the generator they called rebuilt locators from raw attributes
 * and fell back to `page.locator('<tagName>')`. Retiring them also removed this
 * file's ONE direct `browser.storage` call, which was a WRITE that emptied the
 * preserved V1 key. The stored data itself is untouched — see DL-82.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { sendRuntimeMessage } from '../../src/browser/runtime';
import { RECORDING_ENABLED, RECORDING_LIMITS } from '../../src/config/recording';
import {
  observedView,
  recordButtonModel,
  recordingBannerLine,
  type PendingRequest,
  type RecordingView,
} from '../../src/recording/lifecycle-view';
import { resolveRecordingView } from '../../src/recording/reconcile';
import { readDurableObservation } from '../../src/services/recording-observation';
import { readDurableWorkflow } from '../../src/services/recording-workflow';

import type { RecordingRefusal } from '../../src/recording/admission';
import type { StorageGateway } from '../../src/application/ports/StorageGateway';

/**
 * How often the panel re-reads the authority.
 *
 * Re-used from the one constants module rather than declared here, so this file
 * holds no timing number of its own — the same rule `runtime/recording.ts`
 * follows for the recorder's own beat, and the reason DL-4's 600 ms-versus-500
 * drift cannot happen again. Matching the recorder's interval means the panel
 * observes a state change within roughly one beat of it becoming true.
 */
export const LIFECYCLE_REFRESH_MS = RECORDING_LIMITS.heartbeatMs;

/**
 * WS9 slice 5C — what the panel needs to consult DURABLE evidence.
 *
 * Injected rather than reached for, so this hook stays testable and so the tab
 * identity is the one the panel is already bound to (`panel.pick.tabId`) rather
 * than a second active-tab query that could disagree with it.
 *
 * Optional on purpose, and the default fails closed: with no deps the panel
 * reads live evidence only and reports `unknown` when the content script is
 * unreachable — exactly slice 5A's behaviour. A missing wire therefore
 * degrades, it never fabricates.
 */
export interface RecordingDurableDeps {
  /** The tab this panel is bound to. `null` while it is unresolved. */
  tabId: number | null;
  /** WS4's read surface. No other storage path is used or permitted. */
  gateway: Pick<StorageGateway, 'readTab'>;
  /** Injected so expiry is deterministic in tests. */
  now?: () => number;
}

/**
 * WS9 DL-89 — what one round of observation yields.
 *
 * Two fields, and the second is NOT a second opinion about the first.
 * `view` is what DL-79's precedence resolved; `confirmed` records only which
 * evidence produced it, so the banner can avoid asserting a live recording it
 * never confirmed. Kept together in one value because they are decided
 * together, in one function, from one message.
 */
interface Observation {
  view: RecordingView;
  /** The LIVE authority produced a recognised answer. Nothing more. */
  confirmed: boolean;
}

export function useRecording(durable?: RecordingDurableDeps) {
  /** What the evidence resolves to. Only `resolveRecordingView` may write it. */
  const [view, setView] = useState<RecordingView>('unknown');
  /**
   * Whether the live authority answered at all. Starts `false`: before the
   * first poll the panel has confirmed nothing, and a default of `true` would
   * let the very first render claim a confirmation it never received.
   */
  const [confirmed, setConfirmed] = useState(false);
  /**
   * The panel's own outstanding request. This is the ONE local boolean-ish
   * fact the panel legitimately owns — "I have asked and not heard back" — and
   * it never becomes a recording claim: `recordButtonModel(_, 'start').live` is
   * false for every view, and the banner says "Starting", not "RECORDING".
   */
  const [pending, setPending] = useState<PendingRequest>(null);
  /** Held for the identity check on STOP. Never state, never rendered. */
  const active = useRef<string | null>(null);

  /**
   * Gather evidence and resolve it. THE ONE PLACE THE VIEW IS DECIDED.
   *
   * The live authority is asked first. The durable record is read **only** if
   * the live answer was `unknown` — meaning the content script said nothing at
   * all. That short-circuit makes the owner's precedence rule physically true
   * rather than merely computed: when the runtime answers, the stored row is
   * not out-ranked, it is not even looked at. `resolveRecordingView` still owns
   * the decision, so the rule holds even when both are present.
   */
  /**
   * WS9 DL-91 — THE DEPENDENCY IS THE BINDING, NOT THE OBJECT THAT CARRIES IT.
   *
   * `observe` used to depend on `durable` itself. The panel handed it a fresh
   * object literal on every render, so `observe` changed identity on every
   * render, so the reader effect below tore down and re-armed on every render —
   * and its cleanup sets `alive = false`, which DISCARDS the runtime round-trip
   * that was in flight. The lifecycle view was then committed only when a query
   * happened to finish between two renders. Real Chromium measured 5,205 such
   * queries in 24.9 seconds, and the banner arriving after 24,872 ms.
   *
   * Depending on the two values that actually identify the source — and on the
   * injected clock, which tests replace — makes the reader immune to that
   * churn no matter what a caller passes. The panel also memoises the object
   * (its own fix); this makes a future caller that forgets unable to bring the
   * storm back.
   */
  const boundTabId = durable?.tabId ?? null;
  const boundGateway = durable?.gateway;
  const boundNow = durable?.now;

  const observe = useCallback(async (): Promise<Observation> => {
    // WS9 navigation slice (DL-83) — ASK THE BOUND TAB, OR ASK NOBODY.
    //
    // With no tab there is nothing to address, and sending an unaddressed
    // message would re-enter the background's active-tab fallback — the exact
    // second lookup this slice removes. `unknown` is the honest answer, and
    // `unknown` never renders as recording.
    const tabId = boundTabId;
    if (tabId === null) return { view: 'unknown', confirmed: false };

    const ack = await sendRuntimeMessage({ type: 'QUERY_RECORDING_STATE', targetTabId: tabId });
    /**
     * WS9 OWNER DECISION E (DL-89) — ONE EXPRESSION, TWO CONSEQUENCES.
     *
     * `observedView(ack) !== 'unknown'` was ALREADY the condition deciding
     * whether the durable record is even read — that is how DL-79 made its
     * precedence physically true rather than merely computed. It is now bound
     * to a name and reused, so the answer to "may the banner claim a live
     * recording?" and the answer to "must we fall back to the stored row?" are
     * the SAME answer by construction. Two separate expressions could drift,
     * and a panel that fell back to durable evidence while still claiming live
     * confirmation is exactly the untruth DL-88 measured.
     */
    const confirmed = observedView(ack) !== 'unknown';
    if (!boundGateway || confirmed) {
      return { view: resolveRecordingView({ live: ack, durable: null, now: 0 }), confirmed };
    }
    const record = await readDurableObservation(boundGateway, tabId);
    return {
      view: resolveRecordingView({
        live: ack,
        durable: record,
        now: (boundNow ?? Date.now)(),
      }),
      confirmed,
    };
  }, [boundTabId, boundGateway, boundNow]);

  const refresh = useCallback(async () => {
    const next = await observe();
    setView(next.view);
    setConfirmed(next.confirmed);
  }, [observe]);

  /**
   * The reader. It asks; it never asserts.
   *
   * `alive` guards the unmount race so a late answer cannot write to a state
   * setter the panel no longer owns. Nothing here starts, stops, ticks or
   * heartbeats — a source guard asserts the effect contains no START_RECORDING
   * or STOP_RECORDING, and reading durable state is a read: it writes nothing
   * and cannot extend a session.
   */
  useEffect(() => {
    let alive = true;
    const poll = () => {
      void (async () => {
        const next = await observe();
        if (alive) {
          setView(next.view);
          setConfirmed(next.confirmed);
        }
      })();
    };
    poll();
    const timer = setInterval(poll, LIFECYCLE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [observe]);

  /**
   * Ask to start. Note what is NOT here: the acknowledgement never sets the
   * view. It yields the session id and nothing else; what the panel then
   * displays comes from asking the authority.
   */
  const start = useCallback(async () => {
    // Addressed, for the same reason `observe` is: an unaddressed START would
    // begin recording on whatever tab happened to be ACTIVE, while the panel
    // read durable state for the tab it is bound to — two different tabs, one
    // banner. With no bound tab there is nothing to start.
    const tabId = boundTabId;
    if (tabId === null) return;
    setPending('start');
    const ack = await sendRuntimeMessage({ type: 'START_RECORDING', targetTabId: tabId });
    active.current = ack.ok && ack.sessionId ? ack.sessionId : null;
    setPending(null);
    await refresh();
  }, [boundTabId, refresh]);

  /**
   * Ask to stop, presenting the id START handed back.
   *
   * Without it the runtime answers `wrong-session` and the recording keeps
   * running — which is precisely what the previous implementation did.
   */
  const stop = useCallback(async () => {
    // Addressed too. An unaddressed STOP carrying tab A's session id would
    // reach whichever tab was active; tab B would answer `wrong-session` and
    // the recording in A would keep running while the panel believed it had
    // stopped it.
    const tabId = boundTabId;
    if (tabId === null) return;
    setPending('stop');
    const ack = await sendRuntimeMessage({
      type: 'STOP_RECORDING',
      targetTabId: tabId,
      sessionId: active.current ?? undefined,
    });
    if (ack.ok) active.current = null;
    setPending(null);
    await refresh();
  }, [boundTabId, refresh]);

  const button = recordButtonModel(view, pending);

  const toggle = useCallback(async () => {
    if (button.action === 'start') await start();
    else if (button.action === 'stop') await stop();
  }, [button.action, start, stop]);

  return { view, pending, confirmed, button, toggle, refresh };
}

export type RecordingController = ReturnType<typeof useRecording>;

/**
 * WS9 DL-84 — WHAT WAS RECORDED, AND WHAT WAS NOT.
 *
 * A FOURTH question about the same tab, and deliberately separate from the
 * three that already exist: `useRecording` asks whether a recorder is running,
 * `useExport` whether a recording can be copied, `useRecordingWorkspace` what
 * it says. This asks how much of what the user did actually made it in.
 *
 * Both numbers are READ from the durable state the runtime already publishes —
 * nothing is computed here. The panel performs no verification, consults no
 * verdict, resolves no locator and knows nothing about frames; it renders an
 * outcome the admission boundary already decided.
 *
 *   recorded  `workflow.steps.length` — the SAME quantity `appendStep` feeds to
 *             `shouldStopRecording`, so this number and the 40/100 contract are
 *             the same thing. Coalescing is already applied: two clicks that
 *             became one `dblclick` are one action, here as everywhere.
 *   refused   the bounded tally on the observation. Absent means none.
 *
 * It does NOT touch the lifecycle. DL-79's rule holds: a count is not a
 * lifecycle, and five recorded actions say nothing about whether a recorder is
 * running right now.
 */
export interface RecordingFeedback {
  recorded: number;
  refused: number;
  lastRefusal: RecordingRefusal | null;
}

const NO_FEEDBACK: RecordingFeedback = { recorded: 0, refused: 0, lastRefusal: null };

/** Categorical, and short enough to sit on one line beside the banner. */
const REFUSAL_COPY: Record<RecordingRefusal, string> = {
  'frame-unsupported': "actions inside a frame can't be recorded yet",
  ambiguous: "the element couldn't be told apart from others",
  'not-found': 'the element was no longer on the page',
  unverifiable: "the element couldn't be checked",
  'limit-reached': 'this recording is full',
};

export function useRecordingFeedback(deps?: RecordingDurableDeps): RecordingFeedback {
  const [feedback, setFeedback] = useState<RecordingFeedback>(NO_FEEDBACK);

  /**
   * WS9 DL-91 — the same binding-not-object rule as `useRecording` above, and
   * for a sharper reason here: this effect sets a FRESHLY BUILT object on every
   * read, so React can never bail out of the render that follows. Depending on
   * the carrying object therefore closed the loop — read, new object, render,
   * new dependency, re-arm, read — and the real browser measured 10,408
   * observation reads and 15,612 workflow reads in 24.9 seconds. The values
   * below identify the source; the object that carried them does not.
   */
  const tabId = deps?.tabId ?? null;
  const gateway = deps?.gateway;

  useEffect(() => {
    let alive = true;
    if (!gateway || tabId === null) {
      setFeedback(NO_FEEDBACK);
      return;
    }
    const read = () => {
      void (async () => {
        const [workflow, observation] = await Promise.all([
          readDurableWorkflow(gateway, tabId),
          readDurableObservation(gateway, tabId),
        ]);
        if (!alive) return;
        const record = observation.valid ? observation.value : null;
        setFeedback({
          recorded: workflow.valid && workflow.value ? workflow.value.steps.length : 0,
          refused: record?.refusedCount ?? 0,
          lastRefusal: record?.lastRefusal ?? null,
        });
      })();
    };
    read();
    // The SAME interval the lifecycle already polls on, so the panel keeps one
    // beat rather than acquiring a second one.
    const timer = setInterval(read, LIFECYCLE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [tabId, gateway]);

  return feedback;
}

/**
 * The single dark-maroon dot in the header. Hidden while the flag is off.
 *
 * Everything it shows comes from `recordButtonModel` — the blink, the colour,
 * the label and the accessible name — so there is exactly one place where a
 * lifecycle state becomes a recording claim, and it is a pure function with
 * exhaustive tests.
 */
export function RecordButton({
  model,
  disabled,
  onToggle,
}: {
  model: ReturnType<typeof recordButtonModel>;
  disabled: boolean;
  onToggle: () => void;
}) {
  if (!RECORDING_ENABLED) return null;
  const inert = disabled || model.action === 'none';
  return (
    <button
      onClick={onToggle}
      title={model.name}
      aria-label={model.name}
      aria-pressed={model.live}
      aria-busy={model.busy}
      disabled={inert}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        border: 'none',
        borderRadius: 6,
        cursor: inert ? 'default' : 'pointer',
        fontSize: 11,
        fontWeight: 700,
        background: model.live ? '#166534' : '#374151',
        color: model.live ? '#bbf7d0' : '#9ca3af',
        transition: 'all .2s',
        flexShrink: 0,
        opacity: inert ? 0.4 : 1,
      }}
    >
      <span
        style={{
          fontSize: 11,
          lineHeight: 1,
          color: model.live ? '#ef4444' : '#881337',
          animation: model.live ? 'rec-blink 1s infinite' : 'none',
        }}
      >
        ●
      </span>
      {model.label}
    </button>
  );
}

/**
 * The status banner, gated with the control it belongs to.
 *
 * It is a POLITE LIVE REGION and it is always mounted while the flag is on, so
 * a state change is announced rather than dropped — WS8's rule for the status
 * bar, and it matters more here than anywhere else in the panel, because the
 * change a user most needs to hear is "the recorder stopped responding".
 *
 * It reports `stale` and `stopped` instead of quietly vanishing.
 * `heartbeatTimeoutMs`' own doc requires that "stale state is surfaced rather
 * than trusted"; a banner that simply disappeared would leave the user
 * believing a recording is still running somewhere off-screen.
 */
export function RecordingBanner({
  view,
  pending,
  confirmed = true,
  feedback = NO_FEEDBACK,
}: {
  view: RecordingView;
  pending: PendingRequest;
  /**
   * WS9 DL-89 — did the LIVE authority answer? Optional and defaulting to
   * `true` so this component behaves exactly as before for any caller that
   * does not have the fact; the Side Panel, which does, always passes it.
   */
  confirmed?: boolean;
  /** WS9 DL-84. Optional so the banner still renders with nothing to add. */
  feedback?: RecordingFeedback;
}) {
  if (!RECORDING_ENABLED) return null;
  const line = recordingBannerLine(view, pending, confirmed);
  /**
   * WS9 DL-89 — the green ground and the blinking dot ARE a recording claim,
   * made in colour instead of words. Leaving them lit under an "unconfirmed"
   * sentence would state in the loudest channel the very thing the sentence
   * withdraws, so the same one fact governs both.
   */
  const live = view === 'active' && !pending && confirmed;
  /**
   * The counts live INSIDE the banner's existing `role="status"` region rather
   * than in a second one. A separate polite live region announcing a changing
   * number would talk over the one that says whether recording is happening at
   * all, and the number is a qualification of that status, not a rival to it.
   *
   * Silence when there is nothing to say: no recorded actions AND no refusals
   * renders no claim, so a recording that has just started does not announce
   * "0 actions recorded" before the user has done anything.
   */
  const { recorded, refused, lastRefusal } = feedback;
  const tally =
    recorded === 0 && refused === 0
      ? null
      : [
          `${recorded} ${recorded === 1 ? 'action' : 'actions'} recorded`,
          refused > 0 ? `${refused} not recorded` : null,
        ]
          .filter(Boolean)
          .join(' · ');
  const why = refused > 0 && lastRefusal ? REFUSAL_COPY[lastRefusal] : null;
  return (
    <>
      <style>{`@keyframes rec-blink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      <div
        role="status"
        aria-live="polite"
        style={{
          padding: line ? '5px 12px' : 0,
          background: live ? '#166534' : '#3f2937',
          color: live ? '#bbf7d0' : '#fecdd3',
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {line && (
          <>
            <span
              aria-hidden="true"
              style={{ animation: live ? 'rec-blink 1s infinite' : 'none', fontSize: 12 }}
            >
              ●
            </span>
            <span style={{ flex: 1 }}>
              {line}
              {tally && (
                // Weight, not colour, separates the two facts — the banner
                // already carries meaning in its background, and a second
                // colour-only distinction would be unreadable to some users.
                <span style={{ display: 'block', fontWeight: 400, opacity: 0.9 }}>
                  {tally}
                  {why && ` — ${why}`}
                </span>
              )}
            </span>
          </>
        )}
      </div>
    </>
  );
}
