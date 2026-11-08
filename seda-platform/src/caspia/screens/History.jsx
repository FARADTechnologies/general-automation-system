import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Search, ShoppingCart, Coffee, Car, ShoppingBag, Zap, Smartphone, HeartPulse, Film, ArrowLeftRight, Landmark, Wallet, Gift, Repeat, Download, Share2, Flag, Copy, Split } from 'lucide-react';
import { useStore, money, fmtDate, fmtLongDate, last4 } from '../store/Store.jsx';
import { CATEGORIES } from '../data/seed.js';
import { Header, Li, Seg, Empty, Donut } from '../components/ui.jsx';

const ICONS = { groceries: ShoppingCart, dining: Coffee, transport: Car, shopping: ShoppingBag, utilities: Zap, mobile: Smartphone, health: HeartPulse, entertainment: Film, transfers: ArrowLeftRight, loans: Landmark, income: Wallet, cashback: Gift, exchange: Repeat };

export function TxIcon({ tx, size = 19 }) {
  const I = ICONS[tx.category] || Wallet;
  return <I size={size} color={CATEGORIES[tx.category]?.color} />;
}

const dayKey = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
};

export default function History() {
  const { state } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [dir, setDir] = useState('all');
  const loc = useLocation();
  const [card, setCard] = useState(loc.state?.cardId || 'all');

  const list = state.transactions.filter((t) =>
    (cat === 'all' || t.category === cat) &&
    (dir === 'all' || (dir === 'in' ? t.amount > 0 : t.amount < 0)) &&
    (card === 'all' || t.cardId === card) &&
    (!q || t.title.toLowerCase().includes(q.toLowerCase())));

  const groups = useMemo(() => {
    const g = [];
    list.forEach((t) => {
      const k = dayKey(t.date);
      const last = g[g.length - 1];
      if (last && last.k === k) last.items.push(t); else g.push({ k, items: [t] });
    });
    return g;
  }, [list]);

  const out = list.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const inc = list.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);

  return (
    <section className="screen screen-enter">
      <div className="hdr" style={{ gridTemplateColumns: '1fr auto' }}>
        <h1 style={{ textAlign: 'left', fontSize: 24, paddingLeft: 4 }}>History</h1>
        <button className="btn sm ghost" onClick={() => nav('/analytics')} data-nav-id="open-analytics">Analytics</button>
      </div>

      <div className="amount" style={{ padding: '4px 14px', alignItems: 'center' }}>
        <Search size={18} className="muted" />
        <input id="history-search" placeholder="Search merchants or people" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, padding: '10px 0' }} aria-label="Search transactions" />
      </div>

      <Seg value={dir} onChange={setDir} options={[['all', 'All'], ['out', 'Spending'], ['in', 'Income']]} />

      <div className="chips">
        <button className={'chip' + (card === 'all' ? ' on' : '')} onClick={() => setCard('all')}>All cards</button>
        {state.cards.map((c) => <button key={c.id} className={'chip' + (card === c.id ? ' on' : '')} onClick={() => setCard(c.id)}>{c.name.replace('Caspia ', '')} •{last4(c.number)}</button>)}
      </div>
      <div className="chips">
        <button className={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>All categories</button>
        {Object.entries(CATEGORIES).map(([k, c]) => <button key={k} className={'chip' + (cat === k ? ' on' : '')} onClick={() => setCat(k)}>{c.label}</button>)}
      </div>

      <div className="grid2">
        <div className="block" style={{ padding: 14, gap: 4 }}><span className="eyebrow">Out</span><strong className="num" style={{ fontSize: 18 }}>{money(-out)}</strong></div>
        <div className="block" style={{ padding: 14, gap: 4 }}><span className="eyebrow">In</span><strong className="num pos" style={{ fontSize: 18 }}>{money(inc, 'AZN', { sign: true })}</strong></div>
      </div>

      {groups.length === 0 && <Empty icon={<Search size={28} />} title="Nothing found" sub="Try another search or filter." />}
      {groups.map((g) => (
        <section key={g.k} className="stack" style={{ gap: 8 }}>
          <div className="eyebrow" style={{ paddingLeft: 4 }}>{g.k}</div>
          <div className="block flush">
            {g.items.map((t) => (
              <Li key={t.id} id={'tx-' + t.id} icon={<TxIcon tx={t} />} title={t.title}
                sub={`${CATEGORIES[t.category].label}${t.installment ? ' · ' + t.installment : ''} · ${fmtDate(t.date).split(', ')[1]}`}
                right={<span className={t.amount > 0 ? 'pos' : ''}>{money(t.amount, 'AZN', { sign: true })}</span>}
                rightSub={t.cashback ? `+${t.cashback.toFixed(2)} cashback` : null}
                onClick={() => nav('/history/' + t.id)} chevron={false} />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

export function TxDetail() {
  const { id } = useParams();
  const { state, toast } = useStore();
  const nav = useNavigate();
  const t = state.transactions.find((x) => x.id === id);
  if (!t) return <section className="screen no-tabs"><Header title="Transaction" /><Empty title="Transaction not found" /></section>;
  const c = state.cards.find((x) => x.id === t.cardId);
  const rows = [
    ['Status', 'Completed'],
    ['Date', `${fmtLongDate(t.date)}, ${fmtDate(t.date).split(', ')[1]}`],
    ['Category', CATEGORIES[t.category].label],
    ['Card', c ? `${c.name} •••• ${last4(c.number)}` : '—'],
    ...(t.installment ? [['Installment', t.installment]] : []),
    ...(t.cashback ? [['Cashback', `+${money(t.cashback)}`]] : []),
    ['Reference', t.id.toUpperCase() + '8F2A'],
  ];
  return (
    <section className="screen no-tabs screen-enter">
      <Header title="Transaction" />
      <div className="receipt-hero">
        <span className="li-ico" style={{ width: 64, height: 64, borderRadius: 20 }}><TxIcon tx={t} size={28} /></span>
        <strong style={{ fontSize: 17 }}>{t.title}</strong>
        <span className={'receipt-amount num' + (t.amount > 0 ? ' pos' : '')}>{money(t.amount, 'AZN', { sign: true })}</span>
      </div>
      <div className="block" style={{ gap: 0, padding: '4px 16px' }}>
        {rows.map(([k, v]) => <div key={k} className="kv"><span>{k}</span><span className="num">{v}</span></div>)}
      </div>
      <div className="tiles">
        <button className="tile" onClick={() => toast('Receipt saved to Files (demo)')}><span className="q-ico"><Download size={18} /></span>Receipt</button>
        <button className="tile" onClick={() => toast('Share sheet opened (demo)')}><span className="q-ico"><Share2 size={18} /></span>Share</button>
        <button className="tile" onClick={() => (t.category === 'transfers' ? nav('/transfers/card') : toast('Split request sent (demo)'))}><span className="q-ico">{t.category === 'transfers' ? <Repeat size={18} /> : <Split size={18} />}</span>{t.category === 'transfers' ? 'Repeat' : 'Split'}</button>
        <button className="tile" onClick={() => toast('Dispute opened. We will contact you within 2 days.')}><span className="q-ico"><Flag size={18} /></span>Dispute</button>
      </div>
      <button className="btn block" onClick={() => { navigator.clipboard?.writeText(t.id).catch(() => {}); toast('Reference copied'); }}><Copy size={16} /> Copy reference</button>
    </section>
  );
}

export function Analytics() {
  const { state } = useStore();
  const [period, setPeriod] = useState(30);
  const since = Date.now() - period * 86400000;
  const spend = state.transactions.filter((t) => t.amount < 0 && new Date(t.date).getTime() > since && !['transfers', 'exchange'].includes(t.category));
  const by = {};
  spend.forEach((t) => { by[t.category] = (by[t.category] || 0) - t.amount; });
  const list = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const total = list.reduce((s, [, v]) => s + v, 0);

  // weekly bars for the last 6 weeks
  const weeks = [...Array(6)].map((_, i) => {
    const end = Date.now() - i * 7 * 86400000;
    const start = end - 7 * 86400000;
    const v = state.transactions.filter((t) => t.amount < 0 && !['transfers', 'exchange'].includes(t.category) && new Date(t.date).getTime() > start && new Date(t.date).getTime() <= end).reduce((s, t) => s - t.amount, 0);
    return { label: i === 0 ? 'This wk' : `-${i}w`, v };
  }).reverse();
  const maxW = Math.max(...weeks.map((w) => w.v), 1);
  const cashback = state.transactions.filter((t) => t.cashback && new Date(t.date).getTime() > since).reduce((s, t) => s + t.cashback, 0);

  return (
    <section className="screen no-tabs screen-enter">
      <Header title="Spending analytics" />
      <Seg value={period} onChange={setPeriod} options={[[7, '7 days'], [30, '30 days'], [60, '60 days']]} />
      <div className="block" style={{ alignItems: 'center' }}>
        <Donut data={list.map(([k, v]) => ({ label: k, value: v, color: CATEGORIES[k].color }))} size={170} center={['Spent', money(total).replace(' AZN', '')]} />
        <div className="legend" style={{ width: '100%' }}>
          {list.map(([k, v]) => (
            <div key={k} className="legend-row">
              <i style={{ background: CATEGORIES[k].color }} />
              <span>{CATEGORIES[k].label}</span>
              <span className="muted num">{Math.round((v / total) * 100)}%</span>
              <strong className="num">{money(v)}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="block">
        <div className="between"><h3 style={{ fontSize: 16 }}>Weekly spending</h3><span className="tiny muted">AZN</span></div>
        <div className="bars">
          {weeks.map((w, i) => (
            <div key={i} className={i === weeks.length - 1 ? 'cur' : ''}>
              <span className="num" style={{ color: 'var(--text)', fontWeight: 600 }}>{Math.round(w.v)}</span>
              <b style={{ height: `${Math.max(4, (w.v / maxW) * 80)}%` }} />
              {w.label}
            </div>
          ))}
        </div>
      </div>
      <div className="grid2">
        <div className="block" style={{ gap: 4 }}><span className="eyebrow">Cashback earned</span><strong className="num pos" style={{ fontSize: 18 }}>+{money(cashback)}</strong></div>
        <div className="block" style={{ gap: 4 }}><span className="eyebrow">Daily average</span><strong className="num" style={{ fontSize: 18 }}>{money(total / period)}</strong></div>
      </div>
    </section>
  );
}
