/**
 * Playwright Guru — DevTools Panel
 * ---------------------------------------------------------------------------
 * WS5: THIS PANEL NO LONGER THINKS FOR ITSELF — AND NO LONGER RENDERS FOR
 * ITSELF EITHER.
 *
 * It used to carry a ~4KB `inspectedWindow.eval` payload containing its own
 * role inference, its own visibility rule and its own match counting — a second
 * implementation of everything the engine already does. Measured against the
 * conformance corpus it was wrong on 17 of 39 role fixtures, so the two
 * surfaces disagreed about the same element. DL-28…DL-31 removed that.
 *
 * What DL-67 then measured is that a second copy of the PRESENTATION had
 * survived it, and had quietly drifted in seven ways — including `.dblclick()`
 * simply not existing here, and a code workspace that died with the DevTools
 * session. WS5 removes that copy too: the panel is composed from the same
 * frame, the same hooks and the same shared workspace as the Side Panel.
 *
 * What is genuinely specific to DevTools stays here and only here: it is fixed
 * to the tab it INSPECTS (never the active tab — O2), it follows the Elements
 * panel selection rather than arming a picker, and it offers a re-read of `$0`.
 */
import React, { useEffect, useState } from 'react';

import { clipboardPort } from '../../src/application/adapters';
import { chromeDevtoolsApi, createDevtoolsPickSource } from '../../src/browser/pick-source';
import { sendRuntimeMessage } from '../../src/browser/runtime';
import { storageGateway } from '../../src/browser/storage';
import { usePanel } from '../../src/hooks';
import { HeaderButton } from '../../src/ui/panel/HeaderButton';
import { PanelFrame, type PanelStatus } from '../../src/ui/panel/PanelFrame';

/** One adapter for the life of the panel; it owns the inspected-tab binding. */
const pickSource = createDevtoolsPickSource(chromeDevtoolsApi(), sendRuntimeMessage);

const EMPTY = {
  icon: '🔍',
  title: 'No element selected',
  hint: (
    <>
      Open DevTools (F12), go to <strong>Elements</strong> tab, click any element. This panel
      auto-updates.
    </>
  ),
};

export function Panel() {
  const panel = usePanel({
    source: pickSource,
    gateway: storageGateway,
    clipboard: clipboardPort,
    send: sendRuntimeMessage,
  });

  const [status, setStatus] = useState<PanelStatus>({
    text: '← Select an element in the DevTools Elements panel to inspect it',
    tone: 'info',
  });

  const attrs = panel.pick.pick?.attributes ?? null;
  useEffect(() => {
    setStatus({
      tone: 'info',
      text: panel.pick.busy
        ? '⟳ Evaluating selected element…'
        : attrs
          ? `✓ Selected: <${attrs.tagName}${attrs.type ? `[${attrs.type}]` : ''}> ${attrs.id ? `#${attrs.id}` : attrs.placeholder ? '[placeholder]' : ''}`
          : '← Select an element in the DevTools Elements panel to inspect it',
    });
  }, [panel.pick.busy, attrs]);

  return (
    <PanelFrame
      controller={panel}
      status={status}
      empty={EMPTY}
      elementHtmlOpen
      leading={
        /* Refresh/Inspect — left side, like Chrome DevTools */
        <HeaderButton
          onClick={panel.pick.requestPick}
          title="Re-evaluate selected element"
          glyph={panel.pick.busy ? '⟳' : '↖'}
          label={panel.pick.busy ? '…' : 'Inspect'}
        />
      }
    />
  );
}
