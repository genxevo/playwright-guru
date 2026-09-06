/**
 * WS9 Decision A — THE TEST-ONLY RECORDING-ENABLED SUBSTITUTE.
 * ============================================================================
 * THIS FILE IS NEVER PART OF THE PRODUCT. It lives under `test/`, it is
 * imported by nothing in `src/` or `entrypoints/`, and the only thing that ever
 * reaches it is `wxt.e2e.config.ts` — a build configuration that is not invoked
 * by `pnpm build`, does not write into `.output/`, and produces an artifact
 * with a DIFFERENT extension name so it can never be mistaken for the product.
 *
 * ═══ WHY IT EXISTS ═══
 *
 * The WS9 exit criterion is:
 *
 *   "An E2E test that kills the content script proves the RECORDING banner
 *    cannot appear."
 *
 * Proving a banner CANNOT appear is only meaningful if it CAN. Against the
 * production artifact `RECORDING_ENABLED` is `false`, the runtime refuses
 * `start()` with `recording-disabled`, and the banner is unreachable — so its
 * absence after a kill proves nothing at all. DL-86 recorded that honestly as
 * `PASS (necessary, NOT sufficient)` rather than claiming closure.
 *
 * The sufficient proof needs a genuinely ACTIVE recording first. This module is
 * the ONE thing that differs between the artifact that can reach ACTIVE and the
 * artifact we ship.
 *
 * ═══ WHY IT IS A SEPARATE MODULE AND NOT A FLAG ═══
 *
 * Every alternative was rejected in DL-87, and each rejection still holds:
 *
 *   • flipping the constant                — ships recording. Refused.
 *   • `import.meta.env` / `define`         — makes the production constant
 *                                            environment-dependent, so the
 *                                            product's own rollback mechanism
 *                                            grows a second behaviour path in
 *                                            the one module whose entire
 *                                            purpose is to be provably closed.
 *   • a runtime toggle / URL / storage /
 *     debug switch / production test hook  — a shipped way to turn recording
 *                                            on is recording, shipped.
 *
 * A build-time MODULE SUBSTITUTION touches none of that. `src/config/
 * recording.ts` keeps a literal `export const RECORDING_ENABLED = false;` with
 * nothing to override, no branch, no environment read and no new call site. The
 * production graph never contains this file; the E2E graph never contains that
 * constant. Two artifacts, one difference, no shared switch.
 *
 * ═══ WHY IT RE-EXPORTS RATHER THAN REDECLARES ═══
 *
 * `src/config/recording.ts` states its own contract at the top: "No other
 * module may define, hard-code or duplicate these numbers", and a WS0 test
 * enforces it. A substitute that copied `warnAt: 40` and `hardStop: 100` would
 * break that contract in spirit immediately and in fact the moment either
 * number changed — the E2E artifact would then be recording under limits the
 * product does not have, and every count this suite asserts would be measuring
 * a different extension.
 *
 * So the limits, the state function and the stop predicate are RE-EXPORTED from
 * the single authoritative source, unmodified. `RECORDING_ENABLED` is the only
 * declaration in this file, and there is no application logic here of any kind.
 * The substitution plugin skips exactly this one importer, and asserts at the
 * end of the build that it is the ONLY module still importing the production
 * config — so this exemption cannot quietly widen.
 */

export {
  RECORDING_LIMITS,
  recordingLimitState,
  shouldStopRecording,
  type RecordingLimits,
  type RecordingLimitState,
} from '../../src/config/recording';

/**
 * The one line that differs from production.
 *
 * `src/config/recording.ts` says `false` and MUST continue to say `false`; that
 * is asserted by `preview-gate.test.ts`, by `ws9-finalization.test.ts`, by the
 * E2E suite against the production artifact, and by a guard in
 * `ws9-decision-a-e2e-build.test.ts` that reads this repository's own text.
 */
export const RECORDING_ENABLED = true;
