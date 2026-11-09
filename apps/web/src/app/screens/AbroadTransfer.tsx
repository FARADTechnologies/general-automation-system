// /transfers/abroad: international (SWIFT) transfer by IBAN (transfer.intl.prepare).
// The form is held by the session hub, so the assistant's choreography fills it on every screen.
// The IBAN shown after the assistant prepared a transfer is the bank's masked form; the full IBAN
// stays in the bank's vault. Continue sends the request to the assistant, which prepares it and
// opens the bank's confirmation screen; nothing moves without that confirmation.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe2 } from 'lucide-react';
import { hub, useField, useUi } from '../../runtime/hub.ts';

export default function AbroadTransfer() {
  const nav = useNavigate();
  const beneficiary = useField('abroad', 'abroad-beneficiary');
  const iban = useField('abroad', 'abroad-iban');
  const swift = useField('abroad', 'abroad-swift');
  const country = useField('abroad', 'abroad-country');
  const amount = useField('abroad', 'abroad-amount');
  const busy = useUi((s) => !['idle', 'paused', 'error', 'handoff'].includes(s.agent.status));
  const ready = beneficiary.value && iban.value && swift.value && amount.value;
  const submit = () => {
    if (!ready) return;
    const amt = /[A-Z]{3}$/.test(amount.value.trim()) ? amount.value.trim() : `${amount.value.trim()} AZN`;
    hub.input(`Send ${amt} abroad to ${beneficiary.value}, IBAN ${iban.value}, SWIFT ${swift.value}${country.value ? `, ${country.value}` : ''}`);
  };

  return (
    <main className="screen no-tabs screen-enter">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => nav(-1)} data-nav-id="back">‹</button><h1>International transfer</h1><span /></header>
      <div className="block" style={{ flexDirection: 'row', gap: 10, alignItems: 'center', background: 'color-mix(in srgb, var(--saffron) 18%, var(--surface))', boxShadow: 'none' }}>
        <Globe2 size={20} /><span className="small">SWIFT transfers arrive in 1–3 business days. Fee 0.2%, minimum 15.</span>
      </div>
      <div className="field"><label htmlFor="ab-ben">Beneficiary full name</label><input id="ab-ben" className="input" placeholder="e.g. Ali Yilmaz" autoComplete="off" {...beneficiary} /></div>
      <div className="field"><label htmlFor="ab-iban">IBAN</label><input id="ab-iban" className="input num" placeholder="TR00 0000 0000 0000 0000 0000 00" autoComplete="off" {...iban} /></div>
      <div className="field"><label htmlFor="ab-swift">SWIFT / BIC</label><input id="ab-swift" className="input num" placeholder="e.g. TGBATRIS" autoComplete="off" {...swift} /></div>
      <div className="field"><label htmlFor="ab-country">Country</label><input id="ab-country" className="input" placeholder="e.g. Türkiye" autoComplete="off" {...country} /></div>
      <div className="field"><label htmlFor="ab-amount">Amount</label><input id="ab-amount" className="input num" inputMode="decimal" placeholder="0.00 AZN" autoComplete="off" {...amount} /></div>
      <div className="sticky-cta">
        <button type="button" className="btn primary block" disabled={busy || !ready} onClick={submit} data-nav-id="abroad-continue">Continue</button>
      </div>
    </main>
  );
}
