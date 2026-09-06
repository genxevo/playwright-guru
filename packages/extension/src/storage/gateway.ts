/**
 * WS4 — the one storage gateway.
 * ============================================================================
 *
 * Replaces six flat global keys with namespaced, versioned, validated,
 * area-correct, optionally tab-scoped state. Every WS4-owned read and write in
 * the product goes through here; `storage-consumers.test.ts` guards that no
 * consumer goes around it.
 *
 * KEY SHAPE
 *   global   `pg:v2:<key>`
 *   per tab  `pg:v2:tab:<tabId>:<key>`
 *
 * Namespacing is what lets "Clear data" and the orphan sweep act on exactly
 * WS4's own state and nothing else — including leaving WS9's legacy recording
 * keys untouched.
 *
 * VALUE SHAPE
 *   `{ v: <schema version>, data: <validated value> }`
 *
 * The envelope is per value rather than one global version marker, so a future
 * schema can move one key at a time, and an **unknown future version is never
 * interpreted as current data** — it is reported and left exactly as written,
 * never downgraded or overwritten by a read.
 *
 * FAILURES ARE VALUES
 * A read always returns something usable (the descriptor's default when
 * storage is unreadable or holds nonsense) plus a flag and a code. A write
 * returns `{ ok, code }` and never throws. This is the direct answer to the
 * pre-WS4 pattern of `void browser.storage.local.set(...)`, where a rejection
 * — including a quota rejection — vanished and the user believed their work
 * was saved.
 *
 * DEPENDENCY INJECTION
 * The areas and the change source are injected, so every behaviour here is
 * provable in the project's node test environment (R3) with a deterministic
 * fake. Production wiring lives in `../application/adapters/StorageAdapter`.
 * Nothing in this module imports `browser`.
 */

import type {
  StateDescriptor,
  StorageArea,
  StorageFailureCode,
  StorageGateway,
  StorageReadResult,
  StorageWriteResult,
  SweepResult,
} from '../application/ports/StorageGateway';
import { WS4_DESCRIPTORS } from './state';

export const STORAGE_NAMESPACE = 'pg';
export const STORAGE_SCHEMA_VERSION = 2;

const PREFIX = `${STORAGE_NAMESPACE}:v${STORAGE_SCHEMA_VERSION}:`;
const TAB_SEGMENT = 'tab:';

/** `pg:v2:<key>` */
export function globalKey(key: string): string {
  return `${PREFIX}${key}`;
}

/** `pg:v2:tab:<tabId>:` — the prefix every key for one tab shares. */
export function tabScopePrefix(tabId: number): string {
  return `${PREFIX}${TAB_SEGMENT}${tabId}:`;
}

/** `pg:v2:tab:<tabId>:<key>` */
export function tabKey(tabId: number, key: string): string {
  return `${tabScopePrefix(tabId)}${key}`;
}

/** Every key WS4 owns starts with this. Used by Clear data and the sweep. */
export function isWs4Key(key: string): boolean {
  return key.startsWith(PREFIX);
}

/** Reads the tab id back out of a tab-scoped key, or null if it is not one. */
export function tabIdFromKey(key: string): number | null {
  if (!key.startsWith(`${PREFIX}${TAB_SEGMENT}`)) return null;
  const rest = key.slice(PREFIX.length + TAB_SEGMENT.length);
  const id = Number(rest.slice(0, rest.indexOf(':')));
  return Number.isInteger(id) && id >= 0 ? id : null;
}

export interface StorageAreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export type StorageChangeRecord = Record<string, { newValue?: unknown; oldValue?: unknown }>;
export type StorageChangeListener = (changes: StorageChangeRecord, areaName: string) => void;

export interface StorageChangeSource {
  addListener(listener: StorageChangeListener): void;
  removeListener(listener: StorageChangeListener): void;
}

export interface StorageBackends {
  local: StorageAreaLike;
  session: StorageAreaLike;
  changes: StorageChangeSource;
}

/**
 * Chrome signals a full disk by rejecting with a message naming its quota.
 * Classifying it separately matters: a quota failure is the one write failure
 * where destroying the previous value to make room would be the worst possible
 * response, so migration treats it as "stop, keep v1" rather than "retry".
 */
function classifyWriteError(error: unknown): StorageFailureCode {
  const message = error instanceof Error ? error.message : String(error);
  return /quota/i.test(message) ? 'QUOTA_EXCEEDED' : 'WRITE_FAILED';
}

function assertTabId(tabId: number): void {
  if (!Number.isInteger(tabId) || tabId < 0) {
    throw new Error(`WS4: invalid tab id: ${String(tabId)}`);
  }
}

function assertScope<T>(descriptor: StateDescriptor<T>, expected: 'global' | 'tab'): void {
  if (descriptor.scope !== expected) {
    throw new Error(
      `WS4: "${descriptor.key}" is ${descriptor.scope}-scoped and cannot be used as ${expected}-scoped state`,
    );
  }
}

export function createStorageGateway(backends: StorageBackends): StorageGateway {
  const areaOf = (area: StorageArea): StorageAreaLike =>
    area === 'local' ? backends.local : backends.session;

  /** Envelope → validated value, or a typed reason it could not be trusted. */
  function unpack<T>(descriptor: StateDescriptor<T>, raw: unknown): StorageReadResult<T> {
    if (raw === undefined) return { value: descriptor.defaultValue, valid: true };
    if (typeof raw !== 'object' || raw === null) {
      return { value: descriptor.defaultValue, valid: false };
    }
    const envelope = raw as { v?: unknown; data?: unknown };
    if (envelope.v !== STORAGE_SCHEMA_VERSION) {
      // Written by a newer build: report it and leave it alone. Interpreting
      // it as current data, or overwriting it, would destroy that build's state.
      return { value: descriptor.defaultValue, valid: false, code: 'UNKNOWN_VERSION' };
    }
    const validated = descriptor.validate(envelope.data);
    return validated === null && descriptor.defaultValue !== null
      ? { value: descriptor.defaultValue, valid: false }
      : { value: (validated ?? descriptor.defaultValue) as T, valid: validated !== null };
  }

  async function readKey<T>(
    descriptor: StateDescriptor<T>,
    key: string,
  ): Promise<StorageReadResult<T>> {
    try {
      const found = await areaOf(descriptor.area).get(key);
      return unpack(descriptor, found[key]);
    } catch {
      return { value: descriptor.defaultValue, valid: false, code: 'READ_FAILED' };
    }
  }

  async function writeKey<T>(
    descriptor: StateDescriptor<T>,
    key: string,
    value: T,
  ): Promise<StorageWriteResult> {
    // Validate on the way in as well as on the way out: a value that could not
    // be read back as valid must never reach storage in the first place.
    if (descriptor.validate(value) === null && value !== descriptor.defaultValue) {
      return { ok: false, code: 'INVALID_VALUE' };
    }
    try {
      await areaOf(descriptor.area).set({ [key]: { v: STORAGE_SCHEMA_VERSION, data: value } });
      return { ok: true };
    } catch (error) {
      return { ok: false, code: classifyWriteError(error) };
    }
  }

  async function removeMatching(
    area: StorageArea,
    predicate: (key: string) => boolean,
  ): Promise<StorageWriteResult> {
    const target = areaOf(area);
    try {
      const all = await target.get(null);
      const doomed = Object.keys(all).filter(predicate);
      if (doomed.length) await target.remove(doomed);
      return { ok: true };
    } catch (error) {
      return { ok: false, code: classifyWriteError(error) };
    }
  }

  return {
    // ── WS0 seam, retained. Unvalidated by construction: these signatures have
    // nowhere to put a validator, which is exactly why WS4 added the typed
    // surface below. Kept so the WS0 contract is extended, never broken.
    async get<T>(key: string): Promise<T | null> {
      try {
        const found = await backends.local.get(key);
        return (found[key] as T | undefined) ?? null;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      await backends.local.set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await backends.local.remove(key);
    },
    subscribe<T>(key: string, listener: (value: T | null) => void): () => void {
      const handler: StorageChangeListener = (changes, areaName) => {
        if (areaName !== 'local' || !(key in changes)) return;
        listener((changes[key]?.newValue as T | undefined) ?? null);
      };
      backends.changes.addListener(handler);
      return () => backends.changes.removeListener(handler);
    },

    // ── WS4 typed surface ────────────────────────────────────────────────────
    async readGlobal<T>(descriptor: StateDescriptor<T>): Promise<StorageReadResult<T>> {
      assertScope(descriptor, 'global');
      return readKey(descriptor, globalKey(descriptor.key));
    },

    async writeGlobal<T>(descriptor: StateDescriptor<T>, value: T): Promise<StorageWriteResult> {
      assertScope(descriptor, 'global');
      return writeKey(descriptor, globalKey(descriptor.key), value);
    },

    async readTab<T>(descriptor: StateDescriptor<T>, tabId: number): Promise<StorageReadResult<T>> {
      assertScope(descriptor, 'tab');
      assertTabId(tabId);
      return readKey(descriptor, tabKey(tabId, descriptor.key));
    },

    async writeTab<T>(
      descriptor: StateDescriptor<T>,
      tabId: number,
      value: T,
    ): Promise<StorageWriteResult> {
      assertScope(descriptor, 'tab');
      assertTabId(tabId);
      return writeKey(descriptor, tabKey(tabId, descriptor.key), value);
    },

    watch<T>(
      descriptor: StateDescriptor<T>,
      tabId: number | null,
      listener: (value: T) => void,
    ): () => void {
      if (descriptor.scope === 'tab') {
        if (tabId === null) throw new Error(`WS4: "${descriptor.key}" needs a tab id to watch`);
        assertTabId(tabId);
      } else if (tabId !== null) {
        throw new Error(`WS4: "${descriptor.key}" is global and cannot be watched per tab`);
      }
      const key = tabId === null ? globalKey(descriptor.key) : tabKey(tabId, descriptor.key);
      const handler: StorageChangeListener = (changes, areaName) => {
        // Area filtering is not cosmetic: without it a `session` write could
        // drive state hydrated from `local`, which is how stale values used to
        // arrive in the panel.
        if (areaName !== descriptor.area) return;
        if (!(key in changes)) return;
        listener(unpack(descriptor, changes[key]?.newValue).value);
      };
      backends.changes.addListener(handler);
      return () => backends.changes.removeListener(handler);
    },

    async clearTab(tabId: number): Promise<StorageWriteResult> {
      assertTabId(tabId);
      const prefix = tabScopePrefix(tabId);
      return removeMatching('session', (key) => key.startsWith(prefix));
    },

    async sweepOrphans(liveTabIds: number[]): Promise<SweepResult> {
      const live = new Set(liveTabIds);
      try {
        const all = await backends.session.get(null);
        const doomed: string[] = [];
        const removedTabs = new Set<number>();
        for (const key of Object.keys(all)) {
          const owner = tabIdFromKey(key);
          if (owner === null || live.has(owner)) continue;
          doomed.push(key);
          removedTabs.add(owner);
        }
        if (doomed.length) await backends.session.remove(doomed);
        return { ok: true, removedTabs: [...removedTabs] };
      } catch (error) {
        return { ok: false, removedTabs: [], code: classifyWriteError(error) };
      }
    },

    async clearAll(): Promise<StorageWriteResult> {
      // Namespaced keys only. WS9's legacy recording keys and anything else in
      // storage are deliberately out of reach: WS4 clears WS4's data.
      const local = await removeMatching('local', isWs4Key);
      const session = await removeMatching('session', isWs4Key);
      return local.ok && session.ok
        ? { ok: true }
        : { ok: false, code: local.code ?? session.code };
    },
  };
}

/** Every descriptor WS4 owns, re-exported for consumers that iterate them. */
export { WS4_DESCRIPTORS };
