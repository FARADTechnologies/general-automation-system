// Screens the runtime needs for the agent's capabilities (manifest `ui.route`).
// The designer may restyle them through CSS; field IDs follow docs/UI_CONTRACT.md.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Receipt, Repeat, Headset } from 'lucide-react';
import { Header, Avatar, Li, Empty } from '../components/ui.jsx';
import { useStore } from '../store/Store.jsx';
import { useField, hub, useUi } from '../../runtime/hub.ts';
import { useBank } from '../../runtime/bank.ts';

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

export function Subscriptions() {
  const subs = useBank('subscriptions');
  const items = subs.data?.items || [];
  return (
    <main className="screen no-tabs screen-enter">
      <Header title="Subscriptions" />
      {subs.status === 'loading' && <Empty icon={<Repeat size={26} />} title="Loading subscriptions…" />}
      {subs.status === 'error' && <Empty icon={<Repeat size={26} />} title="Cannot load subscriptions" sub="Pull to try again." />}
      {subs.status === 'ready' && !items.length && <Empty icon={<Repeat size={26} />} title="No subscriptions" sub="Card subscriptions will appear here." />}
      {items.length > 0 && (
        <div className="block flush">
          {items.map((s) => (
            <Li key={s.id} id={'sub-' + s.id} icon={<Repeat size={19} />} title={s.merchant}
              sub={s.status === 'active' ? `Next charge ${s.nextCharge} · card •••• ${s.cardLast4}` : 'Cancelled'}
              right={<span className="num" style={s.status !== 'active' ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{s.amount.toFixed(2)} {s.currency}</span>} />
          ))}
        </div>
      )}
      <p className="tiny muted" style={{ textAlign: 'center' }}>To cancel one, ask the assistant, for example “Cancel my Netflix subscription”.</p>
    </main>
  );
}

export function HandoffNotice() {
  const modal = useUi((s) => s.modal);
  if (modal?.kind !== 'handoff') return null;
  return (
    <div className="chooser-backdrop" role="dialog" aria-modal="true" aria-label="Bank specialist">
      <div className="chooser">
        <strong><Headset size={18} /> A bank specialist has your request</strong>
        <p className="small muted" style={{ margin: 0 }}>Ticket {modal.ticketId}. The specialist already sees what the assistant did and what is pending, so you will not have to repeat anything.</p>
        <button className="btn block" data-nav-id="handoff-close" onClick={() => hub.intent({ type: 'modal.close' })}>OK</button>
      </div>
    </div>
  );
}

export const CORE_SCREENS = [
  ['/transfers/contact', TransferContact],
  ['/payments/bill', BillPay],
  ['/subscriptions', Subscriptions],
];
