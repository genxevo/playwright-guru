/**
 * Playwright Guru — the runtime recorder (WS9).
 * ---------------------------------------------------------------------------
 * TURNS A DOM EVENT INTO A `RecordedStep`, AND NOTHING ELSE.
 *
 * §18 is explicit about the one thing this module must not do: "recording
 * consumes the shared verified locator engine. There is never a second locator
 * implementation." So `recordedTargetFor` builds NOTHING of its own — it calls
 * the existing `captureSnapshot`, which calls the existing `resolveCandidates`
 * → `LiveDomProbe` → `resolveStep`/`resolveChain` path that the Pick feature has
 * used since WS3, and reduces the result with the existing
 * `toElementFactsLite`. This file declares no probe, no resolver, no counting
 * and no DOM query of its own, and a source-text guard in
 * `test/ws9-recorder-capture.test.ts` pins that absence so it stays true.
 *
 * WHY `captureSnapshot` AND NOT `capturePick`
 * §18's arrow chain needs three things per action: the verified chain, its
 * verdict, and its rationale codes. `capturePick` produces the `StoredPick`
 * wire shape (ranked candidates); only `captureSnapshot` produces a
 * `RecommendedLocator` — chain + verdict + counts + rationale — which is exactly
 * `RecordedTarget.locator`. Reusing it means a recorded action and a pick can
 * never disagree about which strategy won.
 *
 * A SECRET IS NEVER READ.
 * The order of operations in `stepForFill` is the guarantee: classify the field
 * from its DESCRIPTIVE facts, and only if the answer is "not sensitive" touch
 * `.value` at all. Redacting after reading would be too late — the value would
 * already exist in a variable that some later change could log, coalesce or
 * serialise. The legacy recorder in `entrypoints/content.ts` demonstrates the
 * failure: its filter excludes `checkbox,radio,file,button,submit,reset` and
 * NOT `password`, and it reads `el.value` unconditionally.
 *
 * EVERY NUMBER COMES FROM `config/recording.ts`. This module holds no timing or
 * length literal of its own — DL-4's still-open 600 ms-versus-500 ms drift in
 * the legacy recorder is precisely the defect that rule prevents.
 *
 * NOT IN THIS SLICE, per the WS9 discovery gate's §14 sequencing: the event
 * listeners themselves, the activation handshake, the heartbeat, persistence,
 * `renderAction`/`renderSpecFile`, the export menu and the structured
 * workspace. Nothing here is wired into `content.ts`, and `RECORDING_ENABLED`
 * remains `false`, so this module is not on any shipped bundle's import graph —
 * the same arrangement `fact-model.ts` has had since WS3, and for the same
 * reason: the workstream that puts it in front of a user decides its cost.
 */

import { toElementFactsLite } from '@playwright-guru/locator-engine';

import { RECORDING_LIMITS } from '../config/recording';
import { redactionReasonFor, type SensitiveFieldFacts } from '../recording/redaction';
import { captureSnapshot } from './fact-model';

import type { RecordedStep, RecordedTarget } from '../recording/workflow';

// ─── §18's arrow chain, delegated in full ───────────────────────────────────

/**
 * Builds the verified target for an element, through the ONE shared engine.
 *
 * Every measurement in the result was made by `LiveDomProbe` and interpreted by
 * `resolveChain`; this function contributes only the reduction to
 * `ElementFactsLite`.
 */
export function recordedTargetFor(el: Element): RecordedTarget {
  const snapshot = captureSnapshot(el);
  return { locator: snapshot.recommended, facts: toElementFactsLite(snapshot.element) };
}

// ─── Field classification — descriptive facts only, never the value ────────

/**
 * Reads the facts a redaction decision may see.
 *
 * Deliberately does not read `.value`, and `SensitiveFieldFacts` cannot carry
 * one, so this function structurally cannot leak a secret to its caller.
 */
export function fieldFactsOf(el: Element): SensitiveFieldFacts {
  const facts: SensitiveFieldFacts = {};
  const type = el.getAttribute('type');
  if (type) facts.type = type;
  const autocomplete = el.getAttribute('autocomplete');
  if (autocomplete) facts.autocomplete = autocomplete;
  const name = el.getAttribute('name');
  if (name) facts.name = name;
  if (el.id) facts.id = el.id;
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) facts.placeholder = placeholder;
  const labelText = labelTextFor(el);
  if (labelText) facts.labelText = labelText;
  return facts;
}

/** The associated label's text, by `for=` or by containment. */
function labelTextFor(el: Element): string | undefined {
  const doc = el.ownerDocument;
  if (el.id) {
    const byFor = doc.querySelector(`label[for="${cssQuote(el.id)}"]`);
    const text = byFor?.textContent?.trim();
    if (text) return text;
  }
  const wrapping = el.closest('label');
  const text = wrapping?.textContent?.trim();
  return text ? text : undefined;
}

/** Escapes a value for a quoted CSS attribute selector (the E4 rule). */
function cssQuote(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function tagOf(el: Element): string {
  return el.tagName.toLowerCase();
}

function typeOf(el: Element): string {
  return (el.getAttribute('type') ?? '').toLowerCase();
}

/** Input types that behave as buttons rather than as editable fields. */
const BUTTON_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'image']);

// ─── Event → step ───────────────────────────────────────────────────────────

/**
 * A click, if this element's interaction is genuinely a click.
 *
 * THE NOISE FILTER. A typed field emits both a click and an input; a checkbox
 * emits both a click and a change. Recording both would put a redundant line in
 * every generated test, so the event that carries the user's INTENT owns the
 * element and the other is dropped:
 *
 *   text input / textarea → the fill owns it
 *   checkbox / radio      → the change owns it
 *   select                → the change owns it
 *
 * Returns `null` when the click is noise.
 */
export function stepForClick(el: Element, timestamp: number): RecordedStep | null {
  const tag = tagOf(el);
  const type = typeOf(el);

  if (type === 'checkbox' || type === 'radio') return null;
  if ((tag === 'input' || tag === 'textarea') && !BUTTON_INPUT_TYPES.has(type)) return null;
  if (tag === 'select') return null;

  return { kind: 'click', target: recordedTargetFor(el), timestamp };
}

/**
 * A fill, with the value read ONLY if the field is not sensitive.
 *
 * The classification happens first and `.value` is reached for second. That
 * order is the privacy guarantee, and it is asserted by a test that makes
 * `.value` throw.
 */
export function stepForFill(el: Element, timestamp: number): RecordedStep | null {
  const tag = tagOf(el);
  if (tag !== 'input' && tag !== 'textarea') return null;
  if (BUTTON_INPUT_TYPES.has(typeOf(el))) return null;

  const target = recordedTargetFor(el);
  const redacted = redactionReasonFor(fieldFactsOf(el));
  if (redacted) {
    // The value is never read. The step still exists, so the recording remains
    // a truthful account of what the user did.
    return { kind: 'fill', target, redacted, timestamp };
  }

  const raw = (el as HTMLInputElement | HTMLTextAreaElement).value ?? '';
  const value = raw.slice(0, RECORDING_LIMITS.maxValueLength);
  return value ? { kind: 'fill', target, value, timestamp } : { kind: 'fill', target, timestamp };
}

/**
 * A `change`, for the controls whose intent that event carries.
 *
 * Returns `null` for anything else, so a stray change on a div is not recorded.
 */
export function stepForChange(el: Element, timestamp: number): RecordedStep | null {
  const tag = tagOf(el);
  const type = typeOf(el);

  if (tag === 'select') {
    const value = (el as HTMLSelectElement).value;
    return { kind: 'selectOption', target: recordedTargetFor(el), value, timestamp };
  }
  if (type === 'checkbox') {
    const checked = (el as HTMLInputElement).checked;
    return { kind: checked ? 'check' : 'uncheck', target: recordedTargetFor(el), timestamp };
  }
  if (type === 'radio') {
    return { kind: 'check', target: recordedTargetFor(el), timestamp };
  }
  return null;
}
