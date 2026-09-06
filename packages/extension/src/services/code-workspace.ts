/**
 * WS5 — the ONE user code workspace (O1).
 * ============================================================================
 * Before WS5 the Side Panel persisted this list through WS4's `StorageGateway`
 * and the DevTools panel kept it in a `useState` that died with the DevTools
 * session (DL-67, D-e). The owner's O1 decision is that there is one workspace,
 * not two: both surfaces read, watch and write the same global `CODE_BUFFER`.
 *
 * This module is that workspace as an application service — deliberately
 * framework-free, so it can be driven and asserted directly rather than only
 * through a rendered component. It holds no browser API of its own; it is given
 * a `StorageGateway` and does not know, or care, which surface is using it.
 *
 * CONCURRENCY (O5). WS4's LAST-WRITE-WINS semantics are accepted unchanged and
 * are NOT reimplemented here. No merge, no lock, no conflict UI, no debounce
 * interval (the authoritative documents define none, and WS4's own report
 * records that as an open owner question rather than inventing a number). Two
 * narrower things are guaranteed, because without them "one workspace" would
 * corrupt an edit rather than share it:
 *
 *   1. A `watch` callback that arrives while this surface has a write IN FLIGHT
 *      is ignored. Otherwise the other surface's older value would land on top
 *      of what the user is in the middle of committing.
 *   2. The echo of our OWN write is ignored, by comparing against the exact
 *      value we last sent. In real Chrome `storage.onChanged` fires for the
 *      writer too; without this the undo reference would be dropped every time
 *      the user added a line.
 *
 * Undo is part of the value, not a side ref, so it cannot drift from the
 * content it refers to. On genuine remote convergence the undo reference is
 * dropped rather than left pointing at a history that no longer happened.
 */
import { CODE_BUFFER } from '../storage/state';

import type { StorageFailureCode, StorageGateway } from '../application/ports/StorageGateway';

/** The workspace as a value: the lines, and the one step back. */
export interface Workspace {
  readonly lines: string[];
  readonly previous: string[] | null;
}

export const EMPTY_WORKSPACE: Workspace = { lines: [], previous: null };

const step = (w: Workspace, lines: string[]): Workspace => ({ lines, previous: [...w.lines] });

export function appendLine(w: Workspace, code: string): Workspace {
  return step(w, [...w.lines, code]);
}

export function removeLineAt(w: Workspace, index: number): Workspace {
  return step(
    w,
    w.lines.filter((_, i) => i !== index),
  );
}

export function clearLines(w: Workspace): Workspace {
  return step(w, []);
}

export function undoLines(w: Workspace): Workspace {
  return w.previous === null ? w : { lines: [...w.previous], previous: null };
}

export function canUndoWorkspace(w: Workspace): boolean {
  return w.previous !== null;
}

/** What a surface renders. */
export interface CodeWorkspaceState extends Workspace {
  readonly writeFailed: boolean;
  readonly failureCode?: StorageFailureCode;
}

export interface CodeWorkspaceStore {
  getState(): CodeWorkspaceState;
  subscribe(listener: () => void): () => void;
  /** Read the persisted workspace and start watching for changes. */
  hydrate(): Promise<void>;
  append(code: string): void;
  removeAt(index: number): void;
  clear(): void;
  undo(): void;
  dispose(): void;
}

/** The slice of WS4's gateway this service needs — nothing wider. */
export type WorkspaceGateway = Pick<StorageGateway, 'readGlobal' | 'writeGlobal' | 'watch'>;

const sameLines = (a: string[], b: string[]) =>
  a.length === b.length && a.every((line, i) => line === b[i]);

export function createCodeWorkspaceStore(gateway: WorkspaceGateway): CodeWorkspaceStore {
  let workspace: Workspace = EMPTY_WORKSPACE;
  let writeFailed = false;
  let failureCode: StorageFailureCode | undefined;

  /** How many writes this surface has started and not yet finished. */
  let inFlight = 0;
  /** The exact value we last sent, so its own echo can be told from a peer's. */
  let lastWritten: string[] | null = null;

  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  let stopWatching: (() => void) | null = null;
  let disposed = false;

  const commit = (next: Workspace) => {
    workspace = next;
    notify();
    inFlight += 1;
    lastWritten = [...next.lines];
    void gateway.writeGlobal(CODE_BUFFER, next.lines).then((result) => {
      inFlight -= 1;
      const failed = !result.ok;
      if (failed !== writeFailed || result.code !== failureCode) {
        writeFailed = failed;
        failureCode = result.code;
        notify();
      }
    });
  };

  return {
    getState: () => ({ ...workspace, writeFailed, failureCode }),

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async hydrate() {
      const read = await gateway.readGlobal(CODE_BUFFER);
      if (disposed) return;
      workspace = { lines: read.value, previous: null };
      notify();
      stopWatching?.();
      stopWatching = gateway.watch(CODE_BUFFER, null, (value) => {
        // (1) our own edit is mid-flight — a peer's older value must not land on it
        if (inFlight > 0) return;
        // (2) the echo of our own write carries no news, and must not eat undo
        if (lastWritten && sameLines(lastWritten, value)) return;
        workspace = { lines: value, previous: null };
        notify();
      });
    },

    append(code) {
      commit(appendLine(workspace, code));
    },
    removeAt(index) {
      commit(removeLineAt(workspace, index));
    },
    clear() {
      commit(clearLines(workspace));
    },
    undo() {
      if (!canUndoWorkspace(workspace)) return;
      commit(undoLines(workspace));
    },

    dispose() {
      disposed = true;
      stopWatching?.();
      stopWatching = null;
      listeners.clear();
    },
  };
}
