/**
 * WS9 — THE STRUCTURED CODE WORKSPACE: a review surface, and nothing more.
 * ============================================================================
 * WHAT THIS SLICE IS.
 *
 * A user can already record (gated), the recording is already durably owned,
 * already truthfully observed, and already exportable to the clipboard. What
 * they could not do is LOOK at it. This is that surface, and its whole design
 * is contained in one word: **projection**.
 *
 *     RecordedWorkflow → renderSpecFile(workflow, language) → read-only view
 *
 * ═══ THE NAMING COLLISION, HANDLED RATHER THAN INHERITED ═══
 *
 * WS5 already ships a component called `CodeWorkspace`. It is a DIFFERENT
 * THING: the user's locator code BUFFER — lines they append from picks, with
 * Undo, Clear and per-line Remove, persisted in `CODE_BUFFER`. DL-76 explicitly
 * warned against confusing the two. This slice therefore adds
 * `RecordingWorkspace`, touches `CodeWorkspace` not at all, and adds no storage
 * of its own: the recorded spec's source of truth stays the `RecordedWorkflow`.
 *
 * ═══ WHY REVIEW-ONLY IS AN ARCHITECTURAL BOUNDARY, NOT A SCOPE CUT ═══
 *
 * A recorded `LocatorChain` is a VERIFIED artifact — measured once, at capture,
 * against a live DOM. The moment a user can edit it, the product owes an answer
 * to "is an edited locator still verified?", and there is no honest answer that
 * does not involve re-running verification the workspace is forbidden to run.
 * So the workspace shows and copies. It does not edit, reorder, insert, delete,
 * assert, or persist.
 *
 * ═══ AND IT DOES NOT INTERPRET THE CODE IT SHOWS ═══
 *
 * Generated Playwright source contains `<`, `>`, `&`, quotes and backticks
 * drawn from page content. It is rendered as TEXT — never through `innerHTML`,
 * never `dangerouslySetInnerHTML` — for the same reason `ElementHtml` renders
 * captured markup as text: showing the user what was captured must not let the
 * page render itself a second time inside the extension.
 *
 * Evidence level: UNIT + STRUCTURAL. **Real Chromium: NOT RUN. Manual browser
 * regression: NOT RUN.**
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RECORDING_ENABLED, RECORDING_LIMITS } from '../src/config/recording';
import { buildWorkspaceView, type WorkspaceView } from '../src/recording/workspace';
import { renderSpecFile } from '../src/recording/render';
import { appendStep, createWorkflow, type RecordedStep } from '../src/recording/workflow';
import { readDurableWorkflow } from '../src/services/recording-workflow';
import { createStorageGateway, tabKey, STORAGE_SCHEMA_VERSION } from '../src/storage/gateway';
import { RECORDING_WORKFLOW } from '../src/storage/state';

import { FakeChangeSource, FakeStorageArea } from './helpers/fake-storage';
import { stripComments } from './helpers/surface-source';

import type { TargetLanguage } from '@playwright-guru/codegen';

const EXT = resolve(__dirname, '..');
const readRaw = (rel: string): string => readFileSync(resolve(EXT, rel), 'utf8');
const code = (rel: string): string => stripComments(readRaw(rel));

const VIEW = 'src/recording/workspace.ts';
const PANEL = 'entrypoints/sidepanel/RecordingWorkspace.tsx';
const SIDE_PANEL = 'entrypoints/sidepanel/SidePanel.tsx';

const TAB = 21;
const OTHER_TAB = 22;

const LANGUAGES: TargetLanguage[] = [
  'typescript',
  'javascript',
  'python_sync',
  'python_async',
  'java',
  'csharp_sync',
  'csharp_async',
];

const envelope = (data: unknown) => ({ v: STORAGE_SCHEMA_VERSION, data });

function build(seed: Record<string, unknown> = {}) {
  const session = new FakeStorageArea(seed);
  const gateway = createStorageGateway({
    local: new FakeStorageArea(),
    session,
    changes: new FakeChangeSource(),
  });
  return { session, gateway };
}

const step = (over: Partial<RecordedStep> = {}): RecordedStep => ({
  kind: 'click',
  timestamp: 10,
  target: {
    locator: {
      chain: { steps: [{ kind: 'role', selectorValue: { type: 'string', value: 'button' } }] },
      verdict: 'excellent',
      matchCount: 1,
      visibleMatchCount: 1,
      stepCounts: [1],
      rationale: [],
    },
    facts: {
      attributes: { tagName: 'BUTTON' },
      ancestors: [],
      indexInParent: 0,
      inShadowRoot: false,
    },
  },
  ...over,
});

/** A recording with a navigation, a click, a fill and a withheld password. */
function populated() {
  let workflow = createWorkflow({ id: 's1', url: 'https://example.test/', startedAt: 0 });
  workflow = appendStep(
    workflow,
    step({ kind: 'goto', url: 'https://example.test/', timestamp: 1, target: undefined }),
  ).workflow;
  workflow = appendStep(workflow, step({ timestamp: 2 })).workflow;
  workflow = appendStep(workflow, step({ kind: 'fill', value: 'alice', timestamp: 3 })).workflow;
  workflow = appendStep(
    workflow,
    step({ kind: 'fill', value: 'hunter2', redacted: 'password', timestamp: 9_000 }),
  ).workflow;
  return workflow;
}

function withNth() {
  const positional = step();
  positional.target!.locator = {
    ...positional.target!.locator,
    chain: { ...positional.target!.locator.chain, nth: 3 },
  };
  return appendStep(createWorkflow({ id: 's2', url: 'u', startedAt: 0 }), positional).workflow;
}

const ready = (workflow: unknown, language: TargetLanguage = 'typescript'): WorkspaceView =>
  buildWorkspaceView(workflow as never, language);

// ═══ The flag, and the lifecycle/workflow separation ════════════════════════

describe('the product flag is untouched, and the workspace is not the lifecycle', () => {
  it('keeps RECORDING_ENABLED false', () => {
    expect(RECORDING_ENABLED).toBe(false);
  });

  it('W9/W10/W11/W12 — the projection cannot start, stop, beat or create a session', () => {
    const src = code(VIEW);
    for (const forbidden of [
      'START_RECORDING',
      'STOP_RECORDING',
      'RecordingSession',
      'heartbeat',
      'tick(',
      'RECORDING_ENABLED',
    ]) {
      expect(src, `the projection must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('F48 — asks about the WORKFLOW, never about whether recording is active', () => {
    // DL-79's rule: lifecycle and workflow existence are different facts. An
    // inactive recorder does not erase a recording worth reviewing.
    for (const rel of [VIEW, PANEL]) {
      const src = code(rel);
      for (const forbidden of [
        'observedLifecycle',
        'isRecordingNow',
        'RecordingView',
        'lifecycle',
      ]) {
        expect(src, `${rel} must not consult ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

// ═══ W1/W2/W19/W21 — rendering is the EXISTING renderer, unchanged ═════════

describe('W1/W2/W19 — the workspace shows exactly what the renderer produces', () => {
  it.each(LANGUAGES)('%s is byte-identical to renderSpecFile', (language) => {
    const workflow = populated();
    const view = ready(workflow, language);
    expect(view.state).toBe('ready');
    expect(view.code).toBe(renderSpecFile(workflow, language));
  });

  it('W21 — all seven languages are supported, and no eighth is invented', () => {
    for (const language of LANGUAGES) {
      expect(ready(populated(), language).state, language).toBe('ready');
    }
    expect(ready(populated(), 'ruby' as TargetLanguage).state).toBe('error');
  });

  it('W40 — identical input renders identically', () => {
    const workflow = populated();
    expect(ready(workflow, 'java')).toEqual(ready(workflow, 'java'));
  });

  it('W20 — a positional locator is shown, never quietly dropped', () => {
    const view = ready(withNth(), 'typescript');
    expect(view.code).toContain('.nth(3)');
    expect(view.code).toBe(renderSpecFile(withNth(), 'typescript'));
  });

  it('changing language re-renders from the SAME workflow', () => {
    const workflow = populated();
    const ts = ready(workflow, 'typescript');
    const py = ready(workflow, 'python_sync');
    expect(ts.code).not.toBe(py.code);
    expect(ts.code).toBe(renderSpecFile(workflow, 'typescript'));
    expect(py.code).toBe(renderSpecFile(workflow, 'python_sync'));
  });

  it('F26 — builds no second renderer and synthesises no locator', () => {
    const src = code(VIEW);
    expect(src).toContain('renderSpecFile');
    for (const forbidden of [
      'generateLocatorCode',
      'page.locator(',
      'getByRole',
      'getByTestId',
      'import {',
      "test('",
    ]) {
      if (forbidden === 'import {') continue; // imports are legitimate
      expect(src, `the projection must not build ${forbidden}`).not.toContain(forbidden);
    }
    // No hand-rolled scaffolding, imports or per-language tables.
    expect(src).not.toMatch(/@playwright\/test/);
    expect(src).not.toMatch(/def test_|public void |\[Test\]/);
  });
});

// ═══ W13/W14/W15 + F19 — honest states, never fabricated code ══════════════

describe('W13/F19 — an empty recording gets an honest empty state, not a blank panel', () => {
  it('reports empty and renders no code', () => {
    const empty = createWorkflow({ id: 's', url: 'u', startedAt: 0 });
    expect(renderSpecFile(empty, 'typescript')).toBe('');
    const view = ready(empty);
    expect(view.state).toBe('empty');
    expect(view.code).toBe('');
    expect(view.hasWorkflow).toBe(true);
  });

  it('invents no step and no placeholder test', () => {
    const view = ready(createWorkflow({ id: 's', url: 'u', startedAt: 0 }), 'java');
    expect(view.code).toBe('');
    expect(view.code).not.toMatch(/recordedTest|@Test/);
  });
});

describe('W14/W15/F3/F4 — untrustworthy input fails closed', () => {
  const REJECTED: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['a string', 'workflow'],
    ['an array', []],
    ['no schema version', { id: 's', url: 'u', startedAt: 0, steps: [] }],
    [
      'a future workflow schema',
      { ...createWorkflow({ id: 's', url: 'u', startedAt: 0 }), schemaVersion: 2 },
    ],
    [
      'steps that are not an array',
      { ...createWorkflow({ id: 's', url: 'u', startedAt: 0 }), steps: {} },
    ],
    [
      'an unknown step kind',
      {
        ...createWorkflow({ id: 's', url: 'u', startedAt: 0 }),
        steps: [{ kind: 'scroll', timestamp: 1 }],
      },
    ],
    [
      'a redacted step that illegally kept its value',
      {
        ...createWorkflow({ id: 's', url: 'u', startedAt: 0 }),
        steps: [{ kind: 'fill', timestamp: 1, redacted: 'password', value: 'hunter2' }],
      },
    ],
    [
      'more steps than the authoritative cap',
      {
        ...createWorkflow({ id: 's', url: 'u', startedAt: 0 }),
        steps: Array.from({ length: RECORDING_LIMITS.hardStop + 1 }, (_, i) =>
          step({ timestamp: i }),
        ),
      },
    ],
  ];

  it.each(REJECTED)('refuses %s without rendering partial code', (_label, raw) => {
    const view = ready(raw);
    expect(view.code).toBe('');
    expect(view.hasWorkflow).toBe(false);
    expect(['unavailable', 'error']).toContain(view.state);
  });

  it('never leaks a smuggled secret into the view, even in a refusal', () => {
    const smuggled = {
      ...createWorkflow({ id: 's', url: 'u', startedAt: 0 }),
      steps: [{ kind: 'fill', timestamp: 1, redacted: 'password', value: 'hunter2' }],
    };
    expect(JSON.stringify(ready(smuggled))).not.toContain('hunter2');
  });

  it('does not silently fall back to the legacy recordedActions array', () => {
    for (const rel of [VIEW, PANEL]) {
      expect(code(rel), `${rel} must not revive the legacy array`).not.toContain('recordedActions');
    }
  });
});

// ═══ W7/F9 — the workflow is never mutated ═════════════════════════════════

describe('W7/F9 — the projection is read-only with respect to the recording', () => {
  it('leaves the workflow structurally identical', () => {
    const workflow = populated();
    const before = JSON.stringify(workflow);
    for (const language of LANGUAGES) buildWorkspaceView(workflow, language);
    expect(JSON.stringify(workflow)).toBe(before);
  });

  it('does not sort, splice, normalise or default anything into it', () => {
    const src = code(VIEW);
    for (const forbidden of ['.sort(', '.splice(', '.reverse(', '.push(', '.shift(']) {
      expect(src, `the projection must not ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('the view carries only what the UI needs', () => {
    const view = ready(populated());
    expect(Object.keys(view).sort()).toEqual(['code', 'hasWorkflow', 'language', 'state']);
  });

  it('the view carries no DOM, facts, session, gateway or lifecycle', () => {
    const serialised = JSON.stringify(ready(populated()));
    for (const forbidden of ['ancestors', 'attributes', 'sessionId', 'stepCounts', 'verdict']) {
      expect(serialised, `the view must not carry ${forbidden}`).not.toContain(forbidden);
    }
  });
});

// ═══ W16/W17/W18 — privacy survives the review surface ═════════════════════

describe('W16/W17/W18 — nothing secret reaches the screen', () => {
  it('a withheld password stays withheld in every language', () => {
    for (const language of LANGUAGES) {
      const view = ready(populated(), language);
      expect(view.code, language).not.toContain('hunter2');
    }
    expect(ready(populated()).code).toMatch(/value withheld \(password\)/);
  });

  it('W18 — the session id never appears in the rendered view', () => {
    const view = ready(populated());
    expect(view.code).not.toContain('s1');
    expect(JSON.stringify(view)).not.toContain('"s1"');
  });

  it('F37 — nothing logs the workflow, the code or anything else', () => {
    for (const rel of [VIEW, PANEL]) {
      expect(code(rel), `${rel} must not log`).not.toMatch(/console\./);
    }
  });
});

// ═══ F20/W27 — hostile text is displayed, never interpreted ════════════════

describe('F20 — generated code is rendered as TEXT, never as markup', () => {
  it('carries hostile characters through unchanged, without escaping or stripping', () => {
    // Page-derived values reach the renderer, so `<`, `>`, `&`, quotes and
    // backticks reach the screen. The projection must not touch them — React
    // renders them as text, and the escaping question never arises.
    const hostile = '<img src=x onerror=alert(1)> & "quotes" `ticks` \\/slashes';
    let workflow = createWorkflow({ id: 's', url: 'u', startedAt: 0 });
    workflow = appendStep(workflow, step({ kind: 'fill', value: hostile })).workflow;
    const view = ready(workflow);
    expect(view.code).toBe(renderSpecFile(workflow, 'typescript'));
    expect(view.code).toContain('<img');
    expect(view.code).not.toContain('&lt;');
  });

  it('F39 — no HTML injection surface exists anywhere in the workspace', () => {
    for (const rel of [VIEW, PANEL]) {
      const src = code(rel);
      for (const forbidden of [
        'innerHTML',
        'dangerouslySetInnerHTML',
        'insertAdjacentHTML',
        'eval(',
        'new Function',
        'document.write',
      ]) {
        expect(src, `${rel} must not use ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('preserves whitespace, indentation and line breaks in the model', () => {
    const view = ready(populated());
    expect(view.code).toContain('\n');
    expect(view.code.split('\n').some((l) => l.startsWith('  '))).toBe(true);
  });
});

// ═══ W3–W6 / F21–F25 — the workspace decides nothing ═══════════════════════

describe('W3/W4/W5/W6 — no resolver, probe, verifier or scorer is reachable', () => {
  it.each([VIEW, PANEL])('%s imports none of them', (rel) => {
    const src = code(rel);
    for (const forbidden of [
      'LocatorResolver',
      'DomProbe',
      'LiveDomProbe',
      'resolveChain',
      'resolveStep',
      'captureSnapshot',
      'buildLocatorChain',
      'verifyLocatorExpression',
      'classifyVerification',
      'resolveCandidates',
      'scoreCandidate',
      'rankCandidates',
    ]) {
      expect(src, `${rel} must not reach for ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('W27/F28 — the pure projection touches no browser API, storage or clock', () => {
    const src = code(VIEW);
    for (const forbidden of [
      'document',
      'window',
      'navigator',
      'chrome.',
      'browser.',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'readTab',
      'writeTab',
      'Date.now',
      'Math.random',
      'react',
      'useState',
    ]) {
      expect(src, `the projection must not touch ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('F36 — no network and no telemetry anywhere in the workspace', () => {
    for (const rel of [VIEW, PANEL]) {
      const src = code(rel);
      for (const forbidden of [
        'fetch(',
        'XMLHttpRequest',
        'sendBeacon',
        'WebSocket',
        'analytics',
        'telemetry',
      ]) {
        expect(src, `${rel} must not use ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('names no framework other than Playwright', () => {
    for (const rel of [VIEW, PANEL]) {
      const src = code(rel);
      for (const f of ['Selenium', 'Cypress', 'WebdriverIO', 'Puppeteer', 'Robot Framework']) {
        expect(src, `${rel} must not name ${f}`).not.toContain(f);
      }
    }
  });
});

// ═══ F1–F8 — the reader is the EXISTING one, reused ════════════════════════

describe('F1–F8 — the workspace reuses the export slice’s durable reader', () => {
  it('reuses readDurableWorkflow rather than adding a second reader', () => {
    expect(code(PANEL)).toContain('readDurableWorkflow');
    // No workspace-specific reader, and no second storage path.
    expect(code(PANEL)).not.toContain('readWorkspaceWorkflow');
    for (const rel of [VIEW, PANEL]) {
      expect(code(rel), `${rel} must not open a raw storage path`).not.toMatch(
        /chrome\.storage|localStorage|sessionStorage|indexedDB/,
      );
    }
  });

  it('F1 — a valid stored workflow becomes a ready view', async () => {
    const workflow = populated();
    const { gateway } = build({ [tabKey(TAB, RECORDING_WORKFLOW.key)]: envelope(workflow) });
    const read = await readDurableWorkflow(gateway, TAB);
    expect(ready(read.value).state).toBe('ready');
  });

  it('F2/W37 — no workflow is an honest unavailable state', async () => {
    const { gateway } = build();
    const read = await readDurableWorkflow(gateway, TAB);
    const view = ready(read.value);
    expect(view.state).toBe('unavailable');
    expect(view.hasWorkflow).toBe(false);
  });

  it('F5/W38 — a storage read failure fails closed', async () => {
    const { gateway, session } = build();
    session.fail('read');
    const read = await readDurableWorkflow(gateway, TAB);
    expect(ready(read.value).state).toBe('unavailable');
  });

  it('F6/W39 — a throwing gateway fails closed', async () => {
    const exploding = {
      readTab: () => {
        throw new Error('gateway exploded');
      },
    } as never;
    const read = await readDurableWorkflow(exploding, TAB);
    expect(ready(read.value).state).toBe('unavailable');
  });

  it('F7/W36 — no bound tab is unavailable, not empty', async () => {
    const { gateway } = build();
    const read = await readDurableWorkflow(gateway, null);
    const view = ready(read.value);
    expect(view.state).toBe('unavailable');
    expect(view.state).not.toBe('empty');
  });

  it('F8 — another tab’s recording never leaks in', async () => {
    const { gateway } = build({
      [tabKey(OTHER_TAB, RECORDING_WORKFLOW.key)]: envelope(populated()),
    });
    const read = await readDurableWorkflow(gateway, TAB);
    expect(ready(read.value).state).toBe('unavailable');
  });

  it('F27/W8 — reading for review writes nothing', async () => {
    const key = tabKey(TAB, RECORDING_WORKFLOW.key);
    const { gateway, session } = build({ [key]: envelope(populated()) });
    const before = JSON.stringify(session.snapshot());
    for (let i = 0; i < 5; i += 1) {
      const read = await readDurableWorkflow(gateway, TAB);
      ready(read.value);
    }
    expect(JSON.stringify(session.snapshot())).toBe(before);
    expect(session.writes).toBe(0);
  });
});

// ═══ W30–W35 / F41–F47 — the surface itself ════════════════════════════════

describe('W30/F41/F42/F43 — the code surface is read-only', () => {
  it('renders code in a pre/code element, not an editor', () => {
    const src = readRaw(PANEL);
    expect(src).toMatch(/<pre/);
    expect(src).toMatch(/<code/);
  });

  it('offers no editable surface of any kind', () => {
    const src = code(PANEL);
    for (const forbidden of [
      'textarea',
      'contentEditable',
      'contenteditable',
      'Monaco',
      'CodeMirror',
      'onChange={',
    ]) {
      expect(src, `the workspace must not use ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('W31/W32/F40 — no locator editing, no assertions, no action count', () => {
    const src = code(PANEL);
    for (const forbidden of [
      'selector strategy',
      'assert',
      'actionCount',
      'steps.length',
      'onReorder',
      'onDelete',
      'onInsert',
    ]) {
      expect(src, `the workspace must not offer ${forbidden}`).not.toContain(forbidden);
    }
    expect(src).not.toMatch(/\d+\s*actions?/i);
  });

  it('scrolls rather than trapping or truncating', () => {
    const src = readRaw(PANEL);
    expect(src).toMatch(/overflow(X|Y|):/);
    // Presentation only — the code string itself is never cut.
    expect(code(VIEW)).not.toMatch(/\.slice\(0,|substring\(/);
  });
});

describe('W23/W24/F44/F45 — copy reuses the existing clipboard seam', () => {
  it('uses the shared CopyButton and never the raw API', () => {
    const src = code(PANEL);
    expect(src).toContain('CopyButton');
    expect(src).not.toContain('navigator.clipboard');
    expect(src).not.toContain('BrowserClipboardAdapter');
  });

  it('the shared primitive still routes through ClipboardPort and surfaces failure', () => {
    const primitives = code('src/ui/primitives.tsx');
    expect(primitives).toContain('clipboardPort');
    // The failure detail is surfaced, not swallowed.
    expect(primitives).toMatch(/setFailureDetail|copyFailure/);
  });

  it('W25/W26/F35 — no second export implementation and no download', () => {
    const src = code(PANEL);
    for (const forbidden of [
      'buildExportArtifact',
      'ExportArtifact',
      'chrome.downloads',
      'URL.createObjectURL',
      'new Blob',
      'download',
    ]) {
      expect(src, `the workspace must not use ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('W22/F46 — the workspace reuses the panel’s language, and adds no second model', () => {
  it('takes the language as a prop rather than owning one', () => {
    const src = code(PANEL);
    expect(src).toMatch(/lang/);
    for (const forbidden of ['LANGS', 'PW_LANG', 'useLanguage', 'setLang', 'TargetLanguage[]']) {
      expect(src, `the workspace must not own ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('the projection declares no language table of its own', () => {
    const src = code(VIEW);
    expect(src).not.toMatch(/python_sync|csharp_async|'java'/);
  });
});

describe('W34/W35/F29 — the bound tab is the panel’s, and no second lookup exists', () => {
  it('performs no active-tab query', () => {
    const src = code(PANEL);
    for (const forbidden of ['tabs.query', 'activeTabContext', 'getActiveTab', 'workspaceTabId']) {
      expect(src, `the workspace must not perform ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('is wired from the side panel with the bound tab and the gateway', () => {
    const panel = code(SIDE_PANEL);
    // WS9 DL-91 — the four readers now share ONE memoised binding, so a render
    // that changes nothing they depend on cannot re-arm their effects. The fact
    // this pins is unchanged and now stated more strongly: the side panel
    // supplies THE BOUND TAB and THE GATEWAY, from one identity, to this hook.
    expect(panel).toMatch(
      /const bound = useMemo\([\s\S]{0,200}?tabId: panel\.pick\.tabId[\s\S]{0,80}?gateway: storageGateway[\s\S]{0,80}?\[panel\.pick\.tabId\]/,
    );
    expect(panel).toMatch(/useRecordingWorkspace\(panel\.lang, bound\)/);
  });
});

// ═══ Persistence, and the WS5 workspace it must not become ═════════════════

describe('W29/§39 — the workspace persists nothing and is not WS5’s code buffer', () => {
  it('adds no storage descriptor and no workspace state', () => {
    const state = code('src/storage/state.ts');
    const keys = [...state.matchAll(/key: '([^']+)'/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual([
      'code-buffer',
      'last-pick',
      'picker-active',
      'pw-lang',
      'recording-observation',
      'recording-workflow',
    ]);
  });

  it('never touches WS5’s locator code buffer', () => {
    for (const rel of [VIEW, PANEL]) {
      const src = code(rel);
      for (const forbidden of ['CODE_BUFFER', 'code-buffer', 'useCodeWorkspace', 'CodeWorkspace']) {
        expect(src, `${rel} must not touch ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('WS5’s CodeWorkspace component is untouched by this slice', () => {
    // It is a DIFFERENT thing: the user's locator line buffer, with Undo,
    // Clear and Remove. DL-76 warned against confusing the two.
    const ws5 = code('src/ui/panel/CodeWorkspace.tsx');
    expect(ws5).not.toContain('renderSpecFile');
    expect(ws5).not.toContain('RecordedWorkflow');
  });
});

// ═══ Accessibility ═════════════════════════════════════════════════════════

describe('F50 — the surface is nameable and announced', () => {
  it('the code region carries an accessible name', () => {
    expect(readRaw(PANEL)).toMatch(/aria-label=/);
  });

  it('the copy control carries an accessible name that is not a glyph', () => {
    const src = readRaw(PANEL);
    const label = src.match(/<CopyButton[\s\S]{0,200}?label="([^"]+)"/);
    expect(label, 'CopyButton must be given a real name').toBeTruthy();
    expect(label![1]!.length).toBeGreaterThan(3);
  });

  it('the state is announced politely rather than by colour alone', () => {
    const src = readRaw(PANEL);
    expect(src).toMatch(/role="status"/);
    expect(src).toMatch(/aria-live="polite"/);
  });

  it('no interactive control is nested inside the code block', () => {
    const src = readRaw(PANEL);
    const pre = src.slice(src.indexOf('<pre'), src.indexOf('</pre>'));
    expect(pre).not.toMatch(/<button|<a |<input|<select/);
  });
});
