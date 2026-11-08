// /app/cards/:id/replace: order a replacement card and pick it up at a branch.
import React from 'react';
import { MapPin } from 'lucide-react';
import { useBank, useField, useUi } from '../../runtime';
import { Loading, ErrorState } from '../components/States';

type Branch = { id: string; name: string; address: string; hours: string };
const REASONS = [['damaged', 'Damaged'], ['lost', 'Lost'], ['stolen', 'Stolen'], ['expiring', 'Expiring']] as const;

export default function CardReplace({ cardId }: { cardId: string }) {
  const { intent } = useUi();
  // TODO(data): the route param reaches the screen as a prop until the router wiring exists.
  const card = useBank('card', { id: cardId });
  const branches = useBank('branches');
  const reason = useField('card-replace', 'card-replace-reason');
  const branch = useField('card-replace', 'card-replace-branch');

  return (
    <section className="screen no-tabs replace-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => intent({ type: 'navigate', to: `/app/cards/${cardId}` })} data-nav-id="back">‹</button><h1>Replace card</h1><span /></header>
      {card.status === 'ready' && <div className="block"><strong>{card.data.name}</strong><span className="small muted num">{card.data.masked}</span></div>}
      {card.status === 'error' && <ErrorState onRetry={card.retry} />}

      <fieldset className="field replace-reasons">
        <legend>Why do you need a new card?</legend>
        {REASONS.map(([v, label]) => (
          <label key={v} className={'chip big' + (reason.value === v ? ' on' : '')} data-nav-id={`card-replace-reason-${v}`}>
            <input type="radio" name="replace-reason" value={v} checked={reason.value === v} onChange={reason.onChange} className="sr-only" />{label}
          </label>
        ))}
      </fieldset>
      {(reason.value === 'lost' || reason.value === 'stolen') && <p className="replace-note" role="note">The old card will be blocked as soon as you confirm.</p>}

      <fieldset className="field">
        <legend>Pick it up at</legend>
        {branches.status === 'loading' && <Loading />}
        {branches.status === 'error' && <ErrorState onRetry={branches.retry} />}
        {branches.status === 'ready' && (
          <ul className="block flush replace-branches">
            {branches.data.map((b: Branch) => (
              <li key={b.id}>
                <label className="li" data-nav-id={`branch-${b.id}`}>
                  <input type="radio" name="replace-branch" value={b.id} checked={branch.value === b.id} onChange={branch.onChange} />
                  <span className="li-ico" aria-hidden="true"><MapPin size={18} /></span>
                  <span className="li-main"><span className="li-title">{b.name}</span><span className="li-sub">{b.address} · {b.hours}</span></span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="sticky-cta">
        <button type="button" className="btn primary block" onClick={() => intent({ type: 'submit', form: 'card-replace' })} data-nav-id="card-replace">Continue</button>
      </div>
    </section>
  );
}
