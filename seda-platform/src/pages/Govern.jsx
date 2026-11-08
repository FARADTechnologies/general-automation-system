import React from 'react';
import { CheckCircle2, EyeOff, Eye, KeyRound, RotateCcw, ShieldCheck, Copy, Fingerprint, Gauge, Lock } from 'lucide-react';
import { useSeda, sessionsOf } from '../seda/store.jsx';
import { useNav, ago, timeOf } from '../ui/kit.jsx';
import { MCP_TOOLS } from '../seda/engine/mcpProxy.js';

export function Integrations() {
  const { state } = useSeda();
  const calls = (name) => state.events.filter((e) => e.type === 'mcp' && e.text.startsWith(name + '('));
  return (
    <>
      <div className="sd-cols-2">
        <div className="sd-card">
          <div className="sd-card-h"><h2>Caspia Bank · MCP server</h2><span className="sd-pill ok"><span className="sd-dot" />Connected</span></div>
          <dl className="sd-kv">
            <dt>Endpoint</dt><dd className="mono">mcp://caspia-core (in-browser mock for the demo)</dd>
            <dt>Production</dt><dd className="mono">https://mcp.caspiabank.demo/v1 · streamable HTTP</dd>
            <dt>Auth</dt><dd>OAuth 2.1 · one token per customer session · scopes below</dd>
            <dt>Who executes</dt><dd>The bank. Seda only calls prepare(); execute() needs the customer’s fingerprint proof and is verified by the bank.</dd>
          </dl>
        </div>
        <div className="sd-card">
          <div className="sd-card-h"><h2>Scopes granted</h2></div>
          {[['accounts:read', 'Balances, masked IBAN'], ['transactions:read', 'Last 90 days'], ['payments:prepare', 'Create operations, nothing moves'], ['payments:execute', 'Only with fingerprint proof'], ['cards:state', 'Freeze / unfreeze'], ['notify:send', 'Reminders']].map(([s, d]) => (
            <div key={s} className="sd-between small"><span className="mono">{s}</span><span className="muted">{d}</span></div>
          ))}
        </div>
      </div>
      <div className="sd-card flush">
        <div className="sd-card-h" style={{ padding: '14px 16px' }}><h2>Tools the bank exposes</h2><span className="sd-sub">{MCP_TOOLS.length} tools</span></div>
        <div className="sd-table-wrap" tabIndex={0} role="region" aria-label="Tools the bank exposes"><table className="sd-table">
          <thead><tr><th>Tool</th><th>Type</th><th>What it does</th><th>Calls</th><th>Avg. latency</th></tr></thead>
          <tbody>{MCP_TOOLS.map((t) => { const c = calls(t.name); const ms = c.filter((x) => x.ms).map((x) => x.ms); return (
            <tr key={t.name}><td className="mono">{t.name}</td><td><span className={'sd-pill' + (t.kind === 'write' ? ' warn' : ' info')}>{t.kind}</span></td><td className="muted">{t.desc}</td><td className="num">{c.length}</td><td className="num muted">{ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) + ' ms' : '—'}</td></tr>
          ); })}</tbody>
        </table></div>
      </div>
      <div className="sd-card">
        <div className="sd-card-h"><h2>Data minimisation</h2><span className="sd-sub">what Seda receives from the bank</span></div>
        <div className="sd-cols-eq">
          <div className="sd-stack">
            <div className="sd-row" style={{ fontWeight: 600 }}><Eye size={16} color="var(--sd-ok)" /> Shared, masked</div>
            {['Recipient name as “Murad A.”', 'Card numbers as •••• 4067', 'Balances and debts for the current request', 'Operation id and summary text'].map((x) => <div key={x} className="small">• {x}</div>)}
          </div>
          <div className="sd-stack">
            <div className="sd-row" style={{ fontWeight: 600 }}><EyeOff size={16} color="var(--sd-bad)" /> Never shared</div>
            {['Full card numbers, CVV, PIN', 'Passwords and SMS codes', 'Voice recordings (text only, not stored)', 'Other customers’ data'].map((x) => <div key={x} className="small">• {x}</div>)}
          </div>
        </div>
      </div>
    </>
  );
}

export function Security() {
  const { state } = useSeda();
  const { go, toast } = useNav();
  const sessions = sessionsOf(state.events);
  const flagged = state.events.filter((e) => ['blocked', 'policy', 'no_flow', 'error', 'cancelled'].includes(e.type)).slice().reverse();
  const fps = state.events.filter((e) => e.type === 'fingerprint');
  const exportCsv = () => {
    const rows = [['time', 'session', 'type', 'text'], ...state.events.map((e) => [new Date(e.t).toISOString(), e.session, e.type, `"${String(e.text).replace(/"/g, "'")}"`])];
    navigator.clipboard?.writeText(rows.map((r) => r.join(',')).join('\n')).catch(() => {});
    toast(`Audit log copied as CSV (${state.events.length} rows)`);
  };
  return (
    <>
      <div className="sd-kpis">
        <div className="sd-kpi"><span className="k"><Fingerprint size={14} /> Fingerprint-signed operations</span><span className="v">{fps.length}</span></div>
        <div className="sd-kpi"><span className="k"><Gauge size={14} /> Blocked by limits</span><span className="v">{state.events.filter((e) => e.type === 'blocked').length}</span></div>
        <div className="sd-kpi"><span className="k"><Lock size={14} /> Sessions audited</span><span className="v">{sessions.length}</span></div>
      </div>
      <div className="sd-cols-2">
        <div className="sd-card flush">
          <div className="sd-card-h" style={{ padding: '14px 16px' }}><h2>Flagged events</h2><button className="sd-btn sm" onClick={exportCsv}><Copy size={14} /> Export audit log</button></div>
          <div className="sd-table-wrap" tabIndex={0} role="region" aria-label="Flagged events"><table className="sd-table">
            <thead><tr><th>Time</th><th>Event</th><th>Detail</th></tr></thead>
            <tbody>
              {flagged.slice(0, 30).map((e) => (
                <tr key={e.id} className="click" onClick={() => go('traces', { session: e.session })}>
                  <td className="mono muted">{timeOf(e.t)}</td>
                  <td><span className={'sd-pill ' + (e.type === 'blocked' || e.type === 'policy' ? 'warn' : e.type === 'cancelled' ? '' : 'bad')}>{e.type.replace('_', ' ')}</span></td>
                  <td style={{ maxWidth: 380 }}>{e.text}</td>
                </tr>
              ))}
              {!flagged.length && <tr><td colSpan={3} className="sd-empty">Nothing flagged.</td></tr>}
            </tbody>
          </table></div>
        </div>
        <div className="sd-card">
          <div className="sd-card-h"><h2>Guardrails</h2><span className="sd-sub">always on</span></div>
          {[
            ['Fingerprint on every money movement', 'Cannot be turned off, not even from AI Studio. The bank’s execute() also rejects operations without proof.'],
            ['AI never executes', 'Seda prepares operations. Only the customer’s fingerprint completes them.'],
            ['Per-flow voice limits', state.flows.filter((f) => f.limits?.perPayment).map((f) => `${f.name}: ${f.limits.perPayment} AZN`).join(' · ')],
            ['Human approval for changes', 'AI Studio creates drafts. An admin publishes; every change is versioned.'],
            ['Secrets never spoken', 'PIN, CVV and SMS codes are never read, asked for or stored.'],
          ].map(([t, d]) => (
            <div key={t} className="sd-check"><ShieldCheck size={17} color="var(--sd-ok)" style={{ flex: 'none' }} /><div><div style={{ fontWeight: 600 }}>{t}</div><div className="tiny muted" style={{ lineHeight: 1.5 }}>{d}</div></div></div>
          ))}
        </div>
      </div>
      <div className="sd-card flush">
        <div className="sd-card-h" style={{ padding: '14px 16px' }}><h2>Team access</h2></div>
        <div className="sd-table-wrap" tabIndex={0} role="region" aria-label="Team access"><table className="sd-table"><thead><tr><th>Person</th><th>Role</th><th>Last action</th></tr></thead>
          <tbody>
            <tr><td>{state.user.name}</td><td><span className="sd-pill accent">Admin</span></td><td className="muted">Signed in · now</td></tr>
            <tr><td>Rashad Mammadli</td><td><span className="sd-pill">Risk viewer</span></td><td className="muted">Changed transfer limit · 3 d ago</td></tr>
            <tr><td>Leyla Karimova</td><td><span className="sd-pill">Product</span></td><td className="muted">Updated Money Coach rules · 4 d ago</td></tr>
            <tr><td>Tural Huseynov</td><td><span className="sd-pill info">Developer</span></td><td className="muted"><KeyRound size={12} /> Rotated API key · 6 d ago</td></tr>
          </tbody></table></div>
      </div>
    </>
  );
}

export function Versions() {
  const { state, mutate } = useSeda();
  const { toast } = useNav();
  const rollback = (v) => {
    if (!v.snapshot) return;
    const before = structuredClone(state.flows);
    const n = state.versions[0].n + 1;
    mutate((s) => {
      s.flows = structuredClone(v.snapshot);
      s.versions.unshift({ id: 'v' + n, n, title: `Rolled back “${v.title}”`, by: s.user.name, at: Date.now(), changes: [`flows restored to before v${v.n}`], snapshot: before, env: s.env });
    });
    window.__seda.log({ session: 'S-ROLLBACK' + n, type: 'publish', text: `Rollback of v${v.n} published as v${n}`, status: 'done' });
    window.__seda.log({ session: 'S-ROLLBACK' + n, type: 'result', text: `Flows restored to before v${v.n}`, status: 'done' });
    toast(`Rolled back. Version ${n} published.`);
  };
  return (
    <div className="sd-card flush">
      <div className="sd-table-wrap" tabIndex={0} role="region" aria-label="Version history"><table className="sd-table">
        <thead><tr><th>Version</th><th>Change</th><th>By</th><th>When</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{state.versions.map((v, i) => (
          <tr key={v.id}>
            <td className="num" style={{ fontWeight: 650 }}>v{v.n}{i === 0 && <span className="sd-pill ok" style={{ marginLeft: 8 }}>current</span>}</td>
            <td><div style={{ fontWeight: 600 }}>{v.title}</div>{v.prompt && <div className="tiny muted">Prompt: “{v.prompt}”</div>}<div className="mono muted" style={{ marginTop: 4 }}>{v.changes.join(' · ')}</div></td>
            <td className="muted">{v.by}</td>
            <td className="muted">{ago(v.at)}</td>
            <td>{v.snapshot && i === 0 && <button className="sd-btn sm" onClick={() => rollback(v)} data-sd={'rollback-' + v.n}><RotateCcw size={14} /> Roll back</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
