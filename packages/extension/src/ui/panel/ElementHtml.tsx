/**
 * WS5 — the picked element's markup, one implementation.
 *
 * The captured `outerHtml` is page-derived content, so it is rendered as TEXT
 * inside a `<code>` element and never as HTML. Nothing here uses
 * `dangerouslySetInnerHTML`, and nothing may: the whole point of showing the
 * markup is that the user can read what was captured, not that the page gets to
 * render itself a second time inside the extension.
 *
 * `defaultOpen` is the one surface difference: DevTools opened this section by
 * default and the Side Panel did not. That is a deliberate layout choice for a
 * taller panel, not drift, so it stays a prop rather than being unified away.
 */
import React from 'react';

export function ElementHtml({
  html,
  defaultOpen = false,
}: {
  html?: string;
  defaultOpen?: boolean;
}) {
  if (!html) return null;
  return (
    <details
      open={defaultOpen}
      style={{
        margin: '8px 8px 4px',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        overflow: 'hidden',
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
          justifyContent: 'space-between',
          userSelect: 'none',
          background: '#f8fafc',
        }}
      >
        <span>Element HTML</span>
        <span style={{ fontWeight: 400, fontSize: 11 }}>
          {defaultOpen ? 'click to collapse' : 'click to expand'}
        </span>
      </summary>
      <code
        style={{
          display: 'block',
          fontFamily: 'Consolas,monospace',
          fontSize: 11,
          color: '#475569',
          background: '#f1f5f9',
          padding: '6px 10px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.5,
        }}
      >
        {html}
      </code>
    </details>
  );
}
