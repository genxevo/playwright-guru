/**
 * Playwright Guru — the `RecordedWorkflow` model (WS9).
 * ---------------------------------------------------------------------------
 * WHAT A RECORDING IS, STRUCTURALLY.
 *
 * MASTER-ROADMAP §18: `Record → capture action → SAME DomProbe → SAME
 * LocatorResolver → verified LocatorChain → verdict + rationale codes →
 * ElementFactsLite → RecordedWorkflow`, and "`RecordedTarget` stores **the
 * verified chain, not a rendered string**".
 *
 * This module is the last two arrows, and it is PURE — no DOM, no probe, no
 * resolver, no storage, no messages. Every rule that protects a recording lives
 * here as a function of data, so it can be tested at R3's `environment: 'node'`
 * and cannot be bypassed by whoever calls it.
 *
 * THERE IS NO SECOND LOCATOR REPRESENTATION.
 * `RecordedTarget.locator` is the EXISTING `RecommendedLocator` — the same
 * chain/verdict/counts/rationale shape `PickSnapshot` already carries. A
 * recorded action and a pick therefore describe a located element in exactly
 * one way, and a future change cannot let them disagree.
 *
 * THE FOUR RULES THIS MODEL ENFORCES, and the legacy defects each one closes
 * (the unreachable recorder in `entrypoints/content.ts`, which DL-64/D3 ruled is
 * REPLACED rather than extended):
 *
 *   1. BOUNDED.      `hardStop` refuses further actions and preserves what was
 *                    captured. Legacy: `[...prev, action]`, unbounded.
 *   2. UNINTERRUPTED. `warnAt` changes the reported STATE and nothing else.
 *                    The constant's own doc: "a teaching signal, not a gate".
 *   3. TRUNCATED.    values are cut to `maxValueLength`. Legacy: never cut.
 *   4. REDACTED.     a step marked redacted cannot hold a value, even if one is
 *                    handed to it. Legacy: no password exclusion at all.
 *
 * Rule 4 is defence in depth. `runtime/recorder.ts` never READS a sensitive
 * value; this refuses to STORE one. Either alone would be a single point of
 * failure, and the cost of the second is four lines.
 *
 * EVERY LIMIT COMES FROM `config/recording.ts`. That file's contract is that no
 * other module may define, hard-code or duplicate a recording number, and this
 * module holds none — DL-4's 600 ms-versus-500 ms drift is exactly what that
 * rule exists to prevent.
 *
 * NOT IN THIS SLICE (WS9 discovery §14's own sequencing): the activation
 * handshake, the heartbeat, persistence, `renderAction`/`renderSpecFile`, the
 * export menu and the structured workspace. `RECORDING_ENABLED` stays `false`.
 */

import {
  RECORDING_LIMITS,
  recordingLimitState,
  shouldStopRecording,
  type RecordingLimitState,
} from '../config/recording';
import type { RedactionReason } from './redaction';

import type { ElementFactsLite, RecommendedLocator } from '@playwright-guru/locator-engine';

// ─── Shapes ─────────────────────────────────────────────────────────────────

/**
 * What a recorded action points at.
 *
 * `locator` is the verified chain with its verdict, its measured counts and its
 * rationale CODES (never prose — R4). `facts` is the reduced fact set
 * `toElementFactsLite` produces, which exists precisely so 100 actions fit the
 * persisted-state budget.
 */
export interface RecordedTarget {
  locator: RecommendedLocator;
  facts: ElementFactsLite;
}

export type RecordedStepKind =
  'goto' | 'click' | 'dblclick' | 'fill' | 'check' | 'uncheck' | 'selectOption';

export interface RecordedStep {
  kind: RecordedStepKind;
  /** Absent only for `goto`. */
  target?: RecordedTarget;
  /** Present only when the value was allowed to be read AND is non-empty. */
  value?: string;
  /**
   * Set when the value was deliberately withheld.
   *
   * The step is still recorded. Dropping it entirely would misrepresent what
   * the user did; keeping it without the value keeps the shape honest and the
   * secret out, and lets a later renderer say "a password was typed here"
   * rather than inventing one.
   */
  redacted?: RedactionReason;
  /** Present only for `goto`. */
  url?: string;
  timestamp: number;
}

export interface RecordedWorkflow {
  schemaVersion: 1;
  id: string;
  startedAt: number;
  url: string;
  steps: RecordedStep[];
  /** Set once recording ended. Actions captured before it are preserved. */
  stopped?: { reason: 'limit' | 'user'; at: number };
}

/** What `appendStep` did with the action it was given. */
export type AppendOutcome = 'appended' | 'coalesced' | 'refused-stopped';

export interface AppendResult {
  workflow: RecordedWorkflow;
  outcome: AppendOutcome;
  /** Where the workflow now sits relative to its limits. */
  state: RecordingLimitState;
}

// ─── Construction ───────────────────────────────────────────────────────────

export function createWorkflow(init: {
  id: string;
  url: string;
  startedAt: number;
}): RecordedWorkflow {
  return {
    schemaVersion: 1,
    id: init.id,
    startedAt: init.startedAt,
    url: init.url,
    steps: [],
  };
}

// ─── Rules 3 and 4, applied in exactly one place ───────────────────────────

/**
 * The only way a step enters a workflow.
 *
 * A redacted step loses its value outright — not truncated, not masked,
 * removed — so no length, prefix or shape of a secret survives. Everything else
 * is cut to `maxValueLength`.
 */
function sanitise(step: RecordedStep): RecordedStep {
  const out: RecordedStep = { ...step };
  if (out.redacted) {
    delete out.value;
    return out;
  }
  if (out.value !== undefined) out.value = out.value.slice(0, RECORDING_LIMITS.maxValueLength);
  return out;
}

/**
 * Whether two steps point at the same element.
 *
 * Compared on the VERIFIED CHAIN, because that is what identifies the element
 * in this model — there is no rendered string to compare, by design.
 */
function sameTarget(a: RecordedStep, b: RecordedStep): boolean {
  if (!a.target || !b.target) return false;
  return JSON.stringify(a.target.locator.chain) === JSON.stringify(b.target.locator.chain);
}

// ─── Append ─────────────────────────────────────────────────────────────────

/**
 * Adds one action, applying every rule above.
 *
 * Returns a NEW workflow rather than mutating: a recording is state the UI
 * renders, and shared mutable state is how a panel ends up showing a count that
 * does not match its list.
 */
export function appendStep(workflow: RecordedWorkflow, step: RecordedStep): AppendResult {
  if (workflow.stopped) {
    return { workflow, outcome: 'refused-stopped', state: 'stopped' };
  }

  const incoming = sanitise(step);
  const previous = workflow.steps[workflow.steps.length - 1];

  // ── Coalescing. Consecutive edits to one field are ONE fill; a quick second
  //    click on one element is ONE dblclick. Both windows come from the
  //    constant, never from a literal here.
  if (
    previous &&
    incoming.kind === 'fill' &&
    previous.kind === 'fill' &&
    sameTarget(previous, incoming) &&
    incoming.timestamp - previous.timestamp <= RECORDING_LIMITS.fillDebounceMs
  ) {
    const merged = sanitise({
      ...previous,
      value: incoming.value,
      ...(incoming.redacted ? { redacted: incoming.redacted } : {}),
      timestamp: incoming.timestamp,
    });
    return replaceLast(workflow, merged, 'coalesced');
  }

  if (
    previous &&
    incoming.kind === 'click' &&
    previous.kind === 'click' &&
    sameTarget(previous, incoming) &&
    incoming.timestamp - previous.timestamp < RECORDING_LIMITS.dblclickWindowMs
  ) {
    const merged: RecordedStep = { ...previous, kind: 'dblclick', timestamp: incoming.timestamp };
    return replaceLast(workflow, merged, 'coalesced');
  }

  // ── Rule 1. The cap refuses the action and preserves the recording.
  if (shouldStopRecording(workflow.steps.length)) {
    const stopped: RecordedWorkflow = {
      ...workflow,
      stopped: { reason: 'limit', at: incoming.timestamp },
    };
    return { workflow: stopped, outcome: 'refused-stopped', state: 'stopped' };
  }

  const steps = [...workflow.steps, incoming];
  const next: RecordedWorkflow = {
    ...workflow,
    steps,
    ...(shouldStopRecording(steps.length)
      ? { stopped: { reason: 'limit' as const, at: incoming.timestamp } }
      : {}),
  };
  // Rule 2: reaching `warnAt` changes only this reported state.
  return { workflow: next, outcome: 'appended', state: recordingLimitState(steps.length) };
}

function replaceLast(
  workflow: RecordedWorkflow,
  step: RecordedStep,
  outcome: AppendOutcome,
): AppendResult {
  const steps = [...workflow.steps.slice(0, -1), step];
  return { workflow: { ...workflow, steps }, outcome, state: recordingLimitState(steps.length) };
}

/** Ends a recording the user stopped. Captured actions are preserved. */
export function stopWorkflow(workflow: RecordedWorkflow, at: number): RecordedWorkflow {
  if (workflow.stopped) return workflow;
  return { ...workflow, stopped: { reason: 'user', at } };
}

// ─── The byte budget ────────────────────────────────────────────────────────

export type WorkflowBudgetStatus = 'ok' | 'over-budget';

export interface WorkflowBudgetAssessment {
  bytes: number;
  status: WorkflowBudgetStatus;
}

/** Serialised size, measured the same way `estimateSnapshotBytes` measures a pick. */
export function estimateWorkflowBytes(workflow: RecordedWorkflow): number {
  return JSON.stringify(workflow).length;
}

/**
 * Measures a workflow against §WS9's "≤500 KB at 100 actions".
 *
 * REPORTS, never truncates. A workflow that quietly dropped actions to fit a
 * number would be a misleading record of what the user did — the same failure
 * class WS6.2 spent two gates removing from verification.
 */
export function assessWorkflowBudget(workflow: RecordedWorkflow): WorkflowBudgetAssessment {
  const bytes = estimateWorkflowBytes(workflow);
  return {
    bytes,
    status: bytes > RECORDING_LIMITS.maxWorkflowBytes ? 'over-budget' : 'ok',
  };
}
