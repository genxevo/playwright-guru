import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { DEVTOOLS_TARGET_ATTR } from '../utils/messaging';
import type {
  RuntimeMessage,
  RuntimeMessageAck,
  VerifySelectorMessage,
  VerifyLocatorExpressionMessage,
  VerificationStatus,
  PersistPickMessage,
  PersistPickerStateMessage,
  PersistRecordingStateMessage,
} from '../utils/messaging';
import { normalizeAck } from '../utils/messaging';
import {
  verifyLocatorExpression,
  classifyVerification,
  type ProbeErrorCode,
} from '@playwright-guru/locator-engine';
import { LiveDomProbe } from '../src/runtime/probe';
import { capturePick } from '../src/runtime/capture';
import { createPicker } from '../src/runtime/picker';
import {
  createRecordingRuntime,
  HEARTBEAT_INTERVAL_MS,
} from '../src/runtime/recording';

const LOG = '[PlaywrightGuru/content]';

export default defineContentScript({
  matches: ['<all_urls>'],
  // WS3: inject into every frame, not only the top document, so the picker,
  // Verify Selector, and DevTools pick all reach elements inside <iframe>s.
  // The manifest's content_scripts block is generated from this config —
  // there is no separate wxt.config.ts edit for it.
  allFrames: true,
  main() {
    /**
     * WS4 — persistence crosses the background boundary.
     *
     * A content script cannot know its own tab id, and WS4 keys session state
     * by exactly that, so the write is requested rather than performed here:
     * `background.ts` reads the tab identity from `sender.tab.id` and writes
     * through the one storage gateway. Keeping the gateway on that side of the
     * seam is also what keeps the storage implementation out of `content.js`.
     *
     * Failures are no longer invisible: the ack says whether the state was
     * actually saved, where before a rejected `storage.local.set` disappeared.
     */
    function persist(
      message: PersistPickMessage | PersistPickerStateMessage | PersistRecordingStateMessage,
    ): void {
      void browser.runtime
        .sendMessage(message)
        .then((response) => {
          const ack = normalizeAck(response as RuntimeMessageAck | undefined);
          if (!ack.ok) console.warn(`${LOG} could not persist ${message.type}`, ack.error);
        })
        .catch((error: unknown) => {
          console.warn(`${LOG} could not persist ${message.type}`, String(error));
        });
    }

    const picker = createPicker((el) => {
      const { stored } = capturePick(el);
      persist({ type: 'PERSIST_PICK', pick: stored });
    });

    // ── WS9 slice 3 — the recording runtime ──────────────────────────────
    //
    // Mirrors the picker exactly: a message activates it, it owns its own
    // content-side state, and `content.ts` stays a bootstrap that routes.
    //
    // `RECORDING_ENABLED` is still `false`, and the runtime defaults `enabled`
    // to it, so START_RECORDING is refused today. That is deliberate: hiding
    // the Record button is not a security boundary — a message can still
    // arrive — so the feature flag fails closed here as well as in the UI.
    //
    // The heartbeat interval lives here rather than inside the runtime so the
    // runtime stays timer-free and deterministically testable. Its value comes
    // from `RECORDING_LIMITS`; this file declares no timing number of its own.
    //
    // WS9 slice 5B — the runtime EMITS its state; this file carries it.
    //
    // The sink is injected here rather than built into the runtime because
    // `browser.runtime` may only be touched from the `entrypoints` and
    // `src/browser` directories (R1), and because it keeps travel one-way: the
    // runtime publishes and never reads back, so no stored record can become
    // the runtime's opinion of itself. The message goes through the SAME
    // content-to-background persistence path `PERSIST_PICK` already uses — the
    // background supplies the tab identity from `sender.tab.id`, which a page
    // cannot forge, and performs the write through the one storage gateway.
    const recording = createRecordingRuntime({
      doc: document,
      now: () => Date.now(),
      nonce: () => Math.random().toString(36).slice(2),
      persist: ({ observation, workflow }) =>
        persist({ type: 'PERSIST_RECORDING_STATE', observation, ...(workflow ? { workflow } : {}) }),
    });
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * WS9 navigation slice (DL-83) — ONE RECORDER PER TAB, IN THE TOP FRAME.
     *
     * This content script is injected with `allFrames: true`, and the background
     * reaches it with `browser.tabs.sendMessage(tabId, message)`, which carries
     * NO `frameId` — so a START_RECORDING arrived at every frame in the tab.
     * Each frame holds its own `createRecordingRuntime`, so each minted its own
     * session, each attached its own listeners, and each published to the ONE
     * tab-scoped `recording-observation` / `recording-workflow` pair. Whichever
     * frame wrote last became "the" recording, and the session id the panel held
     * could stop only the frame that minted it.
     *
     * The fix is a single comparison, and it costs no permission and no new API:
     * only the top frame answers the three recording messages. A sub-frame
     * returns `false` WITHOUT calling `sendResponse`, so it is not a responder at
     * all — Chrome then delivers the top frame's answer, deterministically,
     * instead of whichever frame replied first. If no frame answers (a case the
     * top frame's presence makes unreachable in a normal tab), `sendMessage`
     * resolves `undefined`, `normalizeAck` turns that into `NO_HANDLER`, and the
     * panel reads `unknown` — which never displays as recording.
     *
     * This is about SESSION OWNERSHIP only. It is not the reason frame elements
     * are unrecordable; that refusal lives in the runtime's admission rule, and
     * holds even for a frame element clicked while the top frame records.
     */
    const isTopFrame = window.top === window.self;

    function startRecordingSession(): RuntimeMessageAck {
      const result = recording.start(Date.now());
      if (!result.ok) return { ok: false, error: result.error };
      if (heartbeatTimer === null) {
        heartbeatTimer = setInterval(() => recording.tick(Date.now()), HEARTBEAT_INTERVAL_MS);
      }
      return { ok: true, sessionId: result.sessionId };
    }

    function stopRecordingSession(sessionId: string | undefined): RuntimeMessageAck {
      const result = recording.stop(sessionId ?? '', Date.now());
      if (heartbeatTimer !== null && result.ok) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    }

    // ── Message receiver ─────────────────────────────────────────────────
    browser.runtime.onMessage.addListener(
      (message: RuntimeMessage, _sender, sendResponse: (r: RuntimeMessageAck) => void) => {
        switch (message.type) {
          case 'ACTIVATE_PICKER':
            activatePicker(); sendResponse({ ok: true }); return false;
          case 'DEACTIVATE_PICKER':
            deactivatePicker(); sendResponse({ ok: true }); return false;
          case 'VERIFY_SELECTOR':
            handleVerify(message, sendResponse); return false;
          case 'VERIFY_LOCATOR_EXPRESSION':
            handleVerifyLocatorExpression(message, sendResponse); return false;
          case 'PICK_DEVTOOLS_TARGET':
            handleDevtoolsPick(sendResponse); return false;
          // The three recording messages, answered by the top frame ALONE —
          // see `isTopFrame` above. A sub-frame falls through to `return false`
          // without responding, so exactly one frame per tab is a responder.
          case 'START_RECORDING':
            if (!isTopFrame) return false;
            sendResponse(startRecordingSession()); return false;
          case 'STOP_RECORDING':
            if (!isTopFrame) return false;
            sendResponse(stopRecordingSession(message.sessionId)); return false;
          // WS9 slice 5A — a READ, and the panel's only source of truth about
          // recording. `state()` is `lifecycleStateOf`, a pure derivation from
          // the clock: it refreshes no heartbeat and extends no session, so a
          // panel polling this cannot keep a dead recording looking alive.
          case 'QUERY_RECORDING_STATE':
            if (!isTopFrame) return false;
            sendResponse({ ok: true, lifecycle: recording.state(Date.now()) }); return false;
          default: return false;
        }
      }
    );

    // ── Verify selector ──────────────────────────────────────────────────
    /**
     * WS7 — classifies a `ProbeError` into the SAME six-state
     * `VerificationStatus` `classifyVerification` below already uses for
     * measured evidence, so a raw CSS/XPath verify never has to invent a
     * second vocabulary for "this could not be answered". `INVALID_SELECTOR`/
     * `INVALID_XPATH` are bad syntax; `UNSUPPORTED` is a genuine environment
     * limit (e.g. XPath without `document.evaluate`); `SCOPE_DETACHED` and
     * `BUDGET_EXHAUSTED` are cases the probe simply could not measure —
     * exactly `unverifiable`'s definition, never `not-found` (an unmeasured
     * count is not the same claim as a measured zero).
     */
    function statusForProbeError(code: ProbeErrorCode): VerificationStatus {
      switch (code) {
        case 'INVALID_SELECTOR':
        case 'INVALID_XPATH':
          return 'invalid';
        case 'UNSUPPORTED':
          return 'unsupported';
        case 'SCOPE_DETACHED':
        case 'BUDGET_EXHAUSTED':
          return 'unverifiable';
      }
    }

    /**
     * Verify reports BOTH counts, through the SAME `DomProbe` the pick pipeline
     * uses — `resolver.ts`'s own doc comment is explicit that no surface may
     * reintroduce a second implementation of "how many elements does this
     * match". A probe is built fresh per request; nothing is cached across
     * calls.
     *
     * WS7 — `verifyStatus` classifies the outcome through the SAME
     * `classifyVerification` (measured evidence) / `statusForProbeError`
     * (probe error) pair that decides Playwright locator-expression truth
     * (WS6.2's `verifyLocatorExpression`, below). `count`/`visibleCount`/
     * `error` are unchanged; `verifyStatus` only adds a typed classification
     * so the UI can distinguish "invalid syntax" from "this environment
     * cannot tell you" instead of colouring every probe error identically.
     */
    function handleVerify(msg: VerifySelectorMessage, sendResponse: (r: RuntimeMessageAck) => void) {
      const probe = new LiveDomProbe(document);
      const result = msg.selectorType === 'css'
        ? probe.countCss(msg.selector)
        : probe.countXPath(msg.selector);
      if (result.error) {
        sendResponse({
          ok: false,
          error: `${result.error.code}${result.error.detail ? `: ${result.error.detail}` : ''}`,
          count: -1,
          visibleCount: -1,
          verifyStatus: statusForProbeError(result.error.code),
        });
        return;
      }
      sendResponse({
        ok: true,
        count: result.total,
        visibleCount: result.visible,
        verifyStatus: classifyVerification({ matchCount: result.total, visibleMatchCount: result.visible }),
      });
    }

    // ── Verify locator expression (WS6.2) ────────────────────────────────
    /**
     * Reuses the exact same `LiveDomProbe` `handleVerify` above builds — a
     * probe fresh per request, nothing cached across calls — but resolves
     * through `verifyLocatorExpression` (parse + `resolveChain`) instead of
     * a raw CSS/XPath count. `ok` is always `true` here: parsing/resolving
     * a user-typed expression can legitimately land on 'invalid',
     * 'unsupported' or 'unverifiable', and none of those are a transport
     * failure — they are the answer.
     */
    function handleVerifyLocatorExpression(
      msg: VerifyLocatorExpressionMessage,
      sendResponse: (r: RuntimeMessageAck) => void,
    ) {
      const probe = new LiveDomProbe(document);
      const verification = verifyLocatorExpression(msg.expression, probe);
      sendResponse({ ok: true, verification });
    }

    // ── DevTools pick ─────────────────────────────────────────────────────
    /**
     * Builds a pick for the element the DevTools Elements panel selected (WS5).
     *
     * The panel has already stamped `$0` with DEVTOOLS_TARGET_ATTR through
     * `inspectedWindow.eval`, which is the only channel that can see `$0`. The
     * attribute travels through the DOM both worlds share; everything after
     * this point is the SAME `capturePick` the Side Panel's click path uses, so
     * the two surfaces cannot disagree about an element.
     */
    function handleDevtoolsPick(sendResponse: (r: RuntimeMessageAck) => void) {
      const el = document.querySelector(`[${DEVTOOLS_TARGET_ATTR}]`);
      // Removed before anything else can throw, so a failure never leaves the
      // user's page marked.
      el?.removeAttribute(DEVTOOLS_TARGET_ATTR);
      if (!el) {
        sendResponse({ ok: false, error: 'No element selected in the Elements panel.' });
        return;
      }
      try {
        sendResponse({ ok: true, pick: capturePick(el).stored });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────
    function activatePicker(): void {
      if (picker.isActive()) return;
      persist({ type: 'PERSIST_PICKER_STATE', active: true });
      picker.activate();
      console.info(`${LOG} picker activated`);
    }

    function deactivatePicker(): void {
      if (!picker.isActive()) return;
      persist({ type: 'PERSIST_PICKER_STATE', active: false });
      picker.deactivate();
    }

    // ── V1 raw-line recorder: RETIRED (WS9 V1 raw-line migration, DL-82) ─────
    //
    // What stood here was the pre-WS3 recorder: `startRecording`,
    // `stopRecording`, `appendRecAction` and three capture listeners, writing
    // `RecordedAction` objects into the flat `pg_recorded_actions` key. It was
    // measured dead — the message switch above routes START_RECORDING and
    // STOP_RECORDING to `startRecordingSession`/`stopRecordingSession`, which
    // are the WS9 runtime, and nothing referenced these functions at all.
    //
    // Retiring it removes the last writer of the V1 keys, the last direct
    // `browser.storage` call in this file, and DL-4's hard-coded 600 ms fill
    // debounce, which contradicted `RECORDING_LIMITS.fillDebounceMs` (500).
    //
    // THE STORED DATA IS NOT TOUCHED. `pg_recording_active` and
    // `pg_recorded_actions` stay exactly as they are on every install that has
    // them; a V1 action carries no verdict, no match counts and no rationale,
    // so it cannot become a verified `RecordedStep` without fabricating the
    // evidence. Migration is recorded as DEFERRED, not done. See DL-82.
  },
});
