// /cards/:id/replace: order a replacement card and pick it up at a branch (card.replace.prepare, R2).
import React from 'react';
import '../../styles/card-replace.css';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { hub, useField, useUi } from '../../runtime/hub.ts';
import { useBank } from '../../runtime/bank.ts';
import { Loading, ErrorState } from '../components/States';
import { masked } from '../components/format';

type Card = { id: string; name: string; last4: string; status: string };
type Branch = { id: string; name: string; address: string; hours: string };
const REASONS = [['damaged', 'Damaged'], ['lost', 'Lost'], ['stolen', 'Stolen'], ['expiring', 'Expiring']] as const;
// TODO(data): branches for the app (branches.list); the app API has no /branches yet, so the list stays loading.
const branches = { status: 'loading' as 'loading' | 'ready' | 'error', data: undefined as Branch[] | undefined, reload: () => undefined };

export default function CardReplace() {
  const nav = useNavigate();
  const { id = '' } = useParams();
  const summary = useBank<{ cards: Card[] }>('summary');
  const reason = useField('card-replace', 'card-replace-reason');
  const branch = useField('card-replace', 'card-replace-branch');
  const busy = useUi((s) => !['idle', 'paused', 'error', 'handoff'].includes(s.agent.status));
  const card = summary.data?.cards.find((c) => c.id === id);
  const submit = () => card && hub.input(`Replace my card ending ${card.last4}${reason.value ? `, it is ${reason.value}` : ''}${branch.value ? `, pick up at ${branch.value}` : ''}`);
  return (
    <main className="screen no-tabs screen-enter replace-screen">
      <header className="hdr"><button className="icon-btn" aria-label="Back" onClick={() => nav(-1)} data-nav-id="back">‹</button><h1>Replace card</h1><span /></header>
      {summary.status === 'loading' && <Loading />}
      {summary.status === 'error' && <ErrorState onRetry={summary.reload} />}
      {card && <div className="block"><strong>{card.name}</strong><span className="small muted num">{masked(card.last4)}</span></div>}
      <fieldset className="field pick-chips">
        <legend>Why do you need a new card?</legend>
        {REASONS.map(([v, label]) => (
          <label key={v} className={'pick-chip' + (reason.value === v ? ' on' : '')} data-nav-id={`card-replace-reason-${v}`}>
            <input type="radio" name="replace-reason" value={v} checked={reason.value === v} onChange={() => reason.onChange(v)} />{label}
          </label>
        ))}
      </fieldset>
      {(reason.value === 'lost' || reason.value === 'stolen') && <p className="replace-note" role="note">The old card will be blocked as soon as you confirm.</p>}
      <fieldset className="field">
        <legend>Pick it up at</legend>
        {branches.status === 'loading' && <Loading label="Loading branches…" />}
        {branches.status === 'ready' && (
          <ul className="block flush replace-branches">
            {branches.data!.map((b) => (
              <li key={b.id}>
                <label className="li" data-nav-id={`branch-${b.id}`}>
                  <input type="radio" name="replace-branch" value={b.name} checked={branch.value === b.name} onChange={() => branch.onChange(b.name)} />
                  <span className="li-ico" aria-hidden="true"><MapPin size={18} /></span>
                  <span className="li-main"><span className="li-title">{b.name}</span><span className="li-sub">{b.address} · {b.hours}</span></span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <div className="sticky-cta">
        <button type="button" className="btn primary block" disabled={busy || !card} onClick={submit} data-nav-id="card-replace">Continue</button>
      </div>
    </main>
  );
}
