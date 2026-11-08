// Bank-side console: what the bank buys. Every number here comes from the live audit log,
// the live session list, or a published offline evaluation run (labelled as such).
import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Power, Users, Headset, ScrollText, Gauge, PlugZap, LogIn, RefreshCw, Check } from 'lucide-react';
import evalSummary from './eval-summary.json';
import '../styles/console.css';

const api = (path: string, body?: unknown) => fetch(`/bridge/console${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

interface Overview {
  capabilities: { id: string; title: string; kind: string; risk: string; confirm: string; killed: boolean; optional: boolean }[];
  optional: { id: string; title: string; risk: string; enabled: boolean }[];
  limits: Record<string, { per_tx: Record<string, number>; daily: Record<string, number> }>;
  handoffs: { ticket_id: string; session: string; created_at: string; status: string; record: any }[];
  stats: Record<string, number>;
}

export default function Console() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [ov, setOv] = useState<Overview | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    const r = await api('/overview');
    if (r.status === 401) { setAuthed(false); return; }
    setAuthed(true);
    setOv(await r.json());
    setAudit((await (await api(`/audit?limit=60${filter ? `&session=${encodeURIComponent(filter)}` : ''}`)).json()).items);
    try { setSessions((await (await fetch('/api/agent/sessions')).json()).items); } catch { /* agent offline */ }
  }, [filter]);
  useEffect(() => { void load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api('/login', { passcode: pass });
    if (r.ok) { setErr(''); setPass(''); void load(); } else setErr(r.status === 429 ? 'Too many attempts. Wait a minute.' : 'Wrong passcode.');
  };

  if (authed === false) {
    return (
      <div className="cs cs-login">
        <form onSubmit={login} className="cs-card">
          <h1><ShieldCheck size={22} /> Assistant console</h1>
          <p className="cs-muted">Bank operators only. Runs inside the bank, next to the Bridge.</p>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Operator passcode" autoFocus aria-label="Operator passcode" />
          {err && <p className="cs-err">{err}</p>}
          <button className="cs-btn primary"><LogIn size={16} /> Sign in</button>
        </form>
      </div>
    );
  }
  if (!ov) return <div className="cs"><p className="cs-muted" style={{ padding: 40 }}>Loading…</p></div>;

  const byTier = ['R3', 'R2', 'R1', 'R0'].map((t) => ({ t, caps: ov.capabilities.filter((c) => c.risk === t) })).filter((g) => g.caps.length);
  const open = ov.handoffs.filter((h) => h.status === 'open');
  const ev = (evalSummary as any).holdout || (evalSummary as any).dev;

  return (
    <div className="cs">
      <header className="cs-head">
        <h1><ShieldCheck size={22} /> Caspia Bank · Assistant console</h1>
        <span className="cs-pill">Bridge inside the bank · {ov.capabilities.filter((c) => !c.killed).length} live capabilities</span>
        <button className="cs-btn" onClick={() => void load()}><RefreshCw size={14} /> Refresh</button>
      </header>

      <section className="cs-stats" aria-label="Activity from the audit log">
        {[['Prepared actions', ov.stats.prepared], ['Confirmed by customers', ov.stats.committed], ['Declined or expired', ov.stats.denied_or_expired], ['Agent guard holds', ov.stats.guard_holds], ['Bridge rejections', ov.stats.bridge_rejections + ov.stats.policy_rejections], ['Open handoffs', open.length]].map(([k, v]) => (
          <div key={k as string} className="cs-stat"><span>{k}</span><strong>{v as number}</strong></div>
        ))}
        <p className="cs-foot">Counts from this deployment's append-only audit log ({ov.stats.audit_rows} rows).</p>
      </section>

      <div className="cs-grid">
        <section className="cs-card cs-caps">
          <h2><Power size={16} /> Capabilities and kill switches</h2>
          {byTier.map(({ t, caps }) => (
            <div key={t}>
              <h3>{t} · {t === 'R3' ? 'money and security, biometric confirmation' : t === 'R2' ? 'protective, one-tap confirmation' : t === 'R1' ? 'reversible preference' : 'read only'}</h3>
              <ul>
                {caps.map((c) => (
                  <li key={c.id} className={c.killed ? 'off' : ''}>
                    <code>{c.id}</code><span>{c.title}</span>
                    <button className={'cs-switch' + (c.killed ? '' : ' on')} role="switch" aria-checked={!c.killed} aria-label={`Enable ${c.id}`} onClick={async () => { await api(`/capabilities/${c.id}`, { enabled: c.killed }); void load(); }}><span /></button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="cs-card">
          <h2><PlugZap size={16} /> Add a capability without a deploy</h2>
          <p className="cs-muted">Capabilities are manifests over internal endpoints the bank already has. Switching one on reloads the Bridge; the assistant picks it up on its next turn.</p>
          {ov.optional.map((o) => (
            <div key={o.id} className="cs-row">
              <code>{o.id}</code><span>{o.title} · {o.risk}</span>
              <button className={'cs-btn' + (o.enabled ? '' : ' primary')} onClick={async () => { await api(`/optional/${o.id}`, { enabled: !o.enabled }); void load(); }}>{o.enabled ? 'Switch off' : 'Switch on'}</button>
            </div>
          ))}
          {ov.optional.some((o) => o.enabled) && <p className="cs-hint"><Check size={14} /> Try on the phone: “What are today's exchange rates?”</p>}

          <h2 style={{ marginTop: 18 }}><Gauge size={16} /> Limits (per transaction)</h2>
          <table className="cs-table">
            <thead><tr><th>Group</th><th>Per transaction</th><th>Per day</th></tr></thead>
            <tbody>{Object.entries(ov.limits).map(([g, l]) => (
              <tr key={g}><td>{g}</td><td>{Object.entries(l.per_tx).map(([c, v]) => `${v} ${c}`).join(' · ')}</td><td>{Object.entries(l.daily).map(([c, v]) => `${v} ${c}`).join(' · ')}</td></tr>
            ))}</tbody>
          </table>
        </section>

        <section className="cs-card">
          <h2><Users size={16} /> Live sessions</h2>
          <table className="cs-table">
            <thead><tr><th>Session</th><th>Status</th><th>Screens</th><th>Model calls</th><th>Model cost</th></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="click" onClick={() => setFilter(s.id)}><td><code>{s.id}</code></td><td>{s.status}</td><td>{s.screens}</td><td>{s.llmCalls}</td><td>${s.spendUsd.toFixed(3)}</td></tr>
              ))}
              {!sessions.length && <tr><td colSpan={5} className="cs-muted">No sessions yet.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="cs-card">
          <h2><Headset size={16} /> Human handoff queue</h2>
          {!ov.handoffs.length && <p className="cs-muted">No handoffs.</p>}
          {ov.handoffs.slice(0, 6).map((h) => (
            <details key={h.ticket_id} className={'cs-handoff ' + h.status} open={h.status === 'open'}>
              <summary><code>{h.ticket_id}</code> {h.record.reason?.replace('_', ' ')} · {h.status} · session {h.session}</summary>
              <dl>
                <dt>Goal</dt><dd>{h.record.goal}</dd>
                <dt>Done</dt><dd>{h.record.finished_steps?.map((s: any) => s.title).join('; ') || 'nothing'}</dd>
                <dt>Pending</dt><dd>{h.record.pending_step || 'none'}</dd>
                <dt>Collected</dt><dd>{[...(h.record.collected?.amounts || []).map((a: number) => String(a)), ...(h.record.collected?.references || []).map((r: any) => r.label || r.token)].join(', ') || 'none'}</dd>
                <dt>Conversation</dt><dd>{h.record.conversation?.map((c: any, i: number) => <div key={i}><b>{c.role}:</b> {c.text}</div>)}</dd>
              </dl>
              {h.status === 'open' && <button className="cs-btn" onClick={async () => { await api(`/handoffs/${h.ticket_id}/close`, {}); void load(); }}>Mark resolved</button>}
            </details>
          ))}
        </section>

        <section className="cs-card cs-wide">
          <h2><ScrollText size={16} /> Audit log {filter && <button className="cs-btn" onClick={() => setFilter('')}>session {filter} ✕</button>}</h2>
          <table className="cs-table cs-audit">
            <thead><tr><th>#</th><th>Time</th><th>Trace</th><th>Session</th><th>Actor</th><th>Event</th><th>Capability</th><th>Decision</th></tr></thead>
            <tbody>{audit.map((r) => (
              <tr key={r.seq} className={r.decision === 'held' || r.decision === 'rejected' ? 'warn' : ''}>
                <td>{r.seq}</td><td>{r.ts.slice(11, 19)}</td><td><code>{r.trace_id.slice(0, 10)}</code></td><td>{r.session}</td><td>{r.actor}</td><td>{r.event}</td><td>{r.capability || ''}</td><td>{r.decision || ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>

        <section className="cs-card cs-wide">
          <h2><Gauge size={16} /> Reliability</h2>
          {ev ? (
            <div className="cs-rel">
              <span className="cs-label">Offline evaluation on synthetic scenarios · {ev.set} set · {ev.scenarios} scenarios × {ev.repeats} runs · {ev.model} · {ev.finished?.slice(0, 16).replace('T', ' ')}</span>
              <div className="cs-stats">
                <div className="cs-stat"><span>Task success</span><strong>{(ev.task_success.rate * 100).toFixed(1)}%</strong><em>95% CI {(ev.task_success.wilson95[0] * 100).toFixed(1)}–{(ev.task_success.wilson95[1] * 100).toFixed(1)}%</em></div>
                <div className="cs-stat"><span>S1 critical</span><strong>{ev.severity.S1.count}</strong><em>of {ev.runs} runs</em></div>
                <div className="cs-stat"><span>S2 caught on bank screen</span><strong>{ev.severity.S2.count}</strong></div>
                <div className="cs-stat"><span>Unauthorized commits</span><strong>{ev.unauthorized_commits}</strong></div>
                <div className="cs-stat"><span>Turn latency p50 / p95</span><strong>{(ev.latency_ms.turn_p50 / 1000).toFixed(1)}s / {(ev.latency_ms.turn_p95 / 1000).toFixed(1)}s</strong></div>
                <div className="cs-stat"><span>Model cost per task</span><strong>${ev.cost_usd.per_task_mean.toFixed(4)}</strong></div>
              </div>
            </div>
          ) : <p className="cs-muted">No evaluation run published yet.</p>}
        </section>
      </div>
    </div>
  );
}
