import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Snowflake, Wifi } from 'lucide-react';
import { groupCard, last4, money, useStore } from '../store/Store.jsx';

export function Header({ title, back = -1, right = null }) {
  const nav = useNavigate();
  return (
    <div className="hdr">
      {back !== null ? (
        <button className="icon-btn" aria-label="Back" data-nav-id="back" onClick={() => (back === -1 ? nav(-1) : nav(back))}>
          <ChevronLeft size={22} />
        </button>
      ) : <span />}
      <h1>{title}</h1>
      <div>{right}</div>
    </div>
  );
}

export function Li({ icon, avatar, title, sub, right, rightSub, onClick, chevron = !!onClick, id, tone }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className="li" onClick={onClick} data-nav-id={id}>
      {avatar || (icon && <span className="li-ico" style={tone ? { background: tone + '22', color: tone } : undefined}>{icon}</span>)}
      <span className="li-main">
        <span className="li-title">{title}</span>
        {sub && <span className="li-sub">{sub}</span>}
      </span>
      {(right || rightSub) && (
        <span className="li-right num">
          {right}
          {rightSub && <span className="tiny muted" style={{ fontWeight: 500 }}>{rightSub}</span>}
        </span>
      )}
      {chevron && <ChevronRight size={18} className="chev" />}
    </Tag>
  );
}

export function Avatar({ name, color = '#1f8a70', size }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return <span className={'avatar' + (size === 'lg' ? ' lg' : '')} style={{ background: color }}>{initials}</span>;
}

export function CardArt({ card, small = false, showBalance = true, reveal = false }) {
  const { state, bank } = useStore();
  const funds = bank.fundsOf(card);
  const hide = state.settings.hideBalance;
  return (
    <div className={`cardart ${card.style}${small ? ' sm' : ''}${card.frozen ? ' frozen' : ''}`}>
      {card.frozen && <span className="frozen-badge"><Snowflake size={12} /> Frozen</span>}
      <div className="ca-top">
        <div>
          <div className="ca-brand">CASPIA</div>
          <div className="ca-product">{card.product}{card.virtual ? ' · Virtual' : ''}</div>
        </div>
        {!card.virtual && <Wifi size={20} style={{ transform: 'rotate(90deg)', opacity: 0.85 }} />}
      </div>
      {showBalance ? (
        <div className="ca-bal">
          <small>{card.creditLimit ? 'Available limit' : 'Balance'}</small>
          <strong>{hide ? '•••••' : money(funds, bank.currencyOf(card))}</strong>
        </div>
      ) : (
        <div className="row"><span className="ca-chip" /></div>
      )}
      <div className="ca-bottom">
        <span className="ca-num">{reveal ? groupCard(card.number) : `•••• ${last4(card.number)}`}</span>
        <span className="row" style={{ gap: 10 }}>
          <span className="tiny" style={{ opacity: 0.85 }}>{card.expiry}</span>
          <span className="ca-net">{card.network === 'VISA' ? 'VISA' : 'mastercard'}</span>
        </span>
      </div>
    </div>
  );
}

export function MiniCard({ card }) {
  const bg = { navy: 'linear-gradient(140deg,#0f2a33,#1b4a57)', violet: 'linear-gradient(140deg,#2b1d0a,#f2b33d)', mint: 'linear-gradient(140deg,#0f5a49,#5cc6a6)' }[card.style];
  return <span className="mini-card" style={{ background: bg }} />;
}

export function CardPicker({ value, onChange, includeCredit = true, label = 'From card' }) {
  const { state, bank } = useStore();
  const cards = state.cards.filter((c) => includeCredit || !c.creditLimit);
  return (
    <div className="field">
      <label>{label}</label>
      <div className="stack" style={{ gap: 8 }}>
        {cards.map((c) => (
          <button key={c.id} type="button" className={'select-card' + (value === c.id ? ' on' : '')} onClick={() => onChange(c.id)} data-nav-id={'pick-card-' + c.id} disabled={c.frozen}>
            <MiniCard card={c} />
            <span className="grow">
              <span style={{ display: 'block', fontWeight: 600 }}>{c.name} •••• {last4(c.number)}</span>
              <span className="tiny muted num">{c.frozen ? 'Frozen' : (c.creditLimit ? 'Limit ' : '') + money(bank.fundsOf(c), bank.currencyOf(c))}</span>
            </span>
            <span className={'radio' + (value === c.id ? ' on' : '')} style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--line)', background: value === c.id ? 'var(--sea)' : 'transparent', boxShadow: value === c.id ? 'inset 0 0 0 3px var(--surface)' : 'none' }} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, id, label }) {
  return (
    <label className="toggle" aria-label={label}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function Seg({ value, onChange, options }) {
  return (
    <div className="seg" role="tablist">
      {options.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)} data-nav-id={'seg-' + k}>{l}</button>
      ))}
    </div>
  );
}

export const cleanAmount = (v) => {
  let s = String(v).replace(',', '.').replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, 2);
  return s.replace(/^0+(\d)/, '$1').slice(0, 9);
};

export function AmountInput({ value, onChange, currency = 'AZN', quick = [10, 20, 50, 100], id = 'amount' }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="amount" data-nav-id="amount">
        <input id={id} inputMode="decimal" placeholder="0" value={value} onChange={(e) => onChange(cleanAmount(e.target.value))} aria-label="Amount" />
        <span>{currency}</span>
      </div>
      {quick && (
        <div className="chips">
          {quick.map((q) => <button key={q} type="button" className="chip" onClick={() => onChange(String(q))}>{q} {currency}</button>)}
        </div>
      )}
    </div>
  );
}

export function Sheet({ children, onClose }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="sheet" role="dialog" aria-modal="true">
        <span className="grabber" />
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon, title, sub }) {
  return <div className="empty">{icon}<strong style={{ color: 'var(--text)' }}>{title}</strong>{sub && <span className="small">{sub}</span>}</div>;
}

// Donut chart (SVG). data: [{label, value, color}]
export function Donut({ data, size = 150, center }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label="Spending by category">
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="18" />
      {data.map((d) => {
        const len = (d.value / total) * c;
        const el = <circle key={d.label} cx="70" cy="70" r={r} fill="none" stroke={d.color} strokeWidth="18" strokeDasharray={`${Math.max(len - 2, 0)} ${c}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />;
        acc += len;
        return el;
      })}
      {center && (
        <>
          <text x="70" y="66" textAnchor="middle" fontSize="11" fill="var(--muted)" fontFamily="var(--font-body)">{center[0]}</text>
          <text x="70" y="84" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text)" fontFamily="var(--font-display)">{center[1]}</text>
        </>
      )}
    </svg>
  );
}
