// /app/subscriptions: subscriptions charged to the customer's cards, with cancel.
// Cancel is an R2 action: the button asks the runtime to prepare it; the bank confirmation follows.
import React from 'react';
import { Repeat } from 'lucide-react';
import { useBank, useUi } from '../../runtime';
import { Loading, Empty, ErrorState } from '../components/States';

type Sub = { id: string; name: string; amount: string; cardMasked: string; next?: string; status: 'active' | 'cancelled' };

export default function Subscriptions() {
  const { intent } = useUi();
  // TODO(data): subscriptions.list, with the monthly total formatted by the bank.
  const subs = useBank('subscriptions');
  return (
    <section className="screen no-tabs subs-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => intent({ type: 'navigate', to: '/app/payments' })} data-nav-id="back">‹</button><h1>Subscriptions</h1><span /></header>
      {subs.status === 'loading' && <Loading />}
      {subs.status === 'error' && <ErrorState onRetry={subs.retry} />}
      {subs.status === 'ready' && subs.data.items.length === 0 && <Empty title="No subscriptions" sub="Nothing charges your cards every month." />}
      {subs.status === 'ready' && subs.data.items.length > 0 && (
        <>
          <div className="block"><span className="eyebrow">Every month</span><span className="num subs-total" data-nav-id="subs-total">{subs.data.monthlyTotal}</span></div>
          <ul className="block flush subs-list">
            {subs.data.items.map((s: Sub) => (
              <li key={s.id} className="li" data-nav-id={`sub-${s.id}`}>
                <span className="li-ico" aria-hidden="true"><Repeat size={18} /></span>
                <span className="li-main"><span className="li-title">{s.name}</span><span className="li-sub num">{s.amount} · {s.cardMasked}{s.status === 'active' && s.next ? ` · next ${s.next}` : ''}</span></span>
                {s.status === 'cancelled'
                  ? <span className="pill soft">Cancelled</span>
                  : <button type="button" className="btn sm" onClick={() => intent({ type: 'tap', target: `sub-cancel-${s.id}` })} data-nav-id={`sub-cancel-${s.id}`} aria-label={`Cancel ${s.name}`}>Cancel</button>}
              </li>
            ))}
          </ul>
          <p className="tiny muted">Cancelling stops future charges on your card. You keep access until the paid period ends.</p>
        </>
      )}
    </section>
  );
}
