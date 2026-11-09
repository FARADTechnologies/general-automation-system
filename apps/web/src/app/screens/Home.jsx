import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Eye, EyeOff, Send, Receipt, QrCode, Smartphone, Plus, Gift, ChevronRight, CalendarClock, Zap, Landmark, ShoppingBag } from 'lucide-react';
import { useStore, money, fmtDate } from '../store/Store.jsx';
import { CATEGORIES } from '../data/seed.js';
import { CardArt, Li } from '../components/ui.jsx';
import { TxIcon } from './History.jsx';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export default function Home() {
  const { state, bank } = useStore();
  const nav = useNavigate();
  const hide = state.settings.hideBalance;
  const azn = state.accounts.find((a) => a.currency === 'AZN');
  const usd = state.accounts.find((a) => a.currency === 'USD');
  const total = azn.balance + bank.convert(usd.balance, 'USD', 'AZN');
  const unread = state.notifications.filter((n) => !n.read).length;
  const h = (v) => (hide ? '••••' : v);

  const upcoming = useMemo(() => {
    const items = [];
    state.installments.filter((i) => i.paid < i.months).forEach((i) => items.push({ id: i.id, icon: <ShoppingBag size={16} />, title: i.merchant, amount: i.monthly, date: i.nextDate, to: '/loans' }));
    state.loans.forEach((l) => items.push({ id: l.id, icon: <Landmark size={16} />, title: 'Cash loan', amount: l.monthly, date: l.nextDate, to: '/loans' }));
    Object.entries(state.billers).filter(([, b]) => b.saved && b.debt > 0).forEach(([id, b]) => items.push({ id, icon: <Zap size={16} />, title: b.name, amount: b.debt, date: null, to: '/payments/' + id }));
    return items.sort((a, b) => (a.date || '9') > (b.date || '9') ? 1 : -1);
  }, [state.installments, state.loans, state.billers]);

  const monthSpend = useMemo(() => {
    const since = Date.now() - 30 * 86400000;
    const by = {};
    state.transactions.filter((t) => t.amount < 0 && new Date(t.date).getTime() > since && !['transfers', 'exchange'].includes(t.category))
      .forEach((t) => { by[t.category] = (by[t.category] || 0) - t.amount; });
    const list = Object.entries(by).sort((a, b) => b[1] - a[1]);
    return { total: list.reduce((s, [, v]) => s + v, 0), list };
  }, [state.transactions]);

  return (
    <main className="screen screen-enter" style={{ paddingTop: 0 }}>
      <section className="home-top">
        <div className="between">
          <button className="home-greet" onClick={() => nav('/profile')} data-nav-id="profile">
            <span className="avatar">{`${state.user.firstName?.[0] || ""}${state.user.lastName?.[0] || ""}`.toUpperCase() || "•"}</span>
            <span style={{ textAlign: 'left' }}>
              <span className="tiny" style={{ opacity: 0.75, display: 'block' }}>{greeting()},</span>
              <strong style={{ fontSize: 17 }}>{state.user.firstName}</strong>
            </span>
          </button>
          <div className="row" style={{ gap: 8 }}>
            <button className="icon-btn" onClick={() => bank.setSetting('hideBalance', !hide)} aria-label={hide ? 'Show balances' : 'Hide balances'} data-nav-id="toggle-balance">
              {hide ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
            <button className="icon-btn" style={{ position: 'relative' }} onClick={() => nav('/notifications')} aria-label="Notifications" data-nav-id="notifications">
              <Bell size={20} />{unread > 0 && <span className="badge">{unread}</span>}
            </button>
          </div>
        </div>
        <div>
          <div className="balance-label">Total balance</div>
          <div className="balance" data-nav-id="total-balance">{hide ? '•••••••' : total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<small>AZN</small></div>
          <div className="balance-sub" style={{ marginTop: 10 }}>
            <span className="pill num">{h(money(azn.balance))}</span>
            <span className="pill num">{h(money(usd.balance, 'USD'))}</span>
            <button className="pill saffron num" onClick={() => nav('/cashback')}><Gift size={13} /> {h(money(state.cashback.balance))}</button>
          </div>
        </div>
      </section>

      <div className="quick">
        {[
          ['/transfers', <Send size={21} />, 'Transfer', 'quick-transfer'],
          ['/payments', <Receipt size={21} />, 'Pay bills', 'quick-pay'],
          ['/qr', <QrCode size={21} />, 'QR pay', 'quick-qr'],
          ['/payments/azercell', <Smartphone size={21} />, 'Top up', 'quick-topup'],
        ].map(([to, icon, label, id]) => (
          <button key={id} onClick={() => nav(to)} data-nav-id={id}><span className="q-ico">{icon}</span>{label}</button>
        ))}
      </div>

      <div className="sec-title"><h2>My cards</h2><button className="link" onClick={() => nav('/cards')}>All cards</button></div>
      <div className="card-rail">
        {state.cards.map((c) => (
          <button key={c.id} onClick={() => nav('/cards/' + c.id)} data-nav-id={'card-' + c.id} aria-label={c.name}><CardArt card={c} small /></button>
        ))}
        <button className="cardart sm" onClick={() => nav('/cards/new')} style={{ background: 'var(--surface)', color: 'var(--muted)', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: 'inset 0 0 0 2px var(--line)', width: 150 }} data-nav-id="order-card">
          <Plus size={26} /><span className="small" style={{ fontWeight: 600 }}>New card</span>
        </button>
      </div>

      {upcoming.length > 0 && (
        <>
          <div className="sec-title"><h2>Coming up</h2><span className="tiny muted">{upcoming.length} payments</span></div>
          <div className="upcoming">
            {upcoming.map((u) => (
              <button key={u.id} className="up-card" onClick={() => nav(u.to)} data-nav-id={'upcoming-' + u.id}>
                <span className="row" style={{ gap: 6, color: 'var(--muted)' }}>{u.icon}<span className="tiny">{u.date ? fmtDate(u.date, false) : 'Due now'}</span></span>
                <strong className="small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.title}</strong>
                <span className="num" style={{ fontWeight: 700 }}>{h(money(u.amount))}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <button className="promo" onClick={() => nav('/cashback')} data-nav-id="promo">
        <span className="promo-art"><Gift size={26} /></span>
        <span className="grow" style={{ textAlign: 'left' }}>
          <h3>10% back at CinemaPlus</h3>
          <span className="small">Activate before 31 December</span>
        </span>
        <ChevronRight size={20} />
      </button>

      <button className="block" onClick={() => nav('/analytics')} style={{ textAlign: 'left' }} data-nav-id="spending-widget">
        <div className="between">
          <div>
            <div className="eyebrow">Spent in the last 30 days</div>
            <div className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginTop: 4 }}>{h(money(monthSpend.total))}</div>
          </div>
          <span className="pill soft"><CalendarClock size={13} /> Analytics</span>
        </div>
        <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', gap: 2 }}>
          {monthSpend.list.map(([k, v]) => <span key={k} style={{ flex: v, background: CATEGORIES[k].color }} />)}
        </div>
        <div className="row wrap" style={{ gap: '6px 14px' }}>
          {monthSpend.list.slice(0, 4).map(([k, v]) => (
            <span key={k} className="tiny row" style={{ gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORIES[k].color, display: 'inline-block' }} />{CATEGORIES[k].label} <span className="muted num">{h(Math.round(v))}</span></span>
          ))}
        </div>
      </button>

      <div className="sec-title"><h2>Recent activity</h2><button className="link" onClick={() => nav('/history')}>See all</button></div>
      <div className="block flush">
        {state.transactions.slice(0, 5).map((t) => (
          <Li key={t.id} id={'tx-' + t.id} icon={<TxIcon tx={t} />} title={t.title} sub={`${CATEGORIES[t.category].label} · ${fmtDate(t.date)}`}
            right={<span className={t.amount > 0 ? 'pos' : ''}>{h(money(t.amount, 'AZN', { sign: true }))}</span>} rightSub={t.cashback ? `+${t.cashback.toFixed(2)} cashback` : null}
            onClick={() => nav('/history/' + t.id)} chevron={false} />
        ))}
      </div>
    </main>
  );
}
