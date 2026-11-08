import React, { useState } from 'react';
import { ShieldCheck, Lock, KeyRound } from 'lucide-react';
import { useSeda } from '../seda/store.jsx';
import { Wave } from '../ui/Layout.jsx';

export default function Login() {
  const { mutate } = useSeda();
  const [email, setEmail] = useState('nigar.admin@caspiabank.demo');
  const [pw, setPw] = useState('demo-password');
  const [err, setErr] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!email.includes('@') || pw.length < 4) { setErr('Enter your work email and password.'); return; }
    mutate((s) => { s.user = { name: 'Nigar Aliyeva', email, role: 'Admin', bank: 'Caspia Bank' }; });
  };
  return (
    <main className="sd sd-login">
      <section className="sd-login-art">
        <div className="sd-row" style={{ gap: 10, fontWeight: 700, fontSize: 20 }}>
          <span className="sd-brand-mark"><Wave /></span> Seda
        </div>
        <div className="sd-stack" style={{ gap: 18 }}>
          <div className="sd-wave" aria-hidden="true">
            {[0.5, 0.8, 1, 0.6, 0.9, 0.4, 0.7, 1, 0.5, 0.8, 0.6, 0.9, 0.45].map((h, i) => <i key={i} style={{ height: `${h * 100}%`, animationDelay: `${i * 0.09}s` }} />)}
          </div>
          <h2>Voice banking your customers can trust.</h2>
          <p>Seda lets a bank add voice journeys to its own app and decide how they behave. The app carries out each step on screen, and nothing is paid until the customer confirms with a fingerprint. Every action is logged.</p>
        </div>
        <div className="sd-row tiny" style={{ color: 'var(--sd-ink-muted)', gap: 16, flexWrap: 'wrap' }}>
          <span className="sd-row" style={{ gap: 6 }}><ShieldCheck size={14} /> AI never moves money</span>
          <span className="sd-row" style={{ gap: 6 }}><Lock size={14} /> Bank data stays behind MCP</span>
          <span className="sd-row" style={{ gap: 6 }}><KeyRound size={14} /> Fingerprint-signed operations</span>
        </div>
      </section>
      <div className="sd-login-form">
        <form onSubmit={submit} noValidate>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 650 }}>Sign in to Seda</h1>
            <p className="muted" style={{ marginTop: 6 }}>Partner console for Caspia Bank</p>
          </div>
          <div className="sd-stack" style={{ gap: 6 }}>
            <label className="sd-label" htmlFor="email">Work email</label>
            <input id="email" className="sd-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div className="sd-stack" style={{ gap: 6 }}>
            <label className="sd-label" htmlFor="pw">Password</label>
            <input id="pw" type="password" className="sd-input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          </div>
          {err && <div className="sd-banner bad">{err}</div>}
          <button className="sd-btn primary lg" type="submit" data-sd="sign-in">Sign in</button>
          <button className="sd-btn lg" type="button" onClick={submit}>Continue with bank SSO</button>
          <p className="tiny muted" style={{ textAlign: 'center' }}>Demo account is pre-filled. All data is fictional.</p>
        </form>
      </div>
    </main>
  );
}
