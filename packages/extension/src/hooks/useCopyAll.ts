/**
 * WS5 — "Copy All", with the failure it can actually have.
 *
 * DL-54 replaced four uncaught `navigator.clipboard.writeText` call sites with
 * the `ClipboardPort`; both panels then wrote the same transient state machine
 * around it. A copy that fails says so on the control that failed, and the
 * detail goes in the tooltip rather than being thrown away.
 */
import { useCallback, useRef, useState } from 'react';

import type { ClipboardPort } from '../application/ports/ClipboardPort';

export type CopyState = 'idle' | 'done' | 'failed';

export interface CopyAllApi {
  copyState: CopyState;
  copyFailure: string;
  copyAll: () => void;
}

export function useCopyAll(clipboard: ClipboardPort, text: () => string | null): CopyAllApi {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [copyFailure, setCopyFailure] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyAll = useCallback(() => {
    const payload = text();
    if (!payload) return;
    void clipboard.writeText(payload).then((result) => {
      if (result.ok) setCopyState('done');
      else {
        setCopyFailure(result.detail ?? 'Copy failed.');
        setCopyState('failed');
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopyState('idle'), 2000);
    });
  }, [clipboard, text]);

  return { copyState, copyFailure, copyAll };
}
