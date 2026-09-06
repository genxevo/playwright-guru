/**
 * WS5 — the DevTools panel consumes the shared engine.
 *
 * ## What this replaces
 *
 * Stage 2 pinned the DevTools duplicate with a ratchet in the locator-engine
 * conformance suite: a transcription of the panel's hand-written role inference
 * plus the count of fixtures it got wrong (17 of 39). That ratchet had a flaw
 * worth naming — it tested a *copy* of the old logic living in the test file,
 * so deleting the real implementation would not have failed it. It could prove
 * the duplicate was wrong; it could not prove the duplicate was gone.
 *
 * These tests read the actual panel source, so they assert the architecture
 * rather than describing it. They fail if any of the three deleted
 * implementations comes back.
 *
 * ## The three implementations WS5 removed
 *
 *   1. EVAL_SCRIPT's role inference   — wrong on 17/39 conformance fixtures
 *   2. EVAL_SCRIPT's `isVis`          — display/visibility only, no box test
 *   3. handleVerify's `vis`           — rejected opacity:0, required BOTH
 *                                       width AND height
 *
 * All three are now one call into the content script, which holds the engine.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { denseCode, readComposed } from './helpers/surface-source';

const HERE = dirname(fileURLToPath(import.meta.url));
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

const PANEL = read('entrypoints/devtools-panel/Panel.tsx');
const CONTENT = read('entrypoints/content.ts');
const MESSAGING = read('utils/messaging.ts');
const BACKGROUND = read('entrypoints/background.ts');

/** Strips comments so a scan cannot be satisfied — or tripped — by prose. */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const PANEL_CODE = code(PANEL);
/**
 * WS5 — the same panel code with formatting normalised.
 *
 * The assertions below that pin an exact expression were written against the
 * panel's original dense one-liners. WS5 moved that code into prettier-
 * formatted modules, so the expressions are identical and the bytes are not.
 * `denseCode` restores the comparison without changing what is compared.
 */
const PANEL_DENSE = denseCode(PANEL);

// ─── 1. The duplicates are gone ─────────────────────────────────────────────

describe('the DevTools panel carries no locator intelligence of its own', () => {
  it('has no EVAL_SCRIPT', () => {
    expect(PANEL_CODE, 'the eval payload was deleted, not shrunk').not.toContain('EVAL_SCRIPT');
    expect(PANEL_CODE).not.toContain('buildCandidatesFromEval');
    expect(PANEL_CODE).not.toContain('EvalCounts');
  });

  it('infers no roles', () => {
    // The old payload mapped tags to roles inline. resolveRole is the only
    // implementation, and it lives in the engine.
    expect(PANEL_CODE).not.toMatch(/dr\s*=\s*'(button|link|combobox|textbox|checkbox|radio)'/);
    expect(PANEL_CODE, 'no role→selector table may live here').not.toContain('RSELS');
  });

  it('defines no visibility rule', () => {
    // Both deleted predicates used these primitives; the engine's predicate is
    // reached through a message, never re-derived here.
    expect(PANEL_CODE).not.toContain('getComputedStyle');
    expect(PANEL_CODE).not.toContain('getBoundingClientRect');
    expect(PANEL_CODE, 'the opacity rejection Playwright never had').not.toContain("opacity==='0'");
    expect(PANEL_CODE).not.toMatch(/r\.width>0&&r\.height>0/);
  });

  it('counts no matches', () => {
    expect(PANEL_CODE, 'match counting belongs to the content script').not.toContain('visFrom');
    expect(PANEL_CODE).not.toContain('querySelectorAll');
    expect(PANEL_CODE).not.toContain('document.evaluate');
  });

  it('scores and ranks nothing', () => {
    // Candidates arrive already scored and ranked by the engine.
    expect(PANEL_CODE).not.toContain('scoreCandidate');
    expect(PANEL_CODE).not.toContain('buildCandidateSteps');
    expect(PANEL_CODE).not.toContain('rankCandidates');
  });
});

// ─── 2. The shared path is actually used ────────────────────────────────────

describe('the DevTools panel asks the content script instead', () => {
  it('keeps only a tagging payload in the eval, with no intelligence in it', () => {
    expect(PANEL_CODE).toContain('TAG_SCRIPT');
    const tag = PANEL.match(/const TAG_SCRIPT = `[^`]*`/)?.[0] ?? '';
    expect(tag, 'the payload must reach $0').toContain('$0');
    expect(tag, 'and do nothing but mark it').toContain('setAttribute');
    // A payload that stays this small cannot regrow into a second engine
    // without the change being obvious in review.
    expect(tag.length, `TAG_SCRIPT is ${tag.length} bytes; it should stay tiny`).toBeLessThan(400);
  });

  it('requests the verified pick over the message contract', () => {
    expect(PANEL_CODE).toContain("type: 'PICK_DEVTOOLS_TARGET'");
    expect(PANEL_CODE, 'the tab must be the inspected one').toContain(
      'chrome.devtools.inspectedWindow.tabId',
    );
    expect(PANEL_CODE, 'an absent response must not read as success').toContain('normalizeAck');
  });

  it('renders the candidates the engine produced, unmodified', () => {
    // WS5 moved the derivation out of the panel into the shared
    // `useLocatorDerivation` hook — which both surfaces now use, so the rule is
    // enforced in one place instead of two. The rule itself is unchanged: read
    // `pick.candidates` and `pick.attributes` as given, derive nothing new.
    expect(PANEL_DENSE).toMatch(/const candidates=useMemo\(\(\)=>pick\?\.candidates\?\?\[\]/);
    expect(PANEL_DENSE).toMatch(/const attributes=pick\?\.attributes\?\?null/);
  });

  it('verifies selectors through the shared handler', () => {
    expect(PANEL_CODE).toContain("type: 'VERIFY_SELECTOR'");
    // The old path built its own query string and evaluated it.
    expect(PANEL_CODE).not.toContain('XPathResult.ORDERED_NODE_SNAPSHOT_TYPE');
  });
});

// ─── 3. The bridge is a contract, not a convention ──────────────────────────

describe('the $0 bridge is declared once and honoured on both sides', () => {
  it('names the attribute in the shared contract', () => {
    expect(MESSAGING).toContain("export const DEVTOOLS_TARGET_ATTR = 'data-pg-devtools-target'");
    expect(MESSAGING).toContain("type: 'PICK_DEVTOOLS_TARGET'");
    expect(MESSAGING, 'the pick rides the existing ack').toMatch(/pick\?: StoredPick;/);
  });

  it('imports that constant on both sides rather than spelling it twice', () => {
    expect(code(PANEL)).toContain('DEVTOOLS_TARGET_ATTR');
    expect(code(CONTENT)).toContain('DEVTOOLS_TARGET_ATTR');
    const literal = /'data-pg-devtools-target'/g;
    // WS5 — the composed surface now contains `utils/messaging.ts`, which is
    // where the constant is DEFINED, so the literal legitimately appears once.
    // The rule is unchanged: nobody re-spells it. Anything above one occurrence
    // is a second spelling.
    expect(
      (code(PANEL).match(literal) ?? []).length,
      'the panel must use the constant, not a second literal',
    ).toBeLessThanOrEqual(1);
    expect((code(CONTENT).match(literal) ?? []).length).toBe(0);
  });

  it('leaves the page as it was found', () => {
    // The attribute is a transient marker. Removing it before the pick can
    // throw means a failure never leaves the user's DOM modified.
    expect(code(CONTENT)).toMatch(/removeAttribute\(DEVTOOLS_TARGET_ATTR\)/);
  });

  it('routes the new message through the existing background relay', () => {
    expect(code(BACKGROUND)).toContain("'PICK_DEVTOOLS_TARGET'");
    expect(code(BACKGROUND)).toContain('dispatchToTab');
  });
});

// ─── 4. Parity is structural ────────────────────────────────────────────────

describe('both surfaces now render the same verified pick', () => {
  it('builds the DevTools pick with the SAME function as the picker', () => {
    // WS3 renamed the pick builder to `capturePick` (src/runtime/capture.ts)
    // and content.ts now imports it instead of defining it locally — but the
    // guarantee is unchanged: not a copy, the same call, used by both the
    // picker's onPick callback and handleDevtoolsPick.
    expect(code(CONTENT)).toMatch(/handleDevtoolsPick[\s\S]*?capturePick\(el\)\.stored/);
    expect(
      (code(CONTENT).match(/capturePick\(el\)/g) ?? []).length,
      'both call sites use the same capturePick(el)',
    ).toBe(2);
    const capture = read('src/runtime/capture.ts');
    expect(
      (capture.match(/export function capturePick/g) ?? []).length,
      'exactly one pick builder',
    ).toBe(1);
  });

  it('gives DevTools the visible/total transparency, now that it can measure it', () => {
    // totalCount is real here because the content script computed it. This is
    // the one place the milestone permits DevTools to make a total claim.
    expect(PANEL_DENSE).toMatch(/matchBadge\(candidate\.uniqueCount,candidate\.totalCount\)/);
    expect(PANEL_DENSE).toMatch(/isSafelyUnique\(candidate\.uniqueCount,candidate\.totalCount\)/);
  });

  it('uses the shared badge helpers rather than a second safety rule', () => {
    // WS5 — the import now sits in the shared row component the panel composes.
    expect(PANEL_CODE).toMatch(/from '[^']*match-badge'/);
  });
});

// ─── 4. Stale facts must not survive a navigation (WS5) ─────────────────────

describe('the panel invalidates its pick when the inspected page navigates', () => {
  it('subscribes to chrome.devtools.network.onNavigated, and unsubscribes on unmount', () => {
    expect(
      PANEL_CODE,
      'a reload must not leave the panel showing facts about a page that no longer exists',
    ).toContain('chrome.devtools.network.onNavigated.addListener');
    expect(PANEL_CODE).toContain('chrome.devtools.network.onNavigated.removeListener');
  });

  it('the navigation handler clears the pick rather than re-evaluating a stale $0', () => {
    // Re-running TAG_SCRIPT against $0 straight after a navigation would risk
    // silently tagging a detached/stale node — a "synthetic success" the
    // engine could not have verified. Clearing state is the honest choice;
    // the user re-selects an element in the (now-reloaded) Elements panel.
    // WS5 moved this into the DevTools `PickSource` adapter, where the handler
    // is registered rather than written inline; the emitter is now `emitPick`.
    // The behaviour under test is identical: on navigation the pick is CLEARED,
    // never re-evaluated.
    const start = PANEL_CODE.indexOf('api.onNavigated(');
    expect(start, 'the adapter must register a navigation handler').toBeGreaterThanOrEqual(0);
    // Only the handler's own body — the next registration is a different rule.
    const body = PANEL_CODE.slice(start);
    const nearby = body.slice(0, body.indexOf('}),') + 3);
    expect(nearby, 'must clear the stale pick').toMatch(/(setPick|emitPick)\(null\)/);
    expect(nearby, 'must NOT re-evaluate a stale $0').not.toMatch(/evaluate\(\)/);
  });
});
