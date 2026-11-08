import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Landmark, PiggyBank, Gift, Repeat, Bell, User, ShieldCheck, Settings as SettingsI, MapPin, LifeBuoy, LogOut, Fingerprint, KeyRound, Smartphone, Moon, Globe, RotateCcw, AlertTriangle, CheckCircle2, Info, Phone, Mail, Send, BarChart3, QrCode, ChevronRight, Copy, Navigation } from 'lucide-react';
import { useStore, money, fmtDate } from '../store/Store.jsx';
import { BRAND } from '../config.js';
import { Header, Li, Toggle, Seg, Avatar, Sheet } from '../components/ui.jsx';
import { registerDevice, webauthnAvailable } from '../components/webauthn.js';

export default function More() {
  const { state, mutate } = useStore();
  const nav = useNavigate();
  const unread = state.notifications.filter((n) => !n.read).length;
  return (
    <section className="screen screen-enter">
      <div className="hdr" style={{ gridTemplateColumns: '1fr' }}><h1 style={{ textAlign: 'left', fontSize: 24, paddingLeft: 4 }}>More</h1></div>
      <button className="block" style={{ flexDirection: 'row', alignItems: 'center', textAlign: 'left' }} onClick={() => nav('/profile')} data-nav-id="profile">
        <Avatar name={`${state.user.firstName} ${state.user.lastName}`} color="var(--ink)" size="lg" />
        <span className="grow"><strong style={{ fontSize: 17, display: 'block' }}>{state.user.firstName} {state.user.lastName}</strong><span className="small muted">{state.user.phone}</span></span>
        <span className="pill amber">{state.user.segment}</span>
      </button>

      <div className="sec-title"><h2>Products</h2></div>
      <div className="block flush">
        <Li id="menu-cards" icon={<CreditCard size={19} />} title="Cards" sub={`${state.cards.length} cards`} onClick={() => nav('/cards')} />
        <Li id="menu-loans" icon={<Landmark size={19} />} title="Loans & installments" sub={`${money(state.loans[0].remaining)} left on cash loan`} onClick={() => nav('/loans')} />
        <Li id="menu-deposits" icon={<PiggyBank size={19} />} title="Deposits" sub={`${state.deposits.length} active`} onClick={() => nav('/deposits')} />
        <Li id="menu-cashback" icon={<Gift size={19} />} title="Cashback & offers" sub={`${money(state.cashback.balance)} available`} onClick={() => nav('/cashback')} />
        <Li id="menu-exchange" icon={<Repeat size={19} />} title="Currency exchange" sub="USD · EUR · GBP · RUB · TRY" onClick={() => nav('/exchange')} />
        <Li id="menu-analytics" icon={<BarChart3 size={19} />} title="Spending analytics" onClick={() => nav('/analytics')} />
        <Li id="menu-qr" icon={<QrCode size={19} />} title="QR payments" onClick={() => nav('/qr')} />
      </div>

      <div className="sec-title"><h2>Account</h2></div>
      <div className="block flush">
        <Li id="menu-notifications" icon={<Bell size={19} />} title="Notifications" right={unread ? <span className="badge" style={{ position: 'static' }}>{unread}</span> : null} onClick={() => nav('/notifications')} />
        <Li id="menu-security" icon={<ShieldCheck size={19} />} title="Security" sub="Fingerprint, PIN, devices" onClick={() => nav('/security')} />
        <Li id="menu-settings" icon={<SettingsI size={19} />} title="Settings" sub="Appearance, language, demo" onClick={() => nav('/settings')} />
        <Li id="menu-branches" icon={<MapPin size={19} />} title="Branches & ATMs" onClick={() => nav('/branches')} />
        <Li id="menu-support" icon={<LifeBuoy size={19} />} title="Help & support" sub={`24/7 · ${BRAND.callCenter}`} onClick={() => nav('/support')} />
      </div>
      <button className="btn block danger" onClick={() => { mutate((s) => { s.session.locked = true; }); nav('/'); }} data-nav-id="logout"><LogOut size={18} /> Log out</button>
      <p className="tiny muted" style={{ textAlign: 'center' }}>{BRAND.full} · demo app · v1.0</p>
    </section>
  );
}

export function Notifications() {
  const { state, bank } = useStore();
  useEffect(() => { const t = setTimeout(() => bank.readAll(), 1500); return () => clearTimeout(t); }, []); // eslint-disable-line
  const icon = { warning: <AlertTriangle size={18} color="#b7791f" />, success: <CheckCircle2 size={18} color="var(--sea)" />, info: <Info size={18} color="#3b82f6" />, security: <ShieldCheck size={18} color="var(--coral)" /> };
  return (
    <section className="screen no-tabs screen-enter">
      <Header title="Notifications" right={<button className="link" onClick={() => bank.readAll()}>Read all</button>} />
      <div className="block flush">
        {state.notifications.map((n) => (
          <div key={n.id} className="li" style={{ alignItems: 'flex-start' }}>
            <span className="li-ico">{icon[n.type]}</span>
            <span className="li-main">
              <span className="row" style={{ gap: 8 }}><span className="li-title" style={{ whiteSpace: 'normal' }}>{n.title}</span>{!n.read && <span className="tag-new" />}</span>
              <span className="small muted" style={{ lineHeight: 1.4 }}>{n.body}</span>
              <span className="tiny muted">{fmtDate(n.date)}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Profile() {
  const { state, toast } = useStore();
  const u = state.user;
  const acc = state.accounts;
  return (
    <section className="screen no-tabs screen-enter">
      <Header title="Profile" />
      <div className="stack" style={{ alignItems: 'center', gap: 8, padding: '8px 0' }}>
        <Avatar name={`${u.firstName} ${u.lastName}`} color="var(--ink)" size="lg" />
        <h2 style={{ fontSize: 22 }}>{u.firstName} {u.lastName}</h2>
        <span className="pill amber">{u.segment} customer since {u.customerSince}</span>
      </div>
      <div className="block" style={{ gap: 0, padding: '4px 16px' }}>
        {[['Phone', u.phone], ['Email', u.email], ['Date of birth', u.birth], ['ID (FIN)', u.fin], ['Address', u.address]].map(([k, v]) => <div key={k} className="kv"><span>{k}</span><span>{v}</span></div>)}
      </div>
      <div className="sec-title"><h2>Account details</h2></div>
      <div className="block flush">
        {acc.map((a) => (
          <Li key={a.id} icon={<span style={{ fontWeight: 800, fontSize: 12 }}>{a.currency}</span>} title={a.name} sub={a.iban} right={<Copy size={16} />} chevron={false}
            onClick={() => { navigator.clipboard?.writeText(a.iban).catch(() => {}); toast('IBAN copied'); }} />
        ))}
      </div>
      <p className="tiny muted" style={{ textAlign: 'center' }}>To change personal data, visit a branch with your ID card.</p>
    </section>
  );
}

export function Security() {
  const { state, bank, toast } = useStore();
  const [canDevice, setCanDevice] = useState(false);
  const [pinSheet, setPinSheet] = useState(false);
  useEffect(() => { webauthnAvailable().then(setCanDevice); }, []);
  const enableDevice = async (v) => {
    if (!v) { bank.setSetting('webauthn', false); toast('Device biometrics off. The demo sensor will be used.'); return; }
    const id = await registerDevice();
    if (id) { bank.setSetting('webauthnId', id); bank.setSetting('webauthn', true); toast('Device fingerprint linked'); }
    else toast('This browser could not use the device sensor. The demo sensor stays on.', 'err');
  };
  return (
    <section className="screen no-tabs screen-enter">
      <Header title="Security" />
      <div className="block" style={{ flexDirection: 'row', gap: 12, alignItems: 'center', background: 'color-mix(in srgb, var(--sea) 10%, var(--surface))', boxShadow: 'none' }}>
        <ShieldCheck size={26} color="var(--sea)" />
        <span className="small">Every payment needs your fingerprint or PIN. Caspia will never ask for your PIN, CVV or SMS codes by phone.</span>
      </div>
      <div className="block flush">
        <div className="li">
          <span className="li-ico"><Fingerprint size={19} /></span>
          <span className="li-main"><span className="li-title">Log in with fingerprint</span><span className="li-sub">Instead of typing your PIN</span></span>
          <Toggle id="bio-login" label="Log in with fingerprint" checked={state.settings.biometrics} onChange={(v) => bank.setSetting('biometrics', v)} />
        </div>
        <div className="li">
          <span className="li-ico"><Smartphone size={19} /></span>
          <span className="li-main"><span className="li-title">Use this device’s real sensor</span><span className="li-sub">{canDevice ? 'Touch ID, Windows Hello or Android fingerprint' : 'Not available in this browser'}</span></span>
          <Toggle id="bio-device" label="Use device sensor" checked={state.settings.webauthn} onChange={enableDevice} />
        </div>
        <Li icon={<KeyRound size={19} />} title="Change app PIN" onClick={() => setPinSheet(true)} />
      </div>
      <div className="sec-title"><h2>Signed-in devices</h2></div>
      <div className="block flush">
        {state.devices.map((d) => (
          <div key={d.id} className="li">
            <span className="li-ico"><Smartphone size={19} /></span>
            <span className="li-main"><span className="li-title">{d.name}</span><span className="li-sub">{d.place} · {d.last}</span></span>
            {d.current ? <span className="pill green">This device</span> : <button className="btn sm danger" onClick={() => { bank.removeDevice(d.id); toast(`${d.name} signed out`); }}>Sign out</button>}
          </div>
        ))}
      </div>
      {pinSheet && (
        <Sheet onClose={() => setPinSheet(false)}>
          <h2>Change app PIN</h2>
          <p className="muted small">In this demo the PIN stays {BRAND.demoPin} so anyone can try the app.</p>
          <button className="btn primary block" onClick={() => setPinSheet(false)}>OK</button>
        </Sheet>
      )}
    </section>
  );
}

export function Settings() {
  const { state, bank, reset, toast } = useStore();
  const s = state.settings;
  return (
    <section className="screen no-tabs screen-enter">
      <Header title="Settings" />
      <div className="block flush">
        <div className="li"><span className="li-ico"><Moon size={19} /></span><span className="li-main"><span className="li-title">Dark mode</span></span><Toggle id="dark" label="Dark mode" checked={s.dark} onChange={(v) => bank.setSetting('dark', v)} /></div>
        <div className="li"><span className="li-ico"><Bell size={19} /></span><span className="li-main"><span className="li-title">Push notifications</span><span className="li-sub">Payments, offers, security</span></span><Toggle id="push" label="Push notifications" checked={s.notifications} onChange={(v) => bank.setSetting('notifications', v)} /></div>
        <div className="li"><span className="li-ico"><Globe size={19} /></span><span className="li-main"><span className="li-title">Language</span></span><span className="muted small">English</span></div>
      </div>
      <div className="sec-title"><h2>Demo</h2></div>
      <div className="block flush">
        <Li icon={<RotateCcw size={19} />} title="Reset demo data" sub="Restore balances, cards and history" onClick={() => { reset(); toast('Demo data restored'); }} />
      </div>
      <p className="tiny muted" style={{ textAlign: 'center' }}>All data in this app is fictional. No real money moves.</p>
    </section>
  );
}

export function Branches() {
  const { state } = useStore();
  const [type, setType] = useState('all');
  const list = state.branches.filter((b) => type === 'all' || b.type === type).sort((a, b) => a.distance - b.distance);
  const pos = [[22, 40], [64, 28], [42, 62], [78, 66], [12, 18], [88, 14]];
  return (
    <section className="screen no-tabs screen-enter">
      <Header title="Branches & ATMs" />
      <div className="map" role="img" aria-label="Map of nearby branches">
        {state.branches.map((b, i) => (type === 'all' || b.type === type) && <span key={b.id} className={'pin' + (b.type === 'atm' ? ' atm' : '')} style={{ left: pos[i][0] + '%', top: pos[i][1] + '%' }}><i /></span>)}
        <span style={{ position: 'absolute', left: '48%', top: '46%', width: 16, height: 16, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 0 6px rgba(59,130,246,.25)' }} />
      </div>
      <Seg value={type} onChange={setType} options={[['all', 'All'], ['branch', 'Branches'], ['atm', 'ATMs']]} />
      <div className="block flush">
        {list.map((b) => (
          <Li key={b.id} icon={b.type === 'atm' ? <CreditCard size={19} /> : <Landmark size={19} />} title={b.name} sub={`${b.address} · ${b.hours}`} right={`${b.distance} km`} rightSub={<span className="row" style={{ gap: 3 }}><Navigation size={11} /> Route</span>} chevron={false} />
        ))}
      </div>
    </section>
  );
}

const FAQ = [
  ['How do I block a lost card?', 'Open the card and tap Freeze. Payments stop immediately. Call *0000 to block it permanently and order a new one.'],
  ['What does a transfer to another bank cost?', 'Transfers to Caspia cards are free. To other banks: 0.5%, minimum 0.30 AZN.'],
  ['How long does a SWIFT transfer take?', '1–3 business days. The fee is 0.2%, minimum 15 AZN.'],
  ['When is cashback paid?', 'Cashback appears within 3 days after the purchase. Move it to your card any time from Cashback.'],
  ['How do I change my card PIN?', 'At any Caspia ATM, or open the card → PIN → Change PIN to get a one-time code by SMS.'],
];

export function Support() {
  const [open, setOpen] = useState(null);
  const [msgs, setMsgs] = useState([{ me: false, text: 'Hi Leyla! How can we help you today?' }]);
  const [text, setText] = useState('');
  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setMsgs((m) => [...m, { me: true, text }]);
    setText('');
    setTimeout(() => setMsgs((m) => [...m, { me: false, text: 'Thanks! An operator will reply in about 2 minutes. (demo)' }]), 700);
  };
  return (
    <section className="screen no-tabs screen-enter">
      <Header title="Help & support" />
      <div className="grid2">
        <div className="block" style={{ gap: 6 }}><Phone size={20} color="var(--sea)" /><strong>Call us</strong><span className="small muted num">{BRAND.callCenter} · 24/7</span></div>
        <div className="block" style={{ gap: 6 }}><Mail size={20} color="var(--sea)" /><strong>Email</strong><span className="small muted">{BRAND.email}</span></div>
      </div>
      <div className="sec-title"><h2>Frequent questions</h2></div>
      <div className="block flush">
        {FAQ.map(([q, a], i) => (
          <div key={q}>
            <button className="li" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <span className="li-main"><span className="li-title" style={{ whiteSpace: 'normal' }}>{q}</span></span>
              <ChevronRight size={18} className="chev" style={{ transform: open === i ? 'rotate(90deg)' : 'none', transition: '.2s' }} />
            </button>
            {open === i && <p className="small muted" style={{ padding: '0 16px 14px', lineHeight: 1.5 }}>{a}</p>}
          </div>
        ))}
      </div>
      <div className="sec-title"><h2>Chat with us</h2></div>
      <div className="block">
        <div className="chat">{msgs.map((m, i) => <div key={i} className={'bubble ' + (m.me ? 'me' : 'them')}>{m.text}</div>)}</div>
        <form className="row" onSubmit={send}>
          <input id="chat-input" className="input" placeholder="Type a message" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn primary" type="submit" aria-label="Send"><Send size={18} /></button>
        </form>
      </div>
    </section>
  );
}
