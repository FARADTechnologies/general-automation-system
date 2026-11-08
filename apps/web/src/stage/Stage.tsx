// Presentation view for the projector (1920x1080): the mirrored phone, the live plan,
// guard decisions, and "Agent sees / Bank sees" from real payloads of this session.
import React, { useCallback, useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, Check, X, Loader2, Circle, Eye, Landmark, Mic, Wifi, WifiOff } from 'lucide-react';
import { StoreProvider } from '../app/store/Store.jsx';
import { Shell, ModeCtx } from '../app/App.jsx';
import { hub, useUi, useHubEvent, useConnected, type HubEvent } from '../runtime/hub.ts';
import '../styles/stage.css';

interface Trace { trace_id: string; at: number; kind: string; name?: string; decision?: string; detail?: any }

const GUARD_TEXT: Record<string, string> = {
  INTENT_NOT_STATED: 'Blocked: the customer did not ask for this action',
  PAYEE_NOT_FROM_USER: 'Blocked: payee did not come from the customer',
  AMOUNT_NOT_STATED: 'Blocked: amount not stated by the customer',
  CURRENCY_NOT_STATED: 'Blocked: currency not stated',
  PROVENANCE_REJECTED: 'Blocked: reference of unknown origin',
  UNKNOWN_TOOL: 'Blocked: no such capability',
  LOOP_DETECTED: 'Blocked: repeated call',
  SCHEMA_INVALID: 'Blocked: invalid arguments',
  STEP_LIMIT: 'Blocked: step limit',
};

export default function Stage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [bank, setBank] = useState<any[]>([]);
  const plan = useUi((s) => s.plan);
  const transcript = useUi((s) => s.transcript);
  const status = useUi((s) => s.agent.status);
  const connected = useConnected();
  const [backup, setBackup] = useState(false);

  useHubEvent('trace.event', useCallback((e: HubEvent) => setTraces((t) => [...t.slice(-150), e.payload as Trace]), []));
  const refreshBank = useCallback(async () => {
    try { const r = await fetch(`/bridge/session/${encodeURIComponent(hub.session)}/bank-view`); if (r.ok) setBank((await r.json()).items); } catch { /* offline */ }
  }, []);
  useHubEvent(['confirm.required', 'confirm.resolved', 'bank.changed'], useCallback(() => { void refreshBank(); }, [refreshBank]));
  useEffect(() => { void refreshBank(); }, [refreshBank]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'b' || e.key === 'B') setBackup((x) => !x); if (e.key.toLowerCase() === 'r' && e.altKey && e.shiftKey) void hub.reset().then(() => { setTraces([]); setBank([]); }); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const lastTrace = traces.at(-1)?.trace_id;
  const turn = traces.filter((t) => t.trace_id === lastTrace);
  const guards = traces.filter((t) => t.kind === 'guard').slice(-8).reverse();
  const agentSees = [...turn].reverse().find((t) => (t.kind === 'tool_result' || t.kind === 'input') && t.detail?.agent_sees);
  const agentSends = [...turn].reverse().find((t) => t.kind === 'tool_call');
  const bankPrepare = bank.find((b) => b.event === 'prepare');
  const lastUser = [...transcript].reverse().find((t) => t.role === 'user');
  const lastAgent = [...transcript].reverse().find((t) => t.role === 'agent');
  const answer = turn.find((t) => t.kind === 'answer');

  if (backup) {
    return (
      <div className="stg stg-backup">
        <video src="/backup.mp4" autoPlay controls playsInline />
        <p>Backup recording. Press B to return to the live view.</p>
      </div>
    );
  }

  return (
    <div className="stg">
      <header className="stg-head">
        <div className="stg-brand"><ShieldCheck size={22} /> Action layer for Caspia Bank <span className="stg-sub">live session {hub.session}</span></div>
        <div className={'stg-conn ' + (connected ? 'on' : 'off')}>{connected ? <Wifi size={16} /> : <WifiOff size={16} />} {connected ? 'Connected' : 'Reconnecting'}</div>
      </header>

      <section className="stg-phone-col">
        <div className="stg-phone">
          <ModeCtx.Provider value="mirror">
            <MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <StoreProvider><Shell /></StoreProvider>
            </MemoryRouter>
          </ModeCtx.Provider>
        </div>
        <p className="stg-caption">Customer's phone, mirrored live</p>
      </section>

      <section className="stg-main">
        <div className="stg-card stg-said">
          <span className="stg-label"><Mic size={14} /> Customer said</span>
          <p className="stg-quote">{lastUser ? `“${lastUser.text}”` : 'Waiting for a request…'}</p>
          {lastAgent && lastUser && lastAgent.at >= lastUser.at && <p className="stg-answer">{lastAgent.text}</p>}
          <span className={'stg-status s-' + status}>{status.replace('_', ' ')}</span>
          {answer?.detail && <span className="stg-metric">This turn: {Math.round(answer.detail.ms / 100) / 10}s · {answer.detail.llm_calls} model calls · ${answer.detail.cost_usd.toFixed(3)} (measured)</span>}
        </div>

        <div className="stg-card stg-plan">
          <span className="stg-label">Plan</span>
          {plan?.steps?.length ? (
            <ol>{plan.steps.map((s) => (
              <li key={s.id} className={'st-' + s.status}>
                {s.status === 'done' ? <Check size={18} /> : s.status === 'failed' ? <X size={18} /> : s.status === 'running' || s.status === 'waiting_confirmation' ? <Loader2 size={18} className="spin" /> : <Circle size={12} />}
                <span>{s.title}</span>{s.status === 'waiting_confirmation' && <em>waiting for customer</em>}
              </li>
            ))}</ol>
          ) : <p className="stg-muted">Single-step requests run without a plan.</p>}
        </div>

        <div className="stg-card stg-guards">
          <span className="stg-label"><ShieldCheck size={14} /> Guard decisions (deterministic, outside the model)</span>
          <ul>
            {guards.length ? guards.map((g, i) => (
              <li key={i} className={g.decision === 'held' ? 'held' : 'ok'}>
                {g.decision === 'held' ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
                <code>{g.name}</code>
                <span>{g.decision === 'held' ? GUARD_TEXT[g.detail?.code] || g.detail?.code : `allowed · ${g.detail?.risk || ''}`}</span>
              </li>
            )) : <li className="stg-muted">No tool calls yet.</li>}
          </ul>
        </div>

        <div className="stg-split">
          <div className="stg-card">
            <span className="stg-label"><Eye size={14} /> Agent sees</span>
            <pre>{agentSends ? `→ ${agentSends.name} ${JSON.stringify(agentSends.detail?.agent_sends)}\n` : ''}{agentSees ? clip(agentSees.detail.agent_sees) : '—'}</pre>
            <span className="stg-foot">Tokens and masked values only. No card numbers, IBANs or full phone numbers.</span>
          </div>
          <div className="stg-card">
            <span className="stg-label"><Landmark size={14} /> Bank sees (inside the bank, via the Bridge)</span>
            <pre>{bankPrepare ? clip(JSON.stringify(bankPrepare.detail.internal_request, null, 1)) : '—'}</pre>
            <span className="stg-foot">Internal API names translated by the Bridge. Identifiers shortened for the projector.</span>
          </div>
        </div>
      </section>
    </div>
  );
}

const clip = (s: string) => (s.length > 900 ? s.slice(0, 900) + ' …' : s);
