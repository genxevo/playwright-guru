import type {
  ElementAttributes,
  FrameInfo,
  ScoredCandidate,
  LocatorChain,
  VerificationResult,
  VerificationStatus,
} from '@playwright-guru/locator-engine';
import type { RecordingLifecycleState } from '../src/recording/session';
import type { RecordingObservation } from '../src/recording/persistence';
import type { RecordedWorkflow } from '../src/recording/workflow';

export type { RecordingLifecycleState, RecordingObservation, RecordedWorkflow };

export type {
  ElementAttributes,
  FrameInfo,
  ScoredCandidate,
  LocatorChain,
  VerificationResult,
  VerificationStatus,
};

// ─── Messages ─────────────────────────────────────────────────────────────

export interface ActivatePickerMessage {
  type: 'ACTIVATE_PICKER';
  /** Tab to send to — resolved by the side panel before messaging the background. */
  targetTabId?: number;
}
export interface DeactivatePickerMessage {
  type: 'DEACTIVATE_PICKER';
  targetTabId?: number;
}
/**
 * Asks the content script to build a pick for the element the DevTools Elements
 * panel has selected.
 *
 * WS5. DevTools cannot reach `$0` from anywhere but `inspectedWindow.eval`, and
 * a content script cannot see `$0` at all. The panel therefore does the one
 * thing only it can do — tag the selected element with `DEVTOOLS_TARGET_ATTR`
 * — and the content script, which already holds the verified engine, does
 * everything else. No locator intelligence crosses this boundary as source.
 */
export interface PickDevtoolsTargetMessage {
  type: 'PICK_DEVTOOLS_TARGET';
  targetTabId: number;
}

/**
 * The attribute the DevTools panel stamps on `$0` so the content script can
 * find it through the DOM the two share.
 *
 * Declared here because both sides must agree on it and neither may guess. It
 * is removed by the content script immediately after the lookup, so the page is
 * left as it was found.
 */
export const DEVTOOLS_TARGET_ATTR = 'data-pg-devtools-target';

export interface VerifySelectorMessage {
  type: 'VERIFY_SELECTOR';
  selector: string;
  /** 'css' or 'xpath' — determines which query API to use in the content script. */
  selectorType: 'css' | 'xpath';
  targetTabId: number;
}

/**
 * WS6.2 — verify a Playwright locator EXPRESSION (`getByRole('button', ...)`),
 * as opposed to `VerifySelectorMessage`'s raw CSS/XPath string.
 *
 * The expression crosses the wire as-is, not pre-parsed: the content script
 * calls the SAME `verifyLocatorExpression` (`@playwright-guru/locator-engine`)
 * that a direct-`DomProbe` caller (tests, this file's own doc precedent) would
 * — one function, one place a match count becomes a trust verdict, whether
 * it's reached through a live `LiveDomProbe` or a `FixtureDomProbe`.
 */
export interface VerifyLocatorExpressionMessage {
  type: 'VERIFY_LOCATOR_EXPRESSION';
  expression: string;
  targetTabId: number;
}

export type RuntimeMessage =
  | StartRecordingMessage
  | StopRecordingMessage
  | QueryRecordingStateMessage
  | ActivatePickerMessage
  | DeactivatePickerMessage
  | VerifySelectorMessage
  | VerifyLocatorExpressionMessage
  | PickDevtoolsTargetMessage
  | PersistPickMessage
  | PersistPickerStateMessage
  | PersistRecordingStateMessage;

/** Machine-readable failure reasons. Extend rather than adding free-text codes. */
export type AckCode =
  | 'NO_HANDLER'
  /**
   * WS3 — the background router's sender validation rejected the message: it
   * did not come from this extension's own UI (side panel / DevTools panel /
   * popup). None of today's message types are ever legitimately sent from a
   * tab-injected content script, so a sender carrying `sender.tab` is refused.
   */
  | 'UNTRUSTED_SENDER';

export interface RuntimeMessageAck {
  ok: boolean;
  error?: string;
  /** Set on failures a caller may want to branch on. Absent on success. */
  code?: AckCode;
  /** TOTAL DOM elements matched — populated for VERIFY_SELECTOR responses. */
  count?: number;
  /**
   * VISIBLE elements matched — the number the UI leads with, because that is
   * what a Playwright locator resolves against. Reported together with `count`
   * so one selector never shows two unexplained numbers.
   */
  visibleCount?: number;
  /**
   * WS9 slice 3 — the opaque recording session id, returned by START_RECORDING.
   *
   * The caller must present it again on STOP_RECORDING, which is what makes a
   * stale stop from a previous recording refusable rather than merely unlikely.
   * A plain string across the seam, because a branded type cannot survive
   * structured cloning; the content-side runtime is where it is compared.
   */
  sessionId?: string;
  /**
   * WS9 slice 5A — the recording lifecycle, populated for QUERY_RECORDING_STATE.
   *
   * The SAME `RecordingLifecycleState` the runtime derives, imported rather
   * than re-declared: a wire copy of the state names would be a second source
   * of truth for what "recording" means, and the two would eventually disagree.
   *
   * Absent is meaningful. A reply without it is not evidence of any state, and
   * `observedView` collapses it to `unknown` rather than guessing `inactive`.
   */
  lifecycle?: RecordingLifecycleState;
  /**
   * WS7 — populated for VERIFY_SELECTOR responses, classifying the raw
   * CSS/XPath result through the SAME six-state `VerificationStatus`
   * `classifyVerification` (`@playwright-guru/locator-engine`) already uses
   * for VERIFY_LOCATOR_EXPRESSION — one vocabulary, one function, for both
   * "was this a real match" questions. `count`/`visibleCount`/`error` are
   * unchanged and still populated exactly as before; this field only adds a
   * typed classification on top, so a probe error that could not measure
   * anything (`unsupported`/`unverifiable`) is distinguishable from a
   * confirmed zero-match result (`not-found`) or bad syntax (`invalid`)
   * instead of collapsing all three into one generic error string.
   */
  verifyStatus?: VerificationStatus;
  /**
   * The verified pick, populated for PICK_DEVTOOLS_TARGET responses.
   *
   * Carrying the whole snapshot back means DevTools renders exactly what the
   * Side Panel renders — same candidates, same counts, same ranking — because
   * it is literally the same object produced by the same function.
   */
  pick?: StoredPick;
  /**
   * Populated for VERIFY_LOCATOR_EXPRESSION responses. `ok` stays `true` for
   * every reachable status here — 'invalid'/'unsupported'/'unverifiable' are
   * legitimate verification OUTCOMES, not transport failures, so they never
   * borrow `ok:false`/`error` (those stay reserved for "the request itself
   * could not be handled" — no content script, wrong sender, and so on).
   */
  verification?: VerificationResult;
}

/**
 * Normalises a `browser.tabs.sendMessage` result into an acknowledgement.
 *
 * `sendMessage` resolves with `undefined` when the receiver has a listener but
 * no case for the message type — it never calls `sendResponse`. The relay used
 * to treat that as `{ ok: true }`, which is how a message with no handler at
 * all came back as success. An absent response is now an explicit failure.
 *
 * Pure and dependency-free so the guarantee is unit-testable; the background
 * relay is not importable from a test.
 */
export function normalizeAck(response: RuntimeMessageAck | undefined): RuntimeMessageAck {
  if (response === undefined || response === null) {
    return { ok: false, code: 'NO_HANDLER', error: 'The page did not handle this request.' };
  }
  return response;
}

// ─── Storage schema ────────────────────────────────────────────────────────

export interface StoredPick {
  attributes: ElementAttributes;
  chain: LocatorChain;
  candidates: ScoredCandidate[];
  frameInfo?: FrameInfo;
  /** First 300 chars of the element's outerHTML, for display in the panel. */
  outerHtml?: string;
  timestamp: number;
  url: string;
}

// ─── Recording ──────────────────────────────────────────────────────────────

/**
 * THE FROZEN V1 ON-DISK CONTRACT. DOCUMENTATION ONLY — no reader, no writer.
 * ---------------------------------------------------------------------------
 * `RecordedActionKind` and `RecordedAction` describe the value shape of the two
 * legacy flat keys `pg_recording_active` and `pg_recorded_actions`, written by
 * the pre-WS3 recorder in `entrypoints/content.ts`. That recorder was retired
 * in DL-82 and every code path that produced or consumed this type went with
 * it, so nothing in production imports these declarations any more. They are
 * kept — and only kept — because the DATA is deliberately preserved on every
 * install that has it, and deleting the only description of data we refuse to
 * delete would make that preservation unreadable. Being types, they are erased
 * at compile time and cost the bundle nothing.
 *
 * WHY IT WAS NOT MIGRATED TO `RecordedWorkflow`. A V2 `RecordedStep.target`
 * needs a `RecommendedLocator` — `verdict`, `matchCount`, `visibleMatchCount`,
 * `stepCounts[]`, `rationale[]` — plus `ElementFactsLite`'s `ancestors[]`,
 * `indexInParent` and `inShadowRoot`. A V1 action carries none of them, and the
 * page it was captured from is gone, so no honest function exists from this
 * shape to that one. Producing one would mean writing a verdict nobody
 * measured. Migration is DEFERRED and requires an owner decision; see DL-82.
 *
 * DO NOT add a reader, a writer, a converter or a WS4 descriptor for these.
 */
export type RecordedActionKind =
  | 'goto' | 'click' | 'dblclick'
  | 'fill' | 'check' | 'uncheck'
  | 'selectOption';

export interface RecordedAction {
  kind:      RecordedActionKind;
  attrs?:    ElementAttributes;   // undefined only for 'goto'
  value?:    string;              // fill value or selectOption value
  url?:      string;              // goto url
  timestamp: number;
}

export interface StartRecordingMessage { type: 'START_RECORDING'; targetTabId?: number }
/**
 * WS9 slice 3 — `sessionId` is the id START_RECORDING handed back.
 *
 * Optional so the existing callers still typecheck; the content-side runtime
 * refuses a stop whose id does not match the live session, so omitting it is a
 * refusal rather than a wildcard.
 */
export interface StopRecordingMessage  { type: 'STOP_RECORDING';  targetTabId?: number; sessionId?: string }

/**
 * WS9 slice 5A — "what is the recording lifecycle right now?"
 *
 * THE PANEL CANNOT KNOW THIS ON ITS OWN, and that is the point. The lifecycle
 * lives in the content script's `RecordingRuntime`, where slice 2 derives
 * liveness from the clock on every read; a panel that remembered "I started a
 * recording" would hold a boolean that cannot go stale, and would keep claiming
 * RECORDING for a recorder that had already died.
 *
 * It carries NOTHING but the question, and its answer carries nothing but
 * `lifecycle`. No workflow, no steps, no action values, no session id, no
 * counts — a recording's contents never cross this seam, and this message type
 * is structurally incapable of carrying them.
 *
 * It is a READ. The content-side handler calls `runtime.state(now)`, which is
 * `lifecycleStateOf` — a pure derivation that assigns nothing. Asking cannot
 * refresh a heartbeat, extend a session or delay staleness, which is what makes
 * a polling panel a consumer of liveness rather than a second producer of it.
 */
export interface QueryRecordingStateMessage {
  type: 'QUERY_RECORDING_STATE';
  targetTabId?: number;
}

// ─── WS4 — tab-scoped persistence from the content script ───────────────────
//
// A content script cannot know its own tab id, and WS4's session state is
// keyed by exactly that. These two messages are the only WS4 messages that
// travel FROM a tab: the background script supplies the identity from
// `sender.tab.id` and performs the write through the one storage gateway.
//
// Carrying the write across this seam — rather than importing the gateway into
// `content.ts` — is also what keeps the storage implementation out of
// `content.js`, the one bundle on the pick hot path.
//
// They deliberately carry NO `targetTabId`: the whole point is that the tab
// identity comes from the sender, not from the message.

export interface PersistPickMessage { type: 'PERSIST_PICK'; pick: StoredPick }
export interface PersistPickerStateMessage { type: 'PERSIST_PICKER_STATE'; active: boolean }

/**
 * WS9 slice 5B — the recording's durable projection, on its way to WS4.
 *
 * It travels the SAME content-to-background path the two messages above
 * already use, for the same reason: a content script cannot know its own tab
 * id, and recording state is tab-scoped. The background reads the identity
 * from `sender.tab.id` — which the browser fills in and a page cannot forge —
 * so this message deliberately carries NO `targetTabId`.
 *
 * `observation` is the bounded liveness record and is always present.
 * `workflow` is present only when the recording actually changed, so a
 * heartbeat refreshes liveness without rewriting the whole recording.
 *
 * What crosses here is the ALREADY-SANITISED model: slice 1 removed redacted
 * values at the model boundary and truncated the rest, and the validator on
 * the storage side refuses a redacted step that still carries a value.
 */
export interface PersistRecordingStateMessage {
  type: 'PERSIST_RECORDING_STATE';
  observation: RecordingObservation;
  workflow?: RecordedWorkflow;
}
