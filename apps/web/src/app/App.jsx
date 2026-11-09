// App shell for the customer's mobile bank. Same tree renders on the phone ("phone" mode)
// and inside the presentation mirror ("mirror" mode). Route, form values and overlays come
// from the session hub, so both screens always show the same thing.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Home as HomeIco, ArrowLeftRight, Receipt, History as HistIco, LayoutGrid, Signal, BatteryFull, CheckCircle2, AlertCircle } from 'lucide-react';
import { useStore } from './store/Store.jsx';
import { ConfirmProvider } from './components/Confirm.jsx';
import { SCREENS } from './screens/index.jsx';
import { CORE_SCREENS } from './core-screens/index.jsx';
import HandoffNotice from './components/HandoffNotice.tsx';
import { RouteSync, TapLayer, HighlightLayer } from '../runtime/sync.tsx';
import AgentDock from './agent/AgentDock.tsx';
import Chooser from './agent/Chooser.tsx';
import BankConfirm from './confirm/BankConfirm.tsx';

export const ModeCtx = createContext('phone');
export const useMode = () => useContext(ModeCtx);

const TABS = [
  ['/', 'Home', HomeIco],
  ['/payments', 'Payments', Receipt],
  ['/transfers', 'Transfers', ArrowLeftRight],
  ['/history', 'History', HistIco],
  ['/more', 'More', LayoutGrid],
];
const TAB_ROOTS = TABS.map((t) => t[0]);

function Clock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 15000); return () => clearInterval(i); }, []);
  return <span className="num">{t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>;
}

function TabBar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { state } = useStore();
  const unread = state.notifications.filter((n) => !n.read).length;
  const active = (p) => (p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p));
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(([path, label, Icon]) => (
        <button key={path} className={'tab' + (active(path) ? ' on' : '')} onClick={() => nav(path)} data-nav-id={'tab-' + label.toLowerCase()} aria-current={active(path) ? 'page' : undefined}>
          <span className="dot"><Icon size={22} strokeWidth={active(path) ? 2.4 : 1.9} />{path === '/more' && unread > 0 && <span className="badge">{unread}</span>}</span>
          {label}
        </button>
      ))}
    </nav>
  );
}

export function Wave({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /><path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
    </svg>
  );
}

const ROUTES = [...CORE_SCREENS, ...SCREENS.filter(([p]) => !CORE_SCREENS.some(([c]) => c === p))];

export function Shell() {
  const { state } = useStore();
  const mode = useMode();
  const loc = useLocation();
  const root = useRef(null);
  const showTabs = TAB_ROOTS.includes(loc.pathname);
  const onInk = loc.pathname === '/';
  // The phone opens in the light theme even when the device is in dark mode; the customer can
  // still switch to dark in Settings. The projector mirror leaves the stage's own theme alone.
  useEffect(() => {
    if (mode === 'phone') document.documentElement.dataset.theme = state.settings.dark ? 'dark' : 'light';
  }, [mode, state.settings.dark]);

  return (
    <div ref={root} className={'app' + (state.settings.dark ? ' dark' : '') + (onInk ? ' on-ink' : '') + (mode === 'mirror' ? ' mirror' : '')}>
      <RouteSync />
      <TapLayer root={root} />
      <HighlightLayer root={root} />
      <ConfirmProvider>
        <div className="statusbar"><Clock /><span className="sb-right"><Signal size={14} /> 5G <BatteryFull size={18} /></span></div>
        {state.loading || !state.accounts.length ? (
          <main className="screen" style={{ alignItems: 'center', justifyContent: 'center' }} aria-busy="true">
            <span className="logo-mark" style={{ opacity: 0.7 }}><Wave size={28} /></span>
            <span className="small muted">{state.loadError ? 'Cannot reach the bank. Retrying…' : 'Loading your accounts…'}</span>
          </main>
        ) : (
          <Routes location={loc}>
            {ROUTES.map(([path, Comp]) => <Route key={path} path={path} element={<Comp />} />)}
          </Routes>
        )}
        <AgentDock withTabs={showTabs} />
        {showTabs && <TabBar />}
        {state.toast && (
          <div className={'toast ' + state.toast.kind} role="status">
            {state.toast.kind === 'err' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}{state.toast.text}
          </div>
        )}
        <Chooser />
        <HandoffNotice />
        <BankConfirm />
      </ConfirmProvider>
    </div>
  );
}
