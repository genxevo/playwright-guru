/**
 * WS5 — the panel controller: one composition, both surfaces.
 * ============================================================================
 * This is what "one implementation of the product, consumed by both surfaces"
 * turned out to mean concretely. Everything a panel needs is assembled here
 * from the eight focused hooks; the only thing a surface supplies is its
 * `PanelPickSource` — the WS0 port's own claim that the two surfaces "differ in
 * exactly one respect: how they obtain a verified `StoredPick`".
 *
 * It holds no browser API. Storage arrives as a `StorageGateway`, messaging as
 * a send function, the clipboard as its port, and the surface difference as an
 * adapter. That is what keeps this out of `src/ui/` without needing a second
 * copy of anything.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useActionMode, type ActionModeApi } from './useActionMode';
import { useCodeWorkspace, type CodeWorkspaceApi } from './useCodeWorkspace';
import { useCopyAll, type CopyAllApi } from './useCopyAll';
import { useLanguage } from './useLanguage';
import { useLocatorDerivation, type DerivedLocators } from './useLocatorDerivation';
import { usePanelTabs, type PanelTabsApi } from './usePanelTabs';
import { usePickSource, type PickApi } from './usePickSource';
import { useVerify, type VerifyApi } from './useVerify';

import type { ClipboardPort } from '../application/ports/ClipboardPort';
import type { StorageGateway } from '../application/ports/StorageGateway';
import type { PanelPickSource } from '../browser/pick-source';
import type { SendRuntimeMessage } from '../services/verification';
import type { ErrorStateCode } from '../ui/copy/errors';
import type { PwLang } from '../ui/panel/types';

/** How long a transient failure stays on screen before the panel is quiet again. */
const ERROR_VISIBLE_MS = 8000;

export interface PanelController {
  pick: PickApi;
  lang: PwLang;
  setLang: (next: PwLang) => void;
  workspace: CodeWorkspaceApi;
  copy: CopyAllApi;
  verify: VerifyApi;
  action: ActionModeApi;
  tabs: PanelTabsApi;
  derived: DerivedLocators;
  /** The one error code the panel is currently showing, from any source. */
  errorCode: ErrorStateCode | null;
  /** Raise a transient failure — it clears itself. */
  raiseError: (code: ErrorStateCode) => void;
  clearError: () => void;
}

export interface PanelDeps {
  source: PanelPickSource;
  gateway: StorageGateway;
  clipboard: ClipboardPort;
  send: SendRuntimeMessage;
}

export function usePanel({ source, gateway, clipboard, send }: PanelDeps): PanelController {
  const [ownError, setOwnError] = useState<ErrorStateCode | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearError = useCallback(() => setOwnError(null), []);
  const raiseError = useCallback((code: ErrorStateCode) => {
    setOwnError(code);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOwnError(null), ERROR_VISIBLE_MS);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const pick = usePickSource(source);
  const [lang, setLang] = useLanguage(gateway);
  const workspace = useCodeWorkspace(gateway);
  const tabs = usePanelTabs();
  const action = useActionMode(pick.pick?.attributes ?? null);
  const derived = useLocatorDerivation(pick.pick, lang);
  const verify = useVerify(pick.tabId, send, raiseError);
  const copy = useCopyAll(
    clipboard,
    useCallback(
      () => (workspace.lines.length ? workspace.lines.join('\n') : null),
      [workspace.lines],
    ),
  );

  return {
    pick,
    lang,
    setLang,
    workspace,
    copy,
    verify,
    action,
    tabs,
    derived,
    // O5 — a failed workspace write outranks a transient message failure: it is
    // the one the user's work depends on, and it does not time itself out.
    errorCode: workspace.writeFailed ? 'STORAGE_WRITE_FAILED' : (pick.sourceError ?? ownError),
    raiseError,
    clearError,
  };
}
