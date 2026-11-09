// The bank's own confirmation screen. Rendered only from the Bridge's prepared object (I6),
// and the decision goes from this screen straight to the Bridge with the device credential (I3).
// The agent is not in this path. Biometrics and PIN are mocked for the demo.
import React, { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, X, Check, Loader2, Hourglass } from 'lucide-react';
import { useUi, hub } from '../../runtime/hub.ts';
import { Biometric } from '../components/Confirm.jsx';
import { useMode } from '../App.jsx';
import { BRAND } from '../config.js';

interface View {
  id: string; title: string; level: 'none' | 'tap' | 'biometric'; risk: string;
  display: { key: string; label: string; value: string }[]; warnings: string[]; extraConfirmation: boolean;
  payloadHash: string; expiresAt: number; now: number; status: string;
}

let registered = '';
export async function registerDevice(session: string, force = false) {
  if (registered === session && !force) return;
  registered = session;
  await fetch('/bridge/device/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session }), credentials: 'same-origin' }).catch(() => { registered = ''; });
}

export default function BankConfirm() {
  const mode = useMode();
  const modal = useUi((s) => s.modal);
  const confirmId = modal?.kind === 'confirm' ? modal.confirmId : null;
  if (!confirmId) return null;
  if (mode !== 'phone') {
    return (
      <div className="bank-confirm-wait" role="status">
        <Hourglass size={28} />
        <strong>Waiting for customer confirmation</strong>
        <span>The bank's confirmation screen is open on the customer's phone.</span>
      </div>
    );
  }
  return <ConfirmScreen key={confirmId} id={confirmId} />;
}

function ConfirmScreen({ id }: { id: string }) {
  const [view, setView] = useState<View | null>(null);
  const [err, setErr] = useState('');
  const [phase, setPhase] = useState<'review' | 'auth' | 'sending' | 'done' | 'failed'>('review');
  const [ack, setAck] = useState(false);
  const [left, setLeft] = useState(120);

  useEffect(() => {
    let alive = true;
    (async () => {
      await registerDevice(hub.session);
      let r = await fetch(`/bridge/confirm/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
      let body = await r.json().catch(() => ({}));
      // The bank side may have restarted since this page registered the phone (for example after
      // a deployment). Register this phone for the session again and retry once, as a reload would.
      if (!r.ok && body.code !== 'EXPIRED') {
        await registerDevice(hub.session, true);
        r = await fetch(`/bridge/confirm/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
        body = await r.json().catch(() => ({}));
      }
      if (!alive) return;
      if (!r.ok) { setErr(body.code === 'EXPIRED' ? 'This request expired.' : 'This confirmation is not available on this device.'); return; }
      setView(body);
      setLeft(Math.max(0, Math.round((body.expiresAt - body.now) / 1000)));
    })();
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!view) return;
    const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [view]);

  const decide = async (decision: 'approve' | 'deny', method?: string) => {
    if (!view) return;
    setPhase('sending');
    const proof = method === 'PIN' ? { method: 'pin', pin: BRAND.demoPin } : { method: 'biometric', assertion: 'mock-biometric-ok' };
    const r = await fetch(`/bridge/confirm/${encodeURIComponent(id)}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision, payload_hash: view.payloadHash, proof: decision === 'approve' ? proof : undefined, acknowledge_warning: ack }),
    });
    const body = await r.json().catch(() => ({}));
    if (decision === 'deny') { setPhase('done'); return; }
    if (r.ok && body.status === 'committed' && body.verified) setPhase('done');
    else { setPhase('failed'); setErr(body.error?.message || (body.code === 'EXPIRED' ? 'This request expired.' : 'The bank could not complete this.')); }
  };

  const approve = () => (view?.level === 'biometric' ? setPhase('auth') : decide('approve'));

  return (
    <div className="bank-confirm" role="dialog" aria-modal="true" aria-label="Bank confirmation">
      <div className="bank-confirm-head">
        <span className="bank-confirm-brand"><ShieldCheck size={18} /> {BRAND.full} · secure confirmation</span>
        {phase === 'review' && <button className="icon-btn" aria-label="Cancel" data-nav-id="confirm-cancel" onClick={() => decide('deny')}><X size={20} /></button>}
      </div>

      {!view && !err && <div className="bank-confirm-body center"><Loader2 className="spin" size={28} /></div>}
      {err && phase !== 'failed' && <div className="bank-confirm-body center"><p className="hint err">{err}</p></div>}

      {view && phase === 'review' && (
        <div className="bank-confirm-body">
          <span className="eyebrow">{view.title}</span>
          <dl className="bank-confirm-rows">
            {view.display.map((d) => (
              <div key={d.key} className={'bank-confirm-row k-' + d.key}><dt>{d.label}</dt><dd className="num">{d.value}</dd></div>
            ))}
          </dl>
          {view.warnings.map((w) => <p key={w} className="bank-confirm-warn"><AlertTriangle size={16} /> {w}</p>)}
          {view.extraConfirmation && (
            <label className="bank-confirm-ack"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} data-nav-id="confirm-ack" /> I checked the recipient and the amount.</label>
          )}
          <p className="tiny muted bank-confirm-expiry">Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}. Nothing is sent until you confirm.</p>
          <button className="btn primary block" disabled={left === 0 || (view.extraConfirmation && !ack)} onClick={approve} data-nav-id="confirm-approve">
            {view.level === 'biometric' ? 'Confirm with fingerprint' : 'Confirm'}
          </button>
          <button className="btn block" onClick={() => decide('deny')} data-nav-id="confirm-deny">Cancel</button>
        </div>
      )}

      {view && phase === 'auth' && (
        <div className="bank-confirm-body">
          <Biometric title="Confirm with fingerprint" useDevice={false} credentialId={null} onSuccess={(m: string) => decide('approve', m)} onCancel={() => setPhase('review')} />
          <p className="tiny muted center">Demo: the fingerprint and PIN are simulated.</p>
        </div>
      )}

      {phase === 'sending' && <div className="bank-confirm-body center"><Loader2 className="spin" size={28} /><span>Sending to the bank…</span></div>}
      {phase === 'done' && <div className="bank-confirm-body center"><Check size={34} /><strong>Done</strong></div>}
      {phase === 'failed' && (
        <div className="bank-confirm-body center">
          <AlertTriangle size={30} /><strong>Not completed</strong><p className="hint err">{err}</p>
          <button className="btn block" onClick={() => hub.intent({ type: 'modal.close' })}>Close</button>
        </div>
      )}
    </div>
  );
}
