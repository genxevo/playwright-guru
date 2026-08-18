import React from 'react';
import ReactDOM from 'react-dom/client';
import { Panel } from './Panel';

const root = document.getElementById('root');
if (!root) throw new Error('DevTools panel root not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>
);
