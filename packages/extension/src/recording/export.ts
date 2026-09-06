/**
 * Playwright Guru — the export boundary (WS9).
 * ---------------------------------------------------------------------------
 * THE LAST ARROW, AND ONLY THE LAST ARROW:
 *
 *     RecordedWorkflow → renderSpecFile → ExportArtifact → clipboard
 *
 * DL-76 blocked the export menu with four measured proofs: the workflow had one
 * holder, no consumer, no message and no storage slot. Slices 5A, 5B and 5C
 * removed the first three. This module is the fourth arrow — and it is a
 * PROJECTION, which is the whole reason it is safe to build.
 *
 * ═══ EXPORT DECIDES NOTHING ═══
 *
 * Every locator in a recording was decided ONCE, at capture, against a live DOM,
 * by the one resolver and the one probe, and slice 3's admission rule already
 * refused `.nth` winners, non-unique matches and low verdicts. Re-deciding any
 * of it here — resolving, ranking, re-verifying, normalising, "improving" a
 * chain, or turning one back into a selector to rediscover it — would be a
 * second and weaker gate wearing the first one's clothes, applied at the exact
 * moment the code stops being ours and becomes a file someone runs.
 *
 * So this module has no probe, no resolver, no codegen of its own, no DOM, no
 * storage, no messages, no clock and no randomness. It asks `renderSpecFile`
 * (slice 4, which asks WS1's `generateLocatorCode`, which is pinned by 127
 * goldens) for the text, and attaches a name and a type to it.
 *
 * ═══ IT REFUSES RATHER THAN FABRICATES ═══
 *
 * Three refusals, each a fact about the input rather than a failure of nerve:
 *
 *   no-workflow           there is nothing to export, or what is there cannot
 *                         be trusted. The EXISTING `validateWorkflow` decides —
 *                         reused, not duplicated — so a malformed record is
 *                         refused by the same rule that refused to persist it.
 *   empty-workflow        a recording that captured nothing. `renderSpecFile`
 *                         returns `''` here by its own convention, and this
 *                         module does not change that; but an empty FILE looks
 *                         like a successful export, so the boundary says no.
 *   unsupported-language  a language outside the seven. The type says it cannot
 *                         happen; the value crossed a storage boundary, so it
 *                         can.
 *
 * There is no fourth outcome where something plausible is invented to fill a
 * gap. A refusal is visible; a fabricated spec is discovered later, by someone
 * debugging a test that never worked.
 *
 * ═══ PRIVACY, AT THE MOMENT IT MATTERS MOST ═══
 *
 * This is where recorded content leaves the product. Slice 1 removed redacted
 * values at the model boundary and slice 5B refused to persist a redacted step
 * that still carried one; `validateWorkflow` enforces that here too, so a
 * smuggled secret is refused rather than rendered. What reaches the clipboard
 * for a withheld value is slice 4's comment — visible, inert, and honest.
 *
 * NOT IN THIS SLICE: download (no browser seam exists and the manifest grants no
 * `downloads` permission — see the slice report), the structured code workspace,
 * the action count, and anything that would change `RECORDING_ENABLED`.
 */

import { renderSpecFile } from './render';
import { validateWorkflow } from './persistence';

import type { RecordedWorkflow } from './workflow';
import type { TargetLanguage } from '@playwright-guru/codegen';

// ─── The language table ─────────────────────────────────────────────────────

export interface ExportLanguage {
  /** The file extension, leading dot included. */
  readonly extension: string;
  readonly mimeType: string;
  /** For an accessible label. Never parsed. */
  readonly label: string;
}

/** See the note on `EXPORT_LANGUAGES` for why every language shares this. */
const TEXT = 'text/plain;charset=utf-8';

/**
 * One place a language becomes a file. Nothing else may map a language to an
 * extension, a type or a name — scattering that across components is how two
 * surfaces end up disagreeing about what a Python export is called.
 *
 * THE FILE SHAPES FOLLOW THE RENDERER, not a preference. `renderSpecFile`
 * already emits `test('recorded test', …)`, `def test_recorded(page)`,
 * `public void recordedTest()` and `public async Task RecordedTestAsync()`, so
 * the names below are the conventional filenames for exactly those bodies —
 * pytest's `test_` prefix included. The two Python targets share a shape, as do
 * the two C# targets: sync and async differ in the code, not in the file.
 *
 * MIME IS DELIBERATELY UNIFORM. There is no registered media type for
 * TypeScript, Java source or C# source, and inventing `application/x-typescript`
 * would be fabricating a standard in the one place the product hands a file to
 * an operating system. The content is source text, the extension carries the
 * language, and `text/plain;charset=utf-8` is the honest description of both.
 * No dependency was added to compute this.
 */
export const EXPORT_LANGUAGES: Record<TargetLanguage, ExportLanguage> = {
  typescript: { extension: '.spec.ts', mimeType: TEXT, label: 'TypeScript' },
  javascript: { extension: '.spec.js', mimeType: TEXT, label: 'JavaScript' },
  python_sync: { extension: '.py', mimeType: TEXT, label: 'Python' },
  python_async: { extension: '.py', mimeType: TEXT, label: 'Python (async)' },
  java: { extension: '.java', mimeType: TEXT, label: 'Java' },
  csharp_sync: { extension: '.cs', mimeType: TEXT, label: 'C#' },
  csharp_async: { extension: '.cs', mimeType: TEXT, label: 'C# (async)' },
};

/** The base name each language's file takes, matching the rendered test body. */
const BASE_NAME: Record<TargetLanguage, string> = {
  typescript: 'recorded-test',
  javascript: 'recorded-test',
  python_sync: 'test_recorded',
  python_async: 'test_recorded',
  java: 'RecordedTest',
  csharp_sync: 'RecordedTest',
  csharp_async: 'RecordedTest',
};

function isSupported(language: TargetLanguage): boolean {
  return Object.prototype.hasOwnProperty.call(EXPORT_LANGUAGES, language);
}

// ─── Filenames ──────────────────────────────────────────────────────────────

/**
 * The longest a name may be, extension included.
 *
 * Chosen well below every filesystem's 255-byte component limit, because the
 * point is not to sit near a limit — it is that a name the product generates is
 * never the reason a save fails.
 */
const MAX_FILENAME = 64;

/**
 * Reduce any string to something safe to hand an operating system.
 *
 * Today every caller passes a constant from `BASE_NAME`, so nothing hostile can
 * reach it — and it is written to survive the day that stops being true. A
 * filename is one of the few values a product hands straight to a filesystem,
 * and the failure modes are path traversal (`../../etc/passwd`), separators
 * that silently redirect a write, control characters, and leading dots that
 * hide a file. Each is removed rather than escaped: a name is a label, so
 * there is nothing to lose by being blunt with it.
 *
 * It is pure and deterministic — no clock, no counter, no randomness — so the
 * same recording and language always produce the same file.
 */
function sanitiseBase(raw: string): string {
  const cleaned = raw
    // Escapes rather than literal control characters: a source file containing
    // real C0 bytes reads as BINARY to `grep`, to diffs and to any tool that
    // sniffs content, which would quietly exclude this module from exactly the
    // text-scanning guards meant to police it.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\]/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/^[.\-]+/, '')
    .replace(/-{2,}/g, '-')
    .trim();
  return cleaned.length > 0 ? cleaned : 'recorded-test';
}

/**
 * The file a recording exports as.
 *
 * Deterministic, and deliberately carries NOTHING about the recording: no
 * session id, no captured value, no page URL, no timestamp, no action count.
 * A filename is the most easily leaked surface in an export — it appears in a
 * download bar, a directory listing, a screenshot — so it says what the file is
 * and nothing about who made it or what is inside.
 */
export function exportFilename(language: TargetLanguage, base?: string): string {
  const descriptor = EXPORT_LANGUAGES[language] ?? EXPORT_LANGUAGES.typescript;
  const stem = sanitiseBase(base ?? BASE_NAME[language] ?? 'recorded-test');
  const room = Math.max(1, MAX_FILENAME - descriptor.extension.length);
  return `${stem.slice(0, room)}${descriptor.extension}`;
}

// ─── The artifact ───────────────────────────────────────────────────────────

/**
 * Everything needed to deliver one export, and nothing else.
 *
 * No DOM node, no `ElementFacts`, no resolver, no probe, no session, no
 * lifecycle, no gateway, no tab, no Chrome API, no React state. What a consumer
 * receives is a name, a type and some text — which is why handing it to a
 * clipboard today and a download later needs no change here.
 */
export interface ExportArtifact {
  readonly language: TargetLanguage;
  readonly filename: string;
  readonly mimeType: string;
  readonly content: string;
}

export type ExportRefusal = 'no-workflow' | 'empty-workflow' | 'unsupported-language';

export type ExportResult =
  { ok: true; artifact: ExportArtifact } | { ok: false; refusal: ExportRefusal; note: string };

/**
 * Project a recording into an export, or refuse.
 *
 * The workflow is re-validated even when it came from storage that already
 * validated it. That is not belt-and-braces for its own sake: this function is
 * the last thing between a persisted record and a file a user runs, it is
 * callable from anywhere, and the EXISTING validator is one import away. Using
 * it here costs nothing and means no path exists where an unvalidated record
 * becomes Playwright source.
 *
 * The workflow is never mutated — `renderSpecFile` maps over it and this
 * function only reads.
 */
export function buildExportArtifact(
  workflow: RecordedWorkflow | null | undefined,
  language: TargetLanguage,
): ExportResult {
  if (!isSupported(language)) {
    return {
      ok: false,
      refusal: 'unsupported-language',
      note: 'that language is not one this product can generate',
    };
  }

  const validated = workflow ? validateWorkflow(workflow) : null;
  if (!validated) {
    return {
      ok: false,
      refusal: 'no-workflow',
      note: 'there is no recording to export, or the one stored could not be read',
    };
  }

  if (validated.steps.length === 0) {
    return {
      ok: false,
      refusal: 'empty-workflow',
      note: 'that recording captured no actions',
    };
  }

  return {
    ok: true,
    artifact: {
      language,
      filename: exportFilename(language),
      mimeType: EXPORT_LANGUAGES[language].mimeType,
      content: renderSpecFile(validated, language),
    },
  };
}
