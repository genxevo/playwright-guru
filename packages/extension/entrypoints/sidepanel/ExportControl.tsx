/**
 * The Side Panel's export control (WS9 — export).
 * ---------------------------------------------------------------------------
 * WHAT IT IS: the smallest honest surface that turns a persisted recording into
 * text on the clipboard. One button, one accessible name that says what is
 * actually true, and a polite live region for the outcome.
 *
 * ═══ THE TWO QUESTIONS IT KEEPS APART ═══
 *
 * DL-79 was explicit: **lifecycle is not workflow existence.** A recording that
 * ended still has a workflow worth exporting; a recording that is live may have
 * captured nothing yet. So this control never asks the lifecycle anything. It
 * asks one question — is there a valid recording stored for this tab? — and
 * that answer alone decides whether the button is actionable.
 *
 * The product FLAG is a separate question again, and it decides something else:
 * whether the feature is offered at all. `RECORDING_ENABLED` is still `false`,
 * and while it is, `rt.start()` refuses, so no workflow can come into existence
 * and an export button would be a control permanently stuck in its empty state
 * — precisely the dead affordance DL-76 refused to ship. So the control takes
 * the same early return `RecordButton` and `RecordingBanner` take. Three
 * separate ideas, three separate mechanisms:
 *
 *   flag       → is this feature offered?          (rollout; early return)
 *   workflow   → is there something to export?     (truth; the button's state)
 *   lifecycle  → is a recorder running right now?  (NOT ASKED HERE)
 *
 * ═══ WHAT IT MAY NOT DO ═══
 *
 * It writes nothing — no storage, no recording command, no session state. It
 * owns no lifecycle, no heartbeat and no timer. It performs no active-tab query:
 * the tab is injected, and it is the one the panel is already bound to
 * (`panel.pick.tabId`), so an export can never come from a different page than
 * the pick and picker state describe. It touches no raw clipboard API —
 * `useCopyAll` and `ClipboardPort` already own that, failure handling included,
 * and a second transient state machine would drift from the first. It logs
 * nothing: the payload is a user's recording.
 *
 * NOT HERE: download (no browser seam exists and the manifest grants no
 * `downloads` permission — reported as a blocker rather than invented), the
 * structured code workspace, a code editor, workflow management, and the action
 * count, which DL-79 deferred and this slice keeps deferred.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { clipboardPort } from '../../src/application/adapters';
import { RECORDING_ENABLED } from '../../src/config/recording';
import { buildExportArtifact, type ExportResult } from '../../src/recording/export';
import { readDurableWorkflow } from '../../src/services/recording-workflow';
import { useCopyAll } from '../../src/hooks/useCopyAll';
import { RECORDING_WORKFLOW } from '../../src/storage/state';

import type { StorageGateway } from '../../src/application/ports/StorageGateway';
import type { RecordedWorkflow } from '../../src/recording/workflow';
import type { PwLang } from '../../src/ui/panel/types';

/** What the panel supplies. Injected, so this hook stays testable and tab-true. */
export interface ExportDeps {
  /** The tab the panel is bound to. `null` while unresolved. */
  tabId: number | null;
  /**
   * WS4's read surface, plus its change seam. Still read-only: `watch` writes
   * nothing and observes one descriptor for one tab. It is here because DL-91
   * measured what this hook's freshness actually rested on — a render storm —
   * and freshness must come from evidence changing, not from the panel
   * re-rendering.
   */
  gateway: Pick<StorageGateway, 'readTab' | 'watch'>;
}

export interface ExportModel {
  /** Whether pressing it would do anything. */
  actionable: boolean;
  /** The accessible name — always a sentence about the real state. */
  name: string;
  label: string;
}

/**
 * How the button presents itself, derived from the export attempt itself.
 *
 * Deriving it from the attempt rather than from a separate "can I?" flag means
 * the button cannot say "Export" while the export would refuse: there is one
 * answer, and the label and the action come from it.
 */
export function exportButtonModel(result: ExportResult | null): ExportModel {
  if (!result) {
    return { actionable: false, name: 'Checking for a recording to export', label: 'Export' };
  }
  if (result.ok) {
    return { actionable: true, name: 'Copy the recorded test to the clipboard', label: 'Export' };
  }
  const name =
    result.refusal === 'empty-workflow'
      ? 'Nothing to export — that recording captured no actions'
      : result.refusal === 'unsupported-language'
        ? 'Nothing to export — that language cannot be generated'
        : 'Nothing to export — no recording is stored for this page';
  return { actionable: false, name, label: 'Export' };
}

export function useExport(lang: PwLang, deps?: ExportDeps) {
  /**
   * The stored recording this hook has actually seen. The WRAPPER is the point:
   * `null` means "not read yet", `{ workflow: null }` means "read, and there is
   * nothing stored". Collapsing the two would turn "still asking" into
   * "nothing to export", which is the button claiming an answer it has not got.
   */
  const [read, setRead] = useState<{ workflow: RecordedWorkflow | null } | null>(null);

  /**
   * WS9 DL-91 — READ ONCE, THEN FOLLOW THE EVIDENCE.
   *
   * This effect used to depend on the whole `deps` object and on `lang`, and
   * the panel handed it a fresh object literal on every render — so it tore
   * down and re-read on every render, which is how the real browser measured
   * 15,612 workflow reads in 24.9 seconds. Worse, the freshness this hook
   * appears to have was NEVER its own: it had no timer, so it stayed current
   * only as a side effect of that churn. Removing the churn without replacing
   * the freshness would have frozen the export at its first read.
   *
   * So the dependency is now the two values that actually identify the source —
   * the bound tab and the gateway — and the freshness comes from WS4's existing
   * change seam, the same `watch` `pick-source.ts` already uses for LAST_PICK
   * and PICKER_ACTIVE. No new abstraction, no second poll, no third protocol.
   *
   * The listener receives the validated value directly, so a change costs no
   * second read. `lang` is deliberately NOT here: a language is a derivation of
   * a workflow already held, not a reason to go back to storage.
   */
  const tabId = deps?.tabId ?? null;
  const gateway = deps?.gateway;
  useEffect(() => {
    if (!gateway) {
      setRead(null);
      return;
    }
    let alive = true;
    void (async () => {
      const first = await readDurableWorkflow(gateway, tabId);
      if (alive) setRead({ workflow: first.value });
    })();
    // A tab-scoped descriptor cannot be watched without a tab. With none there
    // is nothing to follow, and the read above has already reported the absence.
    if (tabId === null) {
      return () => {
        alive = false;
      };
    }
    const stop = gateway.watch(RECORDING_WORKFLOW, tabId, (workflow) => {
      if (alive) setRead({ workflow });
    });
    return () => {
      alive = false;
      stop();
    };
  }, [tabId, gateway]);

  /** The export attempt. Derived, never stored: one workflow, one language. */
  const result = useMemo<ExportResult | null>(
    () => (read ? buildExportArtifact(read.workflow, lang) : null),
    [read, lang],
  );

  /**
   * The text to copy, or `null`.
   *
   * `useCopyAll` refuses a null payload, so a refused export cannot reach the
   * clipboard even if something managed to press the button.
   */
  const text = useCallback(
    () => (result && result.ok ? result.artifact.content : null),
    [result],
  );
  const copy = useCopyAll(clipboardPort, text);

  return { result, model: exportButtonModel(result), copy };
}

export type ExportController = ReturnType<typeof useExport>;

/** The outcome line. Always mounted while the flag is on, so it is announced. */
export function ExportStatus({ controller }: { controller: ExportController }) {
  if (!RECORDING_ENABLED) return null;
  const line =
    controller.copy.copyState === 'done'
      ? 'Copied the recorded test to the clipboard'
      : controller.copy.copyState === 'failed'
        ? `Could not copy — ${controller.copy.copyFailure}`
        : null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: line ? '4px 12px' : 0,
        fontSize: 11,
        fontWeight: 600,
        color: controller.copy.copyState === 'failed' ? '#fecdd3' : '#bbf7d0',
        background: controller.copy.copyState === 'failed' ? '#3f2937' : '#14532d',
        flexShrink: 0,
      }}
    >
      {line}
    </div>
  );
}

/**
 * The export button. Hidden entirely while the product flag is off.
 *
 * Its enabled state comes from `model.actionable`, which comes from the export
 * attempt — never from the flag and never from the lifecycle.
 */
export function ExportButton({
  controller,
  disabled,
}: {
  controller: ExportController;
  disabled?: boolean;
}) {
  if (!RECORDING_ENABLED) return null;
  const { model } = controller;
  const inert = disabled === true || !model.actionable;
  return (
    <button
      onClick={controller.copy.copyAll}
      title={model.name}
      aria-label={model.name}
      aria-disabled={inert}
      disabled={inert}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        border: 'none',
        borderRadius: 6,
        cursor: inert ? 'default' : 'pointer',
        fontSize: 11,
        fontWeight: 700,
        background: inert ? '#374151' : '#1d4ed8',
        color: inert ? '#9ca3af' : '#dbeafe',
        flexShrink: 0,
        opacity: inert ? 0.4 : 1,
      }}
    >
      <span style={{ fontSize: 11, lineHeight: 1 }}>⎘</span>
      {model.label}
    </button>
  );
}
