# Playwright Guru — Progress

**Updated:** 27 August 2026 · Update this file after every authorised implementation step.

## CURRENT MILESTONE

**PRE-v0.1.0 RELIABILITY GATE — Stage 1 (Truth)**

**STATUS: PARTIAL**

### Completed (in Claude's mirror only — NOT placed in the repository)

- **P0-1A** — `RECORDING_ENABLED = false` in `src/config/recording.ts`; Record button and RECORDING
  banner gated behind it. This is the blueprint's own WS9 rollback mechanism; WS9 flips one constant.
- **P0-1B** — both occurrences of `?? { ok: true }` removed from `background.ts`; pure
  `normalizeAck()` added to `utils/messaging.ts`; `undefined`/`null` → explicit `NO_HANDLER` failure.
- **Tests** — `packages/extension/test/preview-gate.test.ts`, 7 tests, proven to fail before the fix.

Mirror validation: **61/61 tests · build PASS · typecheck PASS · lint PASS · format PASS · verify PASS**
Footprint: 4 modified (+52/−5), 1 new (+95).

> These are **PROPOSED / READY-TO-PLACE**. Not committed. Not placed. Not published.

### Pending

- **P0-3** icons + `minimum_chrome_version: '114'`
- **P0-4** manual smoke matrix (8 journeys + 6 negative checks)
- **P0-5** clean-clone package + load-unpacked validation
- Relabel CSS/XPath honestly (Stage 1)
- Unify verify/candidate count semantics (Stage 1)
- Error boundaries on both panel roots (Stage 1)
- Privacy regression test over the built bundle (Stage 1)
- Honest store copy, prepared not published (Stage 1)
- All Stage 2 items (fidelity)
- All Stage 3 items (visibility)

### Blocked

| Item | Reason |
|---|---|
| **E6** | **CLOSED — invalidated by Playwright source evidence.** No work to do |
| **E8** | WS1 scope — needs a new `LocatorKind`, forcing 4 renderers + `never` check + goldens |
| **Playwright conformance corpus** | Awaiting explicit authorisation (WS1 extension) |
| **Icons** | No assets exist in the repository; awaiting product decision |
| **Host git verification** | Claude cannot run git on the host; awaiting user-supplied output |
| **Manual smoke + load unpacked** | Require the user's browser |

## NEXT AUTHORIZED ACTION

**None.** No implementation is currently authorised.

The next step *recommended* — and requiring explicit authorisation before any work begins — is
placing the mirror's P0-1 into the repository, together with the three inputs listed under
"Blocked" above.

## Milestone history

| Date | Milestone | Result |
|---|---|---|
| 2026-08-17 | Phase 0 Discovery | ✅ 26-section report |
| 2026-08-18 | Phase 1 Blueprint | ✅ LOCKED, 40 sections |
| 2026-08-18 | **WS0** | ✅ **CLOSED / LOCKED** — 3 commits, 54/54, CI green both OS |
| 2026-08-19 | Project synchronisation | ✅ recording lie found |
| 2026-08-27 | Product audit | ✅ F-1 ranking inversion, F-2 fabricated badges |
| 2026-08-27 | Master roadmap | ✅ this document set |
