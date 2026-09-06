/**
 * Playwright Guru — live vs durable recording evidence (WS9, slice 5C).
 * ---------------------------------------------------------------------------
 * THE OWNER DECISION THIS MODULE IS:
 *
 *     LIVE CONTENT AUTHORITY  >  DURABLE OBSERVATION  >  UNKNOWN
 *
 * Slice 5B gave a recording a durable owner and deliberately shipped it with no
 * reader, because choosing between a stored row and a live answer is a
 * precedence rule, and inventing one quietly is how a truthful system stops
 * being one. The rule is authorised now, and this module is the only place it
 * exists.
 *
 * ═══ THE INVARIANT EVERYTHING HERE SERVES ═══
 *
 *     A DURABLE RECORD MAY NEVER RESURRECT A RECORDING THE LIVE RUNTIME HAS
 *     ALREADY DECLARED DEAD.
 *
 * The failure is concrete, not hypothetical. The content runtime reports
 * `stale` — it knows, because slice 2 derives staleness from the clock and the
 * recorder stopped beating. Storage still holds the observation written a
 * moment earlier, saying `active`. A panel that preferred the row would display
 * RECORDING for a recorder that is provably gone: exactly the lie
 * `RECORDING_ENABLED = false` exists to prevent, arriving through the back door
 * of a feature meant to make the product MORE truthful.
 *
 * So durable evidence is FALLBACK evidence, consulted only when the live
 * authority produced no answer at all. Not "when live is uncertain", not "when
 * live disagrees" — only when live said nothing.
 *
 * ═══ WHAT IT DELIBERATELY DOES NOT DO ═══
 *
 * It invents no lifecycle state: every value it returns comes from
 * `observedView` (slice 5A, what a live reply means) or `observedLifecycle`
 * (slice 5B, what a record plus a clock implies). It re-derives no expiry of its
 * own — a second staleness rule is a second timeout waiting to drift, so
 * expiry stays in one place and this module defers to it. It holds no clock:
 * `now` is injected, so every case below is deterministic.
 *
 * And it is PURE. No DOM, no React, no storage, no messages, no logging, no
 * side effects — it receives already-observed evidence and returns a view.
 * Guards pin all of that.
 */

import { observedView, type RecordingView } from './lifecycle-view';
import { observedLifecycle, type RecordingObservation } from './persistence';

/**
 * What the live content runtime said, in the shape `QUERY_RECORDING_STATE`
 * already answers with.
 *
 * Structural rather than the full `RuntimeMessageAck`, so this module stays
 * free of the messaging layer.
 */
export interface LiveEvidence {
  ok: boolean;
  lifecycle?: RecordingObservation['lifecycle'] | 'inactive';
}

/**
 * What durable storage yielded, in the shape WS4's `readTab` already returns.
 *
 * `valid` is not redundant with `value === null`. Today the gateway nulls an
 * unreadable value, but this rule must not depend on that staying true: a
 * record flagged invalid is refused even if something hands one over anyway.
 */
export interface DurableEvidence {
  value: RecordingObservation | null;
  valid: boolean;
}

export interface RecordingEvidence {
  live: LiveEvidence | null | undefined;
  durable: DurableEvidence | null | undefined;
  /** Injected. This module reads no clock. */
  now: number;
}

/**
 * The one place live and durable evidence are weighed against each other.
 *
 * The order below IS the owner decision, and the early return is what makes it
 * unconditional: once the live authority has spoken there is no path that even
 * looks at the record. `unknown` is the only live answer that yields, because
 * `observedView` produces it exactly when there was no live answer at all — a
 * dead or absent content script, a rejected send, a reply with no state, or a
 * failure that happens to mention one.
 *
 * `unknown` is also the floor: absence of a live answer AND absence of durable
 * evidence is `unknown`, never `inactive`. "Recording is off" is a claim, and
 * nothing here has grounds for it.
 */
export function resolveRecordingView(evidence: RecordingEvidence): RecordingView {
  const live = observedView(evidence.live);
  if (live !== 'unknown') return live;

  const durable = evidence.durable;
  if (!durable || !durable.valid || !durable.value) return 'unknown';

  // Expiry is decided in exactly one place, by the projection that owns it —
  // so a record claiming `active` past `heartbeatTimeoutMs` reads as `stale`
  // here for the same reason and by the same constant as everywhere else.
  return observedLifecycle(durable.value, evidence.now);
}
