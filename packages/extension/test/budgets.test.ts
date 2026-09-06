/**
 * WS8 — the performance budgets that actually exist, pinned.
 * ============================================================================
 *
 * WS8's roadmap Exit line reads "§20.6 budgets hold on 3+ real sites".
 * Discovery found that **§20.6 does not exist**: MASTER-ROADMAP.md's §20 is
 * "FrameworkProfile Concept `FUTURE`", it has no numbered subsections, and the
 * string "20.6" appears exactly once in the whole repository — in that Exit
 * line itself. No time-based performance budget is defined anywhere in the
 * authoritative documents. A criterion cannot be verified against a spec that
 * was never written.
 *
 * The project owner re-scoped it for this gate (see the WS8 decision-log
 * entry): bind the criterion to the budgets the repository really does define,
 * and verify them here, in-repo. Real-site validation stays where it honestly
 * belongs — the manual smoke matrix and WS11's release gate — because this
 * repository has no real-browser harness and fixture evidence is not Chromium
 * evidence.
 *
 * The budgets that exist:
 *
 *   SNAPSHOT_BUDGET            25 KB normal / 50 KB anomaly, plus its caps.
 *                              Already exercised end-to-end by
 *                              `runtime-fact-model.test.ts` (DL-53) — this
 *                              file pins the CONSTANTS those tests measure
 *                              against, so the budget cannot be widened to
 *                              make a future breach pass.
 *   content.js ≤ 60 kB         WS3's own exit criterion, verified once by hand
 *                              at 24.71 kB and never pinned. Now it is.
 *
 * What this file deliberately does NOT do: assert the whole-bundle ceiling.
 * The build is 15,665 B (5.62%) over the locked 278,760 B ceiling — disclosed,
 * owner-level release-budget debt (DL-56…DL-60). WS8 was explicitly forbidden
 * from turning into a bundle-optimization pass, and pinning today's number as
 * a new ceiling would quietly relocate that debt instead of leaving it visible.
 */

import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SNAPSHOT_BUDGET } from '@playwright-guru/locator-engine';

const EXT = resolve(__dirname, '..');
const BUILD = join(EXT, '.output', 'chrome-mv3');
const CONTENT_SCRIPT = join(BUILD, 'content-scripts', 'content.js');
const built = existsSync(CONTENT_SCRIPT);

/** WS3's exit criterion, in bytes. */
const CONTENT_SCRIPT_CEILING_BYTES = 60 * 1024;

describe('snapshot budget constants are what the DL-53 tests measure against', () => {
  it('keeps the 25 KB normal target', () => {
    expect(SNAPSHOT_BUDGET.normalTargetBytes).toBe(25 * 1024);
  });

  it('keeps the 50 KB anomaly threshold above which a snapshot degrades', () => {
    expect(SNAPSHOT_BUDGET.anomalyThresholdBytes).toBe(50 * 1024);
    expect(SNAPSHOT_BUDGET.anomalyThresholdBytes).toBeGreaterThan(
      SNAPSHOT_BUDGET.normalTargetBytes,
    );
  });

  it('keeps every collection cap that bounds a snapshot from growing without limit', () => {
    expect(SNAPSHOT_BUDGET.maxPlaywrightCandidates).toBe(12);
    expect(SNAPSHOT_BUDGET.maxVerifiedSelectors).toBe(15);
    expect(SNAPSHOT_BUDGET.maxAmbiguousSelectors).toBe(10);
    expect(SNAPSHOT_BUDGET.maxOuterHtmlPreviewLength).toBe(300);
    expect(SNAPSHOT_BUDGET.maxUrlLength).toBe(500);
    expect(SNAPSHOT_BUDGET.maxRationalePerItem).toBe(5);
  });
});

describe('the content script stays inside WS3’s 60 kB budget', () => {
  // Skipped when nothing is built, matching `privacy.test.ts`: `pnpm test` may
  // run standalone, while `pnpm verify` and CI both build first, so this runs
  // wherever it matters.
  it.skipIf(!built)('content.js is at or under 60 kB', () => {
    const bytes = statSync(CONTENT_SCRIPT).size;
    expect(
      bytes,
      `content.js is ${bytes} B, over the ${CONTENT_SCRIPT_CEILING_BYTES} B budget`,
    ).toBeLessThanOrEqual(CONTENT_SCRIPT_CEILING_BYTES);
  });

  it.skipIf(!built)('the content script is a real build artifact, not an empty file', () => {
    // Guards the guard: a zero-byte or missing-content build would otherwise
    // sail under the ceiling and prove nothing.
    expect(statSync(CONTENT_SCRIPT).size).toBeGreaterThan(1024);
  });
});
