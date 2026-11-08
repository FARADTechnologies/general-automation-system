// Contact chooser overlay (ui.modal.kind === 'chooser'): a numbered list when a name matches
// more than one person. The customer taps, or says "the second one".
import React from 'react';
import { X } from 'lucide-react';
import { useUi } from '../../runtime';

export default function ContactChooser() {
  const { ui, intent } = useUi();
  const m = ui.modal;
  if (!m || m.kind !== 'chooser') return null;
  return (
    <div className="chooser-overlay" role="dialog" aria-modal="true" aria-labelledby="chooser-title">
      <div className="chooser-sheet">
        <div className="chooser-head">
          <h2 id="chooser-title">{m.title}</h2>
          <button type="button" className="icon-btn" aria-label="Cancel" onClick={() => intent({ type: 'modal.close' })} data-nav-id="chooser-cancel"><X size={22} /></button>
        </div>
        <p className="chooser-hint">Tap a name, or say the number.</p>
        <ol className="chooser-list">
          {m.options.map((o) => (
            <li key={o.n}>
              <button type="button" className="chooser-option" onClick={() => intent({ type: 'chooser.pick', chooserId: m.chooserId, n: o.n })} data-nav-id={`chooser-option-${o.n}`}>
                <span className="chooser-n" aria-hidden="true">{o.n}</span>
                <span className="chooser-text"><strong>{o.label}</strong>{o.sub && <span>{o.sub}</span>}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
