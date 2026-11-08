// /split/:txId: ask people to pay their share of a payment (split.calculate, split.request.prepare).
// Only requests are sent; nothing is taken from anyone. The share is calculated by the bank.
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { hub, useField, useUi } from '../../runtime/hub.ts';
import { useBank } from '../../runtime/bank.ts';
import { Loading, ErrorState } from '../components/States';
import { money, shortDate, initials } from '../components/format';

type Tx = { id: string; date: string; title: string; amount: number; currency: string };

export default function SplitBill() {
  const nav = useNavigate();
  const { txId = '' } = useParams();
  const txs = useBank<{ items: Tx[] }>('transactions', { limit: 200 });
  const contacts = useBank<{ items: { id: string; name: string }[] }>('contacts');
  const people = useField('split', 'split-people'); // names, comma separated
  const busy = useUi((s) => !['idle', 'paused', 'error', 'handoff'].includes(s.agent.status));
  const chosen = people.value.split(',').map((x) => x.trim()).filter(Boolean);
  const toggle = (n: string) => people.onChange((chosen.includes(n) ? chosen.filter((x) => x !== n) : [...chosen, n]).join(', '));
  const tx = txs.data?.items.find((t) => t.id === txId);
  return (
    <main className="screen no-tabs screen-enter split-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => nav(-1)} data-nav-id="back">‹</button><h1>Split the bill</h1><span /></header>
      {txs.status === 'loading' && <Loading />}
      {txs.status === 'error' && <ErrorState onRetry={txs.reload} />}
      {txs.status === 'ready' && !tx && <ErrorState title="Payment not found" />}
      {tx && (
        <div className="block">
          <span className="eyebrow">{tx.title} · {shortDate(tx.date)}</span>
          <span className="num split-total">{money(Math.abs(tx.amount), tx.currency)}</span>
          {/* TODO(data): show the per-person share from split.calculate once the app API exposes it. */}
          <span className="small muted" data-nav-id="split-share">{chosen.length ? `${chosen.length + 1} people including you. The bank works out each share.` : 'Choose who shared it with you.'}</span>
        </div>
      )}
      {contacts.status === 'ready' && (
        <ul className="block flush split-people" aria-label="People">
          {contacts.data!.items.map((c) => (
            <li key={c.id}>
              <label className="li" data-nav-id={`split-${c.id}`}>
                <input type="checkbox" checked={chosen.includes(c.name)} onChange={() => toggle(c.name)} />
                <span className="tc-avatar" aria-hidden="true">{initials(c.name)}</span>
                <span className="li-main"><span className="li-title">{c.name}</span></span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="sticky-cta">
        <button type="button" className="btn primary block" disabled={busy || !tx || !chosen.length} onClick={() => tx && hub.input(`Split my ${tx.title} payment of ${Math.abs(tx.amount)} ${tx.currency} with ${chosen.join(' and ')}`)} data-nav-id="split-send">
          {chosen.length ? `Send ${chosen.length} ${chosen.length === 1 ? 'request' : 'requests'}` : 'Send requests'}
        </button>
      </div>
    </main>
  );
}
