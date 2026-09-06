/**
 * A fixture DomProbe.
 *
 * Its existence is the point: if the domain can be handed a probe that has never
 * seen a browser, and still produce correct verified results, then the boundary
 * holds. WS1 adds a richer happy-dom-backed implementation that answers from
 * real parsed HTML; this one answers from a table, which is all WS0 needs to
 * prove the seam is injectable.
 */

import { createScopeHandle } from '../../src/probe';

import type { DomProbe, ProbeCount, ProbeOpts, ScopeHandle, TextMatchMode } from '../../src/probe';

export interface RecordedProbeCall {
  method: 'countCss' | 'countXPath' | 'countByText' | 'countByRole' | 'countByLabel';
  args: readonly (string | undefined)[];
}

const ZERO: ProbeCount = { total: 0, visible: 0 };

export class FakeDomProbe implements DomProbe {
  /** Every question the domain asked, in order. */
  readonly calls: RecordedProbeCall[] = [];

  constructor(
    private readonly answers: Readonly<Record<string, ProbeCount>> = {},
    private readonly fallback: ProbeCount = ZERO,
  ) {}

  private nextScopeId = 1;

  /**
   * Looks up the answer for a question, honouring D2 scope in two ways.
   *
   * 1. A SCOPED lookup tries `scope<id>|<key>` first, so a test can state what a
   *    query returns *inside* a particular parent. It falls back to the bare key
   *    when the table says nothing scope-specific, which keeps the many chain
   *    tests that only care about counts working unchanged.
   *
   * 2. A unique VISIBLE match is given a scope handle if the table did not
   *    supply one. That is not a convenience: it is what a conforming probe
   *    does (`LiveDomProbe`, `FixtureDomProbe`), and a fake that omitted it
   *    would make every chain report `unsupported` and quietly stop testing
   *    chain behaviour at all. A test that wants a specific handle still
   *    provides one; a test that wants a NON-scoping probe uses its own class.
   */
  private answer(key: string, opts?: ProbeOpts): ProbeCount {
    const scoped = opts?.scope ? this.answers[`scope${opts.scope.id}|${key}`] : undefined;
    const base = scoped ?? this.answers[key] ?? this.fallback;
    if (base.error || base.visible !== 1 || base.scope) return base;
    return { ...base, scope: createScopeHandle(this.nextScopeId++) };
  }

  countCss(selector: string, opts?: ProbeOpts): ProbeCount {
    this.calls.push({ method: 'countCss', args: [selector] });
    return this.answer(`css:${selector}`, opts);
  }

  countXPath(expression: string, opts?: ProbeOpts): ProbeCount {
    this.calls.push({ method: 'countXPath', args: [expression] });
    return this.answer(`xpath:${expression}`, opts);
  }

  countByText(text: string, mode: TextMatchMode, opts?: ProbeOpts): ProbeCount {
    this.calls.push({ method: 'countByText', args: [text, mode] });
    return this.answer(`text:${mode}:${text}`, opts);
  }

  countByRole(role: string, name?: string, opts?: ProbeOpts): ProbeCount {
    this.calls.push({ method: 'countByRole', args: [role, name] });
    return this.answer(`role:${role}:${name ?? ''}`, opts);
  }

  countByLabel(text: string, mode: TextMatchMode, opts?: ProbeOpts): ProbeCount {
    this.calls.push({ method: 'countByLabel', args: [text, mode] });
    return this.answer(`label:${mode}:${text}`, opts);
  }

  scopeOf(handle: ScopeHandle): ScopeHandle | null {
    return handle;
  }
}
