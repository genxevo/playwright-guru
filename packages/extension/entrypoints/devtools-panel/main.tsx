import React from 'react';
import ReactDOM from 'react-dom/client';
import { Panel } from './Panel';
import { ErrorBoundary } from '../../src/ui/ErrorBoundary';
// WS2 · design-token foundation. Declares the --pg-* custom properties on
// :root for this surface; nothing here changes behaviour or layout.
import '../../src/ui/tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('DevTools panel root not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary surface="DevTools panel">
      <Panel />
    </ErrorBoundary>
  </React.StrictMode>
);
