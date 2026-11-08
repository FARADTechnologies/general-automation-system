import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CreditCard, Phone, Repeat, Globe2, HandCoins, Search, Home as HomeI, Heart, Zap, ShieldCheck, Check, Share2, Star, Loader2, Contact, ArrowDownUp } from 'lucide-react';
import { useStore, money, maskCard, groupCard, fmtLongDate, fmtDate } from '../store/Store.jsx';
import { Header, Li, Avatar, AmountInput, CardPicker, Seg } from '../components/ui.jsx';
import { useConfirm } from '../components/Confirm.jsx';

const TPL_ICONS = { home: HomeI, heart: Heart, zap: Zap };

export default function Transfers() {
  const { state } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const contacts = state.contacts.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')));

  return (
    <main className="screen screen-enter">
      <div className="hdr" style={{ gridTemplateColumns: '1fr' }}><h1 style={{ textAlign: 'left', fontSize: 24, paddingLeft: 4 }}>Transfers</h1></div>

      <div className="amount" style={{ padding: '4px 14px', alignItems: 'center' }}>
        <Search size={18} className="muted" />
        <input id="contact-search" placeholder="Name, phone or card number" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, padding: '10px 0' }} aria-label="Search recipients" />
      </div>

      {q.replace(/\D/g, '').length === 16 && (
        <div className="block flush">
          <Li id="send-typed-card" icon={<CreditCard size={20} />} title={`Send to ${groupCard(q.replace(/\D/g, ''))}`} sub="Transfer to this card" onClick={() => nav('/transfers/card', { state: { toCard: q.replace(/\D/g, '') } })} />
        </div>
      )}
      <div className="card-rail" style={{ gap: 14 }}>
        {contacts.map((c) => (
          <button key={c.id} className="stack" style={{ alignItems: 'center', gap: 6, width: 62 }} onClick={() => nav('/transfers/card', { state: { toCard: c.card } })} data-nav-id={'contact-' + c.id}>
            <Avatar name={c.name} color={c.color} size="lg" />
            <span className="tiny" style={{ fontWeight: 600 }}>{c.short}</span>
          </button>
        ))}
      </div>

      <div className="block flush">
        <Li id="transfer-card" icon={<CreditCard size={20} />} title="To a card" sub="Any bank in Azerbaijan · free to Caspia cards" onClick={() => nav('/transfers/card')} />
        <Li id="transfer-phone" icon={<Phone size={20} />} title="By phone number" sub="To Caspia customers · instant" onClick={() => nav('/transfers/phone')} />
        <Li id="transfer-own" icon={<Repeat size={20} />} title="Between my accounts" sub="AZN ⇄ USD at bank rate" onClick={() => nav('/transfers/own')} />
        <Li id="transfer-abroad" icon={<Globe2 size={20} />} title="International (SWIFT)" sub="1–3 business days" onClick={() => nav('/transfers/abroad')} />
        <Li id="transfer-request" icon={<HandCoins size={20} />} title="Request money" sub="Send a payment link" onClick={() => nav('/transfers/request')} />
      </div>

      <div className="sec-title"><h2>Templates</h2><span className="tiny muted">{state.templates.length}</span></div>
      <div className="block flush">
        {state.templates.map((t) => {
          const I = TPL_ICONS[t.icon] || Star;
          return (
            <Li key={t.id} id={'tpl-' + t.id} icon={<I size={19} />} title={t.title}
              sub={t.type === 'card' ? `Card ${maskCard(t.to)}` : state.billers[t.billerId]?.name}
              right={t.amount ? money(t.amount) : null}
              onClick={() => (t.type === 'card' ? nav('/transfers/card', { state: { toCard: t.to, amount: t.amount } }) : nav('/payments/' + t.billerId))} />
          );
        })}
      </div>
    </main>
  );
}

function useCardLookup(number) {
  const { bank } = useStore();
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const n = number.replace(/\D/g, '');
    if (n.length !== 16) { setRes(null); return; }
    let alive = true;
    setLoading(true);
    bank.lookupCard(n).then((r) => { if (alive) { setRes(r); setLoading(false); } });
    return () => { alive = false; };
  }, [number]); // eslint-disable-line
  return { res, loading };
}

export function ToCard() {
  const loc = useLocation();
  const { state } = useStore();
  const confirm = useConfirm();
  const [num, setNum] = useState(loc.state?.toCard ? groupCard(loc.state.toCard) : '');
  const [amount, setAmount] = useState(loc.state?.amount ? String(loc.state.amount) : '');
  const [from, setFrom] = useState('card-debit');
  const [note, setNote] = useState('');
  const { res, loading } = useCardLookup(num);
  const own = res?.own;
  const fee = res && !own && Number(amount) > 0 ? Math.max(0.3, Number(amount) * 0.005) : 0;

  const go = () => confirm.start({ type: 'card_transfer', fromCardId: from, toCard: num.replace(/\D/g, ''), toName: res.name, amount: Number(amount), note });

  return (
    <main className="screen no-tabs screen-enter">
      <Header title="To a card" />
      <div className="field">
        <label htmlFor="to-card">Recipient card number</label>
        <input id="to-card" className={'input num' + (res && !res.ok ? ' err' : '')} inputMode="numeric" placeholder="0000 0000 0000 0000" value={num}
          onChange={(e) => setNum(groupCard(e.target.value.replace(/\D/g, '').slice(0, 16)))} data-nav-id="to-card" style={{ letterSpacing: '.06em', fontSize: 17 }} />
        {loading && <span className="hint row" style={{ gap: 6 }}><Loader2 size={14} className="spin" /> Checking card…</span>}
        {res?.ok && <span className="hint ok row" style={{ gap: 6 }} data-nav-id="recipient-name"><Check size={15} /> {res.name} · {res.bank}</span>}
        {res && !res.ok && <span className="hint err">{res.error}</span>}
        {!num && (
          <div className="chips" style={{ marginTop: 4 }}>
            {state.contacts.slice(0, 4).map((c) => <button key={c.id} className="chip" onClick={() => setNum(groupCard(c.card))}>{c.short} •{c.card.slice(-4)}</button>)}
          </div>
        )}
      </div>
      <AmountInput value={amount} onChange={setAmount} />
      <CardPicker value={from} onChange={setFrom} />
      <div className="field">
        <label htmlFor="note">Message (optional)</label>
        <input id="note" className="input" placeholder="e.g. Dinner yesterday" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {res?.ok && Number(amount) > 0 && (
        <div className="block" style={{ gap: 0, padding: '4px 16px' }}>
          <div className="kv"><span>Fee</span><span className="num">{own ? 'Free' : money(fee)}</span></div>
          <div className="kv"><span>Total</span><span className="num">{money(Number(amount) + fee)}</span></div>
        </div>
      )}
      <div className="sticky-cta">
        <button className="btn primary block" disabled={!res?.ok || !(Number(amount) > 0) || confirm.busy} onClick={go} data-nav-id="continue">Continue</button>
      </div>
    </main>
  );
}

export function ByPhone() {
  const { state, bank } = useStore();
  const confirm = useConfirm();
  const [phone, setPhone] = useState('');
  const [res, setRes] = useState(null);
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState('card-debit');

  useEffect(() => {
    const d = phone.replace(/\D/g, '');
    if (d.length < 9) { setRes(null); return; }
    let alive = true;
    bank.lookupPhone(d).then((r) => alive && setRes(r));
    return () => { alive = false; };
  }, [phone]); // eslint-disable-line

  return (
    <main className="screen no-tabs screen-enter">
      <Header title="By phone number" />
      <div className="field">
        <label htmlFor="to-phone">Phone number</label>
        <div className="amount" style={{ padding: '4px 14px', alignItems: 'center' }}>
          <span className="num" style={{ fontWeight: 600 }}>+994</span>
          <input id="to-phone" inputMode="tel" placeholder="50 000 00 00" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ fontFamily: 'var(--font-body)', fontSize: 17, fontWeight: 500, padding: '10px 0' }} data-nav-id="to-phone" />
          <Contact size={20} className="muted" />
        </div>
        {res?.ok && <span className="hint ok row" style={{ gap: 6 }}><Check size={15} /> {res.name} · Caspia customer</span>}
        {res && !res.ok && <span className="hint err">{res.error}</span>}
      </div>
      <div className="block flush">
        {state.contacts.map((c) => (
          <Li key={c.id} avatar={<Avatar name={c.name} color={c.color} />} title={c.name} sub={c.phone} onClick={() => setPhone(c.phone.replace('+994 ', ''))} chevron={false} />
        ))}
      </div>
      {res?.ok && (
        <>
          <AmountInput value={amount} onChange={setAmount} />
          <CardPicker value={from} onChange={setFrom} />
        </>
      )}
      <div className="sticky-cta">
        <button className="btn primary block" disabled={!res?.ok || !(Number(amount) > 0)} onClick={() => confirm.start({ type: 'phone_transfer', fromCardId: from, toPhone: '+994 ' + phone, toName: res.name, amount: Number(amount) })} data-nav-id="continue">Continue</button>
      </div>
    </main>
  );
}

export function OwnAccounts() {
  const { state, bank } = useStore();
  const confirm = useConfirm();
  const [from, setFrom] = useState('acc-azn');
  const [to, setTo] = useState('acc-usd');
  const [amount, setAmount] = useState('');
  const src = state.accounts.find((a) => a.id === from);
  const dst = state.accounts.find((a) => a.id === to);
  const out = Number(amount) > 0 ? bank.convert(Number(amount), src.currency, dst.currency) : 0;
  const Acc = ({ a, label }) => (
    <div className="block" style={{ padding: 14, gap: 4 }}>
      <span className="eyebrow">{label}</span>
      <div className="between"><strong>{a.name}</strong><span className="pill soft">{a.currency}</span></div>
      <span className="small muted num">{money(a.balance, a.currency)}</span>
    </div>
  );
  return (
    <main className="screen no-tabs screen-enter">
      <Header title="Between my accounts" />
      <div className="stack" style={{ position: 'relative' }}>
        <Acc a={src} label="From" />
        <button className="icon-btn solid" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 2 }} onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap accounts" data-nav-id="swap"><ArrowDownUp size={18} /></button>
        <Acc a={dst} label="To" />
      </div>
      <AmountInput value={amount} onChange={setAmount} currency={src.currency} quick={src.currency === 'AZN' ? [50, 100, 500] : [20, 50, 100]} />
      {out > 0 && <p className="small muted num">You get <strong style={{ color: 'var(--text)' }}>{money(out, dst.currency)}</strong> · {bank.rateLabel(src.currency, dst.currency)}</p>}
      <div className="sticky-cta">
        <button className="btn primary block" disabled={!(Number(amount) > 0)} onClick={() => confirm.start({ type: 'own_transfer', fromAccountId: from, toAccountId: to, amount: Number(amount) })} data-nav-id="continue">Continue</button>
      </div>
    </main>
  );
}

export function Abroad() {
  const confirm = useConfirm();
  const [f, setF] = useState({ beneficiary: '', country: 'Türkiye', iban: '', swift: '', purpose: 'Family support', amount: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const [from, setFrom] = useState('card-debit');
  return (
    <main className="screen no-tabs screen-enter">
      <Header title="International transfer" />
      <div className="block" style={{ flexDirection: 'row', gap: 10, alignItems: 'center', background: 'color-mix(in srgb, var(--saffron) 18%, var(--surface))', boxShadow: 'none' }}>
        <Globe2 size={20} /><span className="small">SWIFT transfers arrive in 1–3 business days. Fee 0.2%, minimum 15 AZN.</span>
      </div>
      <div className="field"><label htmlFor="ben">Beneficiary full name</label><input id="ben" className="input" value={f.beneficiary} onChange={set('beneficiary')} placeholder="e.g. Ali Yilmaz" /></div>
      <div className="field"><label htmlFor="country">Country</label>
        <select id="country" className="input" value={f.country} onChange={set('country')}>
          {['Türkiye', 'Georgia', 'Germany', 'United Kingdom', 'United Arab Emirates', 'United States', 'Russia', 'Kazakhstan'].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="iban">IBAN / account number</label><input id="iban" className="input num" value={f.iban} onChange={(e) => setF({ ...f, iban: e.target.value.toUpperCase() })} placeholder="TR00 0000 0000 0000 0000 0000 00" /></div>
      <div className="field"><label htmlFor="swift">SWIFT / BIC</label><input id="swift" className="input num" value={f.swift} onChange={(e) => setF({ ...f, swift: e.target.value.toUpperCase() })} placeholder="e.g. TGBATRIS" /></div>
      <div className="field"><label htmlFor="purpose">Purpose</label>
        <select id="purpose" className="input" value={f.purpose} onChange={set('purpose')}>{['Family support', 'Tuition', 'Medical', 'Services', 'Goods'].map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <AmountInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} quick={[100, 500, 1000]} />
      <CardPicker value={from} onChange={setFrom} includeCredit={false} />
      <div className="sticky-cta">
        <button className="btn primary block" disabled={!(Number(f.amount) > 0)} onClick={() => confirm.start({ type: 'intl_transfer', fromCardId: from, ...f, amount: Number(f.amount) })} data-nav-id="continue">Continue</button>
      </div>
    </main>
  );
}

export function RequestMoney() {
  const { toast } = useStore();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const link = `caspia.demo/pay/LH${(Number(amount) * 100 || 0).toFixed(0)}`;
  return (
    <main className="screen no-tabs screen-enter">
      <Header title="Request money" />
      <AmountInput value={amount} onChange={setAmount} quick={[10, 25, 50]} />
      <div className="field"><label htmlFor="reason">What is it for?</label><input id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Concert tickets" /></div>
      {Number(amount) > 0 && (
        <div className="block">
          <span className="eyebrow">Payment link</span>
          <strong className="num" style={{ wordBreak: 'break-all' }}>{link}</strong>
          <span className="small muted">Anyone with a card from any bank can pay you {money(Number(amount))}{reason ? ` for “${reason}”` : ''}.</span>
        </div>
      )}
      <div className="sticky-cta">
        <button className="btn primary block" disabled={!(Number(amount) > 0)} onClick={() => { navigator.clipboard?.writeText(link).catch(() => {}); toast('Payment link copied'); }}><Share2 size={18} /> Copy and share link</button>
      </div>
    </main>
  );
}

export function ReceiptScreen() {
  const { id } = useParams();
  const { state, toast, bank } = useStore();
  const nav = useNavigate();
  const r = state.receipts[id];
  const canTemplate = r && ['card_transfer', 'bill'].includes(r.op?.type);
  const saveTpl = () => {
    if (!canTemplate) { toast('Templates are available for card transfers and bills', 'err'); return; }
    bank.saveTemplate(r.op.type === 'card_transfer'
      ? { title: r.op.toName, type: 'card', to: r.op.toCard, amount: r.op.amount, icon: 'star' }
      : { title: state.billers[r.op.billerId].name, type: 'bill', billerId: r.op.billerId, icon: 'zap' });
    toast('Saved to Transfers → Templates');
  };
  if (!r) return <main className="screen no-tabs"><Header title="Receipt" back="/" /></main>;
  return (
    <main className="screen no-tabs screen-enter">
      <Header title="" back="/" />
      <div className="receipt-hero">
        <span className="check"><Check size={40} strokeWidth={3} /></span>
        <span className="eyebrow">{r.status}</span>
        <span className="receipt-amount num" data-nav-id="receipt-amount">{money(r.amount, r.currency)}</span>
        <strong>{r.title}</strong>
        <span className="small muted">{fmtLongDate(r.date)} · {fmtDate(r.date).split(', ')[1]}</span>
      </div>
      <div className="block" style={{ gap: 0, padding: '4px 16px 0' }}>
        {r.lines.map(([k, v]) => <div key={k} className="kv"><span>{k}</span><span className="num">{v}</span></div>)}
        <div className="kv"><span>Receipt no.</span><span className="num">{r.id}</span></div>
        <div className="perf" />
        <div className="row small muted" style={{ gap: 8, padding: '6px 0 14px' }}><ShieldCheck size={16} color="var(--sea)" /> Confirmed with {r.method}</div>
      </div>
      <div className="grid2">
        <button className="btn" onClick={() => toast('Receipt shared (demo)')}><Share2 size={17} /> Share</button>
        <button className="btn" onClick={saveTpl} data-nav-id="save-template"><Star size={17} /> Save template</button>
      </div>
      <div className="sticky-cta"><button className="btn primary block" onClick={() => nav('/', { replace: true })} data-nav-id="done">Done</button></div>
    </main>
  );
}
