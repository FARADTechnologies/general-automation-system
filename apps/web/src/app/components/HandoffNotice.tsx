// Handoff notice overlay (ui.modal.kind === 'handoff'): the request went to a person.
import React from 'react';
import { Headset, Check, Clock } from 'lucide-react';
import { useUi, useBank } from '../../runtime';
import { Loading, ErrorState } from './States';

export default function HandoffNotice() {
  const { ui, intent } = useUi();
  const m = ui.modal;
  // TODO(data): a "handoff" resource by ticket id with { reference, request, done[], pending[], eta } is assumed here.
  const ticket = useBank('handoff', m && m.kind === 'handoff' ? { ticketId: m.ticketId } : undefined);
  if (!m || m.kind !== 'handoff') return null;
  return (
    <div className="handoff-overlay" role="dialog" aria-modal="true" aria-labelledby="handoff-title" data-nav-id="handoff-notice">
      <div className="handoff-sheet">
        <span className="handoff-ico" aria-hidden="true"><Headset size={26} /></span>
        <h2 id="handoff-title">A bank specialist has your request</h2>
        {ticket.status === 'loading' && <Loading />}
        {ticket.status === 'error' && <ErrorState onRetry={ticket.retry} />}
        {ticket.status === 'ready' && (
          <>
            <p className="handoff-ref">Reference <span className="num">{ticket.data.reference}</span>{ticket.data.eta && <> · {ticket.data.eta}</>}</p>
            <h3>Already done</h3>
            <ul className="handoff-list">
              {ticket.data.done.length === 0 && <li><Clock size={16} aria-hidden="true" /> Nothing was changed. No money moved.</li>}
              {ticket.data.done.map((d: string) => <li key={d}><Check size={16} aria-hidden="true" /> {d}</li>)}
            </ul>
            <h3>The specialist will</h3>
            <ul className="handoff-list">
              {ticket.data.pending.map((d: string) => <li key={d}><Clock size={16} aria-hidden="true" /> {d}</li>)}
            </ul>
          </>
        )}
        <button type="button" className="btn primary block" onClick={() => intent({ type: 'modal.close' })} data-nav-id="handoff-close">OK</button>
      </div>
    </div>
  );
}
