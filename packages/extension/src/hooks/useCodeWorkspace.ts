/**
 * WS5 — React binding for the one code workspace.
 *
 * All of the logic lives in `services/code-workspace.ts`, which is
 * framework-free and directly testable; this hook is only the subscription. It
 * is the same hook on both surfaces, which is what makes O1's "one user
 * workspace" true rather than merely intended.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import {
  canUndoWorkspace,
  createCodeWorkspaceStore,
  type CodeWorkspaceState,
  type WorkspaceGateway,
} from '../services/code-workspace';

export interface CodeWorkspaceApi {
  lines: string[];
  canUndo: boolean;
  writeFailed: boolean;
  append: (code: string) => void;
  removeAt: (index: number) => void;
  clear: () => void;
  undo: () => void;
}

export function useCodeWorkspace(gateway: WorkspaceGateway): CodeWorkspaceApi {
  const store = useMemo(() => createCodeWorkspaceStore(gateway), [gateway]);
  const snapshot = useRef<CodeWorkspaceState>(store.getState());

  const subscribe = useCallback(
    (onChange: () => void) =>
      store.subscribe(() => {
        snapshot.current = store.getState();
        onChange();
      }),
    [store],
  );
  // getSnapshot must be referentially stable between notifications, so the
  // state object is cached in a ref and only replaced when the store notifies.
  const getSnapshot = useCallback(() => snapshot.current, []);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void store.hydrate();
    return () => store.dispose();
  }, [store]);

  return {
    lines: state.lines,
    canUndo: canUndoWorkspace(state),
    writeFailed: state.writeFailed,
    append: useCallback((code: string) => store.append(code), [store]),
    removeAt: useCallback((index: number) => store.removeAt(index), [store]),
    clear: useCallback(() => store.clear(), [store]),
    undo: useCallback(() => store.undo(), [store]),
  };
}
