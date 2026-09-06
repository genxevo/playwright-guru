/**
 * WS4 — production wiring for the storage gateway.
 * ============================================================================
 *
 * The only place in the product that touches `browser.storage` for WS4-owned
 * state. Everything else goes through the gateway, which is what makes the
 * namespace, the version envelope, validation and tab scoping unavoidable
 * rather than optional.
 *
 * Imported directly (not through the adapters barrel) so that a surface which
 * only needs storage does not also pull in the clipboard adapter.
 *
 * `session` is used for tab-scoped transient state: it is cleared by the
 * browser when the profile closes, which is the correct lifetime for picker
 * state and the last pick, and it keeps that churn out of the durable `local`
 * area that holds the user's code workspace.
 */

import { browser } from 'wxt/browser';

import type { StorageGateway } from '../application/ports/StorageGateway';
import {
  createStorageGateway,
  type StorageAreaLike,
  type StorageChangeListener,
} from '../storage/gateway';

/**
 * Areas are resolved per call, never at module load.
 *
 * A background service worker is torn down and revived constantly, and this
 * module is imported by entrypoints whose test doubles do not always provide a
 * full `browser.storage`. Reading the area lazily means importing this file
 * can never throw — the failure, if there is one, arrives as a rejected
 * operation the gateway turns into a `WRITE_FAILED`/`READ_FAILED` result,
 * which is the behaviour WS4 is built around.
 *
 * `storage.session` is MV3-only and typed loosely here because the polyfill's
 * surface predates it; the shape used is the same three methods as `local`.
 */
function area(name: 'local' | 'session'): StorageAreaLike {
  const storage = browser.storage as unknown as Record<string, StorageAreaLike | undefined>;
  // A profile without session storage falls back to local rather than losing
  // writes: a degraded lifetime is recoverable, a dropped write is not.
  const resolved = storage[name] ?? storage['local'];
  if (!resolved) throw new Error(`WS4: browser.storage.${name} is unavailable`);
  return resolved;
}

const lazyArea = (name: 'local' | 'session'): StorageAreaLike => ({
  get: (keys) => area(name).get(keys),
  set: (items) => area(name).set(items),
  remove: (keys) => area(name).remove(keys),
});

export const storageGateway: StorageGateway = createStorageGateway({
  local: lazyArea('local'),
  session: lazyArea('session'),
  changes: {
    addListener: (listener: StorageChangeListener) =>
      browser.storage?.onChanged?.addListener(listener as never),
    removeListener: (listener: StorageChangeListener) =>
      browser.storage?.onChanged?.removeListener(listener as never),
  },
});
