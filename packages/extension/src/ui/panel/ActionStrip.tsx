/**
 * WS5 — the element + action strip, one implementation.
 *
 * Both panels rendered this identically apart from the action table behind it
 * (D-b/D-c), which is now shared too. It names the picked element and offers
 * the actions that element supports; the hint underneath explains what the
 * selected one does.
 */
import React from 'react';

import type { ElementAttributes } from '@playwright-guru/locator-engine';
import type { ActionOption } from './types';
import { resolveAction } from './contextual-actions';

export function ActionStrip({
  attributes,
  actions,
  actionMode,
  onSelect,
}: {
  attributes: ElementAttributes;
  actions: ActionOption[];
  actionMode: string;
  onSelect: (value: string) => void;
}) {
  const { definition } = resolveAction(actions, actionMode);
  const valid = actions.some((a) => a.value === actionMode);
  return (
    <div
      style={{
        padding: '6px 10px',
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: definition.hint ? 3 : 0,
        }}
      >
        <code
          style={{
            fontSize: 11,
            background: '#f1f5f9',
            color: '#475569',
            padding: '2px 5px',
            borderRadius: 3,
            fontFamily: 'Consolas,monospace',
            flexShrink: 0,
          }}
        >
          &lt;{attributes.tagName}
          {attributes.type ? `[${attributes.type}]` : ''}&gt;
        </code>
        <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0 }}>Action:</span>
        <select
          value={valid ? actionMode : 'none'}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Playwright action to append to the generated locator"
          style={{
            fontSize: 11,
            padding: '3px 5px',
            border: '1px solid #e2e8f0',
            borderRadius: 4,
            background: actionMode === 'none' ? '#f8fafc' : '#eff6ff',
            color: '#1e293b',
            cursor: 'pointer',
            flex: 1,
          }}
        >
          {actions.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      {definition.hint && (
        <div style={{ fontSize: 11, color: '#2563eb', paddingLeft: 2, display: 'flex', gap: 4 }}>
          <span style={{ color: '#64748b', flexShrink: 0 }}>ℹ</span>
          <span>{definition.hint}</span>
        </div>
      )}
    </div>
  );
}
