// /app/split/:txId: ask friends to pay their share of a payment.
// Only requests are sent; nothing is taken from anyone (split.request.prepare, R2).
import React from 'react';
import { useBank, useField, useUi } from '../../runtime';
import { Loading, ErrorState } from '../components/States';

export default function SplitBill({ txId }: { txId: string }) {
  const { intent } = useUi();
  const tx = useBank('transaction', { id: txId });
  const contacts = useBank('contacts');
  const people = useField('split', 'split-people'); // comma-separated contact tokens
  const chosen = (people.value || '').split(',').filter(Boolean);
  // TODO(data): split.calculate returns the per-person share; the UI never divides money itself.
  const share = useBank('split.calculate', { txId, people: chosen.length + 1 });
  const toggle = (t: string) => intent({ type: 'field.set', form: 'split', field: 'split-people', value: (chosen.includes(t) ? chosen.filter((x) => x !== t) : [...chosen, t]).join(',') });

  return (
    <section className="screen no-tabs split-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => intent({ type: 'navigate', to: `/app/history/${txId}` })} data-nav-id="back">‹</button><h1>Split the bill</h1><span /></header>
      {tx.status === 'loading' && <Loading />}
      {tx.status === 'error' && <ErrorState onRetry={tx.retry} />}
      {tx.status === 'ready' && (
        <div className="block">
          <span className="eyebrow">{tx.data.title} · {tx.data.date}</span>
          <span className="num split-total">{tx.data.amount}</span>
          <span className="small" data-nav-id="split-share">
            {chosen.length === 0 ? 'Choose who shared it with you.' : share.status === 'ready' ? `${chosen.length + 1} people · ${share.data.each} each` : 'Calculating…'}
          </span>
        </div>
      )}
      {contacts.status === 'ready' && (
        <ul className="block flush split-people" aria-label="People">
          {contacts.data.map((c: { token: string; name: string }) => (
            <li key={c.token}>
              <label className="li" data-nav-id={`split-${c.token}`}>
                <input type="checkbox" checked={chosen.includes(c.token)} onChange={() => toggle(c.token)} />
                <span className="li-main"><span className="li-title">{c.name}</span></span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="sticky-cta">
        <button type="button" className="btn primary block" disabled={chosen.length === 0} onClick={() => intent({ type: 'submit', form: 'split' })} data-nav-id="split-send">
          {chosen.length ? `Send ${chosen.length} ${chosen.length === 1 ? 'request' : 'requests'}` : 'Send requests'}
        </button>
      </div>
    </section>
  );
}
