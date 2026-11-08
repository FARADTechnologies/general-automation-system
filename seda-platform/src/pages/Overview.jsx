import React, { useMemo } from 'react';
import { Mic, CheckCircle2, ShieldAlert, Timer, Fingerprint, Workflow, Plug, ArrowRight, Wand2, PlayCircle } from 'lucide-react';
import { useSeda, sessionsOf } from '../seda/store.jsx';
import { Kpi, Bars, StatusPill, useNav, ago } from '../ui/kit.jsx';
import { MCP_TOOLS } from '../seda/engine/mcpProxy.js';

export default function Overview() {
  const { state } = useSeda();
  const { go } = useNav();
  const sessions = useMemo(() => sessionsOf(state.events), [state.events]);
  const today = sessions.filter((s) => new Date(s.start).toDateString() === new Date().toDateString());
  const done = today.filter((s) => s.status === 'done');
  const blocked = today.filter((s) => s.status === 'blocked');
  const durations = done.map((s) => (s.end - s.start) / 1000).filter((d) => d > 0);
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const fps = state.events.filter((e) => e.type === 'fingerprint');
  const fpOk = fps.filter((e) => e.ok !== false).length;
  const mcp = state.events.filter((e) => e.type === 'mcp');
  const mcpLat = mcp.filter((e) => e.ms).map((e) => e.ms);
  const mcpAvg = mcpLat.length ? Math.round(mcpLat.reduce((a, b) => a + b, 0) / mcpLat.length) : 0;
  const mcpErr = mcp.filter((e) => e.ok === false).length;
  const liveFlows = state.flows.filter((f) => f.status === 'live');
  const sample = state.events.some((e) => e.sample);

  const hours = [...Array(12)].map((_, i) => {
    const end = Date.now() - (11 - i) * 3600000;
    const start = end - 3600000;
    return { label: new Date(end).getHours() + 'h', v: sessions.filter((s) => s.start > start && s.start <= end).length };
  });
  const byFlow = {};
  sessions.forEach((s) => { if (s.flowName) byFlow[s.flowName] = (byFlow[s.flowName] || 0) + 1; });
  const top = Object.entries(byFlow).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = Math.max(1, ...top.map(([, v]) => v));

  return (
    <>
      <div className="sd-between" style={{ flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 650 }}>Good to see you, {state.user.name.split(' ')[0]}</h2>
          <p className="muted" style={{ marginTop: 4 }}>Voice layer for <strong style={{ color: 'var(--sd-text)' }}>Caspia Bank</strong> · {liveFlows.length} live flows · {state.env === 'live' ? 'Live' : 'Test'} environment{sample ? ' · includes sample history' : ''}</p>
        </div>
        <div className="sd-row">
          <button className="sd-btn" onClick={() => go('playground')}><PlayCircle size={16} /> Open Playground</button>
          <button className="sd-btn primary" onClick={() => go('studio')} data-sd="go-studio"><Wand2 size={16} /> New flow with AI</button>
        </div>
      </div>

      <div className="sd-kpis">
        <Kpi icon={<Mic size={14} />} k="Voice sessions today" v={today.length} d={`${sessions.length} in total`} />
        <Kpi icon={<CheckCircle2 size={14} />} k="Completed" v={done.length} d={today.length ? `${Math.round((done.length / today.length) * 100)}% completion` : '—'} />
        <Kpi icon={<ShieldAlert size={14} />} k="Blocked by policy" v={blocked.length} d="Limits and guardrails" />
        <Kpi icon={<Timer size={14} />} k="Avg. time to complete" v={avg ? `${avg.toFixed(1)}s` : '—'} d="Voice → receipt" />
        <Kpi icon={<Fingerprint size={14} />} k="Fingerprint confirmations" v={fps.length} d={fps.length ? `${Math.round((fpOk / fps.length) * 100)}% verified` : 'None yet'} />
        <Kpi icon={<Workflow size={14} />} k="Live flows" v={liveFlows.length} d={`${state.flows.length - liveFlows.length} draft or off`} />
      </div>

      <div className="sd-cols-2">
        <div className="sd-card">
          <div className="sd-card-h"><h2>Sessions, last 12 hours</h2><span className="sd-sub">per hour</span></div>
          <Bars data={hours} />
        </div>
        <div className="sd-card">
          <div className="sd-card-h"><h2>Bank connection</h2><span className="sd-pill ok"><span className="sd-dot" />Connected</span></div>
          <dl className="sd-kv">
            <dt>MCP server</dt><dd className="mono">caspia-core · in-browser mock</dd>
            <dt>Tools exposed</dt><dd>{MCP_TOOLS.length} ({MCP_TOOLS.filter((t) => t.kind === 'write').length} write)</dd>
            <dt>Calls logged</dt><dd className="num">{mcp.length}</dd>
            <dt>Avg. latency</dt><dd className="num">{mcpAvg ? `${mcpAvg} ms` : '—'}</dd>
            <dt>Errors</dt><dd className="num">{mcpErr}</dd>
          </dl>
          <button className="sd-btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => go('integrations')}><Plug size={14} /> Integration details</button>
        </div>
      </div>

      <div className="sd-cols-2">
        <div className="sd-card flush">
          <div className="sd-card-h" style={{ padding: '14px 16px' }}><h2>Recent sessions</h2><button className="sd-btn sm" onClick={() => go('traces')}>All traces <ArrowRight size={14} /></button></div>
          <div className="sd-table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
            <table className="sd-table">
              <thead><tr><th>Request</th><th>Flow</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {sessions.slice(0, 6).map((s) => (
                  <tr key={s.id} className="click" onClick={() => go('traces', { session: s.id })}>
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</td>
                    <td className="muted">{s.flowName || '—'}</td>
                    <td><StatusPill status={s.status} /></td>
                    <td className="muted num">{ago(s.start)}</td>
                  </tr>
                ))}
                {!sessions.length && <tr><td colSpan={4} className="sd-empty">No sessions yet. Try the Playground.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="sd-card">
          <div className="sd-card-h"><h2>Most used flows</h2></div>
          {top.length ? top.map(([name, v]) => (
            <div key={name} className="sd-stack" style={{ gap: 4 }}>
              <div className="sd-between small"><span>{name}</span><span className="num muted">{v}</span></div>
              <div style={{ height: 6, borderRadius: 9, background: 'var(--sd-surface-2)' }}><div style={{ width: `${(v / topMax) * 100}%`, height: '100%', borderRadius: 9, background: 'var(--sd-accent)' }} /></div>
            </div>
          )) : <div className="sd-empty">No data yet.</div>}
        </div>
      </div>
    </>
  );
}
