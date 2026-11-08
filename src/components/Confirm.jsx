// One confirmation flow for every money movement:
//   prepare (bank validates)  ->  review summary  ->  fingerprint (or PIN)  ->  execute  ->  receipt
import React, { createContext, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, Check, X, Loader2, ShieldCheck, Delete } from 'lucide-react';
import { useStore } from '../store/Store.jsx';
import { BRAND } from '../config.js';
import { Sheet } from './ui.jsx';
import { verifyWithDevice } from './webauthn.js';

const Ctx = createContext(null);
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }) {
  const { bank, toast, state } = useStore();
  const nav = useNavigate();
  const [flow, setFlow] = useState(null); // { pending, phase, error }
  const [busy, setBusy] = useState(false);

  const start = async (op) => {
    if (busy) return null;
    setBusy(true);
    const res = await bank.prepare(op);
    setBusy(false);
    if (!res.ok) { toast(res.error, 'err'); return res; }
    setFlow({ pending: res, phase: 'review' });
    return res;
  };

  const close = () => { if (flow?.pending) bank.cancel(flow.pending.id); setFlow(null); };

  const onVerified = async (method) => {
    setFlow((f) => ({ ...f, phase: 'processing' }));
    const r = await bank.execute(flow.pending.id, { verified: true, method });
    if (!r.ok) { setFlow((f) => ({ ...f, phase: 'review', error: r.error })); return; }
    setFlow(null);
    try { navigator.vibrate?.(30); } catch { /* no haptics */ }
    nav('/receipt/' + r.receiptId, { replace: true });
  };

  // exposed for later voice/MCP integration
  if (typeof window !== 'undefined') window.__caspiaConfirm = { start, current: flow };

  return (
    <Ctx.Provider value={{ start, busy }}>
      {children}
      {busy && <div className="busybar" role="progressbar" aria-label="Checking with the bank" />}
      {flow && (
        <Sheet onClose={flow.phase === 'review' ? close : undefined}>
          {flow.phase === 'review' && <Review pending={flow.pending} error={flow.error} onConfirm={() => setFlow((f) => ({ ...f, phase: 'bio', error: null }))} onCancel={close} />}
          {flow.phase === 'bio' && <Biometric useDevice={state.settings.webauthn} credentialId={state.settings.webauthnId} onSuccess={onVerified} onCancel={() => setFlow((f) => ({ ...f, phase: 'review' }))} />}
          {flow.phase === 'processing' && (
            <div className="bio"><div className="bio-ring scanning"><Loader2 size={40} /></div><strong>Processing…</strong><span className="small muted">Talking to the bank</span></div>
          )}
        </Sheet>
      )}
    </Ctx.Provider>
  );
}

function Review({ pending, error, onConfirm, onCancel }) {
  return (
    <>
      <div className="between">
        <span className="eyebrow">{pending.title}</span>
        <button className="icon-btn" aria-label="Cancel" onClick={onCancel}><X size={20} /></button>
      </div>
      <p className="say" data-nav-id="confirm-summary">{pending.say}</p>
      <div className="block" style={{ gap: 0, padding: '4px 16px' }}>
        {pending.lines.map(([k, v]) => <div key={k} className="kv"><span>{k}</span><span className="num">{v}</span></div>)}
      </div>
      {error && <p className="hint err">{error}</p>}
      <div className="row tiny muted" style={{ gap: 6 }}><ShieldCheck size={14} /> Nothing is sent until you confirm with your fingerprint.</div>
      <button className="btn primary block" onClick={onConfirm} data-nav-id="confirm-fingerprint"><Fingerprint size={20} /> Confirm with fingerprint</button>
      <button className="btn block" onClick={onCancel} data-nav-id="confirm-cancel">Cancel</button>
    </>
  );
}

// Fingerprint step. Uses the device's real biometrics (WebAuthn) when enabled in Security,
// otherwise a simulated sensor: press and hold. "Use PIN" is always available.
export function Biometric({ onSuccess, onCancel, useDevice, credentialId, title = 'Confirm with fingerprint' }) {
  const [phase, setPhase] = useState('idle'); // idle | scanning | done | fail | pin
  const [hold, setHold] = useState(null);

  const finish = (method) => { setPhase('done'); setTimeout(() => onSuccess(method), 450); };

  const tryDevice = async () => {
    setPhase('scanning');
    const ok = await verifyWithDevice(credentialId);
    if (ok) finish('device biometrics');
    else setPhase('fail');
  };

  const down = () => {
    if (phase === 'scanning' || phase === 'done') return;
    if (useDevice && credentialId) { tryDevice(); return; }
    setPhase('scanning');
    setHold(setTimeout(() => finish('fingerprint'), 750));
  };
  const up = () => { if (hold && phase === 'scanning' && !(useDevice && credentialId)) { clearTimeout(hold); setPhase('idle'); } };

  if (phase === 'pin') return <PinConfirm onSuccess={() => onSuccess('PIN')} onBack={() => setPhase('idle')} />;

  return (
    <div className="bio">
      <strong style={{ fontSize: 18 }}>{title}</strong>
      <span className="small muted">{useDevice && credentialId ? 'Tap and use your device sensor' : 'Touch and hold the sensor'}</span>
      <button
        className={'bio-ring' + (phase === 'scanning' ? ' scanning' : phase === 'done' ? ' done' : phase === 'fail' ? ' fail' : '')}
        onPointerDown={down} onPointerUp={up} onPointerLeave={up}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && finish('fingerprint')}
        aria-label="Fingerprint sensor" data-nav-id="fingerprint-sensor"
      >
        {phase === 'done' ? <Check size={46} /> : <Fingerprint size={52} />}
      </button>
      <span className="small" style={{ minHeight: 18, color: phase === 'fail' ? 'var(--coral)' : 'var(--muted)' }}>
        {phase === 'scanning' ? 'Scanning…' : phase === 'done' ? 'Verified' : phase === 'fail' ? 'Not recognised. Try again or use your PIN.' : ' '}
      </span>
      <div className="row" style={{ gap: 10 }}>
        <button className="btn sm" onClick={() => setPhase('pin')}>Use PIN</button>
        <button className="btn sm" onClick={onCancel}>Back</button>
      </div>
    </div>
  );
}

function PinConfirm({ onSuccess, onBack }) {
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);
  const press = (d) => {
    if (d === 'del') return setPin((p) => p.slice(0, -1));
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      if (next === BRAND.demoPin) setTimeout(onSuccess, 200);
      else { setBad(true); setTimeout(() => { setBad(false); setPin(''); }, 450); }
    }
  };
  return (
    <div className="bio" style={{ gap: 10 }}>
      <strong style={{ fontSize: 18 }}>Enter your PIN</strong>
      <span className="tiny muted">Demo PIN: {BRAND.demoPin}</span>
      <div className={'dots' + (bad ? ' shake' : '')} role="status" aria-label={`${pin.length} of 4 digits entered`}>{[0, 1, 2, 3].map((i) => <i key={i} className={i < pin.length ? 'on' : ''} style={{ borderColor: 'var(--line)', background: i < pin.length ? 'var(--sea)' : 'transparent' }} />)}</div>
      <div className="keypad light" style={{ marginTop: 4 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => (
          k === '' ? <span key={i} /> : <button key={i} onClick={() => press(k)} aria-label={k === 'del' ? 'Delete' : k}>{k === 'del' ? <Delete size={22} /> : k}</button>
        ))}
      </div>
      <button className="btn sm" onClick={onBack}>Back</button>
    </div>
  );
}
