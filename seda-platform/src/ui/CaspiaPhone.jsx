// The real Caspia customer app, embedded and driven by Seda.
import React, { useEffect } from 'react';
import { StoreProvider } from '../caspia/store/Store.jsx';
import CaspiaApp from '../caspia/App.jsx';
import { installProxy } from '../seda/engine/mcpProxy.js';
import '../caspia/styles.css';

export default function CaspiaPhone() {
  useEffect(() => installProxy(), []);
  return (
    <div className="sd-phone" aria-label="Caspia customer app (live)">
      <StoreProvider>
        <CaspiaApp />
      </StoreProvider>
    </div>
  );
}
