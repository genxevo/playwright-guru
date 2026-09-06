/**
 * WS5 — a surface's pick, its bound tab, and whatever the source is doing.
 *
 * Everything surface-specific about obtaining a pick is behind the
 * `PanelPickSource` adapter (`browser/pick-source.ts`). This hook subscribes to
 * it and knows nothing about active tabs, `$0`, eval or storage — which is the
 * whole point: the component tree above it cannot tell which surface it is on.
 */
import { useCallback, useEffect, useState } from 'react';

import type { PanelPickSource } from '../browser/pick-source';
import type { StoredPick } from '../../utils/messaging';
import type { ErrorStateCode } from '../ui/copy/errors';

export interface PickApi {
  pick: StoredPick | null;
  tabId: number | null;
  busy: boolean;
  sourceError: ErrorStateCode | null;
  requestPick: () => void;
}

export function usePickSource(source: PanelPickSource): PickApi {
  const [pick, setPick] = useState<StoredPick | null>(null);
  const [tabId, setTabId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceError, setSourceError] = useState<ErrorStateCode | null>(null);

  useEffect(() => {
    const stops = [
      source.subscribe(setPick),
      source.subscribeTab(setTabId),
      source.subscribeBusy?.(setBusy),
      source.subscribeError?.(setSourceError),
    ];
    return () => stops.forEach((stop) => stop?.());
  }, [source]);

  return {
    pick,
    tabId,
    busy,
    sourceError,
    requestPick: useCallback(() => void source.requestPick(), [source]),
  };
}
