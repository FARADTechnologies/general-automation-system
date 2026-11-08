// /bills: every unpaid bill, paid together in one bank confirmation (bills.pay_all.prepare).
import React from 'react';
import '../../styles/bills.css';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Receipt } from 'lucide-react';
import { hub, useUi } from '../../runtime/hub.ts';
import { useBank } from '../../runtime/bank.ts';
import { Loading, Empty, ErrorState } from '../components/States';
import { money, shortDate } from '../components/format';

type Bill = { id: string; biller: string; billerCode: string; subscriber: string; amount: number; currency: string; status: string; dueDate?: string };

export default function Bills() {
  const nav = useNavigate();
  const bills = useBank<{ items: Bill[] }>('bills');
  const busy = useUi((s) => !['idle', 'paused', 'error', 'handoff'].includes(s.agent.status));
  const unpaid = (bills.data?.items || []).filter((b) => b.status === 'unpaid');
  return (
    <main className="screen no-tabs screen-enter bills-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => nav(-1)} data-nav-id="back">‹</button><h1>My bills</h1><span /></header>
      {bills.status === 'loading' && <Loading label="Checking your bills…" />}
      {bills.status === 'error' && <ErrorState onRetry={bills.reload} />}
      {bills.status === 'ready' && unpaid.length === 0 && <Empty icon={<CheckCircle2 size={30} />} title="All bills are paid" sub="Nothing to pay right now." />}
      {bills.status === 'ready' && unpaid.length > 0 && (
        <>
          <p className="bills-lead"><strong>{unpaid.length}</strong> unpaid {unpaid.length === 1 ? 'bill' : 'bills'}. You confirm once for all of them; the bank shows the total.</p>
          <ul className="block flush bills-list">
            {unpaid.map((b) => (
              <li key={b.id} className="li" data-nav-id={`bill-${b.billerCode}`}>
                <span className="li-ico" aria-hidden="true"><Receipt size={18} /></span>
                <span className="li-main"><span className="li-title">{b.biller}</span><span className="li-sub num">{b.subscriber}{b.dueDate ? ` · due ${shortDate(b.dueDate)}` : ''}</span></span>
                <span className="li-right num">{money(b.amount, b.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="sticky-cta">
            {/* Same path as the assistant: the bank prepares the batch and shows its own confirmation. */}
            <button type="button" className="btn primary block" disabled={busy} onClick={() => hub.input('Pay all my unpaid bills')} data-nav-id="bills-pay-all">Pay all bills</button>
          </div>
        </>
      )}
    </main>
  );
}
