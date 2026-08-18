# Playwright Guru

A Chrome extension for QA engineers, SDETs and developers. Click any element on a page and get a
**verified** Playwright locator — plus CSS and XPath — in TypeScript, JavaScript, Python, Java or C#.

The product promise, and the constraint the architecture is designed around:

> Playwright Guru never shows the user something it cannot justify.

Every reliability signal in the UI is measured against the live DOM. Nothing is asserted.

---

## Repository layout

```
packages/
├── locator-engine/     PURE DOMAIN — no DOM, no browser API, no React
│   ├── types.ts        Locator AST (LocatorChain / LocatorStep / MatcherValue)
│   ├── accessibility.ts Implicit ARIA roles + accessible-name computation
│   ├── scorer.ts       Candidate generation and scoring
│   ├── engine.ts       Chain orchestration
│   ├── probe.ts        DomProbe — the ONLY window onto a live DOM
│   ├── resolver.ts     LocatorResolver — the ONE verification abstraction
│   ├── rationale.ts    Structured rationale codes + verdicts
│   ├── facts.ts        ElementFacts / ElementContext (bounded)
│   └── snapshot.ts     PickSnapshot contract + size budget guards
│
├── codegen/            PURE RENDERING — depends only on locator-engine
│   └── renderers/      TypeScript · Python · Java · C#
│
└── extension/          WXT / Manifest V3 shell
    ├── entrypoints/    background · content · popup · sidepanel · devtools
    └── src/
        ├── application/  ports · adapters · hooks · services
        ├── config/       shared configuration (recording limits)
        └── ui/           tokens · primitives · product components · copy
```

## Architecture in one picture

```
Browser / Extension Environment
            ↓
    Environment Adapter          (src/browser, src/application/adapters)
            ↓
         DomProbe                (injected — the domain's only DOM access)
            ↓
   Domain / Locator Logic        (packages/locator-engine, packages/codegen)
            ↓
  Application / Use Cases        (src/application)
            ↓
           UI                    (src/ui, entrypoints)
```

**Browser runtime captures facts. Domain makes decisions. Application orchestrates workflows. UI
presents decisions.** The dependency direction is one-way and enforced by lint, not by convention.

### The five enforced boundary rules

| Rule   | Statement                                                            |
| ------ | -------------------------------------------------------------------- |
| **R1** | Browser/extension APIs only in `src/browser/**` and `entrypoints/**` |
| **R2** | Domain packages must not depend on React                             |
| **R3** | Domain packages must not touch a live DOM — go through `DomProbe`    |
| **R4** | Domain and runtime must not import UI copy (Domain Prose Exclusion)  |
| **R5** | `ui/**` must not import `browser/**`                                 |

A violation fails CI. See `eslint.config.mjs`.

### Four load-bearing ideas

1. **`DomProbe`** — a narrow, injectable port. The domain stays pure _and_ can verify its own
   output. A live implementation runs in the content script; a fixture implementation runs in tests.
2. **One `LocatorResolver`** — candidate counting, recommended-chain proof, expression verification
   and recorded-locator validation all share a single abstraction. There is never more than one.
3. **Generate-and-verify during capture** — all generation and verification happens once, in the
   browser layer, while the element is live. The UI receives a verified `PickSnapshot` and stays
   presentational. This is what lets the Side Panel and the DevTools panel share one implementation.
4. **Rationale codes, not sentences** — engines emit `{ code: 'SCOPED_BY_ANCESTOR', params: {...} }`.
   The UI owns every word.

---

## Development

Requires **Node ≥ 18** and **pnpm 9.15.4** (see `packageManager`).

```bash
pnpm install          # install; also runs `wxt prepare`
pnpm dev              # WXT dev server with HMR
pnpm build            # build all packages + the extension
pnpm typecheck        # tsc --noEmit across the workspace  (run AFTER build — see below)
pnpm lint             # ESLint, incl. boundary rules R1–R5
pnpm test             # vitest across the workspace
pnpm format           # prettier --write
pnpm verify           # build → typecheck → lint → test → format:check (the full CI gate)
```

> **`pnpm build` must run before `pnpm typecheck` on a clean checkout.** `codegen` resolves
> `@playwright-guru/locator-engine` through its `dist/index.d.ts`, which is generated and gitignored.
> Until `tsc -b` has emitted it, `tsc --noEmit` cannot resolve the workspace dependency.
> `pnpm verify` encodes the correct order, and runs exactly the same gates as CI.

### Loading the extension

```bash
pnpm build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
select `packages/extension/.output/chrome-mv3`.

---

## Testing

```bash
pnpm test             # everything
pnpm test:watch       # watch mode
```

Domain packages run under the **Node** environment with no DOM. That is deliberate: if domain code
ever reaches for `document` or `window`, the test run fails rather than passing against a DOM the
domain must not assume.

---

## Contributing

Line endings are normalised to LF via `.gitattributes`. Formatting is Prettier; run `pnpm format`
before committing. Commits follow Conventional Commits.

Before opening a PR: `pnpm verify`.

## Licence

Proprietary. All rights reserved. Not licensed for redistribution.
