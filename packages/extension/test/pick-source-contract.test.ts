/**
 * WS5/WS6 owner-decision gate — Decision A (DL-55).
 * ================================================================
 * `PickSource` is a WS0 contract with zero implementations and zero
 * consumers in this repository. It was, however, typed against
 * `PickSnapshot` (`@playwright-guru/locator-engine`) — a type WS3
 * deliberately keeps out of the live capture path at zero bundle cost. The
 * only value the shipped capture path (`src/runtime/capture.ts`) ever
 * produces is `StoredPick` (`utils/messaging.ts`). A future adapter could
 * never have honestly satisfied the old signature without either a fake
 * conversion or reopening WS3's zero-cost decision.
 *
 * This guard locks the correction: the port's contract must stay typed
 * against `StoredPick`, and must not silently drift back to `PickSnapshot`
 * (which would reintroduce the same unsatisfiable contract).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const PICK_SOURCE = readFileSync(resolve(HERE, '../src/application/ports/PickSource.ts'), 'utf8');

describe('WS5/WS6 owner-decision gate — PickSource contract truth (DL-55)', () => {
  it('imports StoredPick from the messaging module, not PickSnapshot', () => {
    expect(PICK_SOURCE).toMatch(
      /import\s+type\s*\{\s*StoredPick\s*\}\s*from\s*'\.\.\/\.\.\/\.\.\/utils\/messaging'/,
    );
    // PickSnapshot may still appear in prose (documenting the correction's
    // history), but must never again appear in an import or a type position.
    expect(PICK_SOURCE).not.toMatch(/import[^;]*PickSnapshot/);
    expect(PICK_SOURCE).not.toMatch(/:\s*Promise<PickSnapshot/);
    expect(PICK_SOURCE).not.toMatch(/\(\s*(snapshot|pick):\s*PickSnapshot/);
    expect(PICK_SOURCE).not.toMatch(/import[^;]*@playwright-guru\/locator-engine/);
  });

  it('getCurrent and subscribe are both typed against StoredPick', () => {
    expect(PICK_SOURCE).toMatch(/getCurrent\(\):\s*Promise<StoredPick\s*\|\s*null>/);
    expect(PICK_SOURCE).toMatch(
      /subscribe\(listener:\s*\(pick:\s*StoredPick\s*\|\s*null\)\s*=>\s*void\):\s*\(\)\s*=>\s*void/,
    );
  });
});
