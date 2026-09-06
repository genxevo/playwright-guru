/**
 * WS6.2 trust correction — D2: a chained locator is resolved WITHIN its parent.
 * ============================================================================
 * THE DEFECT THIS CLOSES.
 *
 * `resolveChain` iterated the steps calling `resolveStep(step, probe)` with no
 * `opts`, therefore with no scope. Every step was measured independently
 * against the whole document and the chain reported the TERMINAL step's
 * document-wide count. So
 *
 *     page.getByRole('list').getByText('Save')
 *
 * was answered with "how many 'Save' are on the page", not "how many 'Save' are
 * inside that list". When the text existed only OUTSIDE the list, the panel said
 * **verified, 1 match** for an expression Playwright resolves to **zero**. That
 * is the worst failure this product can have: a green result that is wrong.
 *
 * WS0 named the fix in `ResolveResult.stepCounts`' own doc comment — "requires
 * the probe to return scope handles for matched elements" — and WS3 built the
 * scope machinery (`ProbeOpts.scope`, `ScopeHandle`) without ever wiring it in
 * here. This is that wiring, and nothing more.
 *
 * THE AMBIGUITY POLICY, which is the part that makes it honest:
 *
 *     parent matches 0  → not-found      (the child is never evaluated)
 *     parent matches 1  → child is resolved ONLY inside that parent
 *     parent matches 2+ → ambiguous      (the child is never evaluated)
 *
 * No first-match. No `.nth(0)`. No arbitrary parent. No document-wide fallback.
 * If the parent is ambiguous the chain is ambiguous, because there is no single
 * scope to look inside and guessing one would be a fabricated answer.
 *
 * EVIDENCE. The semantic cases run against `FixtureDomProbe` over a real parsed
 * happy-dom document — the strongest oracle this repository has — and the
 * question-shape cases run against a keyed fake so the exact probe calls can be
 * asserted. happy-dom is NOT Chromium and no Chrome behaviour is claimed.
 */
import { describe, expect, it } from 'vitest';

import { parseLocatorExpression } from '../src/parser';
import { resolveChain } from '../src/resolver';
import { verifyLocatorExpression } from '../src/verifier';
import { createScopeHandle } from '../src/probe';
import { FakeDomProbe } from './fakes/FakeDomProbe';
import { FixtureDomProbe } from './fakes/FixtureDomProbe';
import { createFixture } from './fixtures/dom';

import type { ProbeCount } from '../src/probe';

const parse = (expression: string) => {
  const parsed = parseLocatorExpression(expression);
  if (!parsed.ok) throw new Error(`fixture must parse: ${expression} (${parsed.error.code})`);
  return parsed.chain;
};

/** A probe over a real parsed document. */
const probeFor = (html: string) => new FixtureDomProbe(createFixture(html).document);

// ─── 1–5. The mandated policy, against a real DOM ───────────────────────────

describe('D2 · a chained locator is measured inside its parent, or not at all', () => {
  it('1 · parent unique + child unique inside it → verified', () => {
    const probe = probeFor(`
      <ul role="list"><li>Save</li><li>Cancel</li></ul>
      <div><span>Unrelated</span></div>
    `);
    const result = resolveChain(parse("page.getByRole('list').getByText('Save')"), probe);

    expect(result.error).toBeUndefined();
    expect(result.visibleMatchCount).toBe(1);
    // `verdictFor` grades a unique match by the TERMINAL kind: `text` is not a
    // premium strategy, so a unique text match is 'good', not 'excellent'.
    expect(result.verdict).toBe('good');
  });

  it('2 · parent unique + child absent inside it → not-found', () => {
    const probe = probeFor(`
      <ul role="list"><li>Cancel</li></ul>
    `);
    const result = resolveChain(parse("page.getByRole('list').getByText('Save')"), probe);

    expect(result.visibleMatchCount).toBe(0);
    expect(result.verdict).toBe('no-match');
  });

  it('3 · parent unique + child ambiguous inside it → ambiguous', () => {
    const probe = probeFor(`
      <ul role="list"><li>Save</li><li>Save</li></ul>
    `);
    const result = resolveChain(parse("page.getByRole('list').getByText('Save')"), probe);

    expect(result.visibleMatchCount).toBe(2);
    expect(result.verdict).toBe('ambiguous');
  });

  it('4 · parent ambiguous → ambiguous, and the child is NEVER evaluated', () => {
    const probe = new FakeDomProbe({
      'role:list:': { total: 3, visible: 3 },
      'text:substring:Save': { total: 1, visible: 1 },
    });
    const result = resolveChain(parse("page.getByRole('list').getByText('Save')"), probe);

    expect(result.verdict).toBe('ambiguous');
    expect(result.visibleMatchCount).toBeGreaterThan(1);
    expect(
      probe.calls.map((c) => c.method),
      'an ambiguous parent gives no scope to look inside, so the child must not be asked',
    ).toEqual(['countByRole']);
  });

  it('5 · parent absent → not-found, and the child is NEVER evaluated', () => {
    const probe = new FakeDomProbe({
      'role:list:': { total: 0, visible: 0 },
      'text:substring:Save': { total: 1, visible: 1 },
    });
    const result = resolveChain(parse("page.getByRole('list').getByText('Save')"), probe);

    expect(result.verdict).toBe('no-match');
    expect(result.visibleMatchCount).toBe(0);
    expect(probe.calls.map((c) => c.method)).toEqual(['countByRole']);
  });
});

// ─── 8. THE REGRESSION GUARD — the false green this whole gate exists for ───

describe('D2 · a child that exists only OUTSIDE the parent is not-found', () => {
  it('never reports verified because the text exists elsewhere on the page', () => {
    // Before the fix this returned visible=1 / verified: the terminal step was
    // measured document-wide and found the Save outside the list.
    const probe = probeFor(`
      <ul role="list"><li>Cancel</li></ul>
      <div><button>Save</button></div>
    `);
    const result = resolveChain(parse("page.getByRole('list').getByText('Save')"), probe);

    expect(result.verdict, 'this is the exact false green D2 removes').not.toBe('good');
    expect(result.visibleMatchCount).toBe(0);
    expect(result.verdict).toBe('no-match');
  });

  it('and the six-state verifier reports not-found, never verified', () => {
    const probe = probeFor(`
      <ul role="list"><li>Cancel</li></ul>
      <div><button>Save</button></div>
    `);
    const verification = verifyLocatorExpression("page.getByRole('list').getByText('Save')", probe);
    expect(verification.status).toBe('not-found');
    expect(verification.status).not.toBe('verified');
  });
});

// ─── 6. Nested chains keep narrowing ────────────────────────────────────────

describe('D2 · every step narrows, not just the second', () => {
  it('6 · a three-step chain stays inside each preceding unique scope', () => {
    const probe = probeFor(`
      <main role="main">
        <ul role="list"><li>Save</li></ul>
      </main>
      <aside>
        <ul role="list"><li>Save</li><li>Save</li></ul>
      </aside>
    `);
    // Document-wide there are two lists and three "Save"s. Inside <main> there
    // is one list, and inside that list exactly one "Save".
    const result = resolveChain(
      parse("page.getByRole('main').getByRole('list').getByText('Save')"),
      probe,
    );

    expect(result.visibleMatchCount).toBe(1);
    expect(result.verdict).toBe('good');
  });

  it('a middle step that is ambiguous stops the chain there', () => {
    const probe = probeFor(`
      <main role="main">
        <ul role="list"><li>Save</li></ul>
        <ul role="list"><li>Save</li></ul>
      </main>
    `);
    const result = resolveChain(
      parse("page.getByRole('main').getByRole('list').getByText('Save')"),
      probe,
    );
    expect(result.verdict).toBe('ambiguous');
  });

  it('a middle step that matches nothing stops the chain there', () => {
    const probe = probeFor(`
      <main role="main"><p>Save</p></main>
    `);
    const result = resolveChain(
      parse("page.getByRole('main').getByRole('list').getByText('Save')"),
      probe,
    );
    expect(result.verdict).toBe('no-match');
    expect(result.visibleMatchCount).toBe(0);
  });
});

// ─── The scope really is threaded, and it is the probe that mints it ────────

describe('D2 · the scope is opaque, and it comes from the probe', () => {
  it('passes the parent scope to the child query through ProbeOpts', () => {
    const parentScope = createScopeHandle(7);
    const unique: ProbeCount = { total: 1, visible: 1, scope: parentScope };
    const probe = new ScopeRecordingProbe({
      'role:list:': unique,
      'text:substring:Save': { total: 1, visible: 1 },
    });

    resolveChain(parse("page.getByRole('list').getByText('Save')"), probe);

    expect(probe.scopesSeen[0], 'the parent query itself is unscoped').toBeUndefined();
    expect(probe.scopesSeen[1], 'the child query runs inside the parent').toBe(parentScope);
  });

  it('a single-step chain is never given a scope', () => {
    const probe = new ScopeRecordingProbe({ 'role:button:': { total: 1, visible: 1 } });
    resolveChain(parse("page.getByRole('button')"), probe);
    expect(probe.scopesSeen).toEqual([undefined]);
  });
});

/** Records the `opts.scope` each call received — the thing D2 is about. */
class ScopeRecordingProbe extends FakeDomProbe {
  readonly scopesSeen: Array<unknown> = [];
  countByRole(role: string, name?: string, opts?: { scope?: unknown }): ProbeCount {
    this.scopesSeen.push(opts?.scope);
    return super.countByRole(role, name, opts as never);
  }
  countByText(text: string, mode: 'exact' | 'substring', opts?: { scope?: unknown }): ProbeCount {
    this.scopesSeen.push(opts?.scope);
    return super.countByText(text, mode, opts as never);
  }
}

// ─── 7. nth is unchanged — it applies to the final scoped result ────────────

describe('D2 · nth keeps the semantics the architecture already models', () => {
  it('7 · applies to the child measured INSIDE the parent, not document-wide', () => {
    const probe = probeFor(`
      <ul role="list"><li>Save</li><li>Save</li></ul>
      <div><button>Save</button></div>
    `);
    // Inside the list there are two "Save"s, so nth(1) is in range and nth(5) is not.
    expect(
      resolveChain(parse("page.getByRole('list').getByText('Save').nth(1)"), probe)
        .visibleMatchCount,
    ).toBe(1);
    expect(
      resolveChain(parse("page.getByRole('list').getByText('Save').nth(5)"), probe)
        .visibleMatchCount,
    ).toBe(0);
  });

  it('single-step nth behaviour is untouched', () => {
    const probe = new FakeDomProbe({ 'role:button:Edit': { total: 3, visible: 3 } });
    expect(
      resolveChain(parse("page.getByRole('button', { name: 'Edit' }).nth(1)"), probe)
        .visibleMatchCount,
    ).toBe(1);
    expect(
      resolveChain(parse("page.getByRole('button', { name: 'Edit' }).nth(9)"), probe)
        .visibleMatchCount,
    ).toBe(0);
  });
});

// ─── A ScopeHandle must never escape into anything serialisable ─────────────

describe('D2 · the scope stays runtime-only', () => {
  it('the existing snapshot guard still refuses a ScopeHandle', async () => {
    const { containsScopeHandle } = await import('../src/snapshot');
    expect(containsScopeHandle({ deep: { nested: createScopeHandle(1) } })).toBe(true);
    expect(containsScopeHandle({ matchCount: 1, visibleMatchCount: 1 })).toBe(false);
  });

  it('a resolved chain result carries no scope onward to its consumers', () => {
    const probe = probeFor('<ul role="list"><li>Save</li></ul>');
    const result = resolveChain(parse("page.getByRole('list').getByText('Save')"), probe);
    // What `fact-model.ts` copies out of a resolution: counts, verdict, steps.
    const forwarded = {
      verdict: result.verdict,
      matchCount: result.matchCount,
      visibleMatchCount: result.visibleMatchCount,
      stepCounts: result.stepCounts,
    };
    expect(
      Object.values(forwarded).some(
        (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
      ),
    ).toBe(false);
  });
});
