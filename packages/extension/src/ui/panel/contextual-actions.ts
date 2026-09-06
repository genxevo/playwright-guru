/**
 * WS5 — which Playwright actions an element offers, decided once.
 *
 * D-b and D-c (DL-67). The two panels each carried their own copy of this
 * table and they had drifted in two ways that mattered:
 *
 *   D-b — `.dblclick()` existed in the Side Panel's button, input-button and
 *         role=button branches and was **entirely absent** from DevTools. That
 *         is a capability difference, not wording: the same element offered
 *         fewer actions depending on which surface you happened to open.
 *   D-c — every DevTools hint was a truncation of the Side Panel's ("Clicks"
 *         for "Clicks the element"; "Selects option" for "Selects a dropdown
 *         option — replace '' with value").
 *
 * Neither was ever decided; both are drift. The owner resolved them (O4) on
 * the stated principle — unify on the richer existing behaviour — so this is
 * the Side Panel's table, moved verbatim, now serving both surfaces.
 *
 * What was deliberately NOT done: `.dblclick()` was not added to elements the
 * Side Panel never offered it on (links, text inputs, selects, checkboxes, and
 * the no-attributes fallback). Unifying a divergence is not licence to change
 * product behaviour on the side that was already right.
 */
import { NO_ACTION } from './constants';

import type { ElementAttributes } from '@playwright-guru/locator-engine';
import type { ActionOption } from './types';

export function getContextualActions(attrs: ElementAttributes | null): ActionOption[] {
  if (!attrs)
    return [
      NO_ACTION,
      { label: '.click()', value: 'click', hint: 'Clicks the element' },
      { label: '.hover()', value: 'hover', hint: 'Hovers' },
    ];

  const tag = attrs.tagName.toLowerCase(),
    type = (attrs.type ?? '').toLowerCase(),
    role = (attrs.role ?? '').toLowerCase();

  if (type === 'checkbox' || role === 'checkbox')
    return [
      NO_ACTION,
      { label: '.check()', value: 'check', hint: 'Ensures checked' },
      { label: '.uncheck()', value: 'uncheck', hint: 'Ensures unchecked' },
      { label: '.click()', value: 'click', hint: 'Toggles' },
    ];

  if (type === 'radio')
    return [
      NO_ACTION,
      { label: '.check()', value: 'check', hint: 'Selects this option' },
      { label: '.click()', value: 'click', hint: 'Clicks to select' },
    ];

  if (type === 'submit' || type === 'button' || type === 'reset')
    return [
      NO_ACTION,
      { label: '.click()', value: 'click', hint: 'Clicks the button' },
      { label: '.hover()', value: 'hover', hint: 'Hovers' },
      { label: '.dblclick()', value: 'dblclick', hint: 'Double-clicks' },
    ];

  if (tag === 'select')
    return [
      NO_ACTION,
      {
        label: ".selectOption('')",
        value: 'selectOption',
        hint: "Selects a dropdown option — replace '' with value",
      },
      { label: '.click()', value: 'click', hint: 'Opens dropdown' },
    ];

  if (tag === 'input' || tag === 'textarea')
    return [
      NO_ACTION,
      { label: ".fill('')", value: 'fill', hint: 'Clears and types new text' },
      { label: '.clear()', value: 'clear', hint: 'Removes all text' },
      { label: '.click()', value: 'click', hint: 'Focuses field' },
      { label: ".press('Enter')", value: 'press', hint: 'Sends keyboard key' },
    ];

  if (tag === 'button' || role === 'button')
    return [
      NO_ACTION,
      { label: '.click()', value: 'click', hint: 'Clicks' },
      { label: '.hover()', value: 'hover', hint: 'Hovers' },
      { label: '.dblclick()', value: 'dblclick', hint: 'Double-clicks' },
    ];

  if (tag === 'a')
    return [
      NO_ACTION,
      { label: '.click()', value: 'click', hint: 'Navigates' },
      { label: '.hover()', value: 'hover', hint: 'Hovers for menu triggers' },
    ];

  return [
    NO_ACTION,
    { label: '.click()', value: 'click', hint: 'Clicks the element' },
    { label: '.hover()', value: 'hover', hint: 'Hovers' },
    { label: '.waitFor()', value: 'waitFor', hint: 'Waits until visible' },
  ];
}

/** The action pre-selected for a freshly picked element. Identical in both panels. */
export function getDefaultAction(attrs: ElementAttributes): string {
  const tag = attrs.tagName.toLowerCase(),
    type = (attrs.type ?? '').toLowerCase();
  if (type === 'checkbox' || type === 'radio') return 'check';
  if (tag === 'select') return 'selectOption';
  if (tag === 'input' || tag === 'textarea') return 'fill';
  if (tag === 'button' || tag === 'a') return 'click';
  return 'none';
}

/**
 * The action actually applied: the selected one when the current element still
 * supports it, otherwise none. Both panels derived this identically inline.
 */
export function resolveAction(
  actions: ActionOption[],
  actionMode: string,
): { effective: string; definition: ActionOption } {
  const valid = actions.some((a) => a.value === actionMode);
  return {
    effective: valid ? actionMode : 'none',
    definition: actions.find((a) => a.value === actionMode) ?? NO_ACTION,
  };
}
