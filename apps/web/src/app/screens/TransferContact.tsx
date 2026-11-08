// /transfers/contact: send money to a person from the contact list (transfer.contact.prepare).
// Note: main registers its own /transfers/contact in core-screens; this version reads contacts
// from the bank API (masked) instead of the old seed. The core team decides which one routes.
import React from 'react';
import '../../styles/transfer-contact.css';
import { useNavigate } from 'react-router-dom';
import { hub, useField, useUi } from '../../runtime/hub.ts';
import { useBank } from '../../runtime/bank.ts';
import { Loading, Empty, ErrorState } from '../components/States';
import { initials, masked } from '../components/format';

type Contact = { id: string; name: string; phoneMasked: string; cardLast4: string };

export default function TransferContact() {
  const nav = useNavigate();
  const recipient = useField('transfer', 'transfer-recipient');
  const amount = useField('transfer', 'transfer-amount');
  const source = useField('transfer', 'transfer-source');
  const contacts = useBank<{ items: Contact[] }>('contacts');
  const busy = useUi((s) => !['idle', 'paused', 'error', 'handoff'].includes(s.agent.status));
  const q = recipient.value.trim().toLowerCase();
  const list = (contacts.data?.items || []).filter((c) => !q || c.name.toLowerCase().includes(q));
  const submit = () => { if (recipient.value && amount.value) hub.input(`Send ${amount.value} AZN to ${recipient.value}${source.value ? ` from ${source.value}` : ''}`); };

  return (
    <main className="screen no-tabs screen-enter tc-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => nav(-1)} data-nav-id="back">‹</button><h1>Send to a contact</h1><span /></header>
      <div className="field">
        <label htmlFor="tc-recipient">Who are you sending to?</label>
        <input id="tc-recipient" className="input" type="search" placeholder="Name" autoComplete="off" {...recipient} />
      </div>
      {contacts.status === 'loading' && <Loading label="Loading contacts…" />}
      {contacts.status === 'error' && <ErrorState onRetry={contacts.reload} />}
      {contacts.status === 'ready' && list.length === 0 && <Empty title="No one found" sub="Check the name, or send by card number." />}
      {contacts.status === 'ready' && list.length > 0 && (
        <ul className="block flush tc-list" aria-label="Contacts">
          {list.slice(0, 8).map((c) => (
            <li key={c.id}>
              <button type="button" className={'li' + (recipient.value === c.name ? ' on' : '')} onClick={() => recipient.onChange(c.name)} data-nav-id={`contact-${c.id}`}>
                <span className="tc-avatar" aria-hidden="true">{initials(c.name)}</span>
                <span className="li-main"><span className="li-title">{c.name}</span><span className="li-sub num">{masked(c.cardLast4)} · {c.phoneMasked}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="field"><label htmlFor="tc-amount">Amount, AZN</label><input id="tc-amount" className="input num tc-amount" inputMode="decimal" placeholder="0.00" autoComplete="off" {...amount} /></div>
      <div className="field"><label htmlFor="tc-source">From (optional)</label><input id="tc-source" className="input" placeholder="Main account" autoComplete="off" {...source} /></div>
      <div className="sticky-cta">
        <button type="button" className="btn primary block" disabled={busy || !recipient.value || !amount.value} onClick={submit} data-nav-id="transfer-continue">Continue</button>
      </div>
    </main>
  );
}
