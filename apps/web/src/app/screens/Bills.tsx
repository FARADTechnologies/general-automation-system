// /app/bills: every unpaid bill, paid together in one confirmation (bills.pay_all.prepare).
import React from 'react';
import { CheckCircle2, Receipt } from 'lucide-react';
import { useBank, useField, useUi } from '../../runtime';
import { Loading, Empty, ErrorState } from '../components/States';

type Bill = { billerId: string; name: string; maskedAccount: string; amount: string; due?: string };

export default function Bills() {
  const { intent } = useUi();
  // TODO(data): bills.list_unpaid; amounts arrive formatted ("23.40 AZN") plus a total, the UI does not add them up.
  const bills = useBank('bills.unpaid');
  // Which bills are included is a hub field so the agent can say "pay all except gas". Comma-separated biller ids.
  const selected = useField('bills', 'bills-selected');
  const ids = (selected.value || '').split(',').filter(Boolean);
  const toggle = (id: string) => intent({ type: 'field.set', form: 'bills', field: 'bills-selected', value: (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]).join(',') });

  return (
    <section className="screen no-tabs bills-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => intent({ type: 'navigate', to: '/app/payments' })} data-nav-id="back">‹</button><h1>My bills</h1><span /></header>
      {bills.status === 'loading' && <Loading label="Checking your bills…" />}
      {bills.status === 'error' && <ErrorState onRetry={bills.retry} />}
      {bills.status === 'ready' && bills.data.items.length === 0 && <Empty icon={<CheckCircle2 size={30} />} title="All bills are paid" sub="Nothing to pay right now." />}
      {bills.status === 'ready' && bills.data.items.length > 0 && (
        <>
          <div className="block bills-total">
            <span className="eyebrow">Unpaid now</span>
            <span className="num bills-sum" data-nav-id="bills-total">{bills.data.total}</span>
            <span className="small muted">{bills.data.items.length} unpaid bills</span>
          </div>
          <ul className="block flush bills-list">
            {bills.data.items.map((b: Bill) => (
              <li key={b.billerId}>
                <label className="li" data-nav-id={`bill-${b.billerId}`}>
                  <input type="checkbox" checked={ids.length === 0 || ids.includes(b.billerId)} onChange={() => toggle(b.billerId)} aria-label={`Include ${b.name}`} />
                  <span className="li-ico" aria-hidden="true"><Receipt size={18} /></span>
                  <span className="li-main"><span className="li-title">{b.name}</span><span className="li-sub num">Account {b.maskedAccount}{b.due ? ` · due ${b.due}` : ''}</span></span>
                  <span className="li-right num">{b.amount}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="tiny muted">You confirm once for all selected bills. Each bill gets its own receipt.</p>
          <div className="sticky-cta">
            <button type="button" className="btn primary block" onClick={() => intent({ type: 'submit', form: 'bills' })} data-nav-id="bills-pay-all">
              {ids.length === 0 || ids.length === bills.data.items.length ? 'Pay all bills' : `Pay ${ids.length} bills`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
