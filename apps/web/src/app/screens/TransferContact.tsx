// /app/transfers/contact: send money to a person from the contact list.
// Form values live in the hub (useField) so the agent and the customer fill the same form.
import React from 'react';
import { useBank, useField, useUi } from '../../runtime';
import { Loading, Empty, ErrorState } from '../components/States';

type Contact = { token: string; name: string; short?: string; maskedCard?: string };
type Source = { token: string; name: string; masked: string; available: string };

export default function TransferContact() {
  const { intent } = useUi();
  const query = useField('transfer', 'transfer-recipient');
  const amount = useField('transfer', 'transfer-amount');
  const source = useField('transfer', 'transfer-source');
  // TODO(data): contacts.search returns masked contacts; the "recipient" field holds the contact token, not a number.
  const contacts = useBank('contacts', { q: query.value });
  const sources = useBank('accounts');

  return (
    <section className="screen no-tabs tc-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => intent({ type: 'navigate', to: '/app/transfers' })} data-nav-id="back">‹</button><h1>Send to a contact</h1><span /></header>

      <div className="field">
        <label htmlFor="tc-recipient">Who are you sending to?</label>
        <input id="tc-recipient" className="input" type="search" placeholder="Name" autoComplete="off" {...query} />
      </div>

      {contacts.status === 'loading' && <Loading label="Finding contacts…" />}
      {contacts.status === 'error' && <ErrorState onRetry={contacts.retry} />}
      {contacts.status === 'ready' && contacts.data.length === 0 && <Empty title="No one found" sub="Check the name, or send by card number." />}
      {contacts.status === 'ready' && contacts.data.length > 0 && (
        <ul className="block flush tc-list" aria-label="Contacts">
          {contacts.data.map((c: Contact) => (
            <li key={c.token}>
              <button type="button" className={'li' + (query.value === c.name ? ' on' : '')} onClick={() => intent({ type: 'field.set', form: 'transfer', field: 'transfer-recipient', value: c.name })} data-nav-id={`contact-${c.token}`}>
                <span className="avatar" aria-hidden="true">{c.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                <span className="li-main"><span className="li-title">{c.name}</span>{c.maskedCard && <span className="li-sub num">{c.short ? `${c.short} · ` : ''}{c.maskedCard}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="field">
        <label htmlFor="tc-amount">Amount, AZN</label>
        <input id="tc-amount" className="input num tc-amount" inputMode="decimal" placeholder="0.00" {...amount} />
      </div>

      <div className="field">
        <label htmlFor="tc-source">From</label>
        {sources.status === 'ready' ? (
          <select id="tc-source" className="input" {...source}>
            {sources.data.map((s: Source) => <option key={s.token} value={s.token}>{s.name} {s.masked} · {s.available}</option>)}
          </select>
        ) : sources.status === 'error' ? <ErrorState onRetry={sources.retry} /> : <Loading />}
      </div>

      <div className="sticky-cta">
        {/* Continue only asks the runtime to prepare; the confirmation screen shows what the Bridge returns. */}
        <button type="button" className="btn primary block" onClick={() => intent({ type: 'submit', form: 'transfer' })} data-nav-id="transfer-continue">Continue</button>
      </div>
    </section>
  );
}
