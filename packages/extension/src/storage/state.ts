/**
 * WS4 — the WS4-owned state, described once.
 * ============================================================================
 *
 * Each descriptor is the single place that answers, for one piece of state:
 * which area holds it, whether it is global or per-tab, what a valid value
 * looks like, and what to fall back to when storage holds something else.
 *
 * The scope column is owner decision **O2** (DL-66), not an inference:
 *
 *   pg_pw_lang        GLOBAL preference          → local   (durable)
 *   pg_code_buffer    GLOBAL user workspace      → local   (durable)
 *   pg_picker_active  TAB-SCOPED session state   → session (transient)
 *   pg_last_pick      TAB-SCOPED session state   → session (transient)
 *
 * `pg_recording_active` and `pg_recorded_actions` are **deliberately absent**:
 * they are WS9-owned, and O2 says WS4 must not pull them into this
 * architecture. WS4 neither migrates nor clears them.
 *
 * Validators are hand-written and deterministic, following the project's
 * existing convention (`normalizeAck`, `classifyVerification`) — no schema
 * library, no new dependency. Each returns `null` for anything it does not
 * recognise; the gateway turns that into the declared default.
 */

import {
  validateObservation,
  validateWorkflow,
  type RecordingObservation,
} from '../recording/persistence';

import type { TargetLanguage } from '@playwright-guru/codegen';
import type { StateDescriptor } from '../application/ports/StorageGateway';
import type { RecordedWorkflow } from '../recording/workflow';
import type { StoredPick } from '../../utils/messaging';

/**
 * THE LANGUAGE PREFERENCE SPEAKS THE ONE LANGUAGE VOCABULARY (WS9, DL-85).
 * ---------------------------------------------------------------------------
 * This used to declare its own five-member list — `typescript`, `javascript`,
 * `python`, `java`, `csharp` — while the product generated and offered
 * `TargetLanguage`: `python_sync`, `csharp_async` and the rest. `LANGS` in
 * `ui/panel/constants.ts` offers `python_sync` and `csharp_async`, `useLanguage`
 * wrote them through a `as StoredLanguage` cast that hid the mismatch from the
 * compiler, and `writeGlobal` — which validates on the way IN — refused them
 * with `INVALID_VALUE`. **Choosing Python or C# therefore never persisted**: the
 * panel showed the choice until it was reopened, then fell back to TypeScript,
 * and nothing surfaced the failure because the write result is voided.
 *
 * `StoredLanguage` is now `TargetLanguage`. One vocabulary, so the two cannot
 * drift apart again, and the cast that concealed it is gone.
 */
export type StoredLanguage = TargetLanguage;

const LANGUAGES: readonly StoredLanguage[] = [
  'typescript',
  'javascript',
  'python_sync',
  'python_async',
  'java',
  'csharp_sync',
  'csharp_async',
];

/**
 * The WS4-era spellings, still on real disks, mapped FORWARD on read.
 *
 * `pw-lang` lives in `local`, so it survives restarts: an install that saved
 * `python` before this fix still holds it. Rejecting those values would make
 * `readGlobal` return the descriptor default and silently reset a user's saved
 * choice to TypeScript — the same silent loss this fix removes, arriving from
 * the other direction. They are upgraded instead, which needs no migration
 * entry: `migrateToV2` already writes whatever `validate` returns.
 *
 * `python` → `python_sync` and `csharp` → `csharp_async` are the mappings
 * `LANGS` itself documents ("sync = cleaner code, no await confusion";
 * "Playwright .NET is always async"), so this introduces no new judgement.
 */
const LEGACY_LANGUAGE: Readonly<Record<string, StoredLanguage>> = {
  python: 'python_sync',
  csharp: 'csharp_async',
};

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

/**
 * The generated-code workspace.
 *
 * Rejected **whole** rather than filtered: a buffer with a non-string in it is
 * evidence that something wrote a shape we do not understand, and silently
 * keeping "the good lines" would be a guess about which half is real.
 */
export const CODE_BUFFER: StateDescriptor<string[]> = {
  key: 'code-buffer',
  area: 'local',
  scope: 'global',
  defaultValue: [],
  validate: (raw) =>
    Array.isArray(raw) && raw.every((line) => typeof line === 'string') ? (raw as string[]) : null,
};

export const PW_LANG: StateDescriptor<StoredLanguage> = {
  key: 'pw-lang',
  area: 'local',
  scope: 'global',
  defaultValue: 'typescript',
  validate: (raw) => {
    if (typeof raw !== 'string') return null;
    if ((LANGUAGES as readonly string[]).includes(raw)) return raw as StoredLanguage;
    return LEGACY_LANGUAGE[raw] ?? null;
  },
};

export const PICKER_ACTIVE: StateDescriptor<boolean> = {
  key: 'picker-active',
  area: 'session',
  scope: 'tab',
  defaultValue: false,
  validate: (raw) => (typeof raw === 'boolean' ? raw : null),
};

/**
 * The last picked element.
 *
 * Validated structurally, not exhaustively: a pick is recognised by the three
 * fields every consumer reaches for before anything else — `attributes`,
 * `chain` and `candidates`. Deeper shapes stay the domain's business;
 * re-validating a `LocatorChain` here would duplicate the locator engine's own
 * contracts inside the storage layer, which is precisely the second-source-of-
 * truth this architecture exists to avoid.
 */
export const LAST_PICK: StateDescriptor<StoredPick | null> = {
  key: 'last-pick',
  area: 'session',
  scope: 'tab',
  defaultValue: null,
  validate: (raw) => {
    if (!isRecord(raw)) return null;
    if (!isRecord(raw['attributes'])) return null;
    if (!isRecord(raw['chain'])) return null;
    if (!Array.isArray(raw['candidates'])) return null;
    return raw as unknown as StoredPick;
  },
};

// ─── WS9 slice 5B — the durable owner of a recording ────────────────────────
//
// O2 (DL-66) is unchanged and still holds: the LEGACY flat keys
// `pg_recording_active` and `pg_recorded_actions` remain WS9-owned, and WS4
// neither migrates, clears nor reads them. Nothing below touches them.
//
// What DID move is that WS9 now describes its OWN state through this
// architecture instead of beside it (owner decision, DL-78). That is the
// opposite of the drift O2 guarded against: the alternative was a second
// persistence mechanism, which every rule in this repository forbids.
//
// Both are `session` + `tab` for a reason that is load-bearing rather than
// stylistic. `clearTab` and `sweepOrphans` only sweep the SESSION area, so a
// tab-scoped record in `local` would survive the tab that owned it forever;
// putting them here is what makes tab-close cleanup the EXISTING WS4 lifecycle
// rather than a second mechanism. The consequence is stated honestly: a
// recording does not outlive the browser session. Durable-across-restart
// recording would change the scope semantics O2 locked, and is an owner
// decision this slice did not take.

/**
 * The bounded liveness observation. Refreshed on every heartbeat, so it is
 * deliberately small and never grows.
 */
export const RECORDING_OBSERVATION: StateDescriptor<RecordingObservation | null> = {
  key: 'recording-observation',
  area: 'session',
  scope: 'tab',
  defaultValue: null,
  validate: validateObservation,
};

/**
 * The recording itself — the EXISTING `RecordedWorkflow`, stored as it is.
 *
 * Written only when it changes, never on a heartbeat. Bounded by the same
 * `RECORDING_LIMITS` that bound it in memory; the validator refuses anything
 * longer, so persistence can never be where an unbounded recording enters.
 */
export const RECORDING_WORKFLOW: StateDescriptor<RecordedWorkflow | null> = {
  key: 'recording-workflow',
  area: 'session',
  scope: 'tab',
  defaultValue: null,
  validate: validateWorkflow,
};

/** Every descriptor WS4 owns — the basis for "Clear data" and the sweep. */
export const WS4_DESCRIPTORS = [
  CODE_BUFFER,
  PW_LANG,
  PICKER_ACTIVE,
  LAST_PICK,
  RECORDING_OBSERVATION,
  RECORDING_WORKFLOW,
] as const;
