/**
 * WS4 — deterministic fake storage backend.
 * ============================================================================
 *
 * A hand-written in-memory stand-in for one `browser.storage` area, plus a
 * fake `storage.onChanged` source. It exists so the storage gateway, its
 * validators and its migration can be proven **deterministically at unit
 * level** under the project's node test environment (R3) — no DOM, no browser,
 * no `jsdom`, no Chromium.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not Chrome. It models the small surface the gateway actually uses
 * (`get` / `set` / `remove`) and the failure modes Chrome really produces
 * (unavailable, read failure, write failure, quota). Anything it proves is
 * UNIT evidence, never real-browser evidence — real multi-tab, real
 * `onInstalled` and real quota behaviour remain deferred (O4).
 *
 * Failure injection is deliberate and explicit: a test asks for the failure it
 * wants, so a passing suite cannot quietly depend on the happy path.
 */

export interface StorageAreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export type FakeFailure = 'read' | 'write' | 'quota' | 'unavailable';

/** Chrome's real quota rejection text, so detection is tested against reality. */
export const QUOTA_MESSAGE = 'Resource::kQuotaBytes quota exceeded (QUOTA_BYTES quota exceeded)';

export class FakeStorageArea implements StorageAreaLike {
  private readonly data = new Map<string, unknown>();
  /** Failures the next matching operation should raise. */
  private readonly failures = new Set<FakeFailure>();
  /** Counts every successful write — used to prove idempotence and debounce. */
  public writes = 0;

  constructor(seed: Record<string, unknown> = {}) {
    for (const [k, v] of Object.entries(seed)) this.data.set(k, v);
  }

  fail(mode: FakeFailure): void {
    this.failures.add(mode);
  }

  recover(mode?: FakeFailure): void {
    if (mode) this.failures.delete(mode);
    else this.failures.clear();
  }

  /** Direct inspection for assertions — never used by production code. */
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.data);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    if (this.failures.has('unavailable')) throw new Error('Storage is not available');
    if (this.failures.has('read')) throw new Error('Storage read failed');
    if (keys === undefined || keys === null) return this.snapshot();
    const wanted = typeof keys === 'string' ? [keys] : keys;
    const out: Record<string, unknown> = {};
    for (const k of wanted) if (this.data.has(k)) out[k] = this.data.get(k);
    return out;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    if (this.failures.has('unavailable')) throw new Error('Storage is not available');
    if (this.failures.has('quota')) throw new Error(QUOTA_MESSAGE);
    if (this.failures.has('write')) throw new Error('Storage write failed');
    for (const [k, v] of Object.entries(items)) this.data.set(k, v);
    this.writes += 1;
  }

  async remove(keys: string | string[]): Promise<void> {
    if (this.failures.has('unavailable')) throw new Error('Storage is not available');
    if (this.failures.has('write')) throw new Error('Storage remove failed');
    for (const k of typeof keys === 'string' ? [keys] : keys) this.data.delete(k);
  }
}

export type StorageChangeRecord = Record<string, { newValue?: unknown; oldValue?: unknown }>;
export type StorageChangeListener = (changes: StorageChangeRecord, areaName: string) => void;

export interface StorageChangeSource {
  addListener(listener: StorageChangeListener): void;
  removeListener(listener: StorageChangeListener): void;
}

/** A fake `storage.onChanged` that can emit for ANY area — this is what makes
 *  the gateway's area filtering (F17) provable rather than assumed. */
export class FakeChangeSource implements StorageChangeSource {
  private readonly listeners = new Set<StorageChangeListener>();

  addListener(listener: StorageChangeListener): void {
    this.listeners.add(listener);
  }

  removeListener(listener: StorageChangeListener): void {
    this.listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  emit(changes: StorageChangeRecord, areaName: string): void {
    for (const l of [...this.listeners]) l(changes, areaName);
  }
}
