import React, { useState } from 'react';
import { Wand2, PlayCircle, ShieldCheck, X } from 'lucide-react';
import { useSeda } from '../seda/store.jsx';
import { useNav, Switch } from '../ui/kit.jsx';
import { KINDS } from '../seda/flowsSeed.js';

export default function Flows() {
  const { state, mutate } = useSeda();
  const { go, toast } = useNav();
  const [sel, setSel] = useState(null);
  const f = state.flows.find((x) => x.id === sel);

  const toggle = (flow, on) => {
    const before = structuredClone(state.flows);
    const n = (state.versions[0]?.n || 0) + 1;
    mutate((s) => {
      s.flows.find((x) => x.id === flow.id).status = on ? 'live' : 'off';
      s.versions.unshift({ id: 'v' + n, n, title: `${on ? 'Turned on' : 'Turned off'}: ${flow.name}`, by: s.user.name, at: Date.now(), changes: [`${flow.id}.status: ${flow.status} → ${on ? 'live' : 'off'}`], snapshot: before, env: s.env });
    });
    toast(`${flow.name} ${on ? 'turned on' : 'turned off'} · version ${n}`);
  };

  return (
    <>
      <div className="sd-between" style={{ flexWrap: 'wrap' }}>
        <p className="muted" style={{ maxWidth: '70ch' }}>Each flow is a voice journey customers can use. Flows are configuration: what customers say, which bank tools are called, limits, cards and confirmation. Money flows always end with a fingerprint.</p>
        <button className="sd-btn primary" onClick={() => go('studio')}><Wand2 size={16} /> New flow with AI</button>
      </div>
      <div className="sd-cols-2" style={{ gridTemplateColumns: f ? 'minmax(0, 1.3fr) minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
        <div className="sd-card flush" style={{ alignSelf: 'start' }}>
          <div className="sd-table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
            <table className="sd-table">
              <thead><tr><th>Flow</th><th>Type</th><th>Limit</th><th>Confirmation</th><th>Version</th><th>On</th></tr></thead>
              <tbody>
                {state.flows.map((x) => (
                  <tr key={x.id} className="click" onClick={() => setSel(x.id)} style={sel === x.id ? { background: 'var(--sd-accent-soft)' } : undefined} data-sd={'flow-' + x.id}>
                    <td><div style={{ fontWeight: 600 }}>{x.name}</div><div className="tiny muted">{x.createdBy === 'AI Studio' ? '✨ AI Studio · ' : ''}{x.phrases[0]}</div></td>
                    <td><span className={'sd-pill' + (KINDS[x.kind].money ? ' warn' : '')}>{KINDS[x.kind].label}</span></td>
                    <td className="num">{x.limits?.perPayment ? `${x.limits.perPayment} AZN` : '—'}</td>
                    <td>{x.confirmation === 'fingerprint' ? <span className="sd-pill ok"><ShieldCheck size={12} /> Fingerprint</span> : x.confirmation === 'tap' ? <span className="sd-pill">Tap</span> : <span className="muted small">None (read-only)</span>}</td>
                    <td className="num muted">v{x.version}</td>
                    <td onClick={(e) => e.stopPropagation()}><Switch label={`Turn ${x.name} on or off`} checked={x.status === 'live'} onChange={(on) => toggle(x, on)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {f && (
          <div className="sd-card" style={{ alignSelf: 'start' }}>
            <div className="sd-card-h"><h2>{f.name}</h2><button className="sd-iconbtn" onClick={() => setSel(null)} aria-label="Close"><X size={18} /></button></div>
            <dl className="sd-kv">
              <dt>Status</dt><dd>{f.status}</dd>
              <dt>Customers say</dt><dd>{f.phrases.map((p) => `“${p}”`).join(' · ')}</dd>
              <dt>Bank tools (MCP)</dt><dd className="mono">{f.tools.join(', ')}</dd>
              {f.billers && <><dt>Services</dt><dd>{f.billers.join(', ')}</dd></>}
              <dt>Cards</dt><dd>{f.cards ? f.cards.join(', ') : 'Any active card'}</dd>
              <dt>Summary read aloud</dt><dd>“{f.summary}”</dd>
              {f.reminder && <><dt>Reminder</dt><dd>{f.reminder.day}s at {f.reminder.time}</dd></>}
              <dt>Created by</dt><dd>{f.createdBy} · updated {f.updatedAt}</dd>
            </dl>
            <div className="sd-label">Steps</div>
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>{f.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <div className="sd-row" style={{ flexWrap: 'wrap' }}>
              <button className="sd-btn primary sm" onClick={() => go('playground', { prefill: f.phrases[0] })}><PlayCircle size={14} /> Test in Playground</button>
              <button className="sd-btn sm" onClick={() => go('studio')}><Wand2 size={14} /> Change with AI</button>
            </div>
            <details><summary className="small muted" style={{ cursor: 'pointer' }}>Configuration JSON</summary><pre className="sd-code" style={{ marginTop: 8 }}>{JSON.stringify(f, null, 2)}</pre></details>
          </div>
        )}
      </div>
    </>
  );
}
