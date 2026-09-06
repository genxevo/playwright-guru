/**
 * Primitive showcase — DEV ONLY (WS2 item 5).
 * ===========================================
 *
 * A single page that renders every shared primitive (items 3–4) so a developer
 * can eyeball appearance and exercise keyboard/AT behaviour. It is reached only
 * via `?showcase=1` on the side-panel URL, and only in a dev build: the
 * side-panel entrypoint gates the dynamic import behind `import.meta.env.DEV`,
 * so Vite dead-code-eliminates this module from the PRODUCTION bundle entirely
 * (verified: zero production bytes; `test/showcase.test.ts` pins the gate).
 *
 * It therefore adds nothing to the shipped product and cannot change normal
 * panel behaviour. Styling reuses the primitives as-is (no redesign).
 */
import { useState, type ReactNode } from 'react';

import {
  AddButton,
  CopyButton,
  NARow,
  Tabs,
  UnverifiedNotice,
  tabPanelProps,
  type TabItem,
} from './primitives';

const DEMO_TABS: ReadonlyArray<TabItem<'core' | 'attr' | 'text'>> = [
  { id: 'core', label: 'Core' },
  { id: 'attr', label: 'Attributes' },
  { id: 'text', label: 'Text' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px', color: '#1e293b' }}>
        {title}
      </h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {children}
      </div>
    </section>
  );
}

/** Dev-only visual/accessibility showcase of the shared primitives. */
export function Showcase() {
  const [tab, setTab] = useState<'core' | 'attr' | 'text'>('core');
  const noop = () => {};
  return (
    <main
      style={{
        padding: 16,
        fontFamily: 'var(--pg-font-sans)',
        fontSize: 'var(--pg-font-size-base)',
        color: '#1e293b',
        background: '#f8fafc',
        minHeight: '100%',
      }}
    >
      <h1 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>
        Playwright Guru — Primitives
      </h1>
      <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 16px' }}>
        Dev-only showcase (<code>?showcase=1</code>). Not part of the shipped product.
      </p>

      <Section title="Buttons">
        <CopyButton text="body > .example" />
        <AddButton code="page.getByRole('button')" action="click" lang="javascript" onAdd={noop} />
      </Section>

      <Section title="Unverified notice">
        <div style={{ width: '100%' }}>
          <UnverifiedNotice />
        </div>
      </Section>

      <Section title="N/A row">
        <div style={{ width: '100%' }}>
          <NARow label="getByRole" reason="No ARIA role detected." />
        </div>
      </Section>

      <Section title="Tabs (WAI-ARIA)">
        <div style={{ width: '100%' }}>
          <Tabs
            tabs={DEMO_TABS}
            active={tab}
            onSelect={setTab}
            accent="#2563eb"
            idBase="showcase-tabs"
            ariaLabel="Demo category"
          />
          <div
            {...tabPanelProps('showcase-tabs', tab)}
            style={{ padding: 12, fontSize: 11, color: '#475569' }}
          >
            Panel content for “{tab}”. Use ← → Home End to move between tabs.
          </div>
        </div>
      </Section>
    </main>
  );
}
