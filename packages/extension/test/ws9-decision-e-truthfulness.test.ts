/**
 * WS9 — OWNER DECISION E: DURABLE OBSERVATION TRUTHFULNESS.
 * ============================================================================
 * THE DECISION, AND THE ONE THING IT CHANGES.
 *
 * DL-88 made the recording banner observable for the first time and, in doing
 * so, exposed a measured gap: for up to `heartbeatTimeoutMs` after the content
 * script dies, the Side Panel continued to display
 *
 *     "RECORDING — perform actions on the page"
 *
 * sourced entirely from the DURABLE observation, while the live authority was
 * provably unreachable and nothing could be captured. Measured over five runs:
 * 14,445–15,267 ms, deterministic, not a rare race.
 *
 * ═══ WHAT DECISION E DID **NOT** CHANGE ═══
 *
 * DL-79's precedence — LIVE CONTENT AUTHORITY > DURABLE OBSERVATION > UNKNOWN —
 * is UNTOUCHED. `resolveRecordingView` is not modified, `observedView` is not
 * modified, `observedLifecycle` is not modified, and the persisted schema is not
 * modified. The resolved lifecycle for any given pair of evidence is byte-for-
 * byte what it was before. `isRecordingNow`, `recordButtonModel` and therefore
 * the picker lock-out are all unchanged.
 *
 * ═══ WHAT IT DID CHANGE ═══
 *
 * ONE THING: the banner no longer states a live-recording claim it has not
 * confirmed. The panel already knew the difference — `observe()` has always had
 * two distinct branches, one where the live authority answered and one where it
 * did not and the durable record was consulted instead — and it simply threw
 * that knowledge away before rendering. It is now carried through as
 * `confirmed`, and the banner says something honest in the unconfirmed case.
 *
 * `confirmed` has exactly one meaning, and it is not "recording is happening":
 *
 *     confirmed  ⇔  the LIVE authority produced a recognised answer
 *
 * ═══ WHY THIS IS A TRUTHFULNESS FIX AND NOT A PREFERENCE ═══
 *
 * `session.ts` opens with the property the whole workstream serves: "the
 * product must never believe it is recording when it is not." The old banner
 * did not merely state a status — it issued an INSTRUCTION, "perform actions on
 * the page", and actions performed on that instruction were silently lost.
 * `RECORDING_ENABLED`'s own doc gives the same reason for existing: "the
 * control could report success while capturing nothing."
 *
 * The durable record's own reader says it answers "**was** this tab recording?"
 * — a past-tense question. Rendering that as a present-tense imperative is the
 * gap this file closes.
 */
import { describe, expect, it } from 'vitest';

import { RECORDING_ENABLED, RECORDING_LIMITS } from '../src/config/recording';
import {
  observedView,
  recordButtonModel,
  recordingBannerLine,
  type RecordingView,
} from '../src/recording/lifecycle-view';
import { observedLifecycle } from '../src/recording/persistence';
import { resolveRecordingView } from '../src/recording/reconcile';

import { readComposed, stripComments } from './helpers/surface-source';

const code = (rel: string): string => stripComments(readComposed(rel));

const ALL_VIEWS: readonly RecordingView[] = [
  'inactive',
  'starting',
  'active',
  'stale',
  'stopped',
  'unknown',
];

const LIVE_CLAIM = 'RECORDING — perform actions on the page';

// ═══ A. THE BANNER NO LONGER CLAIMS WHAT IT HAS NOT CONFIRMED ══════════════

describe('WS9-DE-1 — an unconfirmed active view makes no live-recording claim', () => {
  it('does not render the confirmed RECORDING line', () => {
    const line = recordingBannerLine('active', null, false);
    expect(line).not.toBe(LIVE_CLAIM);
  });

  it('does not instruct the user to perform actions that cannot be captured', () => {
    // THIS is the actual harm. A status line that is merely optimistic is a
    // cosmetic problem; an INSTRUCTION acted on during the window loses the
    // user's work with no signal at all.
    const line = recordingBannerLine('active', null, false) ?? '';
    expect(line.toLowerCase()).not.toContain('perform actions');
  });

  it('still says something — silence would be worse than an honest caveat', () => {
    // `heartbeatTimeoutMs`' own doc requires that "stale state is surfaced
    // rather than trusted". A banner that vanished would leave the user
    // believing a recording is still running somewhere off-screen — the exact
    // reason `stale` and `stopped` produce text rather than `null`.
    const line = recordingBannerLine('active', null, false);
    expect(typeof line).toBe('string');
    expect((line ?? '').length).toBeGreaterThan(0);
  });

  it('names the reason: the page has not answered', () => {
    const line = (recordingBannerLine('active', null, false) ?? '').toLowerCase();
    expect(line).toMatch(/not (yet )?answer|unconfirmed|no answer|has not confirmed/);
  });
});

// ═══ B. NOTHING ELSE MOVED ═════════════════════════════════════════════════

describe('WS9-DE-2 — the confirmed path and every other view are untouched', () => {
  it('a confirmed active view still renders exactly the line it always did', () => {
    expect(recordingBannerLine('active', null, true)).toBe(LIVE_CLAIM);
  });

  it('omitting the argument keeps the previous behaviour for every caller', () => {
    // The parameter defaults to `true`, so every existing call site and every
    // existing test in `ws9-recording-ui.test.ts` keeps its exact meaning. This
    // change adds a case; it does not reinterpret one.
    for (const view of ALL_VIEWS) {
      for (const pending of [null, 'start', 'stop'] as const) {
        expect(recordingBannerLine(view, pending)).toBe(recordingBannerLine(view, pending, true));
      }
    }
  });

  it('confirmation changes nothing for any view except active', () => {
    for (const view of ALL_VIEWS.filter((v) => v !== 'active')) {
      expect(
        recordingBannerLine(view, null, false),
        `${view} must be unaffected — only a live-recording CLAIM needs confirming`,
      ).toBe(recordingBannerLine(view, null, true));
    }
  });

  it('a pending request still wins over the observed state, confirmed or not', () => {
    for (const confirmed of [true, false]) {
      expect(recordingBannerLine('active', 'start', confirmed)).toBe(
        'Starting — not recording yet',
      );
      expect(recordingBannerLine('active', 'stop', confirmed)).toBe('Stopping…');
    }
  });
});

// ═══ C. DL-79 IS NOT REWRITTEN ═════════════════════════════════════════════

describe('WS9-DE-3 — LIVE > DURABLE > UNKNOWN is untouched', () => {
  const now = 1_000_000;
  const record = {
    schemaVersion: 1 as const,
    sessionId: 's',
    lifecycle: 'active' as const,
    startedAt: now,
    lastHeartbeatAt: now,
  };

  it('the resolver still returns the live answer whenever there is one', () => {
    for (const lifecycle of ['inactive', 'starting', 'active', 'stale', 'stopped'] as const) {
      expect(
        resolveRecordingView({
          live: { ok: true, lifecycle },
          durable: { value: record, valid: true },
          now,
        }),
      ).toBe(lifecycle);
    }
  });

  it('durable evidence is still consulted when live said nothing, and still expires', () => {
    const fallback = (at: number) =>
      resolveRecordingView({
        live: { ok: false },
        durable: { value: record, valid: true },
        now: at,
      });
    expect(fallback(now)).toBe('active');
    expect(fallback(now + RECORDING_LIMITS.heartbeatTimeoutMs + 1)).toBe('stale');
  });

  it('expiry is still derived from the clock by the one module that owns it', () => {
    expect(observedLifecycle(record, now)).toBe('active');
    expect(observedLifecycle(record, now + RECORDING_LIMITS.heartbeatTimeoutMs + 1)).toBe('stale');
  });

  it('the button model — and therefore the picker lock-out — is deliberately unchanged', () => {
    // NOT an oversight. `recordButtonModel(...).live` also drives
    // `disabled={rec.button.live}` on the Inspect control, so making it react to
    // confirmation would UNLOCK the picker during a transient message failure
    // while a recording is genuinely still running. That is a behaviour change
    // with its own risk, and Decision E is scoped to the false CLAIM, not to
    // the affordances. It is recorded as an open follow-up, not done quietly.
    expect(recordButtonModel('active', null).live).toBe(true);
    expect(recordButtonModel('active', null).action).toBe('stop');
  });
});

// ═══ D. `confirmed` MEANS ONE THING, AND THE PANEL DERIVES IT THAT WAY ═════

describe('WS9-DE-4 — confirmation is the live authority answering, nothing else', () => {
  it('is the SAME expression that decides whether to fall back to durable evidence', () => {
    // STRENGTHENED after a first draft failed for the wrong reason. That draft
    // looked for `confirmed: observedView(ack) !== 'unknown'` — a guess at the
    // syntax. The implementation binds the expression to a name and reuses it,
    // which is strictly better, and the assertion below states why: the
    // expression may appear ONCE. Two copies could drift, and a panel that fell
    // back to the stored row while still claiming live confirmation is exactly
    // the untruth DL-88 measured.
    const panel = code('entrypoints/sidepanel/RecordingControl.tsx');
    const uses = panel.match(/observedView\(ack\)\s*!==\s*'unknown'/g) ?? [];
    expect(uses, 'one expression, bound once, governing both consequences').toHaveLength(1);
    expect(panel).toMatch(/const confirmed = observedView\(ack\) !== 'unknown';/);
    // …and the durable read is gated on that same name, not on a copy of it.
    // DL-91 renamed the guard's operand when `observe` stopped depending on the
    // carrying object; the FACT is unchanged and is what is asserted — the
    // durable read is gated on the same `confirmed` name, never on a copy.
    expect(panel).toMatch(/if \(![A-Za-z]+ \|\| confirmed\) \{/);
  });

  it('is false when there is no bound tab at all', () => {
    // Absence of a tab is absence of evidence. The panel returns `unknown`
    // there, and `unknown` never renders as recording — but the flag must
    // still be false, or a later view change could inherit a stale `true`.
    const panel = code('entrypoints/sidepanel/RecordingControl.tsx');
    expect(panel).toMatch(/tabId === null\) return \{ view: 'unknown', confirmed: false \}/);
  });

  it('is never derived from the durable record, the workflow or the pending request', () => {
    const panel = code('entrypoints/sidepanel/RecordingControl.tsx');
    const observe = panel.slice(panel.indexOf('const observe'), panel.indexOf('const refresh'));
    expect(observe).toContain('confirmed');
    for (const forbidden of ['record.valid', 'record.value', 'pending', 'workflow']) {
      expect(observe, `confirmation must not be derived from ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it('the two branches of `observe` are the two provenances, and nothing else', () => {
    // `observedView(ack) !== 'unknown'` is ALREADY the condition that decides
    // whether the durable record is even read (DL-79 made the precedence
    // physically true, not merely computed). Confirmation reuses that exact
    // expression rather than introducing a second, rival notion of "did the
    // live authority answer" that could disagree with it.
    expect(observedView({ ok: true, lifecycle: 'active' })).toBe('active');
    expect(observedView({ ok: false })).toBe('unknown');
    expect(observedView(undefined)).toBe('unknown');
    expect(observedView({ ok: true })).toBe('unknown');
  });
});

// ═══ E. THE BANNER IS WIRED TO IT ══════════════════════════════════════════

describe('WS9-DE-5 — the panel actually renders the distinction', () => {
  it('the banner component accepts confirmation and passes it to the one line function', () => {
    const control = code('entrypoints/sidepanel/RecordingControl.tsx');
    expect(control).toMatch(/recordingBannerLine\(view, pending, confirmed\)/);
  });

  it('withdraws the VISUAL recording claim too, not only the sentence', () => {
    // ADDED AFTER A SURVIVING MUTATION. Reverting `live` to
    // `view === 'active' && !pending` left all other assertions green, because
    // every one of them was about words. The banner also asserts in COLOUR: a
    // green ground and a blinking dot. Leaving those lit under an
    // "unconfirmed" sentence would state in the loudest channel exactly what
    // the sentence withdraws, and no test would have noticed.
    const control = code('entrypoints/sidepanel/RecordingControl.tsx');
    const banner = control.slice(control.indexOf('export function RecordingBanner'));
    const live = /const live = ([^;]+);/.exec(banner)?.[1] ?? '';
    expect(live, 'the banner must derive its live affordance from confirmation').toContain(
      'confirmed',
    );
  });

  it('the Side Panel hands the hook’s own confirmation to the banner', () => {
    const panel = code('entrypoints/sidepanel/SidePanel.tsx');
    expect(panel).toMatch(/confirmed=\{rec\.confirmed\}/);
  });

  it('no component invents its own confirmation', () => {
    // CORRECTED from a first draft that counted occurrences of `confirmed:` and
    // expected three. That was a count of SYNTAX — object-literal shorthand
    // makes it two — and it would have passed or failed on formatting rather
    // than on the claim. The claim is: the state is only ever set from an
    // observation the one function produced, never from a literal.
    const control = code('entrypoints/sidepanel/RecordingControl.tsx');
    const sets = control.match(/setConfirmed\(([^)]*)\)/g) ?? [];
    expect(sets.length, 'the state is written in refresh() and in the poll').toBe(2);
    for (const call of sets) {
      expect(call, `${call} must carry the observation's own answer`).toMatch(
        /setConfirmed\(next\.confirmed\)/,
      );
    }
    expect(control, 'never hard-coded true').not.toMatch(/setConfirmed\((true|false)\)/);
  });
});

// ═══ F. THE PRODUCT IS STILL SHIPPED WITH RECORDING OFF ════════════════════

describe('WS9-DE-6 — Decision E changed no product capability', () => {
  it('RECORDING_ENABLED is still false', () => {
    expect(RECORDING_ENABLED).toBe(false);
  });

  it('no timing constant moved', () => {
    // Option C — shortening `heartbeatTimeoutMs` — was evaluated and REJECTED:
    // that constant is the recorder's own liveness tolerance (three missed
    // beats at `heartbeatMs`), and shortening it to make one banner honest
    // would change when a live recording is declared dead. Decision E does not
    // buy UI truth with lifecycle semantics.
    expect(RECORDING_LIMITS.heartbeatMs).toBe(5_000);
    expect(RECORDING_LIMITS.heartbeatTimeoutMs).toBe(15_000);
  });

  it('no new persisted field and no schema move', () => {
    const persistence = code('src/recording/persistence.ts');
    expect(persistence).toContain('RECORDING_OBSERVATION_SCHEMA = 1');
    expect(persistence, 'confirmation is a panel-side fact, never a stored one').not.toContain(
      'confirmed',
    );
  });

  it('the precedence resolver itself was not edited', () => {
    const reconcile = code('src/recording/reconcile.ts');
    expect(reconcile).not.toContain('confirmed');
  });
});
