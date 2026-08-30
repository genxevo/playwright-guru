# Playwright Guru — Future Vision

`FUTURE` unless marked otherwise. Nothing here is authorised. Nothing here may expand current scope.
Authority for anything conflicting: the locked blueprint, then `MASTER-ROADMAP.md`.

## The three behaviours

The extension should eventually offer three modes that **share one locator intelligence**.

```
LOCATOR MODE    Inspect → Locator            (today; must stay fast and uncluttered)
RECORD MODE     Record  → Verified Test      (WS9)
PROJECT MODE    Project → Framework-Aware Generation   (Phase C/D)
```

The user must never be shown Selenium, Cypress, WebdriverIO, generic automation, AI controls,
framework builders, or unnecessary configuration. **Playwright is the centre.**

## Behaviour 1 — Locator Mode `CURRENT`

Inspect → understand → generate → verify → rank → explain → copy. This is the core and it must
remain clean. Every later behaviour is additive and must not clutter it.

## Behaviour 2 — Record Mode `DEFERRED` (WS9)

```
Record → capture action → SAME DomProbe → SAME LocatorResolver → verified LocatorChain
       → verdict + rationale → ElementFactsLite → RecordedWorkflow → codegen ×5 languages
```

**Binding: there is never a second locator engine.** `RecordedTarget` stores the verified *chain*,
not a rendered string, so a recording survives a change of language or strategy.

Recording UI is currently disabled by `RECORDING_ENABLED = false`. WS9 turns it on.

## Behaviour 3 — Project Mode `FUTURE` (Phase C/D)

**Framework-Aware Test Generation** — *not* "build an automation framework".

```
Existing repo → deterministic structural analysis → FrameworkProfile
             → (optional) AI refinement of ambiguous conventions
             → generation proposal → REVIEW CHANGES → APPLY
```

### FrameworkProfile

Derived by inspecting `package.json`, `playwright.config.ts`, `tsconfig.json`, folder structure,
existing Page Objects, fixtures, test patterns, imports, and naming/locator/assertion conventions.

```
framework:           Playwright Test
language:            TypeScript
architecture:        Page Object Model
testDir / pageDir / fixtureDir
pageNaming:          *Page.ts
testNaming:          *.spec.ts
locatorConvention:   Playwright locators as class properties
assertionStyle:      expect(...)
authStrategy:        storageState
projectConventions:  …
```

**"Learn My Framework"** analyses locally and reports what it found — e.g. *12 Page Objects,
8 fixtures, 34 tests* — before saving a profile.

### Generate changes, not a framework `LOCKED` for this direction

```
MODIFIED  pages/LoginPage.ts    + username locator, + password locator, + login()
MODIFIED  tests/Login.spec.ts   + successful login test
```

Files, methods, imports, dependencies and config changes are all shown **before** anything is
written. **Review → Apply. Never silent modification.** This is a reliability principle.

### Explicitly not wanted

Giant framework generators · uncontrolled scaffolding · mandatory AI · token-heavy per-action
generation · automatic repository rewriting · blindly creating Cucumber/POM/config/CI ·
architecture Guru invents without evidence.

## Optional AI `FUTURE`

**AI must never be required for the core locator product.**

| Appropriate | Forbidden |
|---|---|
| messy repository structure | per-locator generation |
| implicit conventions | any runtime dependency of basic locator output |
| inconsistent naming | sending page content off-device without explicit consent |
| semantic interpretation of project patterns | replacing deterministic analysis that already works |

Privacy stays explicit and opt-in. The verified zero-network property of the core product is a
competitive asset and must not be traded.

## Cucumber `FUTURE`

Not in v0.1.x. Not in the current roadmap. If ever supported, it is **one more generation target
inside the framework-aware layer** — `features/*.feature`, `step-definitions/*.steps.ts`,
`pages/*Page.ts` — never a separate subsystem.

## Long-term phases

| Phase | Content |
|---|---|
| **A — Trustworthy Core** | locator engine · verification · rationale · Playwright conformance · evidence-based ranking |
| **B — Recording** | shared locator engine · action capture · verified locators · assertions · replay/codegen |
| **C — Project Awareness** | project discovery · FrameworkProfile · conventions · "Learn My Framework" |
| **D — Framework-Aware Generation** | generate recorded workflows into the existing structure; reviewable file changes |
| **E — Optional AI Adaptation** | AI interprets ambiguous conventions; remains optional |
| **F — Advanced Generation Targets** | possibly Cucumber and other Playwright-compatible patterns — only if research and architecture justify them |

## Product identity

> **Guru is the only tool that tells you which Playwright locator to use — and can prove it.**

Locator Labs ranks and teaches, across five frameworks, and cannot prove its advice.
Playwright CRX is perfectly faithful and completely silent.
The official extension solves authentication, not locators.

The intersection — **opinionated *and* provably Playwright-faithful** — is currently empty.
