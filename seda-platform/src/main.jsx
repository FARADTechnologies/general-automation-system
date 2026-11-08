import React from 'react';
import { createRoot } from 'react-dom/client';
import { SedaProvider } from './seda/store.jsx';
import SedaApp from './SedaApp.jsx';
import './seda.css';

window.__CASPIA_EMBED = true; // the embedded customer app starts unlocked inside the console
document.body.classList.add('sd-body');

createRoot(document.getElementById('root')).render(
  <SedaProvider>
    <SedaApp />
  </SedaProvider>,
);
