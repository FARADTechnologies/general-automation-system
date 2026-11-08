import React, { useMemo, useState } from 'react';
import { Search, PlayCircle, Copy } from 'lucide-react';
import { useSeda, sessionsOf } from '../seda/store.jsx';
import { useNav, Timeline, StatusPill, ago, timeOf } from '../ui/kit.jsx';

const FILTERS = [['all', 'All'], ['done', 'Completed'], ['blocked', 'Blocked'], ['no_flow', 'No flow'], ['cancelled', 'Cancelled']];

export default function Traces() {
  const { state } = useSeda();
  const { params, go, toast } = useNav();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState(params.q || '');
  const sessions = useMemo(() => sessionsOf(state.events), [state.events]);
  const list = sessions.filter((s) => (filter === 'all' || s.status === filter) && (!q || (s.title + ' ' + (s.flowName || '')).toLowerCase().includes(q.toLowerCase())));
  const [sel, setSel] = useState(params.session || list[0]?.id);
  const cur = sessions.find((s) => s.id === sel) || list[0];
  const utter = cur?.events.find((e) => e.type === 'voice')?.text.replace(/[“”]/g, '');

  return (
    <div className="sd-cols-2" style={{ gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.6fr)' }}>
      <div className="sd-card flush" style={{ alignSelf: 'start' }}>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--sd-line)' }}>
          <label className="sd-search" style={{ width: '100%', margin: 0, display: 'flex' }}><Search size={15} /><input placeholder="Search requests" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sessions" /></label>
          <div className="sd-chips">{FILTERS.map(([k, l]) => <button key={k} className="sd-chip" style={filter === k ? { borderColor: 'var(--sd-accent)', color: 'var(--sd-accent)', fontWeight: 600 } : undefined} onClick={() => setFilter(k)}>{l}</button>)}</div>
        </div>
        <div style={{ maxHeight: 620, overflowY: 'auto' }}>
          {list.map((s) => (
            <button key={s.id} className={'sd-sess' + (cur?.id === s.id ? ' on' : '')} onClick={() => setSel(s.id)}>
              <span className="t">{s.title}</span>
              <span className="sd-between tiny muted"><span>{s.flowName || 'No flow'} · {s.source === 'app' ? 'manual in app' : 'voice'}{s.sample ? ' · sample' : ''}</span><span>{ago(s.start)}</span></span>
              <span><StatusPill status={s.status} /></span>
            </button>
          ))}
          {!list.length && <div className="sd-empty">No sessions match.</div>}
        </div>
      </div>

      <div className="sd-card">
        {cur ? (
          <>
            <div className="sd-between" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div className="sd-stack" style={{ gap: 4 }}>
                <span className="tiny muted mono">{cur.id}</span>
                <h2 style={{ fontSize: 17 }}>{cur.title}</h2>
                <span className="small muted">{timeOf(cur.start)} · {((cur.end - cur.start) / 1000).toFixed(1)}s · {cur.events.length} steps · {cur.events.filter((e) => e.type === 'mcp').length} MCP calls</span>
              </div>
              <div className="sd-row" style={{ flexWrap: 'wrap' }}>
                <StatusPill status={cur.status} />
                {utter && <button className="sd-btn sm" onClick={() => go('playground', { prefill: utter })}><PlayCircle size={14} /> Replay</button>}
                <button className="sd-btn sm" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(cur.events, null, 2)).catch(() => {}); toast('Trace copied as JSON'); }}><Copy size={14} /> Copy JSON</button>
              </div>
            </div>
            <div className="sd-banner info small">Card numbers are masked to the last 4 digits. Voice audio is never stored, only the text.</div>
            <Timeline events={cur.events} />
          </>
        ) : <div className="sd-empty">No sessions yet.</div>}
      </div>
    </div>
  );
}
