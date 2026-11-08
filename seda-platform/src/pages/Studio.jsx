import React, { useState } from 'react';
import { Wand2, Mic, CheckCircle2, XCircle, AlertTriangle, PlayCircle, Code2, ShieldCheck, Sparkles, RotateCcw, MessageSquareQuote } from 'lucide-react';
import { useSeda, newId } from '../seda/store.jsx';
import { useNav } from '../ui/kit.jsx';
import { compile, EXAMPLES } from '../seda/engine/compiler.js';
import { bankState } from '../seda/engine/coach.js';
import { listen } from '../seda/voice.js';

const STAGES = ['Understand', 'Check tools', 'Draft', 'Preview', 'Test', 'Publish'];

export default function Studio() {
  const { state, mutate } = useSeda();
  const { go, toast } = useNav();
  const [prompt, setPrompt] = useState('');
  const [res, setRes] = useState(null);
  const [stage, setStage] = useState(-1);
  const [json, setJson] = useState(false);
  const [published, setPublished] = useState(null);
  const [listening, setListening] = useState(false);

  const generate = async (p = prompt) => {
    if (!p.trim()) return;
    setPrompt(p); setPublished(null); setRes(null); setJson(false);
    const r = compile(p, { flows: state.flows, bank: bankState() });
    const session = newId('S-STUDIO');
    window.__seda.log({ session, type: 'studio', text: `Admin prompt: “${p}”`, source: 'studio' });
    window.__seda.log({ session, type: r.ok ? 'studio' : 'blocked', text: r.ok ? `Draft ${r.op}: ${r.draft.name}` : r.reason, status: r.ok ? undefined : 'blocked' });
    for (let i = 0; i < (r.ok ? 5 : 2); i++) { setStage(i); setRes({ ...r, session }); await new Promise((x) => setTimeout(x, 420)); }
    setStage(r.ok ? 5 : 1);
  };

  const publish = () => {
    const r = res;
    const before = structuredClone(state.flows);
    const n = (state.versions[0]?.n || 0) + 1;
    mutate((s) => {
      const draft = { ...r.draft, status: r.draft.status === 'draft' ? 'live' : r.draft.status, updatedAt: new Date().toISOString().slice(0, 10) };
      const i = s.flows.findIndex((f) => f.id === draft.id);
      if (i >= 0) s.flows[i] = draft; else s.flows.push(draft);
      if (draft.reminder) s.reminders.push({ flow: draft.id, ...draft.reminder });
      s.versions.unshift({ id: 'v' + n, n, title: r.op === 'create' ? `New flow: ${draft.name}` : `Updated: ${draft.name}`, by: `${s.user.name} (AI Studio)`, at: Date.now(), changes: r.changes, prompt, snapshot: before, env: s.env });
    });
    window.__seda.log({ session: r.session, type: 'publish', text: `Published v${n} to ${state.env === 'live' ? 'Live' : 'Test'} · approved by ${state.user.name}`, status: 'done' });
    window.__seda.log({ session: r.session, type: 'result', text: r.op === 'create' ? `${r.draft.name} is live` : `${r.draft.name} updated`, status: 'done' });
    setPublished({ n, flow: r.draft });
    toast(`Version ${n} published`);
  };

  const mic = () => {
    if (listening) return;
    setListening(true);
    listen({ onInterim: setPrompt, onFinal: (t) => generate(t), onError: (m) => toast(m), onEnd: () => setListening(false) });
  };

  const sample = res?.draft ? fillSummary(res.draft) : null;

  return (
    <>
      <div className="sd-card sd-hero-prompt">
        <div className="sd-between" style={{ flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 650 }}>Describe a change in one sentence</h2>
            <p className="small muted" style={{ marginTop: 4 }}>Seda turns it into a flow configuration, checks it against the bank’s MCP tools and guardrails, tests it, and waits for your approval before anything goes live.</p>
          </div>
          <span className="sd-pill accent"><Wand2 size={12} /> Compiler: offline, deterministic</span>
        </div>
        <div className="sd-say" style={{ alignItems: 'stretch' }}>
          <button className={'sd-mic' + (listening ? ' live' : '')} onClick={mic} aria-label="Speak the instruction"><Mic size={22} /></button>
          <textarea id="studio-prompt" className="sd-textarea" placeholder="e.g. Add traffic fine payments by voice, max 100 AZN, only from the debit card, and remind users on Fridays if they have unpaid fines." value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); }} data-sd="studio-prompt" />
        </div>
        <div className="sd-between" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="sd-chips" style={{ flex: 1 }}>{EXAMPLES.map((e) => <button key={e} className="sd-chip" onClick={() => generate(e)}>{e}</button>)}</div>
          <button className="sd-btn primary lg" onClick={() => generate()} disabled={!prompt.trim()} data-sd="studio-generate"><Sparkles size={16} /> Generate</button>
        </div>
      </div>

      {res && (
        <>
          <div className="sd-pipe" aria-label="Pipeline progress">
            {STAGES.map((s, i) => <div key={s} className={i < stage || (published && i === 5) ? 'done' : i === stage ? (res.ok ? 'cur' : 'done') : ''}><i />{i + 1}. {s}</div>)}
          </div>

          {!res.ok && stage >= 1 && (
            <div className="sd-banner bad"><XCircle size={18} style={{ flex: 'none' }} /><div><strong>Not created.</strong> {res.reason}</div></div>
          )}

          <div className="sd-cols-eq">
            <div className="sd-card">
              <div className="sd-card-h"><h2>1 · What Seda understood</h2></div>
              <dl className="sd-kv">{res.understanding.map(([k, v], i) => <React.Fragment key={i}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
            </div>
            {stage >= 1 && (
              <div className="sd-card">
                <div className="sd-card-h"><h2>2 · Bank tools and guardrails</h2></div>
                <div>{res.checks.map((c, i) => (
                  <div key={i} className="sd-check">
                    {c.ok ? <CheckCircle2 size={17} color="var(--sd-ok)" style={{ flex: 'none' }} /> : <XCircle size={17} color="var(--sd-bad)" style={{ flex: 'none' }} />}
                    <div><div style={{ fontWeight: 550 }}>{c.label}</div>{c.note && <div className="tiny muted">{c.note}</div>}</div>
                  </div>
                ))}</div>
                {res.warnings.map((w, i) => <div key={i} className="sd-banner warn"><AlertTriangle size={16} style={{ flex: 'none' }} />{w}</div>)}
              </div>
            )}
          </div>

          {res.ok && stage >= 2 && (
            <div className="sd-cols-eq">
              <div className="sd-card">
                <div className="sd-card-h"><h2>3 · Draft flow</h2><button className="sd-btn sm" onClick={() => setJson(!json)}><Code2 size={14} /> {json ? 'Hide' : 'Show'} config</button></div>
                {json ? <pre className="sd-code">{JSON.stringify(res.draft, null, 2)}</pre> : (
                  <dl className="sd-kv">
                    <dt>Flow</dt><dd>{res.draft.name} <span className="sd-pill accent" style={{ marginLeft: 6 }}>{res.op === 'create' ? 'new' : `v${res.draft.version}`}</span></dd>
                    <dt>Customers say</dt><dd>{res.draft.phrases.map((p) => `“${p}”`).join(' · ')}</dd>
                    <dt>Limit</dt><dd>{res.draft.limits?.perPayment ? `${res.draft.limits.perPayment} AZN per payment` : 'None'}</dd>
                    <dt>Cards</dt><dd>{res.draft.cards ? res.draft.cards.join(', ') : 'Any active card'}</dd>
                    <dt>Confirmation</dt><dd><span className="sd-pill ok"><ShieldCheck size={12} /> {res.draft.confirmation}</span></dd>
                    <dt>Status</dt><dd>{res.draft.status}</dd>
                    {res.draft.reminder && <><dt>Reminder</dt><dd>{res.draft.reminder.day}s at {res.draft.reminder.time} if unpaid</dd></>}
                    <dt>Steps</dt><dd><ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>{res.draft.steps.map((s) => <li key={s}>{s}</li>)}</ol></dd>
                  </dl>
                )}
              </div>
              {stage >= 3 && (
                <div className="sd-card">
                  <div className="sd-card-h"><h2>4 · Preview for the customer</h2></div>
                  <div className="sd-stack" style={{ gap: 8 }}>
                    <div className="sd-msg me" style={{ alignSelf: 'flex-start', background: 'var(--sd-surface-2)', color: 'var(--sd-text)', border: '1px solid var(--sd-line)' }}>🎙️ “{res.draft.phrases[0]}”</div>
                    <div className="sd-row tiny muted" style={{ flexWrap: 'wrap', gap: 6 }}>{previewPath(res.draft).map((p, i) => <span key={i} className="sd-pill">{p}</span>)}</div>
                    <div className="sd-msg bot" style={{ alignSelf: 'flex-end', display: 'flex', gap: 8 }}><MessageSquareQuote size={16} style={{ flex: 'none', marginTop: 2 }} /><span>{sample}</span></div>
                    <div className="sd-banner ok small"><ShieldCheck size={15} style={{ flex: 'none' }} /> The customer then confirms with a fingerprint. The bank’s execute() rejects the operation without it.</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {res.ok && stage >= 4 && (
            <div className="sd-cols-eq">
              <div className="sd-card flush">
                <div className="sd-card-h" style={{ padding: '14px 16px' }}><h2>5 · Automatic tests</h2><span className="sd-pill ok">{res.tests.filter((t) => t.pass).length}/{res.tests.length} passed</span></div>
                <div className="sd-table-wrap" tabIndex={0} role="region" aria-label="Scrollable table"><table className="sd-table"><thead><tr><th>Customer says</th><th>Expected</th><th>Result</th></tr></thead>
                  <tbody>{res.tests.map((t, i) => <tr key={i}><td>“{t.say}”</td><td className="muted">{t.expect}</td><td>{t.pass ? <span className="sd-pill ok">Pass</span> : <span className="sd-pill bad">Fail</span>}</td></tr>)}</tbody></table></div>
              </div>
              <div className="sd-card">
                <div className="sd-card-h"><h2>6 · Review and publish</h2><span className="sd-pill">{state.env === 'live' ? 'Live' : 'Test'} environment</span></div>
                <div className="sd-diff">{res.changes.map((c, i) => <div key={i} className={c.startsWith('+') ? 'add' : c.includes('→') ? 'chg' : ''}>{c}</div>)}</div>
                {published ? (
                  <>
                    <div className="sd-banner ok"><CheckCircle2 size={18} style={{ flex: 'none' }} /><div><strong>Version {published.n} published.</strong> {published.flow.name} is {published.flow.status === 'off' ? 'turned off' : 'live'} for customers in the {state.env} environment.</div></div>
                    <div className="sd-row" style={{ flexWrap: 'wrap' }}>
                      {published.flow.status !== 'off' && <button className="sd-btn primary" onClick={() => go('playground', { prefill: published.flow.phrases[0] })} data-sd="studio-try"><PlayCircle size={16} /> Try it in Playground</button>}
                      <button className="sd-btn" onClick={() => go('flows')}>Open in Flows</button>
                      <button className="sd-btn" onClick={() => go('versions')}><RotateCcw size={14} /> Versions</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="small muted">Approver: <strong style={{ color: 'var(--sd-text)' }}>{state.user.name}</strong> ({state.user.role}). A version is saved so you can roll back in one click.</p>
                    <div className="sd-row">
                      <button className="sd-btn ok lg" onClick={publish} disabled={!res.tests.every((t) => t.pass)} data-sd="studio-publish"><CheckCircle2 size={16} /> Approve and publish</button>
                      <button className="sd-btn lg" onClick={() => { setRes(null); setStage(-1); }}>Discard</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function fillSummary(f) {
  const b = f.billers?.[0] ? bankState().billers[f.billers[0]] : null;
  const amount = b?.debt ? b.debt.toFixed(2) : '20.00';
  return f.summary.replace('{amount}', amount).replace('{account}', b?.saved || b?.placeholder || '').replace('{biller}', b?.name || '').replace('{name}', 'Murad A.').replace('{last4}', '4067');
}
function previewPath(f) {
  if (f.kind === 'pay_bill' || f.kind === 'topup') return ['Payments', bankState().billers[f.billers[0]]?.name, 'Amount', 'Summary', 'Fingerprint'];
  if (f.kind === 'transfer_card') return ['Transfers', 'To a card', 'Amount', 'Summary', 'Fingerprint'];
  return f.steps.slice(0, 4);
}
