/**
 * WS5 — which action is appended to a generated locator.
 *
 * The selection resets to "none" on a new pick (both panels did this), and an
 * action that the newly picked element does not support falls back to none
 * rather than generating a call that element cannot take.
 */
import { useEffect, useMemo, useState } from 'react';

import { getContextualActions, resolveAction } from '../ui/panel/contextual-actions';

import type { ElementAttributes } from '@playwright-guru/locator-engine';
import type { ActionOption } from '../ui/panel/types';

export interface ActionModeApi {
  actions: ActionOption[];
  actionMode: string;
  setActionMode: (next: string) => void;
  effective: string;
  definition: ActionOption;
}

export function useActionMode(attributes: ElementAttributes | null): ActionModeApi {
  const [actionMode, setActionMode] = useState('none');

  // A new element is a new set of capabilities; keeping the old selection would
  // silently carry `.fill()` onto a button.
  useEffect(() => {
    setActionMode('none');
  }, [attributes]);

  const actions = useMemo(() => getContextualActions(attributes), [attributes]);
  const { effective, definition } = resolveAction(actions, actionMode);

  return { actions, actionMode, setActionMode, effective, definition };
}
