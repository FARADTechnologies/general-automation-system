// /transfers/recurring: send the same amount to someone every month (transfer.recurring.prepare).
import React from 'react';
import '../../styles/recurring.css';
import { useNavigate } from 'react-router-dom';
import { Repeat } from 'lucide-react';
import { hub, useField, useUi } from '../../runtime/hub.ts';
import { useBank } from '../../runtime/bank.ts';
import { Loading, Empty } from '../components/States';
import { money, shortDate } from '../components/format';

type Plan = { id: string; title: string; amount: number; currency: string; next: string };
// TODO(data): the customer's standing orders for the app (the bank has /so internally, the app API does not expose it yet).
const plans = { status: 'loading' as 'loading' | 'ready' | 'error', data: undefined as Plan[] | undefined };

export default function RecurringTransfer() {
  const nav = useNavigate();
  const contacts = useBank<{ items: { id: string; name: string }[] }>('contacts');
  const to = useField('recurring', 'recurring-recipient');
  const amount = useField('recurring', 'recurring-amount');
  const day = useField('recurring', 'recurring-day');
  const busy = useUi((s) => !['idle', 'paused', 'error', 'handoff'].includes(s.agent.status));
  const ready = to.value && amount.value && day.value;
  return (
    <main className="screen no-tabs screen-enter rec-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => nav(-1)} data-nav-id="back">‹</button><h1>Recurring transfer</h1><span /></header>
      <h2 className="sec-h">Active</h2>
      {plans.status === 'loading' && <Loading />}
      {plans.status === 'ready' && plans.data!.length === 0 && <Empty title="No recurring transfers yet" />}
      {plans.status === 'ready' && plans.data!.length > 0 && (
        <ul className="block flush rec-list">
          {plans.data!.map((p) => (
            <li key={p.id} className="li" data-nav-id={`recurring-${p.id}`}>
              <span className="li-ico" aria-hidden="true"><Repeat size={18} /></span>
              <span className="li-main"><span className="li-title">{p.title}</span><span className="li-sub">Every month · next {shortDate(p.next)}</span></span>
              <span className="li-right num">{money(p.amount, p.currency)}</span>
            </li>
          ))}
        </ul>
      )}
      <h2 className="sec-h">New</h2>
      <div className="field">
        <label htmlFor="rec-to">To</label>
        <select id="rec-to" className="input" value={to.value} onChange={to.onChange} data-nav-id="recurring-recipient">
          <option value="">{contacts.status === 'ready' ? 'Choose a person' : 'Loading contacts…'}</option>
          {(contacts.data?.items || []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="rec-amount">Amount every month, AZN</label><input id="rec-amount" className="input num" inputMode="decimal" placeholder="0.00" autoComplete="off" {...amount} /></div>
      <div className="field"><label htmlFor="rec-day">Day of the month</label><input id="rec-day" className="input num" inputMode="numeric" placeholder="1–28" autoComplete="off" {...day} /></div>
      <div className="sticky-cta">
        <button type="button" className="btn primary block" disabled={busy || !ready} onClick={() => hub.input(`Send ${amount.value} AZN to ${to.value} every month on day ${day.value}`)} data-nav-id="recurring-continue">Continue</button>
      </div>
    </main>
  );
}
