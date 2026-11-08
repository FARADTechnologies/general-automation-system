import React, { useEffect, useState } from 'react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Home as HomeIco, ArrowLeftRight, Receipt, History as HistIco, LayoutGrid, Signal, BatteryFull, Fingerprint, Delete, CheckCircle2, AlertCircle } from 'lucide-react';
import { useStore } from './store/Store.jsx';
import { ConfirmProvider, Biometric } from './components/Confirm.jsx';
import { BRAND } from './config.js';
import { SCREENS } from './screens/index.jsx';

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

function Lock() {
  const { state, mutate } = useStore();
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);
  const [bio, setBio] = useState(false);
  const unlock = () => mutate((s) => { s.session.locked = false; });
  const press = (d) => {
    if (d === 'del') return setPin((p) => p.slice(0, -1));
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      if (next === BRAND.demoPin) setTimeout(unlock, 180);
      else { setBad(true); setTimeout(() => { setBad(false); setPin(''); }, 450); }
    }
  };
  if (bio) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Unlock Caspia Bank" className="lock" style={{ background: 'var(--bg)', color: 'var(--text)', justifyContent: 'center' }}>
        <Biometric title="Log in with fingerprint" useDevice={state.settings.webauthn} credentialId={state.settings.webauthnId} onSuccess={unlock} onCancel={() => setBio(false)} />
      </div>
    );
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Unlock Caspia Bank" className="lock">
      <div className="logo"><span className="logo-mark"><Wave /></span>{BRAND.name}</div>
      <p style={{ opacity: 0.8 }}>Welcome back, {state.user.firstName}</p>
      <div className={'dots' + (bad ? ' shake' : '')} role="status" aria-label={`${pin.length} of 4 digits entered`}>{[0, 1, 2, 3].map((i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}</div>
      <span className="tiny" style={{ opacity: 0.6 }}>Demo PIN: {BRAND.demoPin}</span>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].map((k) => (
          <button key={k} onClick={() => (k === 'bio' ? state.settings.biometrics && setBio(true) : press(k))} aria-label={k === 'bio' ? 'Use fingerprint' : k === 'del' ? 'Delete' : k} data-nav-id={'pin-' + k}>
            {k === 'bio' ? <Fingerprint size={28} /> : k === 'del' ? <Delete size={24} /> : k}
          </button>
        ))}
      </div>
      <button className="small" style={{ opacity: 0.7, marginTop: 6 }}>Forgot PIN?</button>
    </div>
  );
}

export function Wave({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /><path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
    </svg>
  );
}

function Shell() {
  const { state } = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const showTabs = TAB_ROOTS.includes(loc.pathname);
  const onInk = loc.pathname === '/' && !state.session.locked;

  // Auto-lock after 5 minutes without interaction, like a real banking app.
  const { mutate } = useStore();
  useEffect(() => {
    let t;
    const arm = () => { clearTimeout(t); t = setTimeout(() => mutate((s) => { s.session.locked = true; }), 5 * 60 * 1000); };
    arm();
    ['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, arm));
    return () => { clearTimeout(t); ['pointerdown', 'keydown'].forEach((e) => window.removeEventListener(e, arm)); };
  }, []); // eslint-disable-line

  // Integration hook for the future voice navigator / MCP bridge.
  useEffect(() => { window.caspia = { ...(window.caspia || {}), navigate: nav, path: loc.pathname }; }, [nav, loc.pathname]);

  return (
    <div className={'app' + (state.settings.dark ? ' dark' : '') + (onInk ? ' on-ink' : '')}>
      <ConfirmProvider>
      <div className="statusbar"><Clock /><span className="sb-right"><Signal size={14} /> 5G <BatteryFull size={18} /></span></div>
      <Routes location={loc}>
        {SCREENS.map(([path, Comp]) => <Route key={path} path={path} element={<Comp />} />)}
      </Routes>
      {showTabs && <TabBar />}
      {state.toast && (
        <div className={'toast ' + state.toast.kind} role="status">
          {state.toast.kind === 'err' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}{state.toast.text}
        </div>
      )}
      {state.session.locked && <Lock />}
      </ConfirmProvider>
    </div>
  );
}

export default function App() {
  const { getState, bank } = useStore();
  useEffect(() => { window.caspia = { ...(window.caspia || {}), bank, getState }; }, []); // eslint-disable-line
  return (
    <div className="stage">
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Shell />
      </MemoryRouter>
    </div>
  );
}
