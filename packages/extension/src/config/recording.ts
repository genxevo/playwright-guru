/**
 * Playwright Guru — Recording limits (WS0).
 * ---------------------------------------------------------------------------
 * THE SINGLE AUTHORITATIVE SOURCE FOR RECORDING LIMITS.
 *
 * No other module may define, hard-code or duplicate these numbers. A WS0 test
 * asserts that `warnAt` and `hardStop` are declared in exactly one file, so a
 * second copy fails the build rather than drifting quietly.
 *
 * BEHAVIOUR (locked)
 *   1 – 39    counter is neutral                      recording continues
 *   40 – 99   counter turns amber, one-time hint      recording CONTINUES,
 *                                                     UNINTERRUPTED
 *   100       recording stops, state preserved,       user gets a clear reason
 *             actions remain exportable               and a next action
 *
 * `warnAt` is a teaching signal, not a gate. It must never pause, modal, or
 * otherwise interrupt a recording in progress.
 *
 * WHY 100 AND NOT 30
 * A realistic login → search → checkout → assert flow runs to roughly 34
 * actions. A 30-action cap would truncate the single most valuable recording a
 * user makes, at the worst possible moment. 100 sits comfortably inside all
 * three real constraints:
 *   • storage — ~2 KB per action with ElementFactsLite ⇒ ~200 KB against a
 *     5 MB baseline
 *   • render  — 100 rows is trivial
 *   • human   — a test with >100 actions is a test-design problem, and the
 *     amber counter is where we say so
 *
 * WS0 establishes ownership only. The recorder that consumes these values is
 * WS9; guided assertion capture is WS10.
 */

export const RECORDING_LIMITS = {
  /** Counter turns amber. Recording continues uninterrupted. */
  warnAt: 40,

  /** Recording auto-stops. Captured actions are preserved. */
  hardStop: 100,

  /** Captured input values are truncated to this length before storage. */
  maxValueLength: 500,

  /** Consecutive edits to one field coalesce into a single `fill`. */
  fillDebounceMs: 500,

  /** A second click inside this window becomes `dblclick`. */
  dblclickWindowMs: 400,

  /** The recorder refreshes its liveness marker at this interval. */
  heartbeatMs: 5_000,

  /**
   * After this much silence the UI shows a degraded state.
   *
   * This is half of the guarantee that the product never claims to be recording
   * when it is not: the banner is driven by state the content script writes, and
   * stale state is surfaced rather than trusted.
   */
  heartbeatTimeoutMs: 15_000,
} as const;

export type RecordingLimits = typeof RECORDING_LIMITS;

/** Where a recording sits relative to its limits. */
export type RecordingLimitState = 'normal' | 'warning' | 'stopped';

export function recordingLimitState(actionCount: number): RecordingLimitState {
  if (actionCount >= RECORDING_LIMITS.hardStop) return 'stopped';
  if (actionCount >= RECORDING_LIMITS.warnAt) return 'warning';
  return 'normal';
}

/** True only at the hard limit. `warnAt` must never stop a recording. */
export function shouldStopRecording(actionCount: number): boolean {
  return actionCount >= RECORDING_LIMITS.hardStop;
}
