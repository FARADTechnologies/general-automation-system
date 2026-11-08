import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Landmark, ShoppingBag, Calculator, PiggyBank, Plus, Gift, ArrowDownUp, TrendingUp, Percent, CalendarDays, Check } from 'lucide-react';
import { useStore, money, fmtDate, fmtLongDate } from '../store/Store.jsx';
import { annuity } from '../bank/api.js';
import { Header, Li, AmountInput, CardPicker, Seg } from '../components/ui.jsx';
import { useConfirm } from '../components/Confirm.jsx';

// ---------------- Loans & installments ----------------
export function Loans() {
  const { state } = useStore();
  const confirm = useConfirm();
  const nav = useNavigate();
  const [tab, setTab] = useState('loans');
  const l = state.loans[0];
  const schedule = [...Array(4)].map((_, i) => { const d = new Date(l.nextDate); d.setMonth(d.getMonth() + i); return { date: d.toISOString(), amount: l.monthly }; });

  return (
    <main className="screen no-tabs screen-enter">
      <Header title="Loans" />
      <Seg value={tab} onChange={setTab} options={[['loans', 'Cash loan'], ['ins', `Installments (${state.installments.length})`]]} />

      {tab === 'loans' && (
        <>
          <div className="block" style={{ background: 'var(--ink)', color: 'var(--on-ink)', boxShadow: 'none' }}>
            <div className="between"><span className="eyebrow" style={{ color: 'inherit', opacity: 0.7 }}>{l.type}</span><span className="pill">{l.rate}% / year</span></div>
            <div><span className="tiny" style={{ opacity: 0.7 }}>Left to pay</span><div className="balance" style={{ fontSize: 30 }}>{money(l.remaining)}</div></div>
            <div className="progress" style={{ background: 'rgba(255,255,255,.12)', boxShadow: 'none' }}><span style={{ width: ((l.amount - l.remaining) / l.amount) * 100 + '%', background: 'var(--saffron)' }} /></div>
            <div className="between tiny" style={{ opacity: 0.8 }}><span>{l.paid} of {l.term} payments made</span><span className="num">of {money(l.amount)}</span></div>
          </div>
          <div className="grid2">
            <div className="block" style={{ gap: 4 }}><span className="eyebrow">Next payment</span><strong className="num">{money(l.monthly)}</strong><span className="tiny muted">{fmtLongDate(l.nextDate)}</span></div>
            <div className="block" style={{ gap: 4 }}><span className="eyebrow">Ends</span><strong>{(() => { const d = new Date(l.nextDate); d.setMonth(d.getMonth() + l.term - l.paid - 1); return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); })()}</strong><span className="tiny muted">No early repayment fee</span></div>
          </div>
          <button className="btn primary block" onClick={() => confirm.start({ type: 'loan_payment', fromCardId: 'card-debit', amount: l.monthly })} data-nav-id="pay-loan">Pay {money(l.monthly)} now</button>
          <div className="sec-title"><h2>Schedule</h2></div>
          <div className="block flush">
            {schedule.map((p, i) => <Li key={i} icon={<CalendarDays size={18} />} title={fmtLongDate(p.date)} sub={i === 0 ? 'Next payment' : 'Planned'} right={money(p.amount)} />)}
          </div>
          <button className="block" style={{ flexDirection: 'row', alignItems: 'center', textAlign: 'left' }} onClick={() => nav('/loans/apply')} data-nav-id="apply-loan">
            <span className="q-ico"><Calculator size={20} /></span>
            <span className="grow"><strong style={{ display: 'block' }}>Need more? Up to 30,000 AZN</strong><span className="tiny muted">Calculate a new cash loan in seconds</span></span>
          </button>
        </>
      )}

      {tab === 'ins' && (
        <>
          <div className="block" style={{ gap: 6 }}>
            <span className="eyebrow">Caspia Installment card</span>
            <div className="between"><strong className="num" style={{ fontSize: 20 }}>{money(state.cards[1].available)}</strong><span className="small muted num">available of {money(state.cards[1].creditLimit)}</span></div>
            <div className="progress"><span style={{ width: (state.cards[1].available / state.cards[1].creditLimit) * 100 + '%' }} /></div>
            <span className="tiny muted">0% interest at partner shops for up to 18 months.</span>
          </div>
          {state.installments.map((i) => (
            <div key={i.id} className="block">
              <div className="row">
                <span className="li-ico"><ShoppingBag size={19} /></span>
                <span className="grow"><strong style={{ display: 'block' }}>{i.item}</strong><span className="tiny muted">{i.merchant} · {i.months} months, 0%</span></span>
                <span className="num" style={{ fontWeight: 700 }}>{money(i.monthly)}</span>
              </div>
              <div className="progress"><span style={{ width: (i.paid / i.months) * 100 + '%' }} /></div>
              <div className="between tiny muted"><span>{i.paid}/{i.months} paid · next {fmtDate(i.nextDate, false)}</span><span className="num">{money(i.total - i.paid * i.monthly)} left</span></div>
              {i.paid < i.months && <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => confirm.start({ type: 'installment_payment', installmentId: i.id, amount: i.monthly })} data-nav-id={'pay-ins-' + i.id}>Pay this month</button>}
            </div>
          ))}
        </>
      )}
    </main>
  );
}

export function LoanApply() {
  const confirm = useConfirm();
  const [amount, setAmount] = useState(5000);
  const [term, setTerm] = useState(24);
  const monthly = annuity(amount, 14.9, term);
  return (
    <main className="screen no-tabs screen-enter">
      <Header title="Cash loan" />
      <div className="block">
        <div className="between"><span className="eyebrow">Amount</span><strong className="num" style={{ fontSize: 22 }}>{money(amount)}</strong></div>
        <input id="loan-amount" type="range" min="300" max="30000" step="100" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ accentColor: 'var(--sea)' }} aria-label="Loan amount" />
        <div className="between tiny muted"><span>300</span><span>30,000 AZN</span></div>
      </div>
      <div className="block">
        <div className="between"><span className="eyebrow">Term</span><strong>{term} months</strong></div>
        <div className="chips">{[6, 12, 24, 36, 48, 59].map((t) => <button key={t} className={'chip' + (term === t ? ' on' : '')} onClick={() => setTerm(t)}>{t} mo</button>)}</div>
      </div>
      <div className="block" style={{ background: 'color-mix(in srgb, var(--sea) 10%, var(--surface))', boxShadow: 'none' }}>
        <span className="eyebrow">Monthly payment</span>
        <strong className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 30 }}>{money(monthly)}</strong>
        <div className="kv"><span>Annual rate</span><span>from 14.9%</span></div>
        <div className="kv"><span>Total to repay</span><span className="num">{money(monthly * term)}</span></div>
        <div className="kv"><span>Documents</span><span>ID card only</span></div>
      </div>
      <div className="sticky-cta"><button className="btn primary block" onClick={() => confirm.start({ type: 'loan_apply', amount, term })} data-nav-id="continue">Apply</button></div>
    </main>
  );
}

// ---------------- Deposits ----------------
export function Deposits() {
  const { state } = useStore();
  const nav = useNavigate();
  return (
    <main className="screen no-tabs screen-enter">
      <Header title="Deposits" right={<button className="icon-btn" onClick={() => nav('/deposits/new')} aria-label="New deposit"><Plus size={22} /></button>} />
      {state.deposits.map((d) => {
        const total = (new Date(d.maturity) - new Date(d.opened));
        const done = Math.min(1, (Date.now() - new Date(d.opened)) / total);
        const earned = (d.amount * d.rate * d.term / 1200) * done;
        return (
          <div key={d.id} className="block">
            <div className="between"><strong>{d.name}</strong><span className="pill green">{d.rate}%</span></div>
            <strong className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 26 }}>{money(d.amount, d.currency)}</strong>
            <div className="progress"><span style={{ width: done * 100 + '%' }} /></div>
            <div className="between tiny muted"><span>Earned so far <strong className="pos num">+{money(earned, d.currency)}</strong></span><span>Matures {fmtDate(d.maturity, false)}</span></div>
          </div>
        );
      })}
      <div className="sec-title"><h2>Open a new deposit</h2></div>
      <div className="block flush">
        {state.depositProducts.map((p) => (
          <Li key={p.id} id={'dep-' + p.id} icon={<PiggyBank size={19} />} title={p.name} sub={p.note} right={`up to ${Math.max(...Object.values(p.rates))}%`} rightSub={p.currency} onClick={() => nav('/deposits/new', { state: { productId: p.id } })} />
        ))}
      </div>
    </main>
  );
}

export function NewDeposit() {
  const { state } = useStore();
  const confirm = useConfirm();
  const loc = useLocation();
  const [pid, setPid] = useState(loc.state?.productId || 'dp1');
  const p = state.depositProducts.find((x) => x.id === pid);
  const terms = Object.keys(p.rates).map(Number);
  const [term, setTerm] = useState(terms[terms.length - 1]);
  const [amount, setAmount] = useState('1000');
  const t = terms.includes(term) ? term : terms[0];
  const interest = (Number(amount) || 0) * p.rates[t] * t / 1200;
  return (
    <main className="screen no-tabs screen-enter">
      <Header title="New deposit" />
      <div className="chips">{state.depositProducts.map((x) => <button key={x.id} className={'chip' + (pid === x.id ? ' on' : '')} onClick={() => setPid(x.id)}>{x.name}</button>)}</div>
      <AmountInput value={amount} onChange={setAmount} currency={p.currency} quick={[500, 1000, 5000]} />
      <div className="block">
        <span className="eyebrow">Term</span>
        <div className="chips">{terms.map((x) => <button key={x} className={'chip' + (t === x ? ' on' : '')} onClick={() => setTerm(x)}>{x} months · {p.rates[x]}%</button>)}</div>
      </div>
      <div className="block" style={{ background: 'color-mix(in srgb, var(--saffron) 18%, var(--surface))', boxShadow: 'none' }}>
        <span className="eyebrow">You will earn</span>
        <strong className="num pos" style={{ fontFamily: 'var(--font-display)', fontSize: 28 }}>+{money(interest, p.currency)}</strong>
        <span className="tiny muted">{p.note}. Deposits are insured by the Deposit Insurance Fund (demo).</span>
      </div>
      <div className="sticky-cta"><button className="btn primary block" disabled={!(Number(amount) > 0)} onClick={() => confirm.start({ type: 'deposit_open', productId: pid, term: t, amount: Number(amount) })} data-nav-id="continue">Open deposit</button></div>
    </main>
  );
}

// ---------------- Cashback ----------------
export function Cashback() {
  const { state, bank, toast } = useStore();
  const confirm = useConfirm();
  const since = Date.now() - 30 * 86400000;
  const missed = state.offers.filter((o) => !o.active && o.percent).map((o) => ({
    o, v: state.transactions.filter((t) => t.category === o.category && t.amount < 0 && new Date(t.date).getTime() > since).reduce((s, t) => s - t.amount, 0) * o.percent / 100,
  })).filter((m) => m.v > 0).sort((a, b) => b.v - a.v)[0];
  return (
    <main className="screen no-tabs screen-enter">
      <Header title="Cashback" />
      <div className="block" style={{ background: 'var(--saffron)', color: '#2a1d00', boxShadow: 'none' }}>
        <span className="eyebrow" style={{ color: 'inherit', opacity: 0.75 }}>Cashback balance</span>
        <strong className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 34 }}>{money(state.cashback.balance)}</strong>
        <span className="small">Earned this month: <strong className="num">{money(state.cashback.thisMonth)}</strong></span>
        <button className="btn" style={{ background: '#2a1d00', color: '#fff', boxShadow: 'none', alignSelf: 'flex-start' }} onClick={() => confirm.start({ type: 'cashback_withdraw', amount: state.cashback.balance })} data-nav-id="withdraw-cashback" disabled={!(state.cashback.balance > 0)}>Move to my card</button>
      </div>
      {missed && (
        <div className="block" style={{ flexDirection: 'row', alignItems: 'center', boxShadow: 'inset 0 0 0 1.5px var(--saffron)' }}>
          <TrendingUp size={22} color="var(--sea)" />
          <span className="grow small">You could have earned <strong className="num">{money(missed.v)}</strong> more last month with the <strong>{missed.o.merchant}</strong> offer.</span>
          <button className="btn sm green" onClick={() => { bank.toggleOffer(missed.o.id); toast(`${missed.o.merchant} offer activated`); }}>Activate</button>
        </div>
      )}
      <div className="sec-title"><h2>Offers</h2><span className="tiny muted">{state.offers.filter((o) => o.active).length} active</span></div>
      <div className="block flush">
        {state.offers.map((o) => (
          <div key={o.id} className="li" data-nav-id={'offer-' + o.id}>
            <span className="li-ico" style={{ background: 'color-mix(in srgb, var(--saffron) 25%, var(--surface))', color: '#8a5a12' }}>{o.percent ? <Percent size={18} /> : <Gift size={18} />}</span>
            <span className="li-main"><span className="li-title">{o.merchant} {o.percent ? <span className="pos">{o.percent}%</span> : null}</span><span className="li-sub">{o.note} · until {o.until}</span></span>
            <button className={'btn sm' + (o.active ? ' ghost' : ' primary')} onClick={() => { bank.toggleOffer(o.id); toast(o.active ? `${o.merchant} offer turned off` : `${o.merchant} offer activated`); }}>
              {o.active ? <><Check size={14} /> Active</> : 'Activate'}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}

// ---------------- Exchange ----------------
export function Exchange() {
  const { state, bank } = useStore();
  const confirm = useConfirm();
  const [dir, setDir] = useState('buy'); // buy USD with AZN | sell USD
  const [amount, setAmount] = useState('');
  const from = dir === 'buy' ? 'acc-azn' : 'acc-usd';
  const to = dir === 'buy' ? 'acc-usd' : 'acc-azn';
  const src = state.accounts.find((a) => a.id === from);
  const dst = state.accounts.find((a) => a.id === to);
  const out = Number(amount) > 0 ? bank.convert(Number(amount), src.currency, dst.currency) : 0;
  return (
    <main className="screen no-tabs screen-enter">
      <Header title="Currency exchange" />
      <Seg value={dir} onChange={(v) => { setDir(v); setAmount(''); }} options={[['buy', 'Buy USD'], ['sell', 'Sell USD']]} />
      <div className="block">
        <span className="eyebrow">You pay from {src.name}</span>
        <AmountInput value={amount} onChange={setAmount} currency={src.currency} quick={null} />
        <span className="tiny muted num">Available {money(src.balance, src.currency)}</span>
        <div className="row" style={{ justifyContent: 'center', color: 'var(--muted)' }}><ArrowDownUp size={18} /></div>
        <span className="eyebrow">You get in {dst.name}</span>
        <strong className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 30 }}>{money(out, dst.currency)}</strong>
        <span className="tiny muted">{bank.rateLabel(src.currency, dst.currency)}</span>
      </div>
      <div className="sec-title"><h2>Today’s rates</h2><span className="tiny muted">per 1 unit, AZN</span></div>
      <div className="block" style={{ gap: 0, padding: '4px 16px' }}>
        <div className="kv" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr' }}><span>Currency</span><span style={{ textAlign: 'right', color: 'var(--muted)', fontWeight: 500 }}>Buy</span><span style={{ textAlign: 'right', color: 'var(--muted)', fontWeight: 500 }}>Sell</span></div>
        {state.rates.map((r) => (
          <div key={r.code} className="kv num" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr' }}>
            <span style={{ color: 'var(--text)' }}><strong>{r.code}</strong> <span className="tiny muted">{r.name}</span></span>
            <span style={{ textAlign: 'right' }}>{r.buy.toFixed(4)}</span><span style={{ textAlign: 'right' }}>{r.sell.toFixed(4)}</span>
          </div>
        ))}
      </div>
      <div className="sticky-cta"><button className="btn primary block" disabled={!(Number(amount) > 0)} onClick={() => confirm.start({ type: 'exchange', fromAccountId: from, toAccountId: to, amount: Number(amount) })} data-nav-id="continue">Exchange</button></div>
    </main>
  );
}
