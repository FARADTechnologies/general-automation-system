// /subscriptions: subscriptions charged to the customer's cards, with cancel (subscription.cancel.prepare, R2).
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Repeat } from 'lucide-react';
import { hub, useUi } from '../../runtime/hub.ts';
import { useBank } from '../../runtime/bank.ts';
import { Loading, Empty, ErrorState } from '../components/States';
import { money, masked, shortDate } from '../components/format';

type Sub = { id: string; merchant: string; amount: number; currency: string; cardLast4: string; nextCharge?: string; status: string };

export default function Subscriptions() {
  const nav = useNavigate();
  const subs = useBank<{ items: Sub[] }>('subscriptions');
  const busy = useUi((s) => !['idle', 'paused', 'error', 'handoff'].includes(s.agent.status));
  const items = subs.data?.items || [];
  return (
    <main className="screen no-tabs screen-enter subs-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => nav(-1)} data-nav-id="back">‹</button><h1>Subscriptions</h1><span /></header>
      {subs.status === 'loading' && <Loading />}
      {subs.status === 'error' && <ErrorState onRetry={subs.reload} />}
      {subs.status === 'ready' && items.length === 0 && <Empty title="No subscriptions" sub="Nothing charges your cards regularly." />}
      {subs.status === 'ready' && items.length > 0 && (
        <>
          <ul className="block flush subs-list">
            {items.map((s) => (
              <li key={s.id} className="li" data-nav-id={`sub-${s.id}`}>
                <span className="li-ico" aria-hidden="true"><Repeat size={18} /></span>
                <span className="li-main"><span className="li-title">{s.merchant}</span><span className="li-sub num">{money(s.amount, s.currency)} · {masked(s.cardLast4)}{s.status === 'active' && s.nextCharge ? ` · next ${shortDate(s.nextCharge)}` : ''}</span></span>
                {s.status === 'active'
                  ? <button type="button" className="btn sm" disabled={busy} onClick={() => hub.input(`Cancel my ${s.merchant} subscription`)} data-nav-id={`sub-cancel-${s.id}`} aria-label={`Cancel ${s.merchant}`}>Cancel</button>
                  : <span className="pill soft">Cancelled</span>}
              </li>
            ))}
          </ul>
          <p className="tiny muted">Cancelling stops future charges on your card. The bank asks you to confirm first.</p>
        </>
      )}
    </main>
  );
}
