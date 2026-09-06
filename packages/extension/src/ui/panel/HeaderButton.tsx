/**
 * WS5 — the header's primary control.
 *
 * Both surfaces put one red glyph-and-label button at the left of the header,
 * with the same padding, radius, weight and disabled treatment; only what it
 * does differs (the Side Panel arms the page picker, DevTools re-reads `$0`).
 * The shape is shared so the two headers cannot drift apart the way the rest of
 * the panel did; the behaviour stays with the surface that owns it.
 */
import React from 'react';

export function HeaderButton({
  onClick,
  title,
  glyph,
  label,
  background = '#dc2626',
  disabled = false,
}: {
  onClick: () => void;
  title: string;
  glyph: string;
  label: string;
  background?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        border: 'none',
        borderRadius: 6,
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 11,
        fontWeight: 700,
        background,
        color: '#fff',
        transition: 'background .2s',
        flexShrink: 0,
        letterSpacing: '0.01em',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1, fontWeight: 900 }}>{glyph}</span>
      {label}
    </button>
  );
}
