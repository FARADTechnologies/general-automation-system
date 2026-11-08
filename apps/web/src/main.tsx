import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { StoreProvider } from './app/store/Store.jsx';
import { Shell, ModeCtx } from './app/App.jsx';
import { hub, resolveSession } from './runtime/hub.ts';
import { registerDevice } from './app/confirm/BankConfirm.tsx';
import Stage from './stage/Stage.tsx';
import Console from './console/Console.tsx';
import './styles/app.css';
import './styles/runtime.css';
// designer refinements of core surfaces load after the runtime styles
import './styles/bank-confirm.css';
import './styles/agent.css';
import './styles/states.css';

function PhoneApp() {
  useEffect(() => { void registerDevice(hub.session); }, []);
  return (
    <ModeCtx.Provider value="phone">
      <div className="stage">
        <BrowserRouter basename="/app" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <StoreProvider><Shell /></StoreProvider>
        </BrowserRouter>
      </div>
    </ModeCtx.Provider>
  );
}

const path = window.location.pathname;
if (path.startsWith('/console')) {
  document.title = 'Caspia Bank · Console';
  createRoot(document.getElementById('root')!).render(<Console />);
} else if (!path.startsWith('/app') && !path.startsWith('/stage')) {
  const s = resolveSession();
  window.location.replace(`/app?s=${encodeURIComponent(s)}`);
} else {
  const session = resolveSession();
  hub.connect(session);
  document.title = path.startsWith('/stage') ? 'Caspia Bank · Stage' : 'Caspia Bank';
  createRoot(document.getElementById('root')!).render(path.startsWith('/stage') ? <Stage /> : <PhoneApp />);
}
