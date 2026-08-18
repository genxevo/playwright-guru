import React from 'react';
import ReactDOM from 'react-dom/client';
import { SidePanel } from './SidePanel';

const root = document.getElementById('root');
if (!root) throw new Error('Side panel root not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
