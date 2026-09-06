/**
 * Playwright Guru — StorageGateway port.
 * ---------------------------------------------------------------------------
 * Versioned, validated, namespaced storage. WS4 implements it.
 *
 * Phase 0 found six flat global keys with no schema version, no validation and
 * no tab scoping — so two tabs fought over one picker flag, and the first shape
 * change would corrupt existing installs silently.
 *
 * Every read is validated at the boundary: invalid data is treated as absent,
 * logged once, and never thrown into a render.
 *
 * WS4 — ADDITIVE EXTENSION (owner decision O1, DL-66)
 * ===========================================================================
 * The five original WS0 methods below are unchanged and still part of the
 * contract. What WS4 discovered (DL-65) is that their signatures could not
 * *express* what the doc comment above promises: there was nowhere to put a
 * version, a validator, a namespace, a storage area or a tab identity. This
 * extension adds those concepts to the SAME gateway rather than introducing a
 * second storage abstraction.
 *
 * The unit of access is a `StateDescriptor`: a typed, self-describing handle
 * that carries its own area, scope, validator and default. A caller cannot ask
 * for a value without also saying how to validate it and what to fall back to,
 * which is what makes "corrupted storage degrades to empty" structural rather
 * than a discipline everyone has to remember.
 */

/** Which browser storage area a value lives in. */
export type StorageArea = 'local' | 'session';

/**
 * Whether a value belongs to the whole profile or to one tab.
 *
 * `global` — durable, one user workspace (WS4 O2: the code buffer, the
 * language preference). `tab` — transient session state that must not leak
 * between tabs (WS4 O2: picker state, last pick).
 */
export type StateScope = 'global' | 'tab';

/**
 * A typed handle to one piece of persisted state.
 *
 * `validate` is deterministic and hand-written — the project's convention
 * (`normalizeAck`, `classifyVerification`) — and returns `null` for anything
 * it does not recognise, which the gateway turns into `defaultValue`.
 */
export interface StateDescriptor<T> {
  /** Logical key. The gateway adds the namespace and version. */
  readonly key: string;
  readonly area: StorageArea;
  readonly scope: StateScope;
  readonly defaultValue: T;
  readonly validate: (raw: unknown) => T | null;
}

/** Why a storage operation could not be completed as asked. */
export type StorageFailureCode =
  'READ_FAILED' | 'WRITE_FAILED' | 'QUOTA_EXCEEDED' | 'INVALID_VALUE' | 'UNKNOWN_VERSION';

/**
 * A read always yields a usable value. `valid` says whether that value came
 * from storage or from the descriptor's default, so a caller can tell "the
 * user has nothing saved" apart from "what was saved could not be trusted".
 */
export interface StorageReadResult<T> {
  readonly value: T;
  readonly valid: boolean;
  readonly code?: StorageFailureCode;
}

/** A write never throws. A failure is a value the caller can surface. */
export interface StorageWriteResult {
  readonly ok: boolean;
  readonly code?: StorageFailureCode;
}

/** What an orphan sweep actually removed. */
export interface SweepResult {
  readonly ok: boolean;
  readonly removedTabs: number[];
  readonly code?: StorageFailureCode;
}

export interface StorageGateway {
  // ── WS0 seam (unchanged) ──────────────────────────────────────────────────
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** Subscribe to changes for one key. Returns an unsubscribe function. */
  subscribe<T>(key: string, listener: (value: T | null) => void): () => void;
  /** Drop all session state belonging to a tab. Called on tab close. */
  clearTab(tabId: number): Promise<StorageWriteResult>;

  // ── WS4 additive surface ──────────────────────────────────────────────────
  /** Read profile-wide state. Rejects a tab-scoped descriptor. */
  readGlobal<T>(descriptor: StateDescriptor<T>): Promise<StorageReadResult<T>>;
  /** Write profile-wide state. Rejects a tab-scoped descriptor. */
  writeGlobal<T>(descriptor: StateDescriptor<T>, value: T): Promise<StorageWriteResult>;
  /** Read state belonging to one tab. Rejects a global descriptor. */
  readTab<T>(descriptor: StateDescriptor<T>, tabId: number): Promise<StorageReadResult<T>>;
  /** Write state belonging to one tab. Rejects a global descriptor. */
  writeTab<T>(descriptor: StateDescriptor<T>, tabId: number, value: T): Promise<StorageWriteResult>;
  /**
   * Watch one descriptor. `tabId` is required for tab-scoped state and must be
   * `null` for global state. The listener only ever receives values that
   * passed the descriptor's validator, from the descriptor's own area.
   */
  watch<T>(
    descriptor: StateDescriptor<T>,
    tabId: number | null,
    listener: (value: T) => void,
  ): () => void;
  /** Remove tab state for every tab not in `liveTabIds`. */
  sweepOrphans(liveTabIds: number[]): Promise<SweepResult>;
  /** "Clear data": remove all WS4-owned state, and nothing else. */
  clearAll(): Promise<StorageWriteResult>;
}
