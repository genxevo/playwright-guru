/**
 * WS5 — the CODE workspace footer, one implementation for both surfaces.
 *
 * D-e (DL-67) was that the Side Panel persisted this list through WS4 while
 * DevTools kept it in memory and lost it when DevTools closed. The owner's O1
 * decision makes it ONE user workspace; this component is the presentation half
 * of that and knows nothing about storage — it renders the lines it is given
 * and reports what the user did with them.
 *
 * `writeFailed` is the visible half of O5: a rejected write used to vanish, so
 * the panel kept showing a line as if it had been saved.
 */
import React from 'react';

import { ErrorNotice } from '../primitives';

export function CodeWorkspace({
  lines,
  canUndo,
  copyState,
  copyFailure,
  writeFailed = false,
  onCopyAll,
  onUndo,
  onClear,
  onRemove,
}: {
  lines: string[];
  canUndo: boolean;
  copyState: 'idle' | 'done' | 'failed';
  copyFailure: string;
  writeFailed?: boolean;
  onCopyAll: () => void;
  onUndo: () => void;
  onClear: () => void;
  onRemove: (index: number) => void;
}) {
  const empty = lines.length === 0;
  return (
    <div
      style={{
        borderTop: '3px solid #f97316',
        background: 'var(--pg-code-bg)',
        flex: 1,
        minHeight: 80,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          borderBottom: '1px solid #333',
          background: 'var(--pg-code-surface)',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: 'var(--pg-code-text)',
            letterSpacing: '.05em',
            flex: 1,
          }}
        >
          CODE
        </span>
        <span style={{ fontSize: 11, color: '#858585' }}>
          {lines.length} line{lines.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onCopyAll}
          disabled={empty}
          title={copyState === 'failed' ? copyFailure : undefined}
          style={{
            fontSize: 11,
            padding: '2px 8px',
            border: 'none',
            borderRadius: 3,
            cursor: empty ? 'default' : 'pointer',
            background:
              copyState === 'done' ? '#16a34a' : copyState === 'failed' ? '#dc2626' : '#007acc',
            color: '#fff',
            fontWeight: 700,
            opacity: empty ? 0.4 : 1,
          }}
        >
          {copyState === 'done'
            ? '✓ Copied!'
            : copyState === 'failed'
              ? '✗ Copy failed'
              : '📋 Copy All'}
        </button>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          style={{
            fontSize: 11,
            padding: '2px 8px',
            border: '1px solid #555',
            borderRadius: 3,
            cursor: canUndo ? 'pointer' : 'default',
            background: 'transparent',
            color: canUndo ? 'var(--pg-code-text)' : '#555',
            fontWeight: 700,
          }}
        >
          ↩ Undo
        </button>
        <button
          onClick={onClear}
          disabled={empty}
          style={{
            fontSize: 11,
            padding: '2px 8px',
            border: '1px solid #c0392b',
            borderRadius: 3,
            cursor: empty ? 'default' : 'pointer',
            background: 'transparent',
            color: '#e87171',
            fontWeight: 700,
            opacity: empty ? 0.4 : 1,
          }}
        >
          Clear
        </button>
      </div>

      {/* O5 — a rejected write is stated, with the WS8 title/cause/action. */}
      {writeFailed && (
        <div style={{ padding: '6px 10px', flexShrink: 0 }}>
          <ErrorNotice code="STORAGE_WRITE_FAILED" compact />
        </div>
      )}

      {empty ? (
        <div
          style={{
            padding: '14px 14px',
            fontSize: 11,
            color: '#4a4a4a',
            fontFamily: 'Consolas,monospace',
          }}
        >
          <span style={{ color: 'var(--pg-code-comment)' }}>// Click </span>
          <span style={{ color: 'var(--pg-code-keyword)' }}>+ Code</span>
          <span style={{ color: 'var(--pg-code-comment)' }}>
            {' '}
            on any locator above to build your script
          </span>
        </div>
      ) : (
        <div style={{ maxHeight: 200, overflowY: 'auto', padding: '6px 0' }}>
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                padding: '1px 8px',
                transition: 'background .1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--pg-code-line)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span
                style={{
                  color: '#5a5a5a',
                  userSelect: 'none',
                  flexShrink: 0,
                  width: 22,
                  textAlign: 'right',
                  paddingRight: 10,
                  fontSize: 11,
                  paddingTop: 2,
                  fontFamily: 'Consolas,monospace',
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  flex: 1,
                  color: 'var(--pg-code-string)',
                  wordBreak: 'break-all',
                  fontFamily: '"Fira Code",Consolas,monospace',
                  fontSize: 11,
                  lineHeight: 1.7,
                }}
              >
                {line}
              </span>
              <button
                onClick={() => onRemove(i)}
                aria-label={`Remove line ${i + 1} from the code buffer`}
                title="Remove this line"
                style={{
                  fontSize: 11,
                  background: 'transparent',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  flexShrink: 0,
                  borderRadius: 3,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#e87171';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#6b7280';
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
