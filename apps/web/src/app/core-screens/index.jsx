// Screens the runtime needs for the agent's capabilities (manifest `ui.route`).
// The designer may restyle them through CSS; field IDs follow docs/UI_CONTRACT.md.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Receipt } from 'lucide-react';
import { Header, Avatar } from '../components/ui.jsx';
import { useStore } from '../store/Store.jsx';
import { useField, hub, useUi } from '../../runtime/hub.ts';

function Field({ form, id, label, placeholder, big = false }) {
  const f = useField(form, id);
  return (
    <label className={'cfield' + (big ? ' big' : '')}>
      <span className="eyebrow">{label}</span>
      <input value={f.value} onChange={f.onChange} data-nav-id={id} placeholder={placeholder} autoComplete="off" inputMode={big ? 'decimal' : 'text'} />
    </label>
  );
}

export function TransferContact() {
  const { state } = useStore();
  const recipient = useField('transfer', 'transfer-recipient');
  const amount = useField('transfer', 'transfer-amount');
  const busy = useUi((s) => s.agent.status !== 'idle' && s.agent.status !== 'paused' && s.agent.status !== 'error');
  // Manual continue goes through the same assistant path, so every transfer is prepared and checked by the bank.
  const submit = () => { if (recipient.value && amount.value) hub.input(`Send ${amount.value} to ${recipient.value}`); };
  return (
    <main className="screen no-tabs screen-enter">
      <Header title="To a contact" />
      <Field form="transfer" id="transfer-recipient" label="Recipient" placeholder="Contact name" />
      <div className="card-rail" style={{ gap: 14 }}>
        {state.contacts.slice(0, 8).map((c) => (
          <button key={c.id} className="stack" style={{ alignItems: 'center', gap: 6, width: 62 }} onClick={() => recipient.onChange(c.name)} data-nav-id={'contact-' + c.id}>
            <Avatar name={c.name} color={c.color} size="lg" />
            <span className="tiny" style={{ fontWeight: 600 }}>{c.short}</span>
          </button>
        ))}
      </div>
      <Field form="transfer" id="transfer-amount" label="Amount" placeholder="0.00 AZN" big />
      <Field form="transfer" id="transfer-source" label="From" placeholder="Main account" />
      <div className="sticky-cta">
        <button className="btn primary block" onClick={submit} disabled={busy || !recipient.value || !amount.value} data-nav-id="transfer-continue"><Send size={18} /> Continue</button>
      </div>
    </main>
  );
}

export function BillPay() {
  const nav = useNavigate();
  const biller = useField('bill', 'bill-biller');
  return (
    <main className="screen no-tabs screen-enter">
      <Header title={biller.value || 'Pay a bill'} />
      <Field form="bill" id="bill-biller" label="Biller" placeholder="Biller" />
      <Field form="bill" id="bill-account" label="Subscriber" placeholder="Subscriber code" />
      <Field form="bill" id="bill-amount" label="Amount due" placeholder="0.00 AZN" big />
      <div className="sticky-cta">
        <button className="btn primary block" onClick={() => nav('/payments')} data-nav-id="bill-pay"><Receipt size={18} /> Pay</button>
      </div>
    </main>
  );
}

export const CORE_SCREENS = [
  ['/transfers/contact', TransferContact],
  ['/payments/bill', BillPay],
];
