import React, { createContext, useContext, useState, useEffect } from 'react';
import { Mic, Brain, Plug, Navigation, PencilLine, MessageSquareQuote, Fingerprint, CheckCircle2, Ban, XCircle, Sparkles, ShieldAlert, Wand2, CircleDot, PiggyBank } from 'lucide-react';

// --- in-app navigation (no router: the embedded Caspia app owns its own router) ---
const NavCtx = createContext(null);
export function NavProvider({ children }) {
  const [nav, setNav] = useState({ page: 'overview', params: {} });
  const [toast, setToast] = useState(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);
  const go = (page, params = {}) => setNav({ page, params });
  return (
    <NavCtx.Provider value={{ ...nav, go, toast: setToast }}>
      {children}
      {toast && <div className="sd-toast" role="status"><CheckCircle2 size={16} /> {toast}</div>}
    </NavCtx.Provider>
  );
}
export const useNav = () => useContext(NavCtx);

export function Switch({ checked, onChange, label, id }) {
  return (
    <label className="sd-switch" aria-label={label}>
      <input id={id} type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function Kpi({ k, v, d, icon }) {
  return (
    <div className="sd-kpi">
      <span className="k">{icon}{k}</span>
      <span className="v">{v}</span>
      {d && <span className="d">{d}</span>}
    </div>
  );
}

export function Bars({ data, unit = '' }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <div className="sd-bars" role="img" aria-label="Bar chart">
      {data.map((d, i) => (
        <div key={i} className={'b' + (i === data.length - 1 ? ' cur' : '')}>
          <span className="v">{d.v ? d.v + unit : ''}</span>
          <i style={{ height: `${(d.v / max) * 82}%` }} />
          {d.label}
        </div>
      ))}
    </div>
  );
}

export const STATUS = {
  done: ['ok', 'Completed'], blocked: ['warn', 'Blocked by policy'], no_flow: ['bad', 'No flow'], cancelled: ['', 'Cancelled'],
  error: ['bad', 'Error'], running: ['info', 'Running'], draft: ['', 'Draft (not published)'],
};
export function StatusPill({ status }) {
  const [tone, label] = STATUS[status] || ['', status];
  return <span className={'sd-pill ' + tone}><span className="sd-dot" />{label}</span>;
}

export const EVENT_META = {
  voice: [Mic, 'voice', 'Customer said'],
  intent: [Brain, '', 'Intent'],
  mcp: [Plug, 'mcp', 'MCP call'],
  navigate: [Navigation, '', 'App navigation'],
  summary: [MessageSquareQuote, 'voice', 'Summary read aloud'],
  fingerprint: [Fingerprint, 'ok', 'Fingerprint'],
  result: [CheckCircle2, 'ok', 'Result'],
  blocked: [ShieldAlert, 'warn', 'Blocked by policy'],
  policy: [ShieldAlert, 'warn', 'Policy'],
  no_flow: [Ban, 'bad', 'No matching flow'],
  cancelled: [XCircle, '', 'Cancelled'],
  error: [XCircle, 'bad', 'Error'],
  studio: [Wand2, 'voice', 'AI Studio'],
  publish: [Sparkles, 'ok', 'Published'],
  coach: [PiggyBank, '', 'Coach rules'],
  fill: [PencilLine, '', 'Filled'],
};
export function EventIcon({ type }) {
  const [I, tone] = EVENT_META[type] || [CircleDot, ''];
  return <span className={'sd-tl-ico ' + tone}><I size={14} /></span>;
}

export const timeOf = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

export function Timeline({ events, freshIds = new Set() }) {
  if (!events.length) return <div className="sd-empty">No steps yet.</div>;
  const t0 = events[0].t;
  return (
    <div className="sd-tl">
      {events.map((e) => (
        <div key={e.id} className={'sd-tl-row' + (freshIds.has(e.id) ? ' fresh' : '')}>
          <span className="sd-tl-time" title={timeOf(e.t)}>{timeOf(e.t)}<br /><span>+{((e.t - t0) / 1000).toFixed(1)}s</span></span>
          <EventIcon type={e.type} />
          <div className="sd-tl-main">
            <div className="tiny muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{(EVENT_META[e.type] || [null, null, e.type])[2]}</div>
            <div className="t">{e.text}</div>
            {e.data && <div className="d">{e.data}</div>}
          </div>
          <span className="sd-tl-ms">{e.ms != null ? `${e.ms} ms` : ''}</span>
        </div>
      ))}
    </div>
  );
}
