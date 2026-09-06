/**
 * Playwright Guru — Side Panel
 * ---------------------------------------------------------------------------
 * WS5: THE SURFACE, NOT THE PRODUCT.
 *
 * This file used to be 905 lines and hold the whole application: every
 * component, every piece of state, every message, every derivation. All of that
 * now lives once — the presentation in `src/ui/panel/**`, the orchestration in
 * `src/hooks/**` and `src/services/**`, and the one thing that genuinely
 * differs between the two surfaces (how a verified `StoredPick` is obtained) in
 * a `PickSource` adapter.
 *
 * What is left is what is actually specific to a side panel: it floats over the
 * ACTIVE tab, it can arm the page picker, and it owns the recording control
 * that WS9 will make real. Everything else is composed.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { clipboardPort } from '../../src/application/adapters';
import { createTabPickSource } from '../../src/browser/pick-source';
import { sendRuntimeMessage } from '../../src/browser/runtime';
import { storageGateway } from '../../src/browser/storage';
import { activeTabContext } from '../../src/browser/tabs';
import { usePanel } from '../../src/hooks';
import { HeaderButton } from '../../src/ui/panel/HeaderButton';
import { PanelFrame, type PanelStatus } from '../../src/ui/panel/PanelFrame';
import { ExportButton, ExportStatus, useExport } from './ExportControl';
import {
  RecordButton,
  RecordingBanner,
  useRecording,
  useRecordingFeedback,
} from './RecordingControl';
import { RecordingWorkspace, useRecordingWorkspace } from './RecordingWorkspace';

/** One adapter for the life of the panel: it owns the active-tab binding. */
const pickSource = createTabPickSource(storageGateway, activeTabContext, sendRuntimeMessage);

const EMPTY = {
  icon: '🎯',
  title: 'Ready to inspect',
  hint: (
    <>
      Click the <strong style={{ color: '#166534' }}>🎯 pick button</strong> above, then click any
      element on the page
    </>
  ),
};

export function SidePanel() {
  const panel = usePanel({
    source: pickSource,
    gateway: storageGateway,
    clipboard: clipboardPort,
    send: sendRuntimeMessage,
  });
  // WS9 slice 5C — the recording control becomes a consumer of BOTH evidence
  // sources. The tab is the one this panel is already bound to, so the durable
  // read can never point at a different page than the pick and picker state do.
  // DL-82 — no language argument any more. The only thing that ever read one
  // here was the retired V1 `copyTestCode`; a lifecycle is not language-shaped.
  /**
   * WS9 DL-91 — ONE BOUND SOURCE, ONE IDENTITY.
   *
   * The four readers below all ask about the SAME tab through the SAME gateway,
   * and each used to receive its own object literal — four fresh identities on
   * every render. Their effects therefore tore down and re-armed on every
   * render, and each teardown discarded whatever read was in flight. Real
   * Chromium measured the cost: 5,205 runtime queries, 10,408 observation reads
   * and 15,612 workflow reads in 24.9 seconds, in the ratio 1 : 2 : 3 — one per
   * reader, per render. The lifecycle view was then committed only when a
   * round-trip happened to finish between two renders, which is why the banner
   * arrived after 283 ms on one machine and 24,872 ms on another.
   *
   * `storageGateway` is a module constant, so the bound TAB is the only thing
   * that can honestly change this object. Memoising it here means a render that
   * changes something else — a status line, a picker flag, a language — costs
   * the readers nothing. It is deliberately ONE object for all four: they are
   * four questions about one binding, and a second memo would be a second
   * identity that could drift from the first.
   */
  const bound = useMemo(
    () => ({ tabId: panel.pick.tabId, gateway: storageGateway }),
    [panel.pick.tabId],
  );
  const rec = useRecording(bound);
  // WS9 export — the same bound tab, read-only, and a SEPARATE question from
  // the one above: `rec` asks whether a recorder is running, `exp` asks whether
  // a recording is stored. DL-79's rule is that those are not the same fact.
  const exp = useExport(panel.lang, bound);
  // WS9 DL-84 — a FOURTH question about the same bound tab, read-only: how much
  // of what the user did actually made it into the recording, and what did not.
  // Separate from `rec` on purpose — a count is not a lifecycle (DL-79).
  const feedback = useRecordingFeedback(bound);
  // WS9 workspace — the same bound tab and the same language, read-only. It is
  // a THIRD question again: `rec` asks whether a recorder is running, `exp`
  // whether a recording can be copied, and this asks what that recording
  // actually says. None of the three is derived from either of the others.
  const workspace = useRecordingWorkspace(panel.lang, bound);

  const [pickerActive, setPickerActive] = useState(false);
  const [status, setStatus] = useState<PanelStatus>({ text: '', tone: 'ok' });

  // The crosshair belongs to the page, so its truth is the tab's persisted
  // state (WS4), not what this panel last asked for.
  useEffect(() => pickSource.subscribePickerActive!(setPickerActive), []);

  const togglePicker = async () => {
    const next = !pickerActive;
    setStatus({ text: next ? 'Activating…' : 'Stopping…', tone: 'ok' });
    panel.clearError();
    const ack = await pickSource.setPickerActive!(next);
    if (!ack.ok) {
      setStatus({ text: '', tone: 'error' });
      panel.raiseError(ack.code === 'NO_HANDLER' ? 'CONTENT_SCRIPT_UNREACHABLE' : 'PICKER_FAILED');
      return;
    }
    setStatus({ text: next ? '↗ Click any element on the page' : '', tone: 'ok' });
    if (!next) setTimeout(() => setStatus({ text: '', tone: 'ok' }), 2000);
  };

  return (
    <PanelFrame
      controller={panel}
      status={status}
      empty={EMPTY}
      banner={
        <>
          <RecordingBanner
            view={rec.view}
            pending={rec.pending}
            // WS9 DL-89 — whether the LIVE authority answered. Without it the
            // banner would keep printing a live-recording claim for up to one
            // heartbeat timeout after a content script dies, which DL-88
            // measured at 14.4-15.3 s.
            confirmed={rec.confirmed}
            feedback={feedback}
          />
          <ExportStatus controller={exp} />
          <RecordingWorkspace view={workspace} />
        </>
      }
      leading={
        <>
          <HeaderButton
            onClick={() => void togglePicker()}
            title={pickerActive ? 'Stop picking' : 'Inspect element on page'}
            glyph={pickerActive ? '⏹' : '↖'}
            label={pickerActive ? 'Stop' : 'Inspect'}
            background={pickerActive ? '#7f1d1d' : '#dc2626'}
            // WS9 slice 5A — the picker is locked out while the AUTHORITY says
            // a recording is live, not while this panel remembers asking for
            // one. `rec.button.live` is `isRecordingNow(view)` and nothing else.
            disabled={rec.button.live}
          />
          <RecordButton
            model={rec.button}
            disabled={pickerActive}
            onToggle={() => void rec.toggle()}
          />
          {/* Availability comes from whether a recording is STORED, never from
              the lifecycle. The picker lock-out is the one live-state input. */}
          <ExportButton controller={exp} disabled={pickerActive} />
        </>
      }
    />
  );
}
