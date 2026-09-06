/**
 * The Side Panel's recorded-spec review surface (WS9 — structured code workspace).
 * ---------------------------------------------------------------------------
 * WHAT IT IS: a read-only window onto the recording stored for this tab,
 * rendered by the existing renderer, in the language the panel is already set
 * to, with the existing copy control. That is the whole feature.
 *
 * ═══ IT IS NOT WS5's `CodeWorkspace` ═══
 *
 * `ui/panel/CodeWorkspace.tsx` is the user's locator code BUFFER — lines they
 * append from picks, with Undo, Clear and per-line Remove, persisted in
 * `CODE_BUFFER`. DL-76 warned against confusing the two. This component shows
 * the RECORDED SPEC, owns no buffer, and persists nothing; that file is not
 * touched, imported or extended.
 *
 * ═══ REVIEW-ONLY, AND WHY THAT IS ARCHITECTURE ═══
 *
 * A recorded `LocatorChain` is a verified artifact, measured once at capture
 * against a live DOM. Let a user edit it and the product owes an answer to "is
 * an edited locator still verified?" — and every honest answer requires
 * re-running verification this layer may not run. So: no textarea, no
 * `contentEditable`, no editor library, no locator field, no strategy
 * dropdown, no reordering, no insertion, no deletion, no assertions.
 *
 * ═══ THE CODE IS TEXT, NOT MARKUP ═══
 *
 * Generated source carries `<`, `>`, `&`, quotes and backticks drawn from page
 * content. It is rendered as a React text child inside `<pre><code>` — never
 * `innerHTML`, never `dangerouslySetInnerHTML` — for the same reason
 * `ElementHtml` renders captured markup as text: showing the user what was
 * captured must not let the page render itself a second time inside the
 * extension.
 *
 * ═══ IT ASKS ABOUT THE RECORDING, NEVER ABOUT THE RECORDER ═══
 *
 * DL-79 established that lifecycle and workflow existence are different facts.
 * An inactive recorder does not erase a recording worth reviewing, so this
 * component never consults the lifecycle. It asks one question — is there a
 * trustworthy recording for the bound tab? — and states the answer.
 *
 * The FLAG is a third, separate question: `RECORDING_ENABLED` decides whether
 * the feature is offered at all, and while it is `false` no recording can come
 * into existence, so this takes the same early return `RecordButton`,
 * `RecordingBanner` and `ExportButton` take. No dead affordance ships.
 *
 * NOT HERE: editing, assertions, the action count, download, migration, any
 * persistence, and anything that would change `RECORDING_ENABLED`.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { RECORDING_ENABLED } from '../../src/config/recording';
import { buildWorkspaceView, type WorkspaceView } from '../../src/recording/workspace';
import { readDurableWorkflow } from '../../src/services/recording-workflow';
import { CopyButton } from '../../src/ui/primitives';
import { RECORDING_WORKFLOW } from '../../src/storage/state';

import type { StorageGateway } from '../../src/application/ports/StorageGateway';
import type { RecordedWorkflow } from '../../src/recording/workflow';
import type { PwLang } from '../../src/ui/panel/types';

/** What the panel supplies. Injected, so this stays testable and tab-true. */
export interface WorkspaceDeps {
  /** The tab the panel is bound to. `null` while unresolved. */
  tabId: number | null;
  /**
   * WS4's read surface, plus its change seam. Still read-only: `watch` writes
   * nothing. DL-91 — this view's freshness used to rest on the panel's render
   * churn; it now rests on the stored recording actually changing.
   */
  gateway: Pick<StorageGateway, 'readTab' | 'watch'>;
}

/** What the user is told when there is no code to show. Never "recording is off". */
const NOTE: Record<Exclude<WorkspaceView['state'], 'ready'>, string> = {
  unavailable: 'No recording stored for this page yet.',
  empty: 'That recording captured no actions.',
  error: 'That recording cannot be shown in this language.',
};

export function useRecordingWorkspace(lang: PwLang, deps?: WorkspaceDeps) {
  /** The stored recording itself. The VIEW is derived from it, never stored. */
  const [workflow, setWorkflow] = useState<RecordedWorkflow | null>(null);

  /**
   * WS9 DL-91 — READ ONCE, THEN FOLLOW THE EVIDENCE.
   *
   * Still no timer, and still no second poll — that refusal, held since slice
   * 5A, is why this hook had no freshness of its own and why it silently
   * depended on the panel re-rendering. The real browser measured what that
   * cost: a fresh `deps` literal per render meant a fresh effect per render,
   * and 15,612 workflow reads in 24.9 seconds across the readers that shared it.
   *
   * The dependency is now the two values that identify the source, and change
   * arrives through WS4's existing `watch` seam — the one `pick-source.ts`
   * already uses. A change delivers the validated workflow directly, so it
   * costs no second read, and `lang` stays out of the subscription: rendering
   * the same recording in another language is a derivation, not a re-read.
   */
  const tabId = deps?.tabId ?? null;
  const gateway = deps?.gateway;
  useEffect(() => {
    if (!gateway) {
      setWorkflow(null);
      return;
    }
    let alive = true;
    void (async () => {
      const first = await readDurableWorkflow(gateway, tabId);
      if (alive) setWorkflow(first.value);
    })();
    // A tab-scoped descriptor cannot be watched without a tab, and the read
    // above has already reported the absence honestly.
    if (tabId === null) {
      return () => {
        alive = false;
      };
    }
    const stop = gateway.watch(RECORDING_WORKFLOW, tabId, (next) => {
      if (alive) setWorkflow(next);
    });
    return () => {
      alive = false;
      stop();
    };
  }, [tabId, gateway]);

  return useMemo(() => buildWorkspaceView(workflow, lang), [workflow, lang]);
}

export type WorkspaceController = ReturnType<typeof useRecordingWorkspace>;

/**
 * The review surface. Collapsed by default, like `ElementHtml`, because the
 * panel's primary job is picking and this is a secondary read.
 */
export function RecordingWorkspace({ view }: { view: WorkspaceController }) {
  if (!RECORDING_ENABLED) return null;
  const note = view.state === 'ready' ? null : NOTE[view.state];
  return (
    <details
      style={{
        margin: '4px 8px',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <summary
        style={{
          padding: '6px 10px',
          fontSize: 11,
          fontWeight: 700,
          color: '#64748b',
          cursor: 'pointer',
          listStyle: 'none',
          textTransform: 'uppercase',
          letterSpacing: '.05em',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          userSelect: 'none',
          background: '#f8fafc',
        }}
      >
        <span style={{ flex: 1 }}>Recorded test</span>
        {view.state === 'ready' && (
          <CopyButton text={view.code} label="Copy the recorded test" />
        )}
      </summary>

      {/* The one place this surface says anything about itself. Always mounted
          so a state change is announced rather than dropped (WS8's rule). */}
      <div
        role="status"
        aria-live="polite"
        style={{
          padding: note ? '10px' : 0,
          fontSize: 11,
          color: '#64748b',
          background: '#fff',
        }}
      >
        {note}
      </div>

      {view.state === 'ready' && (
        <pre
          aria-label={`Recorded test, generated ${view.language} source`}
          tabIndex={0}
          style={{
            margin: 0,
            padding: '8px 10px',
            maxHeight: 220,
            overflowX: 'auto',
            overflowY: 'auto',
            background: 'var(--pg-code-bg)',
            color: 'var(--pg-code-text)',
            fontFamily: '"Fira Code",Consolas,monospace',
            fontSize: 11,
            lineHeight: 1.7,
            whiteSpace: 'pre',
            tabSize: 2,
          }}
        >
          <code>{view.code}</code>
        </pre>
      )}
    </details>
  );
}
