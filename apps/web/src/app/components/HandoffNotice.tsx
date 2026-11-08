// Handoff notice overlay (ui.modal.kind === 'handoff'): the request went to a person.
import React from 'react';
import { Headset, Clock } from 'lucide-react';
import { hub, useUi } from '../../runtime/hub.ts';
import { Loading } from './States';

export default function HandoffNotice() {
  const modal = useUi((s) => s.modal);
  const goal = useUi((s) => s.plan?.goal);
  const steps = useUi((s) => s.plan?.steps || []);
  if (!modal || modal.kind !== 'handoff') return null;
  const done = steps.filter((s) => s.status === 'done');
  const open = steps.filter((s) => s.status !== 'done' && s.status !== 'skipped');
  return (
    <div className="handoff-overlay" role="dialog" aria-modal="true" aria-labelledby="handoff-title" data-nav-id="handoff-notice">
      <div className="handoff-sheet">
        <span className="handoff-ico" aria-hidden="true"><Headset size={26} /></span>
        <h2 id="handoff-title">A bank specialist has your request</h2>
        <p className="handoff-ref">Reference <span className="num">{modal.ticketId}</span></p>
        {goal && <p className="handoff-goal">“{goal}”</p>}
        <h3>Already done</h3>
        <ul className="handoff-list">
          {done.length === 0 ? <li><Clock size={16} aria-hidden="true" /> Nothing was changed. No money moved.</li> : done.map((s) => <li key={s.id}>✓ {s.title}</li>)}
        </ul>
        <h3>The specialist will</h3>
        {/* TODO(data): handoff ticket details (eta, what the specialist will do) from handoff.create; until then the open plan steps are shown. */}
        {open.length ? (
          <ul className="handoff-list">{open.map((s) => <li key={s.id}><Clock size={16} aria-hidden="true" /> {s.title}</li>)}</ul>
        ) : <Loading label="Waiting for the specialist's notes…" />}
        <button type="button" className="btn primary block" onClick={() => hub.intent({ type: 'modal.close' })} data-nav-id="handoff-close">OK</button>
      </div>
    </div>
  );
}
