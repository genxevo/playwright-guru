/**
 * WS5 — DevTools joins the one user workspace, and binds to the tab it inspects.
 * ============================================================================
 * O1: there is ONE global code workspace. DevTools stops being an in-memory
 *     island (DL-67 D-e) and reads, watches and writes the same WS4
 *     `CODE_BUFFER` the Side Panel does, through the same `StorageGateway`.
 * O2: any tab-scoped state DevTools touches is keyed by
 *     `chrome.devtools.inspectedWindow.tabId` — NEVER by the active tab, which
 *     is a different tab whenever DevTools is undocked or the user switches.
 * O5: WS4's LAST-WRITE-WINS semantics are accepted unchanged. What is added
 *     here is narrower and necessary: a stale `watch` callback must not
 *     overwrite an edit the user is in the middle of committing, undo must stay
 *     coherent, and a failed write must surface, never vanish.
 *
 * Evidence level: deterministic unit tests against WS4's own fake backend, plus
 * structural guards. Real Chrome DevTools behaviour is NOT proven here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStorageGateway } from '../src/storage/gateway';
import { CODE_BUFFER } from '../src/storage/state';
import {
  createCodeWorkspaceStore,
  EMPTY_WORKSPACE,
  appendLine,
  clearLines,
  removeLineAt,
  undoLines,
} from '../src/services/code-workspace';
import { FakeChangeSource, FakeStorageArea, QUOTA_MESSAGE } from './helpers/fake-storage';
import { eachSurfaceCode, readExtFile, sharedFiles, stripComments } from './helpers/surface-source';

// ─── The pure workspace algebra ─────────────────────────────────────────────

describe('the code workspace is a value, so undo cannot drift from content', () => {
  it('appends and remembers exactly one step back', () => {
    const w = appendLine(appendLine(EMPTY_WORKSPACE, 'a'), 'b');
    expect(w.lines).toEqual(['a', 'b']);
    expect(w.previous).toEqual(['a']);
  });

  it('undoes to the remembered state and then cannot undo again', () => {
    const w = undoLines(appendLine(appendLine(EMPTY_WORKSPACE, 'a'), 'b'));
    expect(w.lines).toEqual(['a']);
    expect(w.previous).toBeNull();
    expect(undoLines(w).lines).toEqual(['a']);
  });

  it('removes by index and clears, both undoable', () => {
    const three = appendLine(appendLine(appendLine(EMPTY_WORKSPACE, 'a'), 'b'), 'c');
    expect(removeLineAt(three, 1).lines).toEqual(['a', 'c']);
    expect(undoLines(removeLineAt(three, 1)).lines).toEqual(['a', 'b', 'c']);
    expect(clearLines(three).lines).toEqual([]);
    expect(undoLines(clearLines(three)).lines).toEqual(['a', 'b', 'c']);
  });

  it('never mutates the workspace it was given', () => {
    const w = appendLine(EMPTY_WORKSPACE, 'a');
    const before = [...w.lines];
    appendLine(w, 'b');
    removeLineAt(w, 0);
    clearLines(w);
    expect(w.lines).toEqual(before);
  });
});

// ─── The store, against WS4's real gateway over a fake backend ──────────────

function harness() {
  const local = new FakeStorageArea();
  const session = new FakeStorageArea();
  const changes = new FakeChangeSource();
  const gateway = createStorageGateway({ local, session, changes });
  return { local, session, changes, gateway, store: createCodeWorkspaceStore(gateway) };
}

/** Let the store's in-flight promises settle. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

describe('DevTools and the Side Panel share ONE persisted workspace (O1)', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it('hydrates from the global CODE_BUFFER, not a tab-scoped key', async () => {
    await h.gateway.writeGlobal(CODE_BUFFER, ['await page.getByRole("button").click();']);
    await h.store.hydrate();
    expect(h.store.getState().lines).toEqual(['await page.getByRole("button").click();']);
    // Nothing tab-scoped was created for the workspace.
    expect(Object.keys(await h.local.get(null)).some((k) => k.includes(':tab:'))).toBe(false);
  });

  it('starts empty rather than throwing when nothing is stored', async () => {
    await h.store.hydrate();
    expect(h.store.getState().lines).toEqual([]);
    expect(h.store.getState().writeFailed).toBe(false);
  });

  it('persists an append through the gateway', async () => {
    await h.store.hydrate();
    h.store.append('line one');
    await settle();
    const read = await h.gateway.readGlobal(CODE_BUFFER);
    expect(read.value).toEqual(['line one']);
  });

  it('converges a second surface built on the same gateway', async () => {
    const other = createCodeWorkspaceStore(h.gateway);
    await h.store.hydrate();
    await other.hydrate();

    h.store.append('from DevTools');
    await settle();
    h.changes.emit(
      { [`pg:v2:${CODE_BUFFER.key}`]: { newValue: { v: 2, data: ['from DevTools'] } } },
      'local',
    );

    expect(other.getState().lines).toEqual(['from DevTools']);
    other.dispose();
  });

  it('uses last-write-wins, exactly as WS4 already does (O5)', async () => {
    const other = createCodeWorkspaceStore(h.gateway);
    await h.store.hydrate();
    await other.hydrate();
    h.store.append('first');
    await settle();
    other.append('second');
    await settle();
    const read = await h.gateway.readGlobal(CODE_BUFFER);
    expect(read.value).toEqual(['second']);
    other.dispose();
  });
});

describe('a stale watch callback cannot eat an edit in flight (O5)', () => {
  it('ignores a change that arrives while this surface has a write pending', async () => {
    const h = harness();
    await h.store.hydrate();
    h.store.append('mine');
    // The remote change lands BEFORE our own write resolves.
    h.changes.emit(
      { [`pg:v2:${CODE_BUFFER.key}`]: { newValue: { v: 2, data: ['theirs'] } } },
      'local',
    );
    expect(h.store.getState().lines).toEqual(['mine']);
    await settle();
    expect(h.store.getState().lines).toEqual(['mine']);
  });

  it('accepts a remote change once no write is in flight', async () => {
    const h = harness();
    await h.store.hydrate();
    h.store.append('mine');
    await settle();
    h.changes.emit(
      { [`pg:v2:${CODE_BUFFER.key}`]: { newValue: { v: 2, data: ['theirs'] } } },
      'local',
    );
    expect(h.store.getState().lines).toEqual(['theirs']);
  });

  it('drops the undo reference on remote convergence rather than pointing it at another history', async () => {
    const h = harness();
    await h.store.hydrate();
    h.store.append('mine');
    await settle();
    expect(h.store.getState().previous).toEqual([]);
    h.changes.emit(
      { [`pg:v2:${CODE_BUFFER.key}`]: { newValue: { v: 2, data: ['theirs'] } } },
      'local',
    );
    expect(h.store.getState().previous).toBeNull();
    h.store.undo();
    expect(h.store.getState().lines).toEqual(['theirs']);
  });

  it('keeps local undo working across its own successful writes', async () => {
    const h = harness();
    await h.store.hydrate();
    h.store.append('a');
    await settle();
    h.store.append('b');
    await settle();
    h.store.undo();
    await settle();
    expect(h.store.getState().lines).toEqual(['a']);
    expect((await h.gateway.readGlobal(CODE_BUFFER)).value).toEqual(['a']);
  });
});

describe('a failed DevTools write is visible, never swallowed (O5)', () => {
  it('raises the WS8 error state when the write is rejected', async () => {
    const h = harness();
    await h.store.hydrate();
    h.local.fail('write');
    h.store.append('will not persist');
    await settle();
    expect(h.store.getState().writeFailed).toBe(true);
    expect(h.store.getState().failureCode).toBe('WRITE_FAILED');
  });

  it('classifies a quota rejection as quota', async () => {
    const h = harness();
    await h.store.hydrate();
    h.local.fail('quota');
    h.store.append('too big');
    await settle();
    expect(h.store.getState().failureCode).toBe('QUOTA_EXCEEDED');
  });

  it('keeps showing the user their own edit after a failed write', async () => {
    const h = harness();
    await h.store.hydrate();
    h.local.fail('write');
    h.store.append('still mine');
    await settle();
    expect(h.store.getState().lines).toEqual(['still mine']);
  });

  it('clears the failure once a later write succeeds', async () => {
    const h = harness();
    await h.store.hydrate();
    h.local.fail('write');
    h.store.append('one');
    await settle();
    expect(h.store.getState().writeFailed).toBe(true);
    h.local.recover('write');
    h.store.append('two');
    await settle();
    expect(h.store.getState().writeFailed).toBe(false);
    expect((await h.gateway.readGlobal(CODE_BUFFER)).value).toEqual(['one', 'two']);
  });

  it('notifies subscribers so a panel can render the failure', async () => {
    const h = harness();
    await h.store.hydrate();
    const seen = vi.fn();
    const stop = h.store.subscribe(seen);
    h.local.fail('write');
    h.store.append('x');
    await settle();
    expect(seen).toHaveBeenCalled();
    stop();
  });

  it('stops watching after dispose', async () => {
    const h = harness();
    await h.store.hydrate();
    h.store.dispose();
    h.changes.emit(
      { [`pg:v2:${CODE_BUFFER.key}`]: { newValue: { v: 2, data: ['after dispose'] } } },
      'local',
    );
    expect(h.store.getState().lines).toEqual([]);
  });
});

// ─── O2 / E8 / E9 — the inspected tab is the tab ────────────────────────────

describe('DevTools binds to the tab it inspects, not the active tab (O2)', () => {
  it('reads its tab identity from the DevTools inspected-window seam', () => {
    const source = readExtFile('src/browser/pick-source.ts');
    expect(source).toMatch(/chrome\.devtools\.inspectedWindow\.tabId/);
  });

  it('never resolves the inspected target through an active-tab query', () => {
    const source = readExtFile('src/browser/pick-source.ts');
    const devtoolsHalf = stripComments(source).slice(
      stripComments(source).indexOf('createDevtoolsPickSource'),
    );
    expect(devtoolsHalf, 'DevTools must not use tabs.query for inspected state').not.toMatch(
      /tabs\.query/,
    );
  });

  it('keeps the Side Panel on its own active-tab model', () => {
    expect(readExtFile('src/browser/tabs.ts')).toMatch(/active:\s*true/);
  });

  it('reports the inspected tab id through the shared TabContext port shape', async () => {
    const { devtoolsTabContext } = await import('../src/browser/pick-source');
    const ctx = devtoolsTabContext(4242);
    expect((await ctx.getActiveTab())?.tabId).toBe(4242);
    const seen: Array<number | null> = [];
    const stop = ctx.subscribe((t) => seen.push(t?.tabId ?? null));
    expect(seen).toEqual([4242]);
    stop();
  });
});

describe('a DevTools $0 pick updates LAST_PICK for the inspected tab (E9)', () => {
  it('the background persists the pick it just returned, scoped to that tab', () => {
    const background = readExtFile('entrypoints/background.ts');
    expect(background).toMatch(/PICK_DEVTOOLS_TARGET/);
    expect(background).toMatch(/persistDevtoolsPick/);
    expect(background).toMatch(/writeTab\(LAST_PICK,\s*tabId,/);
  });

  it('writes it with the message’s targetTabId, which is the inspected tab', async () => {
    const { persistDevtoolsPick } = await import('../entrypoints/background');
    const h = harness();
    const pick = {
      attributes: { tagName: 'button' },
      chain: { steps: [] },
      candidates: [],
    } as never;
    await persistDevtoolsPick(h.gateway, 77, { ok: true, pick });
    const forInspected = await h.gateway.readTab(
      (await import('../src/storage/state')).LAST_PICK,
      77,
    );
    expect(forInspected.value).not.toBeNull();
    const forOther = await h.gateway.readTab((await import('../src/storage/state')).LAST_PICK, 78);
    expect(forOther.value).toBeNull();
  });

  it('persists nothing when the pick failed', async () => {
    const { persistDevtoolsPick } = await import('../entrypoints/background');
    const h = harness();
    await persistDevtoolsPick(h.gateway, 77, { ok: false, error: 'nope' });
    const { LAST_PICK } = await import('../src/storage/state');
    expect((await h.gateway.readTab(LAST_PICK, 77)).value).toBeNull();
  });

  it('still builds that pick with the SAME function as the picker', () => {
    // The DL-31 guard, restated here so this file cannot be read as licence to
    // introduce a DevTools-specific snapshot builder.
    const content = readExtFile('entrypoints/content.ts');
    const capturePickCalls = content.match(/capturePick\(/g) ?? [];
    expect(capturePickCalls.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── The storage boundary held ──────────────────────────────────────────────

describe('the storage boundary is unchanged by WS5 (E15)', () => {
  it('no surface reaches past the gateway to raw browser storage', () => {
    for (const [name, source] of eachSurfaceCode()) {
      // WS9 V1 raw-line migration (DL-82) — STRENGTHENED to zero exceptions.
      //
      // The ONE permitted direct call was WS4's documented exception: the
      // WS9-owned `pg_recorded_actions` reset, which O2 kept outside the WS4
      // architecture and which WS5 moved without changing. DL-82 retired it, so
      // no surface makes a raw storage call at all. `storage-consumers.test.ts`
      // carries the same, now-empty, exception list.
      const calls = [...source.matchAll(/browser\.storage\.\w+\.\w+\(([^)]*)\)/g)].map((m) => m[0]);
      expect(calls, `${name}: no surface may reach storage directly`).toEqual([]);
      expect(source, `${name} must not call chrome.storage directly`).not.toMatch(
        /chrome\.storage\./,
      );
    }
  });

  it('never uses storage.sync anywhere in the composed surfaces', () => {
    for (const [name, source] of eachSurfaceCode()) {
      expect(source, `${name}`).not.toMatch(/storage\.sync/);
    }
  });

  it('the workspace service is shared by both surfaces', () => {
    expect(sharedFiles()).toContain('src/services/code-workspace.ts');
  });

  it('the workspace service holds no browser API of its own', () => {
    const source = stripComments(readExtFile('src/services/code-workspace.ts'));
    expect(source).not.toMatch(/\bchrome\./);
    expect(source).not.toMatch(/wxt\/browser/);
  });
});
