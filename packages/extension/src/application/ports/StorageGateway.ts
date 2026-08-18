/**
 * Playwright Guru — StorageGateway port (WS0 contract only).
 * ---------------------------------------------------------------------------
 * Versioned, validated, namespaced storage. WS4 implements it.
 *
 * Phase 0 found six flat global keys with no schema version, no validation and
 * no tab scoping — so two tabs fought over one picker flag, and the first shape
 * change would corrupt existing installs silently.
 *
 * Every read is validated at the boundary: invalid data is treated as absent,
 * logged once, and never thrown into a render.
 */

export interface StorageGateway {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** Subscribe to changes for one key. Returns an unsubscribe function. */
  subscribe<T>(key: string, listener: (value: T | null) => void): () => void;
  /** Drop all session state belonging to a tab. Called on tab close. */
  clearTab(tabId: number): Promise<void>;
}
