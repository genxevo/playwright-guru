/**
 * Playwright Guru — the recorded-spec review projection (WS9, workspace).
 * ---------------------------------------------------------------------------
 * ONE ARROW, AND IT POINTS ONE WAY:
 *
 *     RecordedWorkflow → renderSpecFile(workflow, language) → text on a screen
 *
 * A user could already record (gated), the recording is already durably owned,
 * already truthfully observed and already copyable. What they could not do was
 * LOOK at it. This module is that, and its entire design is contained in one
 * word: **projection**.
 *
 * ═══ A NAME THAT IS ALREADY TAKEN, AND WHY THIS IS NOT IT ═══
 *
 * WS5 ships `ui/panel/CodeWorkspace.tsx`, and it is a DIFFERENT THING: the
 * user's locator code BUFFER — lines they append from picks, with Undo, Clear
 * and per-line Remove, persisted in `CODE_BUFFER`. DL-76 warned explicitly
 * against confusing the two. This module is the RECORDED SPEC review surface;
 * it touches that buffer not at all, adds no descriptor, and persists nothing.
 * The source of truth stays the `RecordedWorkflow`.
 *
 * ═══ WHY REVIEW-ONLY IS AN ARCHITECTURAL BOUNDARY, NOT A SCOPE CUT ═══
 *
 * A recorded `LocatorChain` is a VERIFIED artifact — measured once, at capture,
 * against a live DOM, by the one probe and the one resolver. The moment a user
 * can edit it, the product owes an answer to "is an edited locator still
 * verified?", and there is no honest answer that does not involve re-running
 * the verification this layer is forbidden to run. So the workspace shows. It
 * does not edit, reorder, insert, delete, assert, normalise or persist.
 *
 * ═══ AND IT RE-DECIDES NOTHING ═══
 *
 * No probe, no resolver, no ranker, no verifier, no second generator, no DOM,
 * no storage, no messages, no clock, no randomness, no React. It asks
 * `renderSpecFile` — slice 4, which asks WS1's `generateLocatorCode`, pinned by
 * 127 goldens — and reports what came back. `workspace.code === renderSpecFile(
 * workflow, language)` is asserted per language, so this module cannot quietly
 * grow an opinion about how a recording should look.
 *
 * ═══ FOUR STATES, EACH A DIFFERENT FACT ═══
 *
 *   unavailable  nothing to review: no bound tab, no stored recording, or one
 *                that cannot be trusted. NOT "recording is off" — DL-79's rule
 *                that lifecycle and workflow existence are different facts
 *                holds here, and this module never asks about the lifecycle.
 *   empty        a real recording that captured no actions. `renderSpecFile`
 *                returns `''` by its own convention; showing a blank panel
 *                would imply a successful render of nothing, so the state says
 *                so instead.
 *   ready        a real recording, rendered.
 *   error        a language this product cannot generate. Separated from
 *                `unavailable` because the recording is fine and the request
 *                is not.
 *
 * Nothing is repaired, guessed, or partially rendered. `validateWorkflow` — the
 * EXISTING validator, reused rather than duplicated — decides trust, so a
 * record refused here is refused by the same rule that refused to persist it.
 */

import { renderSpecFile } from './render';
import { validateWorkflow } from './persistence';

import type { RecordedWorkflow } from './workflow';
import type { TargetLanguage } from '@playwright-guru/codegen';

/** What the review surface is showing, and why. */
export type WorkspaceState = 'unavailable' | 'empty' | 'ready' | 'error';

/**
 * Everything the UI needs, and nothing else.
 *
 * No DOM node, no `ElementFacts`, no resolver, no probe, no session, no session
 * id, no lifecycle, no gateway, no tab, no storage envelope, no candidate list.
 * A state, a language, a string.
 */
export interface WorkspaceView {
  readonly state: WorkspaceState;
  readonly language: TargetLanguage;
  /** The rendered spec, or `''` when there is nothing honest to show. */
  readonly code: string;
  /** Whether a trustworthy recording exists — independent of whether it is empty. */
  readonly hasWorkflow: boolean;
}

function view(
  state: WorkspaceState,
  language: TargetLanguage,
  code: string,
  hasWorkflow: boolean,
): WorkspaceView {
  return { state, language, code, hasWorkflow };
}

/**
 * Project a recording into a read-only review.
 *
 * The workflow is re-validated even when it came from storage that already
 * validated it: this function is callable from anywhere, the existing validator
 * is one import away, and the cost of using it is nothing. There is then no
 * path by which an unvalidated record becomes code on a screen.
 *
 * It never mutates its input. `renderSpecFile` maps over the workflow and this
 * function only reads — no sort, no splice, no defaulting, no normalisation.
 */
export function buildWorkspaceView(
  workflow: RecordedWorkflow | null | undefined,
  language: TargetLanguage,
): WorkspaceView {
  const validated = workflow ? validateWorkflow(workflow) : null;
  if (!validated) return view('unavailable', language, '', false);

  let code: string;
  try {
    code = renderSpecFile(validated, language);
  } catch {
    // The renderer is exhaustive over the seven languages it declares, so this
    // is reachable only for a value that crossed a boundary claiming to be one
    // of them. Showing partial or stale code would be worse than saying so.
    return view('error', language, '', true);
  }

  // `renderSpecFile` returns `''` only for a recording with no actions — it
  // takes that branch before it looks a language up. So an empty render means
  // an empty recording, and `error` above is where an unrecognised language
  // lands, because the scaffold lookup finds nothing and destructuring throws.
  // (An empty recording asked for in an unrecognised language reports `empty`:
  // the recording really is empty, which is the more useful fact to state.)
  return code === '' ? view('empty', language, '', true) : view('ready', language, code, true);
}
