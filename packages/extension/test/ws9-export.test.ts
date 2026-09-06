/**
 * WS9 — EXPORT: the boundary that turns a recording into a file the user owns.
 * ============================================================================
 * WHAT THIS SLICE IS, AND WHAT DL-76 SAID ABOUT IT.
 *
 * DL-76 blocked the export menu with four measured proofs — the workflow had
 * one holder, no consumer, no message, no storage slot. Slices 5A, 5B and 5C
 * removed the first three: a workflow now survives the content script in
 * tab-scoped WS4 storage, and the panel has a truthful, fail-closed way to read
 * tab state. This slice is the fourth arrow, and only the fourth arrow:
 *
 *     RecordedWorkflow → renderSpecFile → ExportArtifact → ClipboardPort
 *
 * ═══ EXPORT IS A PROJECTION. IT DECIDES NOTHING. ═══
 *
 * Every locator in a recording was decided once, at capture, against a live DOM,
 * by the one resolver and the one probe, and slice 3's admission rule already
 * refused anything it could not verify. Re-deciding any of that here — resolving,
 * ranking, re-verifying, normalising, "improving" a chain — would be a second and
 * weaker gate wearing the first one's clothes, and it would do so at the exact
 * moment the code leaves the product and becomes a file someone runs. So export
 * renders what the recording already holds, or it REFUSES with a reason.
 *
 * ═══ THE PRIVACY MOMENT ═══
 *
 * This is the slice where recorded content crosses into the clipboard. Slice 1
 * removed redacted values at the model boundary and slice 5B refused to persist
 * a redacted step that still carried one; here the proof is end-to-end and by
 * BYTES: a password typed during a recording must appear nowhere in the exported
 * text, nowhere in the filename, and nowhere in a log.
 *
 * Evidence level: UNIT + STRUCTURAL. **Real Chromium: NOT RUN** — no clipboard
 * was really written, no file was really downloaded, and neither is claimed.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RECORDING_ENABLED, RECORDING_LIMITS } from '../src/config/recording';
import {
  EXPORT_LANGUAGES,
  buildExportArtifact,
  exportFilename,
  type ExportArtifact,
} from '../src/recording/export';
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

const EXPORT = 'src/recording/export.ts';
const READER = 'src/services/recording-workflow.ts';
const CONTROL = 'entrypoints/sidepanel/ExportControl.tsx';

const TAB = 11;
const OTHER_TAB = 12;

/** The seven the renderer supports. Export must not add to or subtract from it. */
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

/** A recording whose chain carries a positional qualifier. */
function withNth() {
  const positional = step();
  positional.target!.locator = {
    ...positional.target!.locator,
    chain: { ...positional.target!.locator.chain, nth: 2 },
  };
  return appendStep(createWorkflow({ id: 's2', url: 'u', startedAt: 0 }), positional).workflow;
}

// ─── The flag has not moved ─────────────────────────────────────────────────

describe('E19/E20 — export does not depend on the recording flag, and never starts one', () => {
  it('keeps RECORDING_ENABLED false', () => {
    expect(RECORDING_ENABLED).toBe(false);
  });

  it('builds an artifact with the product flag off — export is not gated on it at module load', () => {
    // Importing and using the export layer must not require recording to be on.
    // The CONTROL is flag-gated for rollout; the LOGIC is not.
    const result = buildExportArtifact(populated(), 'typescript');
    expect(result.ok).toBe(true);
  });

  it('the pure export layer names no recording control at all', () => {
    const src = code(EXPORT);
    for (const forbidden of ['START_RECORDING', 'STOP_RECORDING', 'RECORDING_ENABLED', 'tick(']) {
      expect(src, `export must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });
});

// ═══ F1–F9 — the durable workflow reader ═══════════════════════════════════

describe('F1–F9 — the workflow reader is read-only and fails closed', () => {
  it('F1 — reads a valid persisted workflow for the bound tab', async () => {
    const workflow = populated();
    const { gateway } = build({ [tabKey(TAB, RECORDING_WORKFLOW.key)]: envelope(workflow) });
    const read = await readDurableWorkflow(gateway, TAB);
    expect(read.valid).toBe(true);
    expect(read.value).toEqual(workflow);
  });

  it('F2 — no workflow is absence, not an empty recording', async () => {
    const { gateway } = build();
    expect(await readDurableWorkflow(gateway, TAB)).toEqual({ value: null, valid: true });
  });

  it('F3 — a malformed workflow fails closed', async () => {
    const { gateway } = build({
      [tabKey(TAB, RECORDING_WORKFLOW.key)]: envelope({ steps: 'not an array' }),
    });
    const read = await readDurableWorkflow(gateway, TAB);
    expect(read.value).toBeNull();
    expect(read.valid).toBe(false);
  });

  it('F4 — an unknown FUTURE schema version is refused, and its bytes are left alone', async () => {
    const key = tabKey(TAB, RECORDING_WORKFLOW.key);
    const future = { v: STORAGE_SCHEMA_VERSION + 1, data: populated() };
    const { gateway, session } = build({ [key]: future });
    const read = await readDurableWorkflow(gateway, TAB);
    expect(read.value).toBeNull();
    expect(read.code).toBe('UNKNOWN_VERSION');
    expect(session.snapshot()[key]).toEqual(future);
  });

  it('F5 — a storage read failure fails closed', async () => {
    const { gateway, session } = build();
    session.fail('read');
    const read = await readDurableWorkflow(gateway, TAB);
    expect(read.value).toBeNull();
    expect(read.valid).toBe(false);
  });

  it('F6 — a gateway that throws outright fails closed', async () => {
    const exploding = {
      readTab: () => {
        throw new Error('gateway exploded');
      },
    } as never;
    await expect(readDurableWorkflow(exploding, TAB)).resolves.toEqual({
      value: null,
      valid: false,
    });
  });

  it('F7 — never reads another tab’s recording', async () => {
    const { gateway } = build({
      [tabKey(OTHER_TAB, RECORDING_WORKFLOW.key)]: envelope(populated()),
    });
    expect((await readDurableWorkflow(gateway, TAB)).value).toBeNull();
  });

  it('F8 — no bound tab is absence of evidence, not an empty recording', async () => {
    const { gateway } = build();
    expect(await readDurableWorkflow(gateway, null)).toEqual({ value: null, valid: false });
  });

  it('F9/E11/E12 — reading writes nothing and mutates nothing', async () => {
    const workflow = populated();
    const key = tabKey(TAB, RECORDING_WORKFLOW.key);
    const { gateway, session } = build({ [key]: envelope(workflow) });
    const before = JSON.stringify(session.snapshot());
    for (let i = 0; i < 10; i += 1) await readDurableWorkflow(gateway, TAB);
    expect(JSON.stringify(session.snapshot())).toBe(before);
    expect(session.writes).toBe(0);
  });

  it('F36 — reads the WORKFLOW descriptor and never the lifecycle observation', async () => {
    const reads: string[] = [];
    const spy = {
      readTab: async (descriptor: { key: string }) => {
        reads.push(descriptor.key);
        return { value: null, valid: true };
      },
    } as never;
    await readDurableWorkflow(spy, TAB);
    expect(reads).toEqual(['recording-workflow']);
    expect(reads).not.toContain('recording-observation');
  });
});

// ═══ F10–F15 / E2–E7 — rendering, through the EXISTING renderer ════════════

describe('F10/E4 — all seven languages, and only those seven', () => {
  it.each(LANGUAGES)('%s produces an artifact', (language) => {
    const result = buildExportArtifact(populated(), language);
    expect(result.ok, `${language} must export`).toBe(true);
  });

  it('the language table is exactly the renderer’s seven', () => {
    expect(Object.keys(EXPORT_LANGUAGES).sort()).toEqual([...LANGUAGES].sort());
  });

  it('F15/E14 — an unsupported language is refused, not guessed', () => {
    const result = buildExportArtifact(populated(), 'ruby' as TargetLanguage);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('unsupported-language');
  });
});

describe('F11/E5 — the content is the renderer’s output, byte for byte', () => {
  it.each(LANGUAGES)('%s matches renderSpecFile exactly', (language) => {
    const workflow = populated();
    const result = buildExportArtifact(workflow, language);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.artifact.content).toBe(renderSpecFile(workflow, language));
  });

  it('applies no formatting, minification or transformation of its own', () => {
    const workflow = populated();
    const rendered = renderSpecFile(workflow, 'typescript');
    const result = buildExportArtifact(workflow, 'typescript');
    if (!result.ok) throw new Error('expected an artifact');
    expect(result.artifact.content).toHaveLength(rendered.length);
    expect(result.artifact.content.split('\n')).toEqual(rendered.split('\n'));
  });
});

describe('F12/E6 — a positional locator is preserved, never quietly dropped', () => {
  it('renders .nth exactly as the recording holds it', () => {
    const result = buildExportArtifact(withNth(), 'typescript');
    if (!result.ok) throw new Error('expected an artifact');
    expect(result.artifact.content).toContain('.nth(2)');
    expect(result.artifact.content).toBe(renderSpecFile(withNth(), 'typescript'));
  });
});

describe('F13/E7 — a withheld value stays withheld', () => {
  it('renders the redacted step as the renderer’s refusal comment, not a value', () => {
    const result = buildExportArtifact(populated(), 'typescript');
    if (!result.ok) throw new Error('expected an artifact');
    expect(result.artifact.content).toMatch(/value withheld \(password\)/);
    expect(result.artifact.content).not.toContain('hunter2');
  });

  it('never reconstructs a hidden value in any language', () => {
    for (const language of LANGUAGES) {
      const result = buildExportArtifact(populated(), language);
      if (!result.ok) throw new Error('expected an artifact');
      expect(result.artifact.content, language).not.toContain('hunter2');
    }
  });
});

describe('F14/E13 — an empty recording is refused rather than exported as nothing', () => {
  it('refuses instead of producing an empty file', () => {
    // `renderSpecFile` returns '' for an empty workflow — the renderer's own
    // convention, and this slice does not change it. But an empty FILE looks
    // like a successful export of a recording that captured nothing, so the
    // export boundary refuses with a reason instead.
    const empty = createWorkflow({ id: 's', url: 'u', startedAt: 0 });
    expect(renderSpecFile(empty, 'typescript')).toBe('');
    const result = buildExportArtifact(empty, 'typescript');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('empty-workflow');
  });

  it('invents no action and no locator to fill the gap', () => {
    const result = buildExportArtifact(createWorkflow({ id: 's', url: 'u', startedAt: 0 }), 'java');
    expect(result.ok).toBe(false);
  });
});

describe('E15 — malformed workflow data fails closed rather than fabricating code', () => {
  it('refuses a null workflow', () => {
    const result = buildExportArtifact(null, 'typescript');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('no-workflow');
  });

  const MALFORMED: Array<[string, unknown]> = [
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

  it.each(MALFORMED)('refuses %s', (_label, raw) => {
    const result = buildExportArtifact(raw as never, 'typescript');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('no-workflow');
  });

  it('a smuggled password never reaches exported content', () => {
    const smuggled = {
      ...createWorkflow({ id: 's', url: 'u', startedAt: 0 }),
      steps: [{ kind: 'fill', timestamp: 1, redacted: 'password', value: 'hunter2' }],
    };
    const result = buildExportArtifact(smuggled as never, 'typescript');
    expect(JSON.stringify(result)).not.toContain('hunter2');
  });
});

// ═══ F16–F21 — the artifact ════════════════════════════════════════════════

describe('F16/F18/F19 — filename and MIME are a deterministic, declared policy', () => {
  it('F16 — the same recording and language always produce the same filename', () => {
    for (const language of LANGUAGES) {
      const a = exportFilename(language);
      const b = exportFilename(language);
      expect(a).toBe(b);
    }
  });

  it('carries no session id, no value, no url and no clock', () => {
    const workflow = populated();
    const result = buildExportArtifact(workflow, 'typescript');
    if (!result.ok) throw new Error('expected an artifact');
    for (const secret of ['s1', 'hunter2', 'alice', 'example.test']) {
      expect(result.artifact.filename, `filename must not contain ${secret}`).not.toContain(secret);
    }
    expect(result.artifact.filename).not.toMatch(/\d{6,}/);
  });

  it('F18 — every filename is safe and bounded', () => {
    for (const language of LANGUAGES) {
      const name = exportFilename(language);
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(64);
      expect(name).not.toMatch(/[/\\]/);
      // eslint-disable-next-line no-control-regex
      expect(name).not.toMatch(/[\u0000-\u001f]/);
      expect(name).not.toMatch(/^\.|\.\./);
      expect(name).toMatch(/\.[A-Za-z]+$/);
    }
  });

  it('F17 — hostile input to the name helper is sanitised, not passed through', () => {
    const hostile = [
      '../../etc/passwd',
      'a/b\\c',
      'name\u0000with\u001fcontrols',
      '   ',
      '.hidden',
      'x'.repeat(500),
    ];
    for (const raw of hostile) {
      const name = exportFilename('typescript', raw);
      expect(name).not.toMatch(/[/\\]/);
      // eslint-disable-next-line no-control-regex
      expect(name).not.toMatch(/[\u0000-\u001f]/);
      expect(name).not.toMatch(/^\./);
      expect(name.length).toBeLessThanOrEqual(64);
      expect(name).toMatch(/\.[A-Za-z]+$/);
    }
  });

  it('F19 — every language declares an extension and a MIME type', () => {
    for (const language of LANGUAGES) {
      const descriptor = EXPORT_LANGUAGES[language];
      expect(descriptor.extension).toMatch(/^[a-z.]+$/);
      expect(descriptor.mimeType).toContain('charset=utf-8');
      expect(descriptor.label.length).toBeGreaterThan(0);
    }
  });

  it('gives the two Python and the two C# targets the same file shape', () => {
    expect(EXPORT_LANGUAGES.python_sync.extension).toBe(EXPORT_LANGUAGES.python_async.extension);
    expect(EXPORT_LANGUAGES.csharp_sync.extension).toBe(EXPORT_LANGUAGES.csharp_async.extension);
  });
});

describe('F20/F21/E12 — the artifact is exact, and building it is pure', () => {
  it('F20 — content, filename, mime and language are all that it carries', () => {
    const result = buildExportArtifact(populated(), 'python_sync');
    if (!result.ok) throw new Error('expected an artifact');
    expect(Object.keys(result.artifact).sort()).toEqual([
      'content',
      'filename',
      'language',
      'mimeType',
    ]);
  });

  it('E12/F21 — the workflow is not mutated', () => {
    const workflow = populated();
    const before = JSON.stringify(workflow);
    for (const language of LANGUAGES) buildExportArtifact(workflow, language);
    expect(JSON.stringify(workflow)).toBe(before);
  });

  it('F21 — building twice yields identical artifacts', () => {
    const workflow = populated();
    const a = buildExportArtifact(workflow, 'java');
    const b = buildExportArtifact(workflow, 'java');
    expect(a).toEqual(b);
  });

  it('carries no DOM, facts, probe, session or lifecycle', () => {
    const result = buildExportArtifact(populated(), 'typescript');
    if (!result.ok) throw new Error('expected an artifact');
    const serialised = JSON.stringify(result.artifact);
    for (const forbidden of ['ancestors', 'attributes', 'sessionId', 'lifecycle', 'stepCounts']) {
      expect(serialised, `artifact must not carry ${forbidden}`).not.toContain(forbidden);
    }
  });
});

// ═══ E8/E9/E10 + F31/F32 — export decides nothing ══════════════════════════

describe('E8/E9/E10 — export invokes no verification, resolution or probe', () => {
  it('the pure export module imports none of them', () => {
    const src = code(EXPORT);
    for (const forbidden of [
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
      expect(src, `export must not reach for ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('the reader imports none of them either', () => {
    const src = code(READER);
    for (const forbidden of ['DomProbe', 'resolveChain', 'resolveStep', 'captureSnapshot']) {
      expect(src, `the reader must not reach for ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('renders through the ONE existing renderer and adds no second generator', () => {
    const src = code(EXPORT);
    expect(src).toContain('renderSpecFile');
    // No second locator renderer, no hand-rolled expression building.
    expect(src).not.toContain('generateLocatorCode');
    expect(src).not.toMatch(/page\.locator\(/);
    expect(src).not.toMatch(/getBy[A-Z]/);
  });

  it('never converts a chain back into a selector string', () => {
    const src = code(EXPORT);
    expect(src).not.toMatch(/querySelector|document\.evaluate|xpath/i);
  });
});

// ═══ Purity and the absence of browser/storage/clock ═══════════════════════

describe('the pure export layer is pure', () => {
  it('touches no DOM, React, browser, storage, clock or randomness', () => {
    const src = code(EXPORT);
    for (const forbidden of [
      'document',
      'window',
      'navigator',
      'react',
      'useState',
      'chrome.',
      'browser.',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'readTab',
      'writeTab',
      'Date.now',
      'Math.random',
      'crypto',
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'eval(',
      'new Function',
      'innerHTML',
    ]) {
      expect(src, `export must not touch ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('logs nothing at all', () => {
    for (const rel of [EXPORT, READER]) {
      expect(code(rel), `${rel} must not log`).not.toMatch(/console\./);
    }
  });

  it('names no framework other than Playwright', () => {
    const src = code(EXPORT);
    for (const forbidden of [
      'Selenium',
      'Cypress',
      'WebdriverIO',
      'Puppeteer',
      'Robot Framework',
    ]) {
      expect(src, `no ${forbidden}`).not.toContain(forbidden);
    }
  });
});

// ═══ F22–F25 — clipboard ═══════════════════════════════════════════════════

describe('F22–F25 — clipboard export goes through the ClipboardPort', () => {
  const artifactFor = (language: TargetLanguage): ExportArtifact => {
    const result = buildExportArtifact(populated(), language);
    if (!result.ok) throw new Error('expected an artifact');
    return result.artifact;
  };

  it('F24 — the clipboard receives exactly the rendered content', async () => {
    const written: string[] = [];
    const port = { writeText: async (t: string) => (written.push(t), { ok: true as const }) };
    const artifact = artifactFor('typescript');
    await port.writeText(artifact.content);
    expect(written).toEqual([renderSpecFile(populated(), 'typescript')]);
  });

  it('F25 — no clipboard payload, workflow or session id is logged', () => {
    const src = code(CONTROL);
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/\{\s*session[A-Za-z]*\s*\}/);
  });

  it('F22/F23 — the panel reuses the existing copy state machine, failure included', () => {
    // `useCopyAll` already maps a `ClipboardResult` to idle/done/failed with the
    // failure detail; a second transient state machine would drift from it.
    const src = code(CONTROL);
    expect(src).toContain('useCopyAll');
    expect(src).toContain('clipboardPort');
    // And it must not reach past the port to the raw API.
    expect(src).not.toContain('navigator.clipboard');
  });

  it('only the adapter may touch navigator.clipboard', () => {
    const adapter = code('src/application/adapters/ClipboardAdapter.ts');
    expect(adapter).toContain('navigator.clipboard');
    for (const rel of [EXPORT, READER, CONTROL]) {
      expect(code(rel), `${rel} must not reach the raw clipboard API`).not.toContain(
        'navigator.clipboard',
      );
    }
  });
});

// ═══ F26–F30 — download: measured, and reported rather than invented ═══════

describe('F26–F30 — download export is BLOCKED, and the artifact is ready for it', () => {
  it('there is still no download seam anywhere in the product', () => {
    // Measured, not assumed — DL-76 found the same and nothing has added one.
    const searched = [
      'entrypoints/background.ts',
      'entrypoints/content.ts',
      'entrypoints/sidepanel/SidePanel.tsx',
      'src/application/adapters/index.ts',
    ];
    for (const rel of searched) {
      const src = code(rel);
      for (const api of [
        'chrome.downloads',
        'browser.downloads',
        'URL.createObjectURL',
        'new Blob',
      ]) {
        expect(src, `${rel} unexpectedly has ${api}`).not.toContain(api);
      }
    }
  });

  it('the manifest grants no downloads permission, and this slice adds none', () => {
    const config = readRaw('wxt.config.ts');
    expect(config).toContain("permissions: ['activeTab', 'storage', 'scripting', 'sidePanel']");
    expect(config).not.toContain('downloads');
  });

  it('F28/F29/F30 — the artifact nevertheless carries exactly what a download needs', () => {
    // The blocker is the browser seam, not the data. When a download slice is
    // authorised it consumes this artifact unchanged.
    const result = buildExportArtifact(populated(), 'python_async');
    if (!result.ok) throw new Error('expected an artifact');
    expect(result.artifact.filename).toBe(exportFilename('python_async'));
    expect(result.artifact.mimeType).toBe(EXPORT_LANGUAGES.python_async.mimeType);
    expect(result.artifact.content).toBe(renderSpecFile(populated(), 'python_async'));
  });
});

// ═══ F33–F39 — the panel, and what it still may not do ═════════════════════

describe('F33/F34/F35 — export mutates no recording state', () => {
  it('writes no storage and sends no recording command', () => {
    const src = code(CONTROL);
    for (const forbidden of [
      'writeTab',
      'writeGlobal',
      'PERSIST_RECORDING_STATE',
      'START_RECORDING',
      'STOP_RECORDING',
    ]) {
      expect(src, `export UI must not use ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('touches no raw storage API', () => {
    const src = code(CONTROL);
    for (const api of ['chrome.storage', 'localStorage', 'sessionStorage', 'indexedDB']) {
      expect(src, `export UI must not touch ${api}`).not.toContain(api);
    }
  });

  it('F39 — creates no lifecycle, session or heartbeat of its own', () => {
    const src = code(CONTROL);
    for (const forbidden of [
      'RecordingSession',
      'lifecycle',
      'heartbeat',
      'setInterval',
      'tick(',
    ]) {
      expect(src, `export UI must not own ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('F37/F38 — the export UI uses the panel’s bound tab, and queries no other', () => {
  it('takes the tab id as an injected dependency', () => {
    expect(code(CONTROL)).toMatch(/tabId/);
  });

  it('performs no active-tab lookup of its own', () => {
    const src = code(CONTROL);
    for (const forbidden of ['tabs.query', 'activeTabContext', 'getActiveTab', 'currentWindow']) {
      expect(src, `export UI must not perform ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('is wired from the side panel with the bound tab and the gateway', () => {
    const panel = code('entrypoints/sidepanel/SidePanel.tsx');
    // WS9 DL-91 — the four readers now share ONE memoised binding, so a render
    // that changes nothing they depend on cannot re-arm their effects. The fact
    // this pins is unchanged and now stated more strongly: the side panel
    // supplies THE BOUND TAB and THE GATEWAY, from one identity, to this hook.
    expect(panel).toMatch(
      /const bound = useMemo\([\s\S]{0,200}?tabId: panel\.pick\.tabId[\s\S]{0,80}?gateway: storageGateway[\s\S]{0,80}?\[panel\.pick\.tabId\]/,
    );
    expect(panel).toMatch(/useExport\(panel\.lang, bound\)/);
  });
});

describe('F36 — lifecycle is not workflow, and the UI does not confuse them', () => {
  it('derives availability from the workflow, never from the recording flag alone', () => {
    const src = code(CONTROL);
    // The control is flag-gated for ROLLOUT — the same early return the record
    // button uses, so no dead affordance ships while recording is off. But what
    // makes it ACTIONABLE is a workflow, never the flag and never the lifecycle.
    expect(src).toMatch(/if\s*\(!RECORDING_ENABLED\)\s*return null;/);
    expect(src).not.toMatch(/RECORDING_ENABLED\s*&&\s*(canExport|available|ready)/);
    expect(src).not.toContain('observedLifecycle');
    expect(src).not.toContain('isRecordingNow');
  });

  it('reads the workflow descriptor, not the observation', () => {
    const src = code(CONTROL);
    expect(src).toContain('readDurableWorkflow');
    expect(src).not.toContain('readDurableObservation');
    expect(src).not.toContain('RECORDING_OBSERVATION');
  });
});

// ═══ F40 + AA — no network, no telemetry, no action count ══════════════════

describe('F40 — no network, no telemetry, no new permission', () => {
  it('adds none of them anywhere in the new surface', () => {
    for (const rel of [EXPORT, READER, CONTROL]) {
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
});

describe('the action count stays deferred (DL-79)', () => {
  it('appears in no export surface — not in the UI, the filename or the artifact', () => {
    // The UI and the reader may not reach for a count at all.
    for (const rel of [READER, CONTROL]) {
      expect(code(rel), `${rel} must not count actions`).not.toMatch(/steps\.length|actionCount/);
    }
    // The pure layer needs ONE length reference — to tell an empty recording
    // from a real one, which is a refusal, not a feature. Pinned to exactly
    // that shape so a displayable count cannot appear under cover of it.
    const uses = [...code(EXPORT).matchAll(/steps\.length[^\n]*/g)].map((m) => m[0].trim());
    expect(uses).toEqual(['steps.length === 0) {']);
    expect(code(EXPORT)).not.toContain('actionCount');

    const result = buildExportArtifact(populated(), 'typescript');
    if (!result.ok) throw new Error('expected an artifact');
    expect(result.artifact.filename).not.toMatch(/\d/);
    expect(JSON.stringify(result.artifact)).not.toMatch(/actionCount|"count"/);
  });
});
