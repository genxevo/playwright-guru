/**
 * WS6.2 — VerifyLocatorPanel wiring, accessibility and security guards.
 * ================================================================
 * The extension test environment is `node` (no DOM) — matching
 * `architecture.test.ts`/`primitives.test.ts`, these are structural
 * source-scan guards, not render tests.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readComposed } from './helpers/surface-source';

const EXT = resolve(__dirname, '..');
/**
 * WS5 — a surface is a COMPOSITION, not a file.
 *
 * `readComposed` resolves a panel entrypoint path to everything that surface
 * actually imports (see `helpers/surface-source.ts`). Every assertion below is
 * unchanged; what changed is that they now follow the code when WS5 moves it,
 * instead of silently passing because the string they look for went to another
 * file. Any other path still reads exactly that one file.
 */
const read = (rel: string): string => readComposed(rel);

const PANEL_COMPONENT = read('src/ui/VerifyLocatorPanel.tsx');
const COPY = read('src/ui/copy/verification.ts');
const CONTENT = read('entrypoints/content.ts');
const BACKGROUND = read('entrypoints/background.ts');
const MESSAGING = read('utils/messaging.ts');
const SIDE_PANEL = read('entrypoints/sidepanel/SidePanel.tsx');
const DEVTOOLS_PANEL = read('entrypoints/devtools-panel/Panel.tsx');

// ─── Contract wiring — the message reaches the same seam, end to end ──────

describe('WS6.2 — VERIFY_LOCATOR_EXPRESSION reuses the existing RuntimeMessage seam', () => {
  it('messaging.ts declares the message type and carries a VerificationResult on the ack', () => {
    expect(MESSAGING).toMatch(/type:\s*'VERIFY_LOCATOR_EXPRESSION'/);
    expect(MESSAGING).toMatch(/verification\?:\s*VerificationResult/);
  });

  it('background.ts routes it as a tab-scoped request/response, same as VERIFY_SELECTOR', () => {
    expect(BACKGROUND).toMatch(/KNOWN_MESSAGE_TYPES[\s\S]*?'VERIFY_LOCATOR_EXPRESSION'/);
    expect(BACKGROUND).toMatch(
      /message\.type === 'VERIFY_SELECTOR'[\s\S]{0,80}message\.type === 'VERIFY_LOCATOR_EXPRESSION'/,
    );
  });

  it('content.ts handles it by calling the SHARED verifyLocatorExpression — no second parser/resolver', () => {
    expect(CONTENT).toMatch(/case 'VERIFY_LOCATOR_EXPRESSION':/);
    expect(CONTENT).toMatch(
      /import\s*\{[^}]*verifyLocatorExpression[^}]*\}\s*from\s*'@playwright-guru\/locator-engine'/,
    );
    expect(CONTENT).toMatch(/verifyLocatorExpression\(msg\.expression,\s*probe\)/);
  });

  it('content.ts never evaluates the expression itself — no eval/new Function anywhere in this file', () => {
    expect(CONTENT).not.toMatch(/\beval\s*\(/);
    expect(CONTENT).not.toMatch(/\bnew\s+Function\b/);
  });

  it('both panels mount VerifyLocatorPanel and supply their OWN verify callback (no shared browser call inside the component)', () => {
    for (const [name, source] of [
      ['SidePanel.tsx', SIDE_PANEL],
      ['Panel.tsx', DEVTOOLS_PANEL],
    ] as const) {
      expect(source, `${name} must import VerifyLocatorPanel`).toMatch(
        /import\s*\{\s*VerifyLocatorPanel\s*\}\s*from\s*'[^']*VerifyLocatorPanel'/,
      );
      expect(source, `${name} must mount it with a verify prop`).toMatch(
        /<VerifyLocatorPanel verify=\{(verifyLocatorExpr|verifyExpression)\}/,
      );
      expect(source, `${name} must send VERIFY_LOCATOR_EXPRESSION from its own callback`).toMatch(
        /type:\s*'VERIFY_LOCATOR_EXPRESSION'/,
      );
    }
  });
});

// ─── R5 — the component itself stays browser-free ──────────────────────────

describe('VerifyLocatorPanel.tsx — R5 (no browser/runtime import in ui/)', () => {
  it('never imports chrome.*/browser.* or a runtime module directly', () => {
    expect(PANEL_COMPONENT).not.toMatch(/from\s+'wxt\/browser'/);
    expect(PANEL_COMPONENT).not.toMatch(/\bchrome\./);
    expect(PANEL_COMPONENT).not.toMatch(/from\s+'\.\.\/runtime\//);
  });

  it('receives verification behaviour only through an injected `verify` prop', () => {
    expect(PANEL_COMPONENT).toMatch(
      /verify:\s*\(expression:\s*string\)\s*=>\s*Promise<VerificationResult>/,
    );
  });
});

// ─── Accessibility ──────────────────────────────────────────────────────────

describe('VerifyLocatorPanel.tsx — accessibility contract', () => {
  it('the input has an associated <label>, not just a placeholder', () => {
    expect(PANEL_COMPONENT).toMatch(/<label\s+htmlFor=\{inputId\}/);
    expect(PANEL_COMPONENT).toMatch(/<input\s[^>]*id=\{inputId\}/s);
  });

  it('renders a native <button type="submit"> inside a <form>, not a click-handled div', () => {
    expect(PANEL_COMPONENT).toMatch(/<form[^>]*onSubmit=/);
    expect(PANEL_COMPONENT).toMatch(/<button\s[^>]*type="submit"/);
  });

  it('the result region is announced (role=status, aria-live=polite) — not silent on update', () => {
    expect(PANEL_COMPONENT).toMatch(/role="status"/);
    expect(PANEL_COMPONENT).toMatch(/aria-live="polite"/);
  });

  it('status is never conveyed by colour alone — every state has a distinct label AND symbol', () => {
    expect(PANEL_COMPONENT).toMatch(/copy\.symbol/);
    expect(PANEL_COMPONENT).toMatch(/copy\.label/);
  });
});

// ─── Trust copy — domain prose exclusion + no overclaiming ────────────────

describe('ui/copy/verification.ts — exhaustive, honest copy', () => {
  const STATUSES = ['verified', 'not-found', 'ambiguous', 'invalid', 'unsupported', 'unverifiable'];

  it.each(STATUSES)(
    'has copy for VerificationStatus %s (compile-time enforced, checked here too)',
    (status) => {
      expect(COPY).toMatch(new RegExp(`(^|\\s)'?${status.replace('-', '\\-')}'?:\\s*\\{`, 'm'));
    },
  );

  it('never claims "verified" language for the unsupported/unverifiable/invalid states', () => {
    // Crude but effective: the word "Verified" (capitalised, the positive
    // label) must not appear inside any OTHER state's block. This guards
    // against copy drifting to overclaim confidence the evidence lacks.
    const blocks = COPY.split(/^\s{2}(?=[a-z'-]+:\s*\{)/m).slice(1);
    for (const block of blocks) {
      const isVerifiedBlock = /^verified:/.test(block);
      if (isVerifiedBlock) continue;
      expect(block).not.toMatch(/label:\s*'Verified'/);
    }
  });
});
