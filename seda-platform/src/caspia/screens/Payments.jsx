import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Smartphone, Zap, Wifi, Landmark, GraduationCap, Bus, Search, Check, Loader2, QrCode, ScanLine, Store, Star, Info, Droplets, Flame, Thermometer, Phone, Tv, Car, School, TrainFront, ParkingSquare } from 'lucide-react';
import { useStore, money } from '../store/Store.jsx';
import { Header, Li, AmountInput, CardPicker, Seg } from '../components/ui.jsx';
import { useConfirm } from '../components/Confirm.jsx';

const GROUP_ICONS = { smartphone: Smartphone, zap: Zap, wifi: Wifi, landmark: Landmark, 'graduation-cap': GraduationCap, bus: Bus };
const LOGO_COLORS = { azercell: '#6d28d9', bakcell: '#dc2626', nar: '#ea580c', azerishiq: '#eab308', azersu: '#0284c7', azeriqaz: '#2563eb', azeristilik: '#e11d48', citynet: '#0f766e', aztelekom: '#1d4ed8', ktv: '#7c3aed', fines: '#334155', tax: '#475569', university: '#0369a1', school: '#15803d', metrocard: '#b91c1c', parking: '#0f2a33' };

const LOGO_ICONS = { azerishiq: Zap, azersu: Droplets, azeriqaz: Flame, azeristilik: Thermometer, citynet: Wifi, aztelekom: Phone, ktv: Tv, fines: Car, tax: Landmark, university: GraduationCap, school: School, metrocard: TrainFront, parking: ParkingSquare };
export function BillerLogo({ id, name }) {
  const I = LOGO_ICONS[id];
  return (
    <span className="li-ico" style={{ background: LOGO_COLORS[id] || 'var(--ink)', color: '#fff', fontWeight: 800, fontSize: 12.5, fontFamily: 'var(--font-display)', letterSpacing: '-.02em' }} aria-hidden="true">
      {I ? <I size={19} strokeWidth={2.2} /> : name.slice(0, 3)}
    </span>
  );
}

export default function Payments() {
  const { state } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const due = Object.entries(state.billers).filter(([, b]) => b.saved && b.debt > 0);
  const matches = q ? Object.entries(state.billers).filter(([, b]) => b.name.toLowerCase().includes(q.toLowerCase())) : [];

  return (
    <section className="screen screen-enter">
      <div className="hdr" style={{ gridTemplateColumns: '1fr auto' }}>
        <h1 style={{ textAlign: 'left', fontSize: 24, paddingLeft: 4 }}>Payments</h1>
        <button className="icon-btn solid" onClick={() => nav('/qr')} aria-label="QR pay" data-nav-id="open-qr"><QrCode size={20} /></button>
      </div>

      <div className="amount" style={{ padding: '4px 14px', alignItems: 'center' }}>
        <Search size={18} className="muted" />
        <input id="biller-search" placeholder="Search services" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, padding: '10px 0' }} aria-label="Search services" />
      </div>

      {q ? (
        <div className="block flush">
          {matches.length ? matches.map(([id, b]) => <Li key={id} id={'biller-' + id} avatar={<BillerLogo id={id} name={b.name} />} title={b.name} sub={b.field} onClick={() => nav('/payments/' + id)} />)
            : <div className="empty">No services match “{q}”.</div>}
        </div>
      ) : (
        <>
          {due.length > 0 && (
            <>
              <div className="sec-title"><h2>Due now</h2><span className="tiny muted num">{money(due.reduce((s, [, b]) => s + b.debt, 0))} total</span></div>
              <div className="block flush">
                {due.map(([id, b]) => (
                  <Li key={id} id={'due-' + id} avatar={<BillerLogo id={id} name={b.name} />} title={b.name} sub={`${b.field}: ${b.saved}`}
                    right={<span className="neg">{money(b.debt)}</span>} rightSub="debt" onClick={() => nav('/payments/' + id)} />
                ))}
              </div>
            </>
          )}

          <div className="sec-title"><h2>Categories</h2></div>
          <div className="grid2">
            {state.billerGroups.map((g) => {
              const I = GROUP_ICONS[g.icon];
              return (
                <button key={g.id} className="block" style={{ padding: 14, gap: 10, textAlign: 'left' }} onClick={() => nav('/payments/group/' + g.id)} data-nav-id={'group-' + g.id}>
                  <span className="q-ico" style={{ width: 40, height: 40 }}><I size={20} /></span>
                  <span><strong style={{ display: 'block' }}>{g.title}</strong><span className="tiny muted">{g.billers.map((b) => state.billers[b].name).slice(0, 2).join(', ')}{g.billers.length > 2 ? '…' : ''}</span></span>
                </button>
              );
            })}
          </div>

          <div className="sec-title"><h2>Saved</h2></div>
          <div className="block flush">
            {Object.entries(state.billers).filter(([, b]) => b.saved).map(([id, b]) => (
              <Li key={id} avatar={<BillerLogo id={id} name={b.name} />} title={b.name} sub={b.saved} right={b.debt > 0 ? money(b.debt) : null} onClick={() => nav('/payments/' + id)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function BillerGroup() {
  const { id } = useParams();
  const { state } = useStore();
  const nav = useNavigate();
  const g = state.billerGroups.find((x) => x.id === id);
  return (
    <section className="screen no-tabs screen-enter">
      <Header title={g.title} />
      <div className="block flush">
        {g.billers.map((b) => <Li key={b} id={'biller-' + b} avatar={<BillerLogo id={b} name={state.billers[b].name} />} title={state.billers[b].name} sub={state.billers[b].field} onClick={() => nav('/payments/' + b)} />)}
      </div>
    </section>
  );
}

export function PayBiller() {
  const { id } = useParams();
  const { state, bank } = useStore();
  const confirm = useConfirm();
  const b = state.billers[id];
  const [acc, setAcc] = useState(b?.saved || '');
  const [look, setLook] = useState(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState('card-debit');

  const check = async (value = acc) => {
    setLoading(true);
    const r = await bank.lookupBill(id, value);
    setLoading(false);
    setLook(r);
    if (r.ok && r.debt) setAmount(String(r.debt));
  };
  useEffect(() => { if (b?.saved) check(b.saved); }, [id]); // eslint-disable-line

  if (!b) return <section className="screen no-tabs"><Header title="Payment" /></section>;
  const isTopup = b.mode === 'topup';

  return (
    <section className="screen no-tabs screen-enter">
      <Header title={b.name} />
      <div className="row" style={{ alignSelf: 'center', flexDirection: 'column', gap: 8 }}>
        <span style={{ transform: 'scale(1.4)', margin: '8px 0' }}><BillerLogo id={id} name={b.name} /></span>
      </div>
      <div className="field">
        <label htmlFor="bill-acc">{b.field}</label>
        <div className="row" style={{ gap: 8 }}>
          <input id="bill-acc" className="input num" value={acc} placeholder={b.placeholder} onChange={(e) => { setAcc(e.target.value); setLook(null); }} data-nav-id="bill-account" />
          {!isTopup && <button className="btn" onClick={() => check()} disabled={loading} data-nav-id="bill-check" aria-label="Check">{loading ? <Loader2 size={18} className="spin" /> : 'Check'}</button>}
        </div>
        {look?.ok && !isTopup && (
          <span className={'hint row' + (look.debt ? '' : ' ok')} style={{ gap: 6 }} data-nav-id="bill-debt">
            {look.debt ? <>Subscriber {look.holder} · debt <strong className="neg num">{money(look.debt)}</strong></> : <><Check size={15} /> {look.holder} · no debt</>}
          </span>
        )}
        {look && !look.ok && <span className="hint err">{look.error}</span>}
      </div>

      {(isTopup || b.mode === 'free' || look?.ok) && (
        <>
          <AmountInput value={amount} onChange={setAmount} quick={isTopup ? [3, 5, 10, 20] : look?.debt ? [look.debt, Math.ceil(look.debt / 10) * 10 + 10] : [10, 50, 100]} />
          <CardPicker value={from} onChange={setFrom} />
        </>
      )}
      {isTopup && <p className="row tiny muted" style={{ gap: 6 }}><Info size={14} /> Top-ups arrive instantly. No fee.</p>}
      <div className="sticky-cta">
        <button className="btn primary block" disabled={!(Number(amount) > 0) || (!isTopup && b.mode !== 'free' && !look?.ok)}
          onClick={() => confirm.start({ type: 'bill', billerId: id, accountNo: acc || b.placeholder, fromCardId: from, amount: Number(amount) })} data-nav-id="continue">
          Pay {Number(amount) > 0 ? money(Number(amount)) : ''}
        </button>
      </div>
    </section>
  );
}

// ---------- QR ----------
function FakeQR({ seed = 'LH-CASPIA' }) {
  // decorative QR-style pattern (demo, not scannable)
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const cells = [];
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
    const finder = (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17);
    if (finder) continue;
    h = (h * 1103515245 + 12345) >>> 0;
    if ((h >> 16) & 1) cells.push(<rect key={x + '-' + y} x={x} y={y} width="1" height="1" fill="#0f2a33" />);
  }
  const Finder = ({ x, y }) => (<g><rect x={x} y={y} width="7" height="7" fill="#0f2a33" /><rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" /><rect x={x + 2} y={y + 2} width="3" height="3" fill="#0f2a33" /></g>);
  return (
    <svg className="qr" viewBox="0 0 25 25" shapeRendering="crispEdges" role="img" aria-label="Your payment QR code">
      <rect width="25" height="25" fill="#fff" />{cells}<Finder x={0} y={0} /><Finder x={18} y={0} /><Finder x={0} y={18} />
    </svg>
  );
}

export function QR() {
  const confirm = useConfirm();
  const { state } = useStore();
  const [tab, setTab] = useState('scan');
  const [scanned, setScanned] = useState(null);
  const [from, setFrom] = useState('card-debit');
  const [amount, setAmount] = useState('');

  const simulate = () => { setScanned({ merchant: 'Mado Café', place: 'Nizami st. 67, Baku', amount: 12.8, cashback: 5 }); setAmount('12.80'); };

  return (
    <section className="screen no-tabs screen-enter">
      <Header title="QR payments" />
      <Seg value={tab} onChange={(v) => { setTab(v); setScanned(null); }} options={[['scan', 'Scan to pay'], ['mine', 'My QR']]} />
      {tab === 'scan' && !scanned && (
        <>
          <div className="scanner"><div className="frame" /><div className="line" /><span style={{ position: 'absolute', bottom: 16 }} className="small">Point the camera at a QR code</span></div>
          <button className="btn primary block" onClick={simulate} data-nav-id="simulate-scan"><ScanLine size={18} /> Simulate a scan (demo)</button>
          <p className="tiny muted" style={{ textAlign: 'center' }}>Works with any AZQR code at partner shops. Up to 3% cashback on QR payments.</p>
        </>
      )}
      {tab === 'scan' && scanned && (
        <>
          <div className="block" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <span className="li-ico"><Store size={20} /></span>
            <span className="grow"><strong style={{ display: 'block' }}>{scanned.merchant}</strong><span className="tiny muted">{scanned.place}</span></span>
            <span className="pill green">{scanned.cashback}% back</span>
          </div>
          <AmountInput value={amount} onChange={setAmount} quick={null} />
          <CardPicker value={from} onChange={setFrom} />
          <div className="sticky-cta">
            <button className="btn primary block" disabled={!(Number(amount) > 0)} onClick={() => confirm.start({ type: 'qr_payment', merchant: scanned.merchant, cashbackPct: scanned.cashback, fromCardId: from, amount: Number(amount) })} data-nav-id="continue">Pay {money(Number(amount) || 0)}</button>
          </div>
        </>
      )}
      {tab === 'mine' && (
        <div className="block" style={{ alignItems: 'center', textAlign: 'center' }}>
          <FakeQR />
          <strong>{state.user.firstName} {state.user.lastName[0]}.</strong>
          <span className="small muted">Show this code to receive money from any Caspia customer.</span>
          <span className="pill soft"><Star size={13} /> Payments land on Caspia Debit •••• 4471</span>
        </div>
      )}
    </section>
  );
}
