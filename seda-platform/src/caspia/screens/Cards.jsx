import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Snowflake, Eye, SlidersHorizontal, KeyRound, FileText, Globe, Nfc, ShoppingCart, Plus, Copy, CreditCard, Smartphone, Truck, Check, Sun } from 'lucide-react';
import { useStore, money, groupCard, last4 } from '../store/Store.jsx';
import { Header, Li, CardArt, Toggle, Sheet, Seg } from '../components/ui.jsx';
import { Biometric } from '../components/Confirm.jsx';

export default function Cards() {
  const { state, bank } = useStore();
  const nav = useNavigate();
  return (
    <section className="screen no-tabs screen-enter">
      <Header title="My cards" right={<button className="icon-btn" onClick={() => nav('/cards/new')} aria-label="New card"><Plus size={22} /></button>} />
      {state.cards.map((c) => (
        <button key={c.id} className="stack" style={{ gap: 8, textAlign: 'left' }} onClick={() => nav('/cards/' + c.id)} data-nav-id={'card-' + c.id}>
          <CardArt card={c} />
          <span className="between small" style={{ padding: '0 4px' }}>
            <span><strong>{c.name}</strong> <span className="muted">•••• {last4(c.number)}</span></span>
            <span className="muted num">{c.creditLimit ? `Limit ${money(c.creditLimit)}` : money(bank.fundsOf(c))}</span>
          </span>
        </button>
      ))}
      <button className="btn block" onClick={() => nav('/cards/new')} data-nav-id="order-card"><Plus size={18} /> Order a new card</button>
    </section>
  );
}

export function CardDetail() {
  const { id } = useParams();
  const { state, bank, toast } = useStore();
  const nav = useNavigate();
  const c = state.cards.find((x) => x.id === id);
  const [sheet, setSheet] = useState(null); // 'reveal-bio' | 'details' | 'limits' | 'pin' | 'freeze'
  const [revealed, setRevealed] = useState(false);
  const [limits, setLimits] = useState(c?.limits);
  if (!c) return <section className="screen no-tabs"><Header title="Card" /></section>;

  const freeze = () => {
    bank.setCard(c.id, { frozen: !c.frozen });
    toast(c.frozen ? 'Card unfrozen. You can pay again.' : 'Card frozen. No payments will go through.');
    setSheet(null);
  };

  return (
    <section className="screen no-tabs screen-enter">
      <Header title={c.name} />
      <CardArt card={c} reveal={revealed} />
      {revealed && (
        <div className="block" style={{ gap: 0, padding: '4px 16px' }}>
          <div className="kv"><span>Card number</span><span className="num">{groupCard(c.number)}</span></div>
          <div className="kv"><span>Expiry / CVV</span><span className="num">{c.expiry} · {c.cvv}</span></div>
          <div className="kv"><span>Holder</span><span>{c.holder}</span></div>
          {c.accountId && <div className="kv"><span>IBAN</span><span className="num" style={{ fontSize: 12.5 }}>{state.accounts.find((a) => a.id === c.accountId).iban}</span></div>}
          <button className="btn sm" style={{ margin: '6px 0 12px' }} onClick={() => { navigator.clipboard?.writeText(c.number).catch(() => {}); toast('Card number copied'); }}><Copy size={15} /> Copy number</button>
        </div>
      )}

      <div className="tiles">
        <button className={'tile' + (c.frozen ? ' on' : '')} onClick={() => setSheet('freeze')} data-nav-id="card-freeze"><span className="q-ico">{c.frozen ? <Sun size={19} /> : <Snowflake size={19} />}</span>{c.frozen ? 'Unfreeze' : 'Freeze'}</button>
        <button className="tile" onClick={() => (revealed ? setRevealed(false) : setSheet('reveal-bio'))} data-nav-id="card-details"><span className="q-ico"><Eye size={19} /></span>{revealed ? 'Hide' : 'Details'}</button>
        <button className="tile" onClick={() => setSheet('limits')} data-nav-id="card-limits"><span className="q-ico"><SlidersHorizontal size={19} /></span>Limits</button>
        <button className="tile" onClick={() => setSheet('pin')} data-nav-id="card-pin"><span className="q-ico"><KeyRound size={19} /></span>PIN</button>
      </div>

      {c.creditLimit && (
        <div className="block">
          <div className="between"><span className="eyebrow">Installment limit</span><span className="small muted num">{money(c.available)} of {money(c.creditLimit)}</span></div>
          <div className="progress"><span style={{ width: (c.available / c.creditLimit) * 100 + '%' }} /></div>
          <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => nav('/loans')}>See installments</button>
        </div>
      )}

      <div className="sec-title"><h2>Settings</h2></div>
      <div className="block flush">
        {[
          ['online', <ShoppingCart size={19} />, 'Online payments', 'Shopping on websites and apps'],
          ['contactless', <Nfc size={19} />, 'Contactless', 'Tap to pay in shops'],
          ['abroad', <Globe size={19} />, 'Payments abroad', 'Use the card outside Azerbaijan'],
        ].map(([k, icon, title, sub]) => (
          <div key={k} className="li">
            <span className="li-ico">{icon}</span>
            <span className="li-main"><span className="li-title">{title}</span><span className="li-sub">{sub}</span></span>
            <Toggle id={'set-' + k} label={title} checked={c[k]} onChange={(v) => { bank.setCard(c.id, { [k]: v }); toast(`${title} ${v ? 'on' : 'off'}`); }} />
          </div>
        ))}
      </div>
      <div className="block flush">
        <Li icon={<FileText size={19} />} title="Statement" sub="Transactions on this card" onClick={() => nav('/history', { state: { cardId: c.id } })} />
        <Li icon={<Smartphone size={19} />} title="Add to Google Pay / Apple Pay" sub="Pay with your phone" onClick={() => toast('Card added to wallet (demo)')} />
      </div>

      {sheet === 'reveal-bio' && (
        <Sheet onClose={() => setSheet(null)}>
          <Biometric title="Show card details" useDevice={state.settings.webauthn} credentialId={state.settings.webauthnId} onSuccess={() => { setRevealed(true); setSheet(null); }} onCancel={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === 'freeze' && (
        <Sheet onClose={() => setSheet(null)}>
          <h2>{c.frozen ? 'Unfreeze this card?' : 'Freeze this card?'}</h2>
          <p className="muted">{c.frozen ? 'Payments and withdrawals will work again right away.' : 'All payments and withdrawals will be declined until you unfreeze it. You can unfreeze any time. If the card is lost or stolen, call *0000 to block it permanently.'}</p>
          <button className={'btn block ' + (c.frozen ? 'green' : 'primary')} onClick={freeze} data-nav-id="confirm-freeze">{c.frozen ? 'Unfreeze card' : 'Freeze card'}</button>
          <button className="btn block" onClick={() => setSheet(null)}>Cancel</button>
        </Sheet>
      )}
      {sheet === 'limits' && (
        <Sheet onClose={() => setSheet(null)}>
          <h2>Daily limits</h2>
          {[['purchase', 'Purchases', 5000], ['atm', 'Cash withdrawal', 3000], ['online', 'Online', 5000]].map(([k, label, max]) => (
            <div key={k} className="field">
              <div className="between"><label htmlFor={'lim-' + k}>{label}</label><strong className="num">{money(limits[k])}</strong></div>
              <input id={'lim-' + k} type="range" min="0" max={max} step="50" value={limits[k]} onChange={(e) => setLimits({ ...limits, [k]: Number(e.target.value) })} style={{ accentColor: 'var(--sea)' }} />
            </div>
          ))}
          <button className="btn primary block" onClick={() => { Object.entries(limits).forEach(([k, v]) => bank.setCardLimit(c.id, k, v)); toast('Limits updated'); setSheet(null); }} data-nav-id="save-limits">Save limits</button>
        </Sheet>
      )}
      {sheet === 'pin' && (
        <Sheet onClose={() => setSheet(null)}>
          <h2>Card PIN</h2>
          <Li icon={<KeyRound size={19} />} title="Change PIN" sub="At any Caspia ATM, or get a new one by SMS" onClick={() => { toast('A one-time code was sent by SMS (demo)'); setSheet(null); }} />
          <Li icon={<Eye size={19} />} title="Show PIN" sub="Needs your fingerprint" onClick={() => setSheet('pin-bio')} />
        </Sheet>
      )}
      {sheet === 'pin-bio' && (
        <Sheet onClose={() => setSheet(null)}>
          <Biometric title="Show card PIN" useDevice={state.settings.webauthn} credentialId={state.settings.webauthnId} onSuccess={() => { toast('Card PIN: 4 8 2 0 (demo)'); setSheet(null); }} onCancel={() => setSheet(null)} />
        </Sheet>
      )}
    </section>
  );
}

export function OrderCard() {
  const { bank, toast } = useStore();
  const nav = useNavigate();
  const [kind, setKind] = useState('virtual');
  const [design, setDesign] = useState('navy');
  const opts = {
    virtual: { icon: <Smartphone size={20} />, title: 'Virtual Visa', lines: ['Ready in seconds', 'For online shopping and subscriptions', 'Free'] },
    debit: { icon: <CreditCard size={20} />, title: 'Visa Gold debit', lines: ['Ready in 3 business days', 'Free delivery in Baku', '10 AZN per year, first year free'] },
  };
  return (
    <section className="screen no-tabs screen-enter">
      <Header title="New card" />
      <Seg value={kind} onChange={setKind} options={[['virtual', 'Virtual'], ['debit', 'Physical']]} />
      <CardArt card={{ name: 'New', product: opts[kind].title, network: 'VISA', number: '4169000000000000', expiry: '11/31', style: design, virtual: kind === 'virtual', limits: {}, accountId: 'acc-azn' }} showBalance={false} />
      {kind === 'debit' && (
        <div className="chips">
          {[['navy', 'Petrol'], ['mint', 'Caspian'], ['violet', 'Saffron']].map(([k, l]) => <button key={k} className={'chip' + (design === k ? ' on' : '')} onClick={() => setDesign(k)}>{l}</button>)}
        </div>
      )}
      <div className="block flush">
        {opts[kind].lines.map((l) => <div key={l} className="li"><span className="li-ico"><Check size={18} color="var(--sea)" /></span><span className="li-main">{l}</span></div>)}
        {kind === 'debit' && <div className="li"><span className="li-ico"><Truck size={18} /></span><span className="li-main"><span className="li-title">Delivery address</span><span className="li-sub">Baku, Nasimi district</span></span></div>}
      </div>
      <div className="sticky-cta">
        <button className="btn primary block" onClick={() => { bank.orderCard(kind); toast(kind === 'virtual' ? 'Your virtual card is ready' : 'Card ordered. We will notify you.'); nav(kind === 'virtual' ? '/cards' : '/'); }} data-nav-id="confirm-order">
          {kind === 'virtual' ? 'Get virtual card' : 'Order card'}
        </button>
      </div>
    </section>
  );
}
