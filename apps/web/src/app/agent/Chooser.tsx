// Contact chooser: several matches, the user taps one or says "the second one".
import React from 'react';
import { hub, useUi } from '../../runtime/hub.ts';

export default function Chooser() {
  const modal = useUi((s) => s.modal);
  if (!modal || modal.kind !== 'chooser') return null;
  return (
    <div className="chooser-backdrop" role="dialog" aria-modal="true" aria-label={modal.title}>
      <div className="chooser">
        <strong>{modal.title}</strong>
        <ol>
          {modal.options.map((o) => (
            <li key={o.n}>
              <button className="chooser-opt" data-nav-id={`chooser-option-${o.n}`} onClick={() => hub.intent({ type: 'chooser.pick', n: o.n })}>
                <span className="chooser-n">{o.n}</span>
                <span>{o.label}{o.sub && <small>{o.sub}</small>}</span>
              </button>
            </li>
          ))}
        </ol>
        <button className="btn block" data-nav-id="chooser-cancel" onClick={() => hub.intent({ type: 'modal.close' })}>Cancel</button>
      </div>
    </div>
  );
}
