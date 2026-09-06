import React from 'react';
import ReactDOM from 'react-dom/client';
import { SidePanel } from './SidePanel';
import { ErrorBoundary } from '../../src/ui/ErrorBoundary';
// WS2 · design-token foundation. Declares the --pg-* custom properties on
// :root for this surface; nothing here changes behaviour or layout.
import '../../src/ui/tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('Side panel root not found');

// WS2 item 5 — dev-only primitive showcase. Reached via ?showcase=1 in a DEV
// build only: the `import.meta.env.DEV` guard lets Vite dead-code-eliminate the
// whole branch (and the dynamic import) from the PRODUCTION bundle, so it adds
// nothing to the shipped product and never affects normal panel behaviour.
const showcase =
  import.meta.env.DEV && new URLSearchParams(location.search).get('showcase') === '1';

if (showcase) {
  void import('../../src/ui/showcase').then(({ Showcase }) => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <Showcase />
      </React.StrictMode>
    );
  });
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary surface="side panel">
        <SidePanel />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
