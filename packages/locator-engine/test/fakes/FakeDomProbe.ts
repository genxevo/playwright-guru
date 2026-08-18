/**
 * A fixture DomProbe.
 *
 * Its existence is the point: if the domain can be handed a probe that has never
 * seen a browser, and still produce correct verified results, then the boundary
 * holds. WS1 adds a richer happy-dom-backed implementation that answers from
 * real parsed HTML; this one answers from a table, which is all WS0 needs to
 * prove the seam is injectable.
 */

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

  private answer(key: string): ProbeCount {
    return this.answers[key] ?? this.fallback;
  }

  countCss(selector: string, _opts?: ProbeOpts): ProbeCount {
    this.calls.push({ method: 'countCss', args: [selector] });
    return this.answer(`css:${selector}`);
  }

  countXPath(expression: string, _opts?: ProbeOpts): ProbeCount {
    this.calls.push({ method: 'countXPath', args: [expression] });
    return this.answer(`xpath:${expression}`);
  }

  countByText(text: string, mode: TextMatchMode, _opts?: ProbeOpts): ProbeCount {
    this.calls.push({ method: 'countByText', args: [text, mode] });
    return this.answer(`text:${mode}:${text}`);
  }

  countByRole(role: string, name?: string, _opts?: ProbeOpts): ProbeCount {
    this.calls.push({ method: 'countByRole', args: [role, name] });
    return this.answer(`role:${role}:${name ?? ''}`);
  }

  countByLabel(text: string, mode: TextMatchMode, _opts?: ProbeOpts): ProbeCount {
    this.calls.push({ method: 'countByLabel', args: [text, mode] });
    return this.answer(`label:${mode}:${text}`);
  }

  scopeOf(handle: ScopeHandle): ScopeHandle | null {
    return handle;
  }
}
