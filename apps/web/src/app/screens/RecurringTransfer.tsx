// /app/transfers/recurring: send the same amount to someone on a schedule.
import React from 'react';
import { Repeat } from 'lucide-react';
import { useBank, useField, useUi } from '../../runtime';
import { Loading, Empty, ErrorState } from '../components/States';

type Plan = { id: string; title: string; amount: string; next: string; status: 'active' | 'paused' };

export default function RecurringTransfer() {
  const { intent } = useUi();
  // TODO(data): a list of existing recurring transfers and the contact list (masked).
  const plans = useBank('transfers.recurring');
  const contacts = useBank('contacts');
  const to = useField('recurring', 'recurring-recipient');
  const amount = useField('recurring', 'recurring-amount');
  const day = useField('recurring', 'recurring-day');
  const start = useField('recurring', 'recurring-start');

  return (
    <section className="screen no-tabs rec-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => intent({ type: 'navigate', to: '/app/transfers' })} data-nav-id="back">‹</button><h1>Recurring transfer</h1><span /></header>

      <h2 className="sec-h">Active</h2>
      {plans.status === 'loading' && <Loading />}
      {plans.status === 'error' && <ErrorState onRetry={plans.retry} />}
      {plans.status === 'ready' && plans.data.length === 0 && <Empty title="No recurring transfers yet" />}
      {plans.status === 'ready' && plans.data.length > 0 && (
        <ul className="block flush rec-list">
          {plans.data.map((p: Plan) => (
            <li key={p.id} className="li" data-nav-id={`recurring-${p.id}`}>
              <span className="li-ico" aria-hidden="true"><Repeat size={18} /></span>
              <span className="li-main"><span className="li-title">{p.title}</span><span className="li-sub">Every month · next {p.next}</span></span>
              <span className="li-right num">{p.amount}</span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="sec-h">New</h2>
      <div className="field">
        <label htmlFor="rec-to">To</label>
        {contacts.status === 'ready'
          ? <select id="rec-to" className="input" {...to}><option value="">Choose a person</option>{contacts.data.map((c: { token: string; name: string }) => <option key={c.token} value={c.token}>{c.name}</option>)}</select>
          : <Loading />}
      </div>
      <div className="field"><label htmlFor="rec-amount">Amount every month, AZN</label><input id="rec-amount" className="input num" inputMode="decimal" placeholder="0.00" {...amount} /></div>
      <div className="field"><label htmlFor="rec-day">Day of the month</label><input id="rec-day" className="input num" inputMode="numeric" placeholder="1–28" {...day} /></div>
      <div className="field"><label htmlFor="rec-start">First payment</label><input id="rec-start" className="input" type="date" {...start} /></div>

      <div className="sticky-cta">
        <button type="button" className="btn primary block" onClick={() => intent({ type: 'submit', form: 'recurring' })} data-nav-id="recurring-continue">Continue</button>
      </div>
    </section>
  );
}
